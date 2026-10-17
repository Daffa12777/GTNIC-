import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { FAULT_LABEL, asObj, now } from '../domain';
import { ToolsService } from '../tools/tools.service';

export const OPEN_STATUSES = ['diproses', 'menunggu_klarifikasi', 'menunggu_persetujuan'];

function short(tool: string, res: any): string {
  if (!res || typeof res !== 'object') return String(res).slice(0, 120);
  if (res.error) return `galat: ${res.error}`;
  try {
    switch (tool) {
      case 'get_sensor_data': {
        const l = res.latest;
        return `tekanan ${l.PS1} bar, daya motor ${l.EPS1} W, debit ${l.FS1} L/mnt, suhu ${l.TS1} C, getaran ${l.VS1} mm/s, efisiensi pendingin ${l.CE}%`;
      }
      case 'check_sensor_validity': return res.valid ? 'semua sensor valid' : `sensor mencurigakan: ${res.suspect_sensors.join(', ')}`;
      case 'detect_anomaly': return `${res.is_anomaly ? 'ANOMALI' : 'normal'} (skor ${res.anomaly_score}, ambang ${res.threshold})`;
      case 'classify_fault':
        return Object.entries(res.probs as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([k, v]) => `${FAULT_LABEL[k] ?? k} ${(v * 100).toFixed(0)}%`).join(', ');
      case 'search_manual': return (res.results || []).slice(0, 2).map((h: any) => `${h.citation} (skor ${h.score})`).join('; ') || 'tidak ada hasil';
      case 'search_history': return `${res.cases.length} kasus serupa`;
      case 'check_inventory': return res.found ? `${res.name}: stok ${res.stock}` : 'part tidak ditemukan';
      case 'create_work_order': return `${res.id ?? ''}${res.duplicate ? ' (sudah ada)' : ` prioritas ${res.priority}`}`;
      case 'schedule_technician': return res.scheduled ? `${res.technician} pada ${res.scheduled_at}` : 'teknisi belum tersedia';
      case 'send_notification': return `${res.recipient}: ${res.status}`;
      case 'create_purchase_request': return `${res.id} ${res.part_name} x${res.qty}`;
    }
  } catch { /* jatuh ke JSON */ }
  return JSON.stringify(res).slice(0, 140);
}

export class Trace {
  items: any[];
  constructor(private tools: ToolsService, private db: DbService, public caseId: string, items: any[] = []) { this.items = items; }

  add(kind: string, title: string, detail = '', tool?: string, args?: any, result?: any) {
    const it: any = { n: this.items.length + 1, kind, title, detail, tool: tool ?? null, args: args ?? null, ts: now() };
    if (result !== undefined) it.result = tool ? short(tool, result) : String(result);
    this.items.push(it);
    return it;
  }

  async tool(name: string, args: any = {}): Promise<any> {
    if (['create_work_order', 'escalate_to_senior'].includes(name)) args = { ...args, case_id: this.caseId };
    const res = await this.tools.call(name, args);
    this.add('tool', `Memanggil ${name}`, short(name, res), name, args, res);
    await this.db.x('INSERT INTO agent_logs (ts, case_id, step, tool, input, output) VALUES ($1,$2,$3,$4,$5,$6)',
      [now(), this.caseId, `step${this.items.length}`, name, JSON.stringify(args), JSON.stringify(res).slice(0, 2000)]);
    return res;
  }
}

@Injectable()
export class CaseStore {
  constructor(private db: DbService, private tools: ToolsService) {}

  async reserve(pumpId: string, complaint = '') {
    return this.db.transaction(async () => {
      await this.db.q('SELECT id FROM pumps WHERE id=$1 FOR UPDATE', [pumpId]);
      const existing = await this.db.client.maintenanceCase.findFirst({ where: { pump_id: pumpId, status: { in: OPEN_STATUSES } } });
      if (existing) return { id: existing.id, existing: true };
      const id = await this.db.nextId('C', 'cases');
      await this.db.client.maintenanceCase.create({ data: { id, pump_id: pumpId, status: 'diproses', state: { pump_id: pumpId, complaint }, trace: [], created_at: now(), updated_at: now(), mode: 'policy' } });
      return { id, existing: false };
    });
  }

  trace(caseId: string, items: any[] = []) { return new Trace(this.tools, this.db, caseId, items); }

  async save(caseId: string, trace: Trace, status: string, state: any, o: { fault?: string | null; conf?: number | null; risk?: string | null; summary?: string | null; mode?: string } = {}) {
    const t = now();
    const exists = await this.db.one('SELECT id FROM cases WHERE id=$1', [caseId]);
    if (!exists) {
      await this.db.x('INSERT INTO cases VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)',
        [caseId, state?.pump_id ?? null, status, o.fault ?? null, o.conf ?? null, o.risk ?? null, o.summary ?? null,
          JSON.stringify(trace.items), JSON.stringify(state ?? {}), t, t, o.mode ?? 'policy']);
    } else {
      await this.db.x('UPDATE cases SET status=$1, fault=$2, confidence=$3, risk=$4, summary=$5, trace=$6::jsonb, state=$7::jsonb, updated_at=$8 WHERE id=$9',
        [status, o.fault ?? null, o.conf ?? null, o.risk ?? null, o.summary ?? null, JSON.stringify(trace.items), JSON.stringify(state ?? {}), t, caseId]);
    }
  }

  async get(caseId: string): Promise<any | null> {
    const c = await this.db.one('SELECT * FROM cases WHERE id=$1', [caseId]);
    if (!c) return null;
    const state = asObj(c.state, {});
    return { ...c, state, trace: asObj(c.trace, []), confidence: c.confidence == null ? null : Number(c.confidence), created_at: Number(c.created_at), updated_at: Number(c.updated_at), question: c.status === 'menunggu_klarifikasi' ? state.question ?? null : null, plan: c.status === 'menunggu_persetujuan' ? state.plan ?? null : null, probs: state.probs ?? null };
  }

  async list(limit = 30) {
    const rows = await this.db.q('SELECT id, pump_id, status, fault, confidence, risk, summary, created_at, mode FROM cases ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows.map((r: any) => ({ ...r, confidence: r.confidence == null ? null : Number(r.confidence), created_at: Number(r.created_at) }));
  }

  openFor(pumpId: string) {
    return this.db.one("SELECT id FROM cases WHERE pump_id=$1 AND status IN ('diproses','menunggu_klarifikasi','menunggu_persetujuan') ORDER BY created_at DESC", [pumpId]);
  }
}
