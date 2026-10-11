import { Injectable, Logger } from '@nestjs/common';
import { CONFIG } from '../config';
import { DbService } from '../db/db.service';
import { FAULT_LABEL, FAULT_PART, FAULT_QUERY, FAULT_SKILL, KEYWORDS, NEGATORS, QUESTION, now } from '../domain';
import { StatusStore } from '../monitor/status.store';
import { SimService } from '../sim/sim.service';
import { ToolsService } from '../tools/tools.service';
import { CaseStore, OPEN_STATUSES, Trace } from './case.store';
import { LlmService } from './llm.service';

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const KEY_SENSORS: [string, string][] = [['PS1', 'tekanan'], ['EPS1', 'daya motor'], ['FS1', 'debit'], ['TS1', 'suhu'], ['VS1', 'getaran'], ['CE', 'efisiensi pendingin']];

/** Sesuaikan probabilitas dari kata kunci teknisi (dengan negasi sederhana). */
export function applyEvidence(probs: Record<string, number>, text: string): [Record<string, number>, string[]] {
  if (!text) return [probs, []];
  const t = text.toLowerCase();
  const notes: string[] = [];
  const p = { ...probs };
  for (const [fault, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      const idx = t.indexOf(w);
      if (idx < 0) continue;
      const before = (t.slice(Math.max(0, idx - 28), idx).match(/[a-z0-9]+/g) || []).slice(-3);
      if (before.some((b) => NEGATORS.includes(b))) {
        p[fault] = (p[fault] ?? 0) * 0.35;
        notes.push(`'${w}' dinegasikan, menurunkan ${FAULT_LABEL[fault]}`);
      } else {
        p[fault] = (p[fault] ?? 0) * 3 + 0.02;
        notes.push(`'${w}' mendukung ${FAULT_LABEL[fault]}`);
      }
      break;
    }
  }
  const s = Object.values(p).reduce((a, b) => a + b, 0) || 1;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) out[k] = Math.round((v / s) * 10000) / 10000;
  return [out, notes];
}

export function assessRisk(label: string, comps: any, flags: string[]): 'rendah' | 'sedang' | 'tinggi' {
  if (flags.length) return 'tinggi';
  const sev = comps?.[label]?.severity ?? 0;
  if (sev >= 1) return 'tinggi';
  if (sev >= 0.5) return 'sedang';
  return label === 'normal' ? 'rendah' : 'rendah';
}

@Injectable()
export class AgentService {
  private log = new Logger('Agent');
  constructor(private db: DbService, private tools: ToolsService, private cases: CaseStore, private llm: LlmService,
    private sim: SimService, private status: StatusStore) {}

  // ------------------------------------------------------------ eksekusi rencana
  private async execute(caseId: string, trace: Trace, state: any, approved = false) {
    const plan = state.plan;
    const pumpId = state.pump_id, label = plan.fault, risk = plan.risk;
    const part = FAULT_PART[label] ?? '';
    const inv = part ? await trace.tool('check_inventory', { part_name: part }) : { found: false };
    const inStock = !!inv.available;
    let desc = `Diagnosis agent: ${FAULT_LABEL[label]} (keyakinan ${pct(plan.confidence)}). Dasar: ${plan.citation}. ${plan.advice}`;
    if (part && !inStock) desc += ` Stok ${part} kosong: lakukan tindakan sementara yang aman dan tunggu pengadaan.`;
    const wo = await trace.tool('create_work_order', {
      pump_id: pumpId, title: `${FAULT_LABEL[label]} pada ${pumpId}`, description: desc,
      priority: ['rendah', 'sedang', 'tinggi'].includes(risk) ? risk : 'sedang', part, case_id: caseId, risk, approved,
    });
    const result: any = { work_order: wo.id ?? null, purchase_request: null, technician: null, notified: null };
    if (!wo.id) {
      trace.add('decision', 'Tindakan tidak dapat dijalankan', wo.error ?? 'work order gagal dibuat');
      return { result, ok: false };
    }
    if (part && !inStock) {
      const pr = await trace.tool('create_purchase_request', { part_name: part, qty: 1, reason: `Dibutuhkan untuk ${wo.id} (${FAULT_LABEL[label]} pada ${pumpId})`, work_order_id: wo.id });
      result.purchase_request = pr.id ?? null;
    }
    const sched = await trace.tool('schedule_technician', { work_order_id: wo.id, skill: FAULT_SKILL[label] ?? 'mekanik', senior: risk === 'tinggi' });
    if (!sched.scheduled) {
      trace.add('decision', 'Teknisi belum tersedia', 'Work order tetap terbuka dan masuk antrean; supervisor diberi tahu.');
      const n = await trace.tool('send_notification', { recipient: 'Dewi Anggraini', message: `${wo.id} untuk ${pumpId} (${FAULT_LABEL[label]}) belum punya teknisi tersedia. Mohon alokasikan.` });
      result.notified = n.status;
      return { result, ok: true };
    }
    result.technician = sched.technician;
    const msg = `${wo.id} ${pumpId}: ${FAULT_LABEL[label]} (risiko ${risk}). Jadwal ${sched.scheduled_at}. Part ${part || '-'}: ${inStock ? 'tersedia' : 'KOSONG, pembelian diajukan'}. Dasar: ${plan.citation}.`;
    result.notified = (await trace.tool('send_notification', { recipient: sched.technician, message: msg })).status;
    return { result, ok: true };
  }

