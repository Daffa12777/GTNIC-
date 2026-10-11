import { Body, Controller, Get, Headers, HttpException, Param, Post, Query } from '@nestjs/common';
import { AgentService } from '../agent/agent.service';
import { CaseStore } from '../agent/case.store';
import { LlmService } from '../agent/llm.service';
import { CONFIG } from '../config';
import { DbService } from '../db/db.service';
import { DISPLAY_SENSORS, FAULT_LABEL } from '../domain';
import { MlService } from '../ml/ml.service';
import { MonitorService } from '../monitor/monitor.service';
import { StatusStore } from '../monitor/status.store';
import { SimService } from '../sim/sim.service';

const bad = (msg: string, code = 400) => new HttpException({ detail: msg }, code);
const num = (v: any) => (v == null ? v : Number(v));

@Controller()
export class ApiController {
  constructor(private db: DbService, private agent: AgentService, private cases: CaseStore, private llm: LlmService,
    private sim: SimService, private ml: MlService, private monitor: MonitorService, private status: StatusStore) {}

  private fail<T>(r: T): T {
    if (r && typeof r === 'object' && (r as any).error) throw bad((r as any).error);
    return r;
  }
  /** Peran demo (header x-role). Bukan autentikasi sungguhan; hanya memisahkan hak persetujuan. */
  private needSupervisor(role?: string) {
    if ((role || '').toLowerCase() !== 'supervisor') throw bad('Hanya supervisor yang dapat menyetujui atau menolak.', 403);
  }

  @Get('health')
  health() { return { ok: true, db: this.db.mode, time: Date.now() / 1000 }; }

  @Get('overview')
  async overview() {
    const pumps = await this.db.q('SELECT * FROM pumps ORDER BY id');
    const wos = await this.db.q("SELECT pump_id, COUNT(*) AS n FROM work_orders WHERE status NOT IN ('selesai','dibatalkan') GROUP BY pump_id");
    const wmap = Object.fromEntries(wos.map((w: any) => [w.pump_id, Number(w.n)]));
    const out: any[] = [];
    for (const p of pumps) {
      const oc = await this.cases.openFor(p.id);
      out.push({ ...p, status: this.status.map[p.id] ?? { state: 'tidak ada data' }, open_work_orders: wmap[p.id] ?? 0, open_case: oc?.id ?? null });
    }
    const meta = await this.ml.meta();
    return {
      pumps: out, auto: this.status.auto.enabled, llm_available: this.llm.enabled, llm_model: this.llm.enabled ? CONFIG.GEMINI_MODEL : null,
      db: this.db.mode, tick_seconds: CONFIG.TICK_SECONDS, simulator: CONFIG.SIM_ENABLED,
      ml: meta.error ? { ok: false, error: meta.error } : { ok: true, source: meta.source, trained_at: meta.trained_at },
      fault_labels: FAULT_LABEL,
    };
  }

  @Get('ml/meta')
  mlMeta() { return this.ml.meta(); }

  @Get('pumps/:id/readings')
  async readings(@Param('id') id: string, @Query('limit') limit = '60') {
    const p = await this.db.one('SELECT * FROM pumps WHERE id=$1', [id]);
    if (!p) throw bad('unit tidak ditemukan', 404);
    const n = Math.max(2, Math.min(Number(limit) || 60, 240));
    const rows = this.sim.recent(id, n).map((r) => ({ ts: r.ts, ...this.sim.display(r.features) }));
    const sensors = DISPLAY_SENSORS.map((s) => ({ key: s, ...this.sim.profiles.sensors[s] }));
    return { pump: p, sensors, nominal: this.sim.nominalDisplay(), readings: rows, status: this.status.map[id] ?? null, components: this.sim.profiles.components };
  }

  @Post('diagnose')
  async diagnose(@Body() b: any) {
    if (!b?.pump_id) throw bad('pump_id wajib');
    return this.fail(await this.agent.diagnose(b.pump_id, b.complaint ?? '', 'manual', !!b.use_llm));
  }

