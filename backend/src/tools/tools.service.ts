import { Injectable } from '@nestjs/common';
import { CONFIG } from '../config';
import { COMP_KEYS, DISPLAY_SENSORS, FAULT_LABEL, asObj, now } from '../domain';
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

  constructor(private db: DbService, private ml: MlService, private sim: SimService, private rag: RagService) {}

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

  async check_sensor_validity(a: { pump_id: string }) {
    const rows = this.sim.recent(a.pump_id, 5);
    const bad: string[] = [];
    if (rows.length) {
      for (const s of this.sim.profiles.features.filter((f) => f.endsWith('_mean')).map((f) => f.replace('_mean', ''))) {
        const vals = rows.map((r) => r.features[`${s}_mean`]);
        if (vals.some((v) => v == null || !Number.isFinite(v)) || vals.every((v) => v === 0)) bad.push(s);
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
    if (!(qty >= 1 && qty <= 50)) return { error: 'qty harus 1-50' };
    const id = await this.db.nextId('PR', 'purchase_requests');
    await this.db.x('INSERT INTO purchase_requests VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, a.part_name, qty, a.reason, a.work_order_id ?? '', 'menunggu persetujuan', now()]);
    return { id, part_name: a.part_name, qty, status: 'menunggu persetujuan' };
  }

  // ---------------------------------------------------------- work order
  async create_work_order(a: { pump_id: string; title: string; description: string; priority: string; part?: string; case_id?: string; risk?: string; approved?: boolean }) {
    if (!(await this.getPump(a.pump_id))) return { error: `unit tidak ditemukan: ${a.pump_id}` };
    if (!['rendah', 'sedang', 'tinggi'].includes(a.priority)) return { error: 'priority harus rendah|sedang|tinggi' };
    if (!a.title || !a.description) return { error: 'title dan description wajib' };
    if ((a.risk ?? 'sedang') === 'tinggi' && !a.approved) return { error: 'tindakan berisiko tinggi membutuhkan persetujuan manusia', requires_approval: true };
    const dup = await this.db.one("SELECT id FROM work_orders WHERE pump_id=$1 AND status NOT IN ('selesai','dibatalkan') AND title=$2", [a.pump_id, a.title]);
    if (dup) return { id: dup.id, duplicate: true, note: 'work order serupa masih terbuka' };
    const id = await this.db.nextId('WO', 'work_orders');
    await this.db.x('INSERT INTO work_orders VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [id, a.pump_id, a.case_id ?? '', a.title, a.description, a.priority, 'terbuka', null, null, a.part ?? '', now(), null]);
    return { id, pump_id: a.pump_id, priority: a.priority, status: 'terbuka' };
  }

  async schedule_technician(a: { work_order_id: string; skill: string; senior?: boolean }) {
    const wo = await this.db.one('SELECT * FROM work_orders WHERE id=$1', [a.work_order_id]);
    if (!wo) return { error: `work order tidak ditemukan: ${a.work_order_id}` };
    let techs = await this.db.q('SELECT * FROM technicians WHERE available=true AND skill=$1', [a.skill]);
    if (a.senior) {
      const sr = techs.filter((t: any) => t.level === 'senior');
      techs = sr.length ? sr : await this.db.q("SELECT * FROM technicians WHERE available=true AND level='senior' AND skill<>'supervisor'");
    }
    if (!techs.length) return { error: 'tidak ada teknisi tersedia', scheduled: false };
    const t = techs[0];
    const base = new Date();
    let when: Date;
    if (wo.priority === 'tinggi') when = new Date(base.getTime() + 2 * 3600e3);
    else {
      when = new Date(base.getTime() + (wo.priority === 'sedang' ? 1 : 2) * 86400e3);
      when.setHours(8, 0, 0, 0);
    }
    const p = (n: number) => String(n).padStart(2, '0');
    const when_s = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())} ${p(when.getHours())}:${p(when.getMinutes())}`;
    await this.db.x("UPDATE work_orders SET technician_id=$1, scheduled_at=$2, status='terjadwal' WHERE id=$3", [t.id, when_s, a.work_order_id]);
    await this.db.x('UPDATE technicians SET available=false WHERE id=$1', [t.id]);
    return { scheduled: true, technician: t.name, technician_id: t.id, contact: t.contact, scheduled_at: when_s };
  }

  // ---------------------------------------------------------- notifikasi
  async send_notification(a: { recipient: string; message: string; channel?: string }) {
    if (!a.message) return { error: 'pesan kosong' };
    const channel = a.channel ?? 'telegram';
    let status = 'disimulasikan', detail = 'Telegram belum dikonfigurasi; pesan hanya dicatat.';
    if (channel === 'telegram' && CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_CHAT_ID) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: CONFIG.TELEGRAM_CHAT_ID, text: `[${a.recipient}] ${a.message}` }), signal: AbortSignal.timeout(8000),
        });
        if (r.ok) { status = 'terkirim'; detail = 'Terkirim melalui Telegram Bot API.'; }
        else { status = 'gagal'; detail = `Telegram HTTP ${r.status}`; }
      } catch (e: any) { status = 'gagal'; detail = String(e?.message ?? e); }
    }
    const r = await this.db.one('INSERT INTO notifications (ts, recipient, channel, message, status, detail) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [now(), a.recipient, channel, a.message, status, detail]);
    return { id: Number(r!.id), recipient: a.recipient, status, detail };
  }

  async escalate_to_senior(a: { pump_id: string; summary: string; case_id?: string }) {
    const wo: any = await this.create_work_order({ pump_id: a.pump_id, title: `Eskalasi diagnosis ${a.pump_id}`, description: a.summary, priority: 'tinggi', case_id: a.case_id, risk: 'sedang' });
    const sched: any = wo.id ? await this.schedule_technician({ work_order_id: wo.id, skill: 'mekanik', senior: true }) : {};
    const n = await this.send_notification({ recipient: sched.technician ?? 'supervisor', message: `ESKALASI ${a.pump_id}: ${a.summary}` });
    return { work_order: wo, schedule: sched, notification: n };
  }

  // ---------------------------------------------------------- riwayat
  async save_case_history(a: { pump_id: string; symptoms: string; fault: string; root_cause: string; action: string; duration_min?: number }) {
    const id = await this.db.nextId('H', 'case_history');
    await this.db.x('INSERT INTO case_history VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, a.pump_id, now(), a.symptoms, a.fault, a.root_cause, a.action, a.duration_min ?? 0]);
    await this.rag.build();
    return { id, saved: true };
  }

  // ---------------------------------------------------------- registri
  async call(name: string, args: any): Promise<any> {
    const fn = (this as any)[name];
    if (!TOOL_SPECS.some((t) => t[0] === name) || typeof fn !== 'function') return { error: `tool tidak dikenal: ${name}` };
    try {
      const res = await fn.call(this, args || {});
      if (name === 'get_sensor_data' && res && typeof res === 'object') { const { rows, ...rest } = res; return rest; }
      return res;
    } catch (e: any) {
      return { error: `${e?.name ?? 'Error'}: ${e?.message ?? e}` };
    }
  }
}

export { FAULT_LABEL, DISPLAY_SENSORS, asObj };