  private summaryAfter(state: any, r: any) {
    const p = state.plan;
    const acts: string[] = [];
    if (r.work_order) acts.push(`${r.work_order} dibuat`);
    if (r.technician) acts.push(`teknisi ${r.technician} dijadwalkan`);
    if (r.purchase_request) acts.push(`${r.purchase_request} diajukan karena stok kosong`);
    if (r.notified) acts.push(`notifikasi ${r.notified}`);
    return `Diagnosis: ${FAULT_LABEL[p.fault]} (keyakinan ${pct(p.confidence)}), risiko ${p.risk}.${acts.length ? ` Tindakan: ${acts.join(', ')}.` : ''} Dasar: ${p.citation}.`;
  }

  // ------------------------------------------------------------ keputusan
  private async decide(caseId: string, trace: Trace, state: any): Promise<[string, string]> {
    const ranked = Object.entries(state.probs as Record<string, number>).sort((a, b) => b[1] - a[1]);
    const [label, conf] = ranked[0];
    const second = ranked[1];
    const { risk, pump_id: pumpId } = state;
    trace.add('reasoning', 'Penalaran gabungan',
      `Hipotesis teratas: ${FAULT_LABEL[label]} (${pct(conf)}), berikutnya ${FAULT_LABEL[second[0]]} (${pct(second[1])}). Risiko dinilai ${risk}. Ambang eksekusi otomatis ${pct(CONFIG.CONF_ACT)}, ambang eskalasi ${pct(CONFIG.CONF_CONFIRM)}.`);

    if (label === 'normal') {
      const [best, pf] = ranked.find(([k]) => k !== 'normal')!;
      if (pf >= 0.15 && !state.clarified) {
        const q = `Pembacaan masih mendekati normal, tetapi ada sinyal awal ${FAULT_LABEL[best]} (${pct(pf)}). Mohon bantu konfirmasi di lapangan: ${QUESTION[best]}`;
        state.question = q;
        trace.add('decision', 'Tanya balik ke teknisi', q);
        return ['menunggu_klarifikasi', 'Sinyal awal belum cukup kuat. Agent menunggu konfirmasi lapangan sebelum bertindak.'];
      }
      const s = 'Sinyal awal masih lemah dan belum cukup untuk tindakan. Agent terus memantau dan akan menganalisis ulang bila pola menguat.';
      trace.add('decision', 'Dipantau, belum bertindak', s);
      state.plan = null;
      return ['dipantau', s];
    }

    if ((state.multi?.length ?? 0) >= 2) {
      const names = (state.multi as string[]).map((k) => FAULT_LABEL[k]).join(' dan ');
      const s = `Beberapa komponen menurun bersamaan (${names}). Kasus majemuk dieskalasi ke teknisi senior untuk inspeksi langsung.`;
      trace.add('decision', 'Eskalasi: gangguan majemuk', s);
      await trace.tool('escalate_to_senior', { pump_id: pumpId, case_id: caseId, summary: `Gangguan majemuk pada ${pumpId}: ${names}. Perlu inspeksi langsung.` });
      state.plan = null;
      return ['dieskalasi', s];
    }

    if (conf < CONFIG.CONF_CONFIRM) {
      const s = `Keyakinan ${pct(conf)} di bawah ambang eskalasi. Kasus dieskalasi ke teknisi senior dengan ringkasan data.`;
      trace.add('decision', 'Eskalasi ke teknisi senior', s);
      await trace.tool('escalate_to_senior', {
        pump_id: pumpId, case_id: caseId,
        summary: `Anomali pada ${pumpId}, hipotesis: ${ranked.slice(0, 3).map(([k, v]) => `${FAULT_LABEL[k]} ${pct(v)}`).join(', ')}. Perlu inspeksi langsung.`,
      });
      state.plan = null;
      return ['dieskalasi', s];
    }

    const cites: string[] = state.citations ?? [];
    const plan = { fault: label, confidence: conf, risk, citation: cites[0] ?? 'belum ada sitasi', advice: state.advice ?? '' };
    state.plan = plan;

    if (conf >= CONFIG.CONF_ACT && risk !== 'tinggi') {
      trace.add('decision', 'Eksekusi otomatis', 'Keyakinan tinggi dan risiko tidak tinggi, agent menjalankan rantai tindakan tanpa menunggu manusia.');
      const { result, ok } = await this.execute(caseId, trace, state, false);
      return [ok ? 'selesai_otomatis' : 'gagal', this.summaryAfter(state, result)];
    }

    if (risk === 'tinggi') {
      trace.add('decision', 'Butuh persetujuan manusia', 'Risiko tinggi: agent hanya merekomendasikan dan tidak menjalankan tindakan sebelum supervisor menyetujui.');
      await trace.tool('send_notification', {
        recipient: 'Dewi Anggraini',
        message: `PERSETUJUAN DIPERLUKAN ${pumpId}: ${FAULT_LABEL[label]} (${pct(conf)}), risiko tinggi. Buka dashboard untuk menyetujui atau menolak.`,
      });
      return ['menunggu_persetujuan', `Diagnosis: ${FAULT_LABEL[label]} (keyakinan ${pct(conf)}), risiko tinggi. Menunggu persetujuan supervisor. Dasar: ${plan.citation}.`];
    }

    if (!state.clarified) {
      const [a, b] = [ranked[0][0], ranked[1][0]];
      const q = b === 'normal'
        ? `Gejala awal mengarah ke ${FAULT_LABEL[a]} (${pct(ranked[0][1])}), tetapi belum cukup kuat dibanding kondisi normal (${pct(ranked[1][1])}). Mohon bantu konfirmasi di lapangan: ${QUESTION[a]}`
        : `Gejala mengarah ke ${FAULT_LABEL[a]} (${pct(ranked[0][1])}) dan ${FAULT_LABEL[b]} (${pct(ranked[1][1])}). Untuk membedakan, pertama ${QUESTION[a]} Kedua, ${QUESTION[b]}`;
      state.question = q;
      trace.add('decision', 'Tanya balik ke teknisi', q);
      return ['menunggu_klarifikasi', 'Keyakinan belum cukup. Agent menunggu jawaban teknisi untuk membedakan hipotesis.'];
    }
    trace.add('decision', 'Minta konfirmasi', 'Setelah klarifikasi keyakinan masih di bawah ambang otomatis, jadi tindakan menunggu konfirmasi manusia.');
    return ['menunggu_persetujuan', `Diagnosis: ${FAULT_LABEL[label]} (keyakinan ${pct(conf)}). Menunggu konfirmasi sebelum tindakan dijalankan.`];
  }

