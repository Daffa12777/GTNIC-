import { Injectable } from '@nestjs/common';
import { CONFIG } from '../config';
import { assessRisk, COMP_KEYS, DISPLAY_SENSORS, FAULT_LABEL, FAULT_QUERY, type MaintenancePlan, asObj, now } from '../domain';
import { DbService } from '../db/db.service';
import { Analysis, MlService } from '../ml/ml.service';
import { RagService } from '../rag/rag.service';
import { SimService } from '../sim/sim.service';

const S = { type: 'STRING' }, I = { type: 'INTEGER' }, B = { type: 'BOOLEAN' };
const obj = (properties: any, required: string[]) => ({ type: 'OBJECT', properties, required });

export const TOOL_SPECS: [string, string, any][] = [
  ['get_sensor_data', 'Ambil data sensor terbaru sebuah unit hidrolik (tekanan PS1, daya motor EPS1, debit FS1, suhu TS1, getaran VS1, CE, CP, SE).', obj({ pump_id: S, window: I }, ['pump_id'])],
  ['check_sensor_validity', 'Cek apakah sensor mengirim data valid (bukan nol/hilang).', obj({ pump_id: S }, ['pump_id'])],
  ['detect_anomaly', 'Jalankan model deteksi anomali (Isolation Forest) pada data terbaru unit.', obj({ pump_id: S }, ['pump_id'])],
  ['classify_fault', 'Klasifikasi gangguan (normal/pump/valve/cooler/accumulator) dengan probabilitas, dari model Random Forest per komponen.', obj({ pump_id: S }, ['pump_id'])],
  ['search_manual', 'Cari manual dan panduan perawatan (RAG) dan kembalikan potongan dengan sitasi.', obj({ query: S }, ['query'])],
  ['search_history', 'Cari riwayat perbaikan untuk unit dan/atau jenis gangguan.', obj({ pump_id: S, fault: S }, [])],
  ['check_inventory', 'Cek stok spare part berdasarkan nama.', obj({ part_name: S }, ['part_name'])],
  ['create_purchase_request', 'Buat permintaan pembelian part.', obj({ part_name: S, qty: I, reason: S, work_order_id: S }, ['part_name', 'qty', 'reason'])],
  ['create_work_order', "Buat work order. Risiko 'tinggi' ditolak kecuali sudah disetujui manusia.", obj({ pump_id: S, title: S, description: S, priority: S, part: S, risk: S }, ['pump_id', 'title', 'description', 'priority', 'risk'])],
  ['schedule_technician', 'Jadwalkan teknisi untuk work order. skill: mekanik atau listrik.', obj({ work_order_id: S, skill: S, senior: B }, ['work_order_id', 'skill'])],
  ['send_notification', 'Kirim notifikasi ke teknisi atau supervisor.', obj({ recipient: S, message: S }, ['recipient', 'message'])],
  ['escalate_to_senior', 'Eskalasi kasus ke teknisi senior dengan ringkasan.', obj({ pump_id: S, summary: S }, ['pump_id', 'summary'])],
];

/**
 * Semua tool yang dipanggil agent. Validasi input dan guardrail keselamatan ada di sini,
 * sehingga tetap berlaku walaupun keputusan datang dari LLM.
 */
@Injectable()
export class ToolsService {
  private cache = new Map<string, { ts: number; a: Analysis }>();
  private zeroable?: Set<string>;

  constructor(private db: DbService, private ml: MlService, private sim: SimService, private rag: RagService) {}
  async refreshKnowledge() { await this.rag.build(); }