  @Post('chat')
  chat(@Body() b: any) { return this.agent.chat(b?.message ?? '', b?.case_id ?? null, !!b?.use_llm); }

  @Post('triage')
  triage() { return this.agent.triage('manual'); }

  @Get('cases')
  listCases() { return this.cases.list(40); }

  @Get('cases/:id')
  async getCase(@Param('id') id: string) {
    const c = await this.cases.get(id);
    if (!c) throw bad('kasus tidak ditemukan', 404);
    return c;
  }

  @Post('cases/:id/answer')
  async answer(@Param('id') id: string, @Body() b: any) {
    if (!b?.text?.trim()) throw bad('text wajib');
    return this.fail(await this.agent.continueCase(id, b.text));
  }

  @Post('cases/:id/approve')
  async approve(@Param('id') id: string, @Headers('x-role') role?: string) {
    this.needSupervisor(role);
    return this.fail(await this.agent.approve(id));
  }

  @Post('cases/:id/reject')
  async reject(@Param('id') id: string, @Body() b: any, @Headers('x-role') role?: string) {
    this.needSupervisor(role);
    return this.fail(await this.agent.reject(id, b?.note ?? ''));
  }

  @Get('work-orders')
  async workOrders() {
    const r = await this.db.q('SELECT w.*, t.name AS technician FROM work_orders w LEFT JOIN technicians t ON t.id = w.technician_id ORDER BY w.created_at DESC LIMIT 60');
    return r.map((w: any) => ({ ...w, created_at: num(w.created_at), closed_at: num(w.closed_at) }));
  }

  @Post('work-orders/:id/complete')
  async complete(@Param('id') id: string, @Body() b: any) {
    return this.fail(await this.agent.completeWorkOrder(id, b?.root_cause ?? '', b?.action ?? '', Number(b?.duration_min ?? 60)));
  }

  @Get('inventory')
  inventory() { return this.db.q('SELECT * FROM inventory ORDER BY part_id'); }

  @Get('technicians')
  technicians() { return this.db.q('SELECT * FROM technicians ORDER BY id'); }

  @Get('purchase-requests')
  async purchases() {
    const r = await this.db.q('SELECT * FROM purchase_requests ORDER BY created_at DESC LIMIT 40');
    return r.map((x: any) => ({ ...x, created_at: num(x.created_at) }));
  }

  @Get('notifications')
  async notifications() {
    const r = await this.db.q('SELECT * FROM notifications ORDER BY id DESC LIMIT 40');
    return r.map((x: any) => ({ ...x, id: num(x.id), ts: num(x.ts) }));
  }

  @Post('auto')
  setAuto(@Body() b: any) { this.status.auto.enabled = !!b?.enabled; return { auto: this.status.auto.enabled }; }

  @Post('scenario/start')
  async startScenario() { this.sim.startScenario(); return { ok: true }; }

  @Post('scenario/fault')
  async fault(@Body() b: any) {
    if (!this.sim.startFault(b?.pump_id, b?.fault, Number(b?.rate ?? 0.07), Number(b?.severity ?? 0))) throw bad('pump_id atau fault tidak valid');
    return { ok: true };
  }

  @Post('scenario/dropout')
  async dropout(@Body() b: any) {
    if (!b?.pump_id) throw bad('pump_id wajib');
    this.sim.setDropout(b.pump_id, b.sensor ?? null);
    return { ok: true };
  }

  @Post('scenario/reset')
  async reset() {
    for (const id of Object.keys(this.sim.state)) this.sim.resetPump(id);
    return { ok: true };
  }

  /** Satu siklus manual (dipakai tes dan demo tanpa timer). */
  @Post('scenario/tick')
  async tick() { await this.monitor.tick(); return { ok: true }; }
}