  /** Potong teks di batas kalimat/kata agar tidak berhenti di tengah kata. */
  private clip(s: string, n: number): string {
    if (s.length <= n) return s;
    const cut = s.slice(0, n);
    const dot = cut.lastIndexOf('. ');
    return dot > 60 ? cut.slice(0, dot + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
  }

  private adviceFrom(man: any): string {
    if (!man.results?.length) return '';
    const m = man.results[0].text.match(/Tindakan:\s*([\s\S]*?)(?:\sSpare part|\sRisiko|$)/);
    return m ? this.clip(m[1].trim(), 260) : '';
  }

  // ------------------------------------------------------------ diagnosis
  async diagnose(pumpId: string, complaint = '', trigger = 'manual', useLlm = false): Promise<any> {
    if (!(await this.tools.getPump(pumpId))) return { error: `unit tidak ditemukan: ${pumpId}` };
    const existing = await this.cases.openFor(pumpId);
    if (existing) return this.cases.get(existing.id);

    let note = '';
    if (useLlm && this.llm.enabled) {
      try { return await this.llm.diagnose(pumpId, complaint); }
      catch (e: any) { note = `Mode LLM gagal (${String(e?.message ?? e).slice(0, 160)}); beralih ke mode policy.`; this.log.warn(note); }
    }

    const caseId = await this.db.nextId('C', 'cases');
    const trace = this.cases.trace(caseId);
    if (note) trace.add('reasoning', 'Peralihan mode', note);
    trace.add('reasoning', 'Pemicu analisis', `${trigger === 'auto' ? 'Otomatis oleh monitor' : 'Diminta pengguna'} untuk ${pumpId}.${complaint ? ` Keluhan: "${complaint}".` : ''}`);

    const data = await trace.tool('get_sensor_data', { pump_id: pumpId, window: CONFIG.WINDOW });
    const state: any = { pump_id: pumpId, complaint };
    if (data.error) {
      trace.add('decision', 'Data tidak tersedia', data.error);
      await this.cases.save(caseId, trace, 'gagal', state, { summary: data.error });
      return this.cases.get(caseId);
    }
    const dev = KEY_SENSORS.map(([k, n]) => `${n} ${(((data.latest[k] / data.nominal[k]) - 1) * 100).toFixed(0)}%`).join(', ');
    trace.add('reasoning', 'Perbandingan dengan kondisi sehat', `Deviasi pembacaan terbaru terhadap rata-rata kondisi sehat: ${dev}.`);

    const valid = await trace.tool('check_sensor_validity', { pump_id: pumpId });
    if (!valid.valid) {
      const bad = valid.suspect_sensors.join(', ');
      trace.add('decision', 'Sensor mencurigakan, diagnosis ditunda',
        `Sensor ${bad} mengirim nilai nol sementara sensor lain tidak menunjukkan pola gangguan. Agent tidak menyimpulkan kerusakan dari satu sensor.`);
      const wo = await trace.tool('create_work_order', {
        pump_id: pumpId, title: `Periksa sensor ${bad} pada ${pumpId}`,
        description: `Sensor ${bad} mengirim nilai nol. Verifikasi kabel dan sensor, bandingkan dengan pengukuran manual (panduan bagian 1.5).`,
        priority: 'sedang', part: 'Sensor getaran VS1', case_id: caseId, risk: 'sedang',
      });
      if (wo.id) {
        const sched = await trace.tool('schedule_technician', { work_order_id: wo.id, skill: 'listrik' });
        if (sched.scheduled) await trace.tool('send_notification', { recipient: sched.technician, message: `${wo.id}: periksa sensor ${bad} pada ${pumpId}. Jadwal ${sched.scheduled_at}.` });
      }
      await this.cases.save(caseId, trace, 'sensor_bermasalah', state, { risk: 'rendah', summary: `Sensor ${bad} pada ${pumpId} diduga bermasalah. Tiket pemeriksaan sensor dibuat.` });
      return this.cases.get(caseId);
    }

    const an: any = await this.tools.analyze(pumpId);
    await trace.tool('detect_anomaly', { pump_id: pumpId });
    await trace.tool('classify_fault', { pump_id: pumpId });
    if (an.error) {
      trace.add('decision', 'Analisis ML tidak tersedia', an.error);
      await this.cases.save(caseId, trace, 'gagal', state, { summary: `Analisis ML gagal: ${an.error}` });
      return this.cases.get(caseId);
    }

    let probs: Record<string, number> = { ...an.probs };
    if (an.is_anomaly && an.label === 'normal') {
      probs.normal = (probs.normal ?? 0) * 0.25;
      const tot = Object.values(probs).reduce((a, b) => a + b, 0) || 1;
      for (const k of Object.keys(probs)) probs[k] = Math.round((probs[k] / tot) * 10000) / 10000;
      trace.add('reasoning', 'Detektor berselisih, hipotesis normal diturunkan',
        'Detektor anomali menandai data abnormal sedangkan classifier memilih normal. Pola ini khas tahap awal gangguan, jadi probabilitas normal dikalikan 0,25 sebelum menimbang hipotesis lain.');
    }
    if (complaint) {
      const [p2, notes] = applyEvidence(probs, complaint);
      probs = p2;
      if (notes.length) trace.add('reasoning', 'Bukti dari keluhan teknisi', notes.join('; '));
    }
    state.sensor_probs = an.probs;

    if (an.label === 'normal' && !an.is_anomaly && (!complaint || (probs.normal ?? 0) >= 0.8)) {
      let summary = `Tidak ada gangguan terdeteksi pada ${pumpId}. Semua komponen dalam kondisi sehat.`;
      if (complaint) {
        summary += ' Karena ada keluhan, disarankan inspeksi fisik untuk memastikan.';
        await trace.tool('create_work_order', { pump_id: pumpId, title: `Inspeksi visual ${pumpId}`, description: `Keluhan teknisi: ${complaint}. Sensor normal, lakukan inspeksi fisik.`, priority: 'rendah', case_id: caseId, risk: 'rendah' });
      }
      trace.add('decision', 'Tidak ada tindakan korektif', summary);
      await this.cases.save(caseId, trace, 'tidak_ada_gangguan', state, { fault: 'normal', conf: an.confidence, risk: 'rendah', summary });
      return this.cases.get(caseId);
    }

    const label = Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];
    const flags: string[] = an.flags;
    if (flags.length) trace.add('reasoning', 'Komponen mendekati gagal total', flags.join('; '));
    const risk = assessRisk(label, an.components, flags);
    const multi = ['pump', 'valve', 'cooler', 'accumulator'].filter((k) => (an.components[k]?.p_degraded ?? 0) >= 0.8);
    if (multi.length >= 2) {
      state.multi = multi;
      trace.add('reasoning', 'Gangguan majemuk terdeteksi', `Model menilai ${multi.length} komponen menurun bersamaan: ${multi.map((k) => FAULT_LABEL[k]).join(', ')}.`);
    }

    const rec = await trace.tool('search_history', { pump_id: pumpId, fault: label !== 'normal' ? label : undefined, days: 90 });
    if (rec.cases?.length) {
      const c = rec.cases[0];
      trace.add('reasoning', 'Kemungkinan kegagalan berulang', `${c.id} (kasus serupa pada unit ini): penyebab sebelumnya "${c.root_cause}". Selain tindakan standar, periksa akar masalah tersebut.`);
      state.advice = `Kasus serupa sebelumnya (${c.id}): ${c.root_cause}. Periksa akar masalah ini agar tidak berulang.`;
    }

    const man = await trace.tool('search_manual', { query: FAULT_QUERY[label] ?? 'anomali unit hidrolik', k: 5 });
    man.results = [...(man.results ?? [])].sort((a: any, b: any) => (a.text.includes('Tindakan:') ? 0 : 1) - (b.text.includes('Tindakan:') ? 0 : 1)).slice(0, 3);
    const cites = man.results.map((h: any) => h.citation);
    Object.assign(state, { probs, risk, citations: cites });
    const adv = this.adviceFrom(man);
    if (adv) state.advice = state.advice ? `${state.advice} Tindakan standar: ${this.clip(adv, 200)}` : adv;

    const [status, summary] = await this.decide(caseId, trace, state);
    const ranked = Object.entries(state.probs as Record<string, number>).sort((a, b) => b[1] - a[1]);
    await this.cases.save(caseId, trace, status, state, { fault: ranked[0][0], conf: ranked[0][1], risk, summary });
    return this.cases.get(caseId);
  }

