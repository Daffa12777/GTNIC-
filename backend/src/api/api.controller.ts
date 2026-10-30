import { Body, Controller, Get, Headers, HttpException, Param, Post, Query, SetMetadata, UsePipes, ValidationPipe } from '@nestjs/common';
import { CompleteWorkOrderDto } from './complete-work-order.dto';
import { ChatDto } from './chat.dto';
import { RatePolicy } from '../security/rate-policy';
import { AnswerDto, AutoDto, DiagnoseDto, DropoutDto, FaultDto, RejectDto } from './operations.dto';
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
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
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
  private needSimulation(role?: string) {
    this.needSupervisor(role);
    if (!CONFIG.SCENARIO_CONTROLS_ENABLED) throw bad('Kontrol simulator dinonaktifkan pada lingkungan ini.', 403);
  }

  @Get('health')
  @SetMetadata('public', true)
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
      scenario_controls_enabled: CONFIG.SCENARIO_CONTROLS_ENABLED,
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
  @RatePolicy('ai')
  async diagnose(@Body() b: DiagnoseDto) {
    return this.fail(await this.agent.diagnose(b.pump_id, b.complaint, 'manual', b.use_llm));
  }

  @Post('chat')
  @RatePolicy('ai')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  chat(@Body() b: ChatDto) { return this.agent.chat(b.message, b.case_id ?? null, b.use_llm, b.history); }

  @Post('triage')
  @RatePolicy('ai')
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
  async answer(@Param('id') id: string, @Body() b: AnswerDto) {
    return this.fail(await this.agent.continueCase(id, b.text));
  }

  @Post('cases/:id/approve')
  @SetMetadata('roles', ['supervisor'])
  async approve(@Param('id') id: string, @Headers('x-role') role?: string) {
    this.needSupervisor(role);
    return this.fail(await this.agent.approve(id));
  }

  @Post('cases/:id/reject')
  @SetMetadata('roles', ['supervisor'])
  async reject(@Param('id') id: string, @Body() b: RejectDto, @Headers('x-role') role?: string) {
    this.needSupervisor(role);
    return this.fail(await this.agent.reject(id, b?.note ?? ''));
  }

  @Get('work-orders')
  async workOrders() {
    const r = await this.db.q('SELECT w.*, t.name AS technician FROM work_orders w LEFT JOIN technicians t ON t.id = w.technician_id ORDER BY w.created_at DESC LIMIT 60');
    return r.map((w: any) => ({ ...w, created_at: num(w.created_at), closed_at: num(w.closed_at) }));
  }

  @Post('work-orders/:id/complete')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async complete(@Param('id') id: string, @Body() b: CompleteWorkOrderDto) {
    return this.fail(await this.agent.completeWorkOrder(id, b.root_cause.trim(), b.action.trim(), b.duration_min ?? 60));
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
  @SetMetadata('roles', ['supervisor'])
  setAuto(@Body() b: AutoDto, @Headers('x-role') role?: string) { this.needSupervisor(role); this.status.auto.enabled = b.enabled; return { auto: this.status.auto.enabled }; }

  @Post('scenario/start')
  @SetMetadata('roles', ['supervisor'])
  async startScenario(@Headers('x-role') role?: string) { this.needSimulation(role); this.sim.startScenario(); return { ok: true }; }

  @Post('scenario/fault')
  @SetMetadata('roles', ['supervisor'])
  async fault(@Body() b: FaultDto, @Headers('x-role') role?: string) {
    this.needSimulation(role);
    if (!this.sim.startFault(b.pump_id, b.fault, b.rate, b.severity)) throw bad('pump_id atau fault tidak valid');
    return { ok: true };
  }

  @Post('scenario/dropout')
  @SetMetadata('roles', ['supervisor'])
  async dropout(@Body() b: DropoutDto, @Headers('x-role') role?: string) {
    this.needSimulation(role);
    this.sim.setDropout(b.pump_id, b.sensor ?? null);
    return { ok: true };
  }

  @Post('scenario/reset')
  @SetMetadata('roles', ['supervisor'])
  async reset(@Headers('x-role') role?: string) {
    this.needSimulation(role);
    for (const id of Object.keys(this.sim.state)) this.sim.resetPump(id);
    return { ok: true };
  }

  /** Satu siklus manual (dipakai tes dan demo tanpa timer). */
  @Post('scenario/tick')
  @SetMetadata('roles', ['supervisor'])
  async tick(@Headers('x-role') role?: string) { this.needSimulation(role); await this.monitor.tick(); return { ok: true }; }
}
