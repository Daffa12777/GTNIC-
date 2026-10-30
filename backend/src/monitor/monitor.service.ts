import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AgentService } from '../agent/agent.service';
import { CaseStore } from '../agent/case.store';
import { CONFIG } from '../config';
import { DbService } from '../db/db.service';
import { now } from '../domain';
import { RagService } from '../rag/rag.service';
import { SimService } from '../sim/sim.service';
import { ToolsService } from '../tools/tools.service';
import { PumpStatus, StatusStore } from './status.store';

/** Monitor: tiap siklus bangkitkan data, hitung status tiap unit, picu agent otomatis bila perlu. */
@Injectable()
export class MonitorService implements OnApplicationBootstrap, OnModuleDestroy {
  private log = new Logger('Monitor');
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(private db: DbService, private sim: SimService, private tools: ToolsService, private agent: AgentService,
    private cases: CaseStore, private rag: RagService, private status: StatusStore) {}

  async onApplicationBootstrap() {
    this.status.auto.enabled = CONFIG.AUTO_AGENT;
    const pumps = await this.db.q('SELECT id FROM pumps ORDER BY id');
    await this.sim.init(pumps.map((p: any) => p.id));
    if (CONFIG.SIM_ENABLED && CONFIG.DEMO_SCENARIO) {
      this.sim.startScenario();
      this.log.log('Skenario demo aktif: pendingin Pump-02 dan kebocoran Pump-03.');
    }
    await this.rag.build();
    await this.refreshStatus();
    if (CONFIG.SIM_ENABLED) {
      this.timer = setInterval(() => this.tick().catch((e) => this.log.error(e)), CONFIG.TICK_SECONDS * 1000);
      this.log.log(`Simulator aktif, siklus tiap ${CONFIG.TICK_SECONDS} dtk`);
    }
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async computeStatus(pumpId: string): Promise<PumpStatus> {
    const rows = this.sim.recent(pumpId, 1);
    if (!rows.length) return { state: 'tidak ada data' };
    const latest = this.sim.display(rows[0].features);
    const valid = await this.tools.check_sensor_validity({ pump_id: pumpId });
    if (!valid.valid) return { state: 'sensor', label: 'sensor', confidence: 0, suspect: valid.suspect_sensors, latest };
    const an: any = await this.tools.analyze(pumpId);
    if (an.error) return { state: 'ml_error', error: an.error, latest };
    let state: PumpStatus['state'];
    if (an.flags.length) state = 'kritis';
    else if ((an.label !== 'normal' && an.confidence >= 0.6) || (an.is_anomaly && an.anomaly_score > an.threshold * 1.5)) state = 'waspada';
    else state = 'normal';
    return {
      state, label: an.label, confidence: an.confidence, anomaly_score: an.anomaly_score, threshold: an.threshold,
      is_anomaly: an.is_anomaly, probs: an.probs, flags: an.flags, components: an.components, latest,
    };
  }

  async refreshStatus() {
    const pumps = await this.db.q('SELECT id FROM pumps ORDER BY id');
    for (const p of pumps) this.status.map[p.id] = await this.computeStatus(p.id);
  }

  async hasOpenWork(pumpId: string) {
    return !!(await this.db.one("SELECT id FROM work_orders WHERE pump_id=$1 AND status NOT IN ('selesai','dibatalkan')", [pumpId]));
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.sim.stepAll();
      await this.refreshStatus();
      if (!this.status.auto.enabled) return;
      const t = now();
      for (const [pid, st] of Object.entries(this.status.map)) {
        // Agent otomatis hanya dipicu oleh pola gangguan, ambang kritis, atau sensor bermasalah.
        const pattern = st.state === 'waspada' && st.label && st.label !== 'normal';
        if (!(st.state === 'kritis' || st.state === 'sensor' || pattern)) continue;
        if ((await this.hasOpenWork(pid)) || (await this.cases.openFor(pid))) continue;
        const last = await this.db.one('SELECT created_at FROM cases WHERE pump_id=$1 ORDER BY created_at DESC', [pid]);
        if (last && t - Number(last.created_at) < 30) continue;
        await this.agent.diagnose(pid, '', 'auto');
      }
    } finally {
      this.busy = false;
    }
  }
}