  async continueCase(caseId: string, text: string) {
    const c = await this.cases.get(caseId);
    if (!c) return { error: 'kasus tidak ditemukan' };
    if (c.status !== 'menunggu_klarifikasi') return { error: `kasus berstatus ${c.status}, tidak menunggu klarifikasi` };
    const state = c.state;
    const trace = this.cases.trace(caseId, c.trace);
    trace.add('reasoning', 'Jawaban teknisi', text);
    const [probs, notes] = applyEvidence(state.probs, text);
    trace.add('reasoning', 'Pembaruan hipotesis', notes.length ? notes.join('; ') : 'Jawaban tidak mengandung bukti yang dikenali, keyakinan tidak berubah.');
    Object.assign(state, { probs, clarified: true, question: null });
    const [status, summary] = await this.decide(caseId, trace, state);
    const ranked = Object.entries(state.probs as Record<string, number>).sort((a, b) => b[1] - a[1]);
    await this.cases.save(caseId, trace, status, state, { fault: ranked[0][0], conf: ranked[0][1], risk: state.risk, summary });
    return this.cases.get(caseId);
  }

  async approve(caseId: string, by = 'supervisor') {
    const c = await this.cases.get(caseId);
    if (!c || c.status !== 'menunggu_persetujuan') return { error: 'kasus tidak menunggu persetujuan' };
    if (!c.state?.plan) return { error: 'kasus ini tidak memiliki rencana tindakan untuk disetujui' };
    const trace = this.cases.trace(caseId, c.trace);
    trace.add('decision', 'Disetujui supervisor', `Tindakan dijalankan setelah persetujuan manusia (${by}).`);
    const { result, ok } = await this.execute(caseId, trace, c.state, true);
    await this.cases.save(caseId, trace, ok ? 'disetujui_dijalankan' : 'gagal', c.state, {
      fault: c.fault, conf: c.confidence, risk: c.risk,
      summary: ok ? this.summaryAfter(c.state, result) : 'Persetujuan diberikan tetapi tindakan gagal dijalankan.',
    });
    return this.cases.get(caseId);
  }