  get names(): Record<string, string> {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.sim.profiles.components)) o[k] = v.name;
    return o;
  }

  async getPump(id: string) { return this.db.one('SELECT * FROM pumps WHERE id=$1', [id]); }

  // ---------------------------------------------------------- sensor & ML
  async get_sensor_data(a: { pump_id: string; window?: number }) {
    if (!(await this.getPump(a.pump_id))) return { error: `unit tidak ditemukan: ${a.pump_id}` };
    const n = Math.max(1, Math.min(Number(a.window ?? CONFIG.WINDOW), 300));
    const rows = this.sim.recent(a.pump_id, n);
    if (!rows.length) return { error: 'belum ada data sensor' };
    const last = rows[rows.length - 1];
    return { pump_id: a.pump_id, n: rows.length, latest: this.sim.display(last.features), nominal: this.sim.nominalDisplay(), rows };
  }

  /** Sensor yang di data nyata pernah tepat 0 (mis. PS4 pada kondisi rusak) bukan bukti sensor mati. */
  private zeroableSensors(): Set<string> {
    if (!this.zeroable) {
      const p = this.sim.profiles;
      const rows: number[][] = [...p.healthy];
      for (const comp of Object.values(p.banks)) for (const lv of Object.values(comp)) rows.push(...lv);
      this.zeroable = new Set(
        p.features
          .map((n, j) => (n.endsWith('_mean') && rows.some((r) => r[j] === 0) ? n.replace('_mean', '') : ''))
          .filter(Boolean),
      );
    }
    return this.zeroable;
  }

  async check_sensor_validity(a: { pump_id: string }) {
    const rows = this.sim.recent(a.pump_id, 5);
    const bad: string[] = [];
    if (rows.length) {
      const zeroable = this.zeroableSensors();
      for (const s of this.sim.profiles.features.filter((f) => f.endsWith('_mean')).map((f) => f.replace('_mean', ''))) {
        const vals = rows.map((r) => r.features[`${s}_mean`]);
        const missing = vals.some((v) => v == null || !Number.isFinite(v));
        const allZero = !zeroable.has(s) && vals.every((v) => v === 0);
        if (missing || allZero) bad.push(s);
      }
    }
    return { valid: bad.length === 0, suspect_sensors: bad };
  }

  /** Analisis ML untuk satu unit, di-cache per pembacaan terbaru. */
  async analyze(pump_id: string): Promise<Analysis | { error: string }> {
    if (!(await this.getPump(pump_id))) return { error: `unit tidak ditemukan: ${pump_id}` };
    const rows = this.sim.recent(pump_id, 1);
    if (!rows.length) return { error: 'belum ada data sensor' };
    const ts = rows[0].ts;
    const hit = this.cache.get(pump_id);
    if (hit && hit.ts === ts) return hit.a;
    const feats = this.sim.smoothed(pump_id, 1)!;
    try {
      const raw = await this.ml.predict(feats);
      const a = this.ml.toAnalysis(raw, this.names);
      this.cache.set(pump_id, { ts, a });
      return a;
    } catch (e: any) {
      return { error: `layanan ML gagal: ${e?.message ?? e}` };
    }
  }

  async detect_anomaly(a: { pump_id: string }) {
    const r: any = await this.analyze(a.pump_id);
    if (r.error) return r;
    return { pump_id: a.pump_id, is_anomaly: r.is_anomaly, anomaly_score: r.anomaly_score, threshold: r.threshold };
  }

  async classify_fault(a: { pump_id: string }) {
    const r: any = await this.analyze(a.pump_id);
    if (r.error) return r;
    const comps: any = {};
    for (const k of COMP_KEYS) comps[k] = { level: r.components[k].level, severity: r.components[k].severity, confidence: r.components[k].confidence };
    return { pump_id: a.pump_id, label: r.label, confidence: r.confidence, probs: r.probs, components: comps };
  }

  async maintenancePlan(pumpId: string) {
    const analysis = await this.analyze(pumpId);
    if ('error' in analysis) return analysis;
    const validity = await this.check_sensor_validity({ pump_id: pumpId });
    if (!validity.valid) return { error: 'Sensor perlu diperiksa sebelum merencanakan perbaikan.' };
    if (analysis.label === 'normal') return { analysis, plan: null };
    const manual = await this.search_manual({ query: FAULT_QUERY[analysis.label] });
    const plan: MaintenancePlan = {
      fault: analysis.label, confidence: analysis.confidence,
      risk: assessRisk(analysis.label, analysis.components, analysis.flags),
      citation: manual.results?.[0]?.citation ?? 'belum ada sitasi',
      advice: manual.results?.[0]?.text?.slice(0, 600) ?? 'Periksa unit bersama teknisi sebelum perbaikan.',
    };
    return { analysis, plan };
  }

  // ---------------------------------------------------------- RAG
  async search_manual(a: { query: string; k?: number }) {
    if (!a.query?.trim()) return { error: 'query kosong' };
    return { query: a.query, results: await this.rag.search(a.query, a.k ?? 3, 'manual') };
  }

  async search_history(a: { pump_id?: string; fault?: string; days?: number }) {
    const params: any[] = [now() - (a.days ?? 365) * 86400];
    let sql = 'SELECT * FROM case_history WHERE ts >= $1';
    if (a.pump_id) { params.push(a.pump_id); sql += ` AND pump_id=$${params.length}`; }
    if (a.fault) { params.push(a.fault); sql += ` AND fault=$${params.length}`; }
    return { pump_id: a.pump_id, fault: a.fault, cases: await this.db.q(sql + ' ORDER BY ts DESC', params) };
  }

  // ---------------------------------------------------------- inventory
  async check_inventory(a: { part_name: string }) {
    if (!a.part_name) return { error: 'nama part kosong' };
    const r = await this.db.one('SELECT * FROM inventory WHERE LOWER(name) LIKE $1', [`%${a.part_name.toLowerCase()}%`]);
    if (!r) return { found: false, part_name: a.part_name };
    return { found: true, part_id: r.part_id, name: r.name, stock: Number(r.stock), available: Number(r.stock) > 0, location: r.location };
  }

  async create_purchase_request(a: { part_name: string; qty: number; reason: string; work_order_id?: string }) {
    const qty = Number(a.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) return { error: 'qty harus bilangan bulat 1-50' };
    return this.db.transaction(async () => {
      if (a.work_order_id) {
        const order = await this.db.one('SELECT id FROM work_orders WHERE id=$1 FOR UPDATE', [a.work_order_id]);
        if (!order) return { error: 'work order tidak ditemukan' };
        const duplicate = await this.db.client.purchaseRequest.findFirst({ where: { work_order_id: a.work_order_id, part_name: a.part_name, status: 'menunggu persetujuan' } });
        if (duplicate) return { id: duplicate.id, duplicate: true };
      }
      const id = await this.db.nextId('PR', 'purchase_requests');
      await this.db.client.purchaseRequest.create({ data: { id, part_name: a.part_name, qty, reason: a.reason, work_order_id: a.work_order_id || null, status: 'menunggu persetujuan', created_at: now() } });
      return { id, part_name: a.part_name, qty, status: 'menunggu persetujuan' };
    });
  }

  async create_work_order(a: { pump_id: string; title: string; description: string; priority: string; part?: string; case_id?: string; risk?: string; approved?: boolean }, inspection = false) {
    if (!['rendah', 'sedang', 'tinggi'].includes(a.priority)) return { error: 'priority harus rendah|sedang|tinggi' };
    if (!a.title || !a.description) return { error: 'title dan description wajib' };
    if (a.risk && !['rendah', 'sedang', 'tinggi'].includes(a.risk)) return { error: 'risk harus rendah|sedang|tinggi' };
    // Tool arguments cannot grant approval: verify the decision persisted by the supervisor endpoint.
    const approvedCase = a.case_id ? await this.db.client.maintenanceCase.findUnique({ where: { id: a.case_id } }) : null;
    const state = asObj(approvedCase?.state, {});
    if (a.case_id && (!approvedCase || approvedCase.pump_id !== a.pump_id || state.pump_id !== a.pump_id)) return { error: 'kasus tidak sesuai dengan unit tindakan' };
    if (!inspection) {
      const analysis = await this.analyze(a.pump_id);
      if ('error' in analysis) return { error: `Tindakan ditunda: ${analysis.error}` };
      if (!(await this.check_sensor_validity({ pump_id: a.pump_id })).valid) return { error: 'Sensor perlu diperiksa sebelum perbaikan.' };
      const highRisk = [a.risk, approvedCase?.risk, state.risk, state.plan?.risk, assessRisk(analysis.label, analysis.components, analysis.flags)].includes('tinggi');
      const approved = a.approved === true && state.approved_by && approvedCase?.status === 'menunggu_persetujuan' && state.plan;
      if (highRisk && !(approved && state.plan.risk === 'tinggi')) return { error: 'tindakan berisiko tinggi membutuhkan persetujuan manusia', requires_approval: true };
      const confidence = state.plan?.confidence ?? analysis.confidence;
      if (confidence < CONFIG.CONF_ACT && !approved) return { error: 'Keyakinan diagnosis belum cukup untuk perbaikan otomatis. Minta klarifikasi atau eskalasi inspeksi.', requires_clarification: true };
      if (analysis.label === 'normal') return { error: 'Belum ada diagnosis gangguan untuk perbaikan. Gunakan jalur inspeksi.' };
    }
    return this.db.transaction(async () => {
      if (!await this.db.one('SELECT id FROM pumps WHERE id=$1 FOR UPDATE', [a.pump_id])) return { error: 'unit tidak ditemukan' };
      const duplicate = await this.db.client.workOrder.findFirst({ where: { pump_id: a.pump_id, OR: [{ title: a.title }, ...(a.case_id ? [{ case_id: a.case_id }] : [])], status: { notIn: ['selesai', 'dibatalkan'] } } });
      if (duplicate) return { id: duplicate.id, duplicate: true };
      const id = await this.db.nextId('WO', 'work_orders');
      await this.db.client.workOrder.create({ data: { id, pump_id: a.pump_id, case_id: a.case_id || null, title: a.title, description: a.description, priority: a.priority, status: 'terbuka', part: a.part ?? '', created_at: now() } });
      return { id, pump_id: a.pump_id, priority: a.priority, status: 'terbuka' };
    });
  }

  async schedule_technician(a: { work_order_id: string; skill: string; senior?: boolean }) {
    return this.db.transaction(async () => {
      await this.db.q('SELECT id FROM work_orders WHERE id=$1 FOR UPDATE', [a.work_order_id]);
      const wo = await this.db.client.workOrder.findUnique({ where: { id: a.work_order_id }, include: { technician: true } });
      if (!wo || ['selesai', 'dibatalkan'].includes(wo.status ?? '')) return { error: 'work order tidak tersedia', scheduled: false };
      if (wo.technician) return { scheduled: true, technician: wo.technician.name, technician_id: wo.technician.id, scheduled_at: wo.scheduled_at, duplicate: true };
      const candidates = a.senior
        ? await this.db.q("SELECT * FROM technicians WHERE available=true AND level='senior' AND skill<>'supervisor' ORDER BY (skill=$1) DESC,id LIMIT 1 FOR UPDATE SKIP LOCKED", [a.skill])
        : await this.db.q('SELECT * FROM technicians WHERE available=true AND skill=$1 ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED', [a.skill]);
      const technician = candidates[0];
      if (!technician) return { error: 'tidak ada teknisi tersedia', scheduled: false };
      const when = new Date(Date.now() + (wo.priority === 'tinggi' ? 2 * 3600e3 : (wo.priority === 'sedang' ? 1 : 2) * 86400e3));
      if (wo.priority !== 'tinggi') when.setHours(8, 0, 0, 0);
      const pad = (v: number) => String(v).padStart(2, '0');
      const scheduled_at = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
      await this.db.client.technician.update({ where: { id: technician.id }, data: { available: false } });
      await this.db.client.workOrder.update({ where: { id: wo.id }, data: { technician_id: technician.id, scheduled_at, status: 'terjadwal' } });
      return { scheduled: true, technician: technician.name, technician_id: technician.id, contact: technician.contact, scheduled_at };
    });
  }

  // ---------------------------------------------------------- notifikasi
  async send_notification(a: { recipient: string; message: string; channel?: string }) {
    if (!a.message) return { error: 'pesan kosong' };
    const channel = a.channel ?? 'telegram';
    const enabled = channel === 'telegram' && !!CONFIG.TELEGRAM_BOT_TOKEN && !!CONFIG.TELEGRAM_CHAT_ID;
    const status = enabled ? 'diantrekan' : 'disimulasikan';
    const row = await this.db.client.notification.create({ data: { ts: now(), recipient: a.recipient, channel, message: a.message, status, detail: enabled ? 'Menunggu pengiriman setelah transaksi commit.' : 'Telegram belum dikonfigurasi; pesan hanya dicatat.' } });
    return { id: Number(row.id), recipient: a.recipient, status, detail: row.detail };
  }

  async escalate_to_senior(a: { pump_id: string; summary: string; case_id?: string }) {
    const wo: any = await this.create_work_order({ pump_id: a.pump_id, title: `Eskalasi diagnosis ${a.pump_id}`, description: `Inspeksi oleh teknisi senior; perbaikan berisiko tetap membutuhkan persetujuan supervisor. ${a.summary}`, priority: 'tinggi', case_id: a.case_id, risk: 'sedang' }, true);
    const sched: any = wo.id ? await this.schedule_technician({ work_order_id: wo.id, skill: 'mekanik', senior: true }) : {};
    const n = await this.send_notification({ recipient: sched.technician ?? 'supervisor', message: `ESKALASI ${a.pump_id}: ${a.summary}` });
    return { work_order: wo, schedule: sched, notification: n };
  }

  // ---------------------------------------------------------- riwayat
  async save_case_history(a: { pump_id: string; symptoms: string; fault: string; root_cause: string; action: string; duration_min?: number }) {
    const id = await this.db.nextId('H', 'case_history');
    await this.db.x('INSERT INTO case_history (id,pump_id,ts,symptoms,fault,root_cause,action,duration_min) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, a.pump_id, now(), a.symptoms, a.fault, a.root_cause, a.action, a.duration_min ?? 0]);
    await this.rag.build();
    return { id, saved: true };
  }

  // ---------------------------------------------------------- registri
  async call(name: string, args: any, inspection = false): Promise<any> {
    const fn = (this as any)[name];
    if (!TOOL_SPECS.some((t) => t[0] === name) || typeof fn !== 'function') return { error: `tool tidak dikenal: ${name}` };
    try {
      const res = await fn.call(this, args || {}, name === 'create_work_order' && inspection);
      if (name === 'get_sensor_data' && res && typeof res === 'object') { const { rows, ...rest } = res; return rest; }
      return res;
    } catch (e: any) {
      return { error: `${e?.name ?? 'Error'}: ${e?.message ?? e}` };
    }
  }
}

export { FAULT_LABEL, DISPLAY_SENSORS, asObj };
