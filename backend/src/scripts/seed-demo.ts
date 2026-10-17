import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

async function main() {
  // Explicit CLI action only. Never send external notifications while preparing fixtures.
  process.env.SEED_DEMO_DATA = 'true';
  process.env.SIM_ENABLED = 'false';
  process.env.AUTO_AGENT = 'false';
  process.env.TELEGRAM_BOT_TOKEN = '';
  process.env.TELEGRAM_CHAT_ID = '';
  const { MlService } = await import('../ml/ml.service');
  const ml = new MlService();
  const meta: unknown = await ml.meta();
  if (!meta || typeof meta !== 'object' || 'error' in meta) throw new Error('Layanan ML harus aktif sebelum mengisi demo.');
  const { AppModule } = await import('../app.module');
  const { DbService } = await import('../db/db.service');
  const { SimService } = await import('../sim/sim.service');
  const { AgentService } = await import('../agent/agent.service');
  const { ToolsService } = await import('../tools/tools.service');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const db = app.get(DbService);
    const sim = app.get(SimService);
    const agent = app.get(AgentService);
    const tools = app.get(ToolsService);
    const scenarios = [
      { id: 'Pump-02', fault: 'cooler', severity: 0.4, complaint: 'Demo: oli cepat panas, efisiensi pendingin turun.' },
      { id: 'Pump-03', fault: 'pump', severity: 1, complaint: 'Demo: kebocoran pompa, tekanan turun dan debit turun.' },
      { id: 'Pump-04', fault: 'valve', severity: 0.35, complaint: 'Demo: respons katup lambat, gerak aktuator tersendat.' },
    ];
    const before = await db.client.maintenanceCase.count();
    for (const scenario of scenarios) sim.startFault(scenario.id, scenario.fault, 0, scenario.severity);
    // Samples come from the existing UCI profile bank; predictions are never stubbed.
    for (let index = 0; index < 6; index++) await sim.stepAll();
    const diagnoses: { pump: string; label: string; confidence: number }[] = [];
    for (const scenario of scenarios) {
      const analysis = await tools.analyze(scenario.id);
      if ('error' in analysis) throw new Error(analysis.error);
      diagnoses.push({ pump: scenario.id, label: analysis.label, confidence: analysis.confidence });
      if (await db.client.maintenanceCase.findFirst({ where: { pump_id: scenario.id, status: { not: 'gagal' } } })) continue;
      const result: unknown = await agent.diagnose(scenario.id, scenario.complaint, 'demo');
      if (result && typeof result === 'object' && 'error' in result) throw new Error(String(result.error));
    }
    console.log(JSON.stringify({
      source: 'source' in meta ? meta.source : 'unknown', diagnoses,
      pumps: await db.client.pump.count(), readings: await db.client.sensorReading.count(),
      inventory: await db.client.inventory.count(), technicians: await db.client.technician.count(),
      history: await db.client.caseHistory.count(), cases: await db.client.maintenanceCase.count(),
      newCases: await db.client.maintenanceCase.count() - before,
      workOrders: await db.client.workOrder.count(), purchases: await db.client.purchaseRequest.count(),
      notifications: await db.client.notification.count(),
    }, null, 2));
  } finally { await app.close(); }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Pengisian demo gagal.'); process.exitCode = 1; });