  async reject(caseId: string, note = '') {
    const c = await this.cases.get(caseId);
    if (!c || !OPEN_STATUSES.includes(c.status)) return { error: 'kasus tidak dapat ditolak' };
    const trace = this.cases.trace(caseId, c.trace);
    trace.add('decision', 'Ditolak supervisor', note || 'Tidak ada tindakan dijalankan.');
    await this.cases.save(caseId, trace, 'ditolak', c.state, { fault: c.fault, conf: c.confidence, risk: c.risk, summary: 'Rekomendasi ditolak oleh supervisor. Tidak ada tindakan dijalankan.' });
    return this.cases.get(caseId);
  }

  async completeWorkOrder(woId: string, rootCause = '', action = '', durationMin = 60) {
    const wo = await this.db.one('SELECT * FROM work_orders WHERE id=$1', [woId]);
    if (!wo) return { error: 'work order tidak ditemukan' };
    if (wo.status === 'selesai') return { error: 'work order sudah selesai' };
    await this.db.x("UPDATE work_orders SET status='selesai', closed_at=$1 WHERE id=$2", [now(), woId]);
    if (wo.technician_id) await this.db.x('UPDATE technicians SET available=true WHERE id=$1', [wo.technician_id]);
    const c = wo.case_id ? await this.cases.get(wo.case_id) : null;
    await this.tools.save_case_history({
      pump_id: wo.pump_id, symptoms: (c?.summary || wo.title).slice(0, 200), fault: c?.fault || 'normal',
      root_cause: rootCause || 'Sesuai diagnosis agent', action: action || String(wo.description).slice(0, 200), duration_min: durationMin,
    });
    this.sim.resetPump(wo.pump_id);
    if (c && ['selesai_otomatis', 'disetujui_dijalankan', 'dieskalasi'].includes(c.status)) {
      const trace = this.cases.trace(c.id, c.trace);
      trace.add('action', 'Pekerjaan selesai', `${woId} ditutup. Hasil disimpan ke riwayat kasus dan indeks pengetahuan diperbarui.`);
      await this.cases.save(c.id, trace, 'selesai', c.state, { fault: c.fault, conf: c.confidence, risk: c.risk, summary: c.summary });
    }
    return { ok: true, work_order: woId };
  }

  // ------------------------------------------------------------ triage & chat
  async triage(trigger = 'manual') {
    const crit: Record<string, number> = { tinggi: 2, sedang: 1 };
    const ranking: any[] = [];
    for (const p of await this.db.q('SELECT * FROM pumps')) {
      const st = this.status.map[p.id];
      if (!st || st.state === 'normal' || st.state === 'tidak ada data') continue;
      const score = (st.state === 'kritis' ? 2 : 1) * 10 + (crit[p.criticality] ?? 0) * 3 + (1 - (st.confidence ?? 0));
      ranking.push({ pump_id: p.id, state: st.state, label: st.label, criticality: p.criticality, score: Math.round(score * 100) / 100 });
    }
    ranking.sort((a, b) => b.score - a.score);
    const cases: any[] = [];
    for (const r of ranking) {
      const c = await this.diagnose(r.pump_id, '', trigger);
      cases.push({ pump_id: r.pump_id, case_id: c.id, status: c.status });
    }
    return { ranking, cases };
  }

  async chat(message: string, caseId?: string | null, useLlm = false): Promise<any> {
    if (useLlm && this.llm.enabled && (message || '').trim()) {
      try { return await this.llm.chat(message.trim()); }
      catch (e: any) {
        const err = String(e?.message ?? e).slice(0, 200);
        this.log.warn(`Mode LLM gagal pada chat: ${err}`);
        return { ...(await this.chatPolicy(message, caseId)), llm_error: err };
      }
    }
    return this.chatPolicy(message, caseId);
  }

  private async chatPolicy(message: string, caseId?: string | null): Promise<any> {
    const msg = (message || '').trim();
    if (!msg) return { reply: 'Tulis pertanyaan atau keluhan, misalnya: "Unit 3 oli cepat panas dan tekanan sulit naik".', case: null };
    if (caseId) {
      const c = await this.cases.get(caseId);
      if (c && c.status === 'menunggu_klarifikasi') {
        const r = await this.continueCase(caseId, msg);
        return { reply: r.summary || 'Jawaban diterima.', case: r };
      }
    }
    const low = msg.toLowerCase();
    const m = low.match(/(?:pompa|pump|unit)[\s-]*0?(\d)/);
    if (m) {
      const pid = `Pump-0${m[1]}`;
      if (!(await this.tools.getPump(pid))) return { reply: `${pid} tidak terdaftar.`, case: null };
      const r = await this.diagnose(pid, msg);
      return { reply: r.summary || 'Analisis selesai.', case: r };
    }
    if (['prioritas', 'triage', 'semua unit', 'semua pompa', 'urutan'].some((w) => low.includes(w))) {
      const t = await this.triage();
      if (!t.ranking.length) return { reply: 'Semua unit dalam kondisi normal.', case: null };
      return { reply: 'Urutan prioritas penanganan:\n' + t.ranking.map((r, i) => `${i + 1}. ${r.pump_id} (${r.state}, ${FAULT_LABEL[r.label] ?? r.label})`).join('\n'), case: null };
    }
    if (['stok', 'stock', 'persediaan'].some((w) => low.includes(w))) {
      const items = await this.db.q('SELECT * FROM inventory');
      const toks = low.match(/[a-z0-9]{4,}/g) || [];
      const hit = items.filter((i: any) => toks.some((t) => i.name.toLowerCase().includes(t)));
      return { reply: 'Stok: ' + (hit.length ? hit : items).map((i: any) => `${i.name} = ${i.stock}`).join('; '), case: null };
    }
    if (low.includes('work order') || /\bwo\b/.test(low)) {
      const wos = await this.db.q("SELECT * FROM work_orders WHERE status<>'selesai' ORDER BY created_at DESC LIMIT 8");
      return { reply: wos.length ? 'Work order terbuka: ' + wos.map((w: any) => `${w.id} ${w.pump_id} (${w.status})`).join('; ') : 'Tidak ada work order terbuka.', case: null };
    }
    if (low.includes('status') || low.includes('kondisi')) {
      return { reply: 'Status unit: ' + Object.entries(this.status.map).map(([k, v]) => `${k} ${v.state}`).join('; '), case: null };
    }
    return { reply: 'Saya bisa menganalisis unit (contoh: "Unit 3 oli cepat panas"), menampilkan prioritas, stok part, atau work order terbuka.', case: null };
  }
}