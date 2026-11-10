import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { AgentService } from '../src/agent/agent.service';
import { CaseStore } from '../src/agent/case.store';
import { LlmService } from '../src/agent/llm.service';
import { CONFIG } from '../src/config';
import { DbService } from '../src/db/db.service';
import { COMP_KEYS } from '../src/domain';
import { MlService, type MlRaw } from '../src/ml/ml.service';
import { MonitorService } from '../src/monitor/monitor.service';
import { StatusStore } from '../src/monitor/status.store';
import { RagService } from '../src/rag/rag.service';
import { SimService } from '../src/sim/sim.service';
import { ToolsService } from '../src/tools/tools.service';

let moduleRef: TestingModule, db: DbService, agent: AgentService, sim: SimService, pumpId: string, orderId: string;
const originalSimulation = CONFIG.SIM_ENABLED;

beforeAll(async () => {
  CONFIG.SIM_ENABLED = false;
  moduleRef = await Test.createTestingModule({ providers: [DbService, MlService, SimService, RagService, ToolsService, CaseStore, LlmService, AgentService, StatusStore] }).compile();
  await moduleRef.init();
  db = moduleRef.get(DbService); agent = moduleRef.get(AgentService); sim = moduleRef.get(SimService);
});

beforeEach(async () => {
  CONFIG.SIM_ENABLED = false;
  pumpId = `recovery-${randomUUID()}`; orderId = `wo-${pumpId}`;
  await db.client.pump.create({ data: { id: pumpId } });
  const features = { ...sim.vec2obj(sim.profiles.healthy[0]), PS1_mean: -999 };
  await db.client.sensorReading.createMany({ data: Array.from({ length: 40 }, (_, i) => ({ pump_id: pumpId, ts: i + 1, features })) });
  await db.client.workOrder.create({ data: { id: orderId, pump_id: pumpId, title: 'Perbaikan fixture', description: 'Perbaiki', status: 'terbuka' } });
  await sim.init([pumpId]);
});

afterEach(async () => {
  jest.restoreAllMocks(); CONFIG.SIM_ENABLED = false;
  await db.client.stockMovement.deleteMany({ where: { partId: pumpId } });
  await db.client.inventory.deleteMany({ where: { part_id: pumpId } });
  await db.client.agentLog.deleteMany({ where: { tool: 'recover_demo_readings', input: { contains: orderId } } });
  await db.client.caseHistory.deleteMany({ where: { pump_id: pumpId } });
  await db.client.workOrder.deleteMany({ where: { pump_id: pumpId } });
  await db.client.sensorReading.deleteMany({ where: { pump_id: pumpId } });
  await db.client.pump.delete({ where: { id: pumpId } });
});
afterAll(async () => { CONFIG.SIM_ENABLED = originalSimulation; await moduleRef.close(); });

const prediction = (broken: boolean): MlRaw => ({
  source: 'fixture', anomaly: { score: broken ? -1 : 0, threshold: -0.5, is_anomaly: broken },
  components: Object.fromEntries(COMP_KEYS.map(key => [key, { level: 1, severity: broken && key === 'pump' ? 1 : 0, confidence: 0.99, p_degraded: broken && key === 'pump' ? 0.99 : 0, probs: {} }])),
});

it('consumes one part once when duplicate requests complete a work order', async () => {
  await db.client.inventory.create({ data: { part_id: pumpId, name: `Seal ${pumpId}`, stock: 2 } });
  await db.client.workOrder.update({ where: { id: orderId }, data: { part: `SEAL ${pumpId.toUpperCase()}` } });
  await Promise.all([agent.completeWorkOrder(orderId), agent.completeWorkOrder(orderId)]);
  expect((await db.client.inventory.findUniqueOrThrow({ where: { part_id: pumpId } })).stock).toBe(1);
  expect(await db.client.stockMovement.findMany({ where: { partId: pumpId } })).toEqual([
    expect.objectContaining({ delta: -1, balance: 1, reason: `Pemakaian part ${orderId}` }),
  ]);
});

it('refuses completion when the listed part is missing or out of stock', async () => {
  await db.client.workOrder.update({ where: { id: orderId }, data: { part: pumpId } });
  expect(await agent.completeWorkOrder(orderId)).toEqual({ error: expect.stringContaining('tidak ditemukan') });
  await db.client.inventory.create({ data: { part_id: pumpId, name: pumpId, stock: 0 } });
  expect(await agent.completeWorkOrder(orderId)).toEqual({ error: expect.stringContaining('kosong') });
  expect((await db.client.workOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('terbuka');
  expect(await db.client.caseHistory.count({ where: { work_order_id: orderId } })).toBe(0);
});

it('rolls back part consumption if sensor recovery fails', async () => {
  await db.client.inventory.create({ data: { part_id: pumpId, name: pumpId, stock: 2 } });
  await db.client.workOrder.update({ where: { id: orderId }, data: { part: pumpId } });
  jest.spyOn(sim, 'recover').mockRejectedValue(new Error('recovery failed'));
  await expect(agent.completeWorkOrder(orderId)).rejects.toThrow('recovery failed');
  expect((await db.client.inventory.findUniqueOrThrow({ where: { part_id: pumpId } })).stock).toBe(2);
  expect(await db.client.stockMovement.count({ where: { partId: pumpId } })).toBe(0);
});

it('allows only one of two work orders to consume the last part', async () => {
  await db.client.inventory.create({ data: { part_id: pumpId, name: pumpId, stock: 1 } });
  await db.client.workOrder.update({ where: { id: orderId }, data: { part: pumpId } });
  const secondId = `${orderId}-second`;
  await db.client.workOrder.create({ data: { id: secondId, pump_id: pumpId, part: pumpId, status: 'terbuka' } });
  const results = await Promise.all([agent.completeWorkOrder(orderId), agent.completeWorkOrder(secondId)]);
  expect(results.filter(result => 'ok' in result)).toHaveLength(1);
  expect(results.filter(result => 'error' in result)).toEqual([{ error: expect.stringContaining('kosong') }]);
  expect((await db.client.inventory.findUniqueOrThrow({ where: { part_id: pumpId } })).stock).toBe(0);
  expect(await db.client.stockMovement.count({ where: { partId: pumpId } })).toBe(1);
});

it('refreshes an already running instance after completion, even when reading timestamps match', async () => {
  const reader = new SimService(db); await reader.init([pumpId]);
  const ml = moduleRef.get(MlService), rag = moduleRef.get(RagService);
  jest.spyOn(ml, 'predict').mockImplementation(async features => prediction(features.PS1_mean === -999));
  const tools = new ToolsService(db, ml, reader, rag);
  const monitor = new MonitorService(db, reader, tools, agent, moduleRef.get(CaseStore), rag, new StatusStore());
  expect((await monitor.computeStatus(pumpId)).state).toBe('kritis');
  jest.spyOn(Date, 'now').mockReturnValue(40000);
  expect(await agent.completeWorkOrder(orderId, 'Seal aus', 'Ganti seal')).toEqual({ ok: true, work_order: orderId });
  expect((await monitor.computeStatus(pumpId)).state).toBe('normal');
  expect((await reader.recent(pumpId, 1))[0].ts).toBe(40);
  expect(await db.client.sensorReading.count({ where: { pump_id: pumpId } })).toBe(45);
});

it('rolls back completion, history and partial recovery writes while preserving simulator memory', async () => {
  CONFIG.SIM_ENABLED = true;
  sim.startFault(pumpId, 'pump', 0, 1);
  const previous = [...await sim.recent(pumpId, 5)];
  const execute = db.x.bind(db); let sensorWrites = 0;
  const failure = jest.spyOn(db, 'x').mockImplementation(async (sql, params) => {
    if (sql.startsWith('INSERT INTO sensor_readings') && ++sensorWrites === 2) throw new Error('recovery write failed');
    return execute(sql, params);
  });
  await expect(agent.completeWorkOrder(orderId, 'Seal aus', 'Ganti seal')).rejects.toThrow('recovery write failed');
  expect((await db.client.workOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('terbuka');
  expect(await db.client.caseHistory.count({ where: { work_order_id: orderId } })).toBe(0);
  expect(await db.client.sensorReading.count({ where: { pump_id: pumpId } })).toBe(40);
  expect(await sim.recent(pumpId, 5)).toEqual(previous);
  expect(sim.state[pumpId].fault).toBe('pump');
  failure.mockRestore();
  expect(await agent.completeWorkOrder(orderId, 'Seal aus', 'Ganti seal')).toEqual({ ok: true, work_order: orderId });
  expect(sim.state[pumpId].fault).toBeNull();
  expect((await sim.recent(pumpId, 1))[0].features.PS1_mean).not.toBe(-999);
  expect(await db.client.caseHistory.count({ where: { work_order_id: orderId } })).toBe(1);
});

it('reports a committed completion successfully when refreshing the knowledge index fails', async () => {
  jest.spyOn(moduleRef.get(ToolsService), 'refreshKnowledge').mockRejectedValue(new Error('index unavailable'));
  await expect(agent.completeWorkOrder(orderId, 'Seal aus', 'Ganti seal')).resolves.toEqual({ ok: true, work_order: orderId });
  expect((await db.client.workOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('selesai');
  expect(await db.client.sensorReading.count({ where: { pump_id: pumpId } })).toBe(45);
});

it('persists one recovery when two requests complete the same work order concurrently', async () => {
  const results = await Promise.all([
    agent.completeWorkOrder(orderId, 'Seal aus', 'Ganti seal'),
    agent.completeWorkOrder(orderId, 'Seal aus', 'Ganti seal'),
  ]);
  expect(results.filter(result => 'ok' in result && result.ok)).toHaveLength(1);
  expect(await db.client.sensorReading.count({ where: { pump_id: pumpId } })).toBe(45);
  expect(await db.client.caseHistory.count({ where: { work_order_id: orderId } })).toBe(1);
});

it('repairs a legacy completed order once without rewriting its completion or adding history', async () => {
  await db.client.workOrder.update({ where: { id: orderId }, data: { status: 'selesai', closed_at: 100 } });
  const results = await Promise.all([agent.completeWorkOrder(orderId), agent.completeWorkOrder(orderId)]);
  expect(results.filter(result => 'ok' in result && result.ok)).toHaveLength(1);
  expect((await db.client.workOrder.findUniqueOrThrow({ where: { id: orderId } })).closed_at).toBe(100);
  expect(await db.client.caseHistory.count({ where: { work_order_id: orderId } })).toBe(0);
  expect(await db.client.sensorReading.count({ where: { pump_id: pumpId } })).toBe(45);
  expect(await db.client.agentLog.count({ where: { tool: 'recover_demo_readings', input: { contains: orderId } } })).toBe(1);
});

it('does not replace new sensor data for an already completed order', async () => {
  await db.client.workOrder.update({ where: { id: orderId }, data: { status: 'selesai', closed_at: 30 } });
  expect(await agent.completeWorkOrder(orderId)).toMatchObject({ error: 'work order sudah selesai' });
  expect(await db.client.sensorReading.count({ where: { pump_id: pumpId } })).toBe(40);
  expect((await sim.recent(pumpId, 1))[0].features.PS1_mean).toBe(-999);
});

it('checks completion ownership before mutating work or inventory', async () => {
  const user = await db.client.user.create({ data: { username: pumpId, role: 'teknisi', passwordHash: 'fixture' } });
  const technician = await db.client.technician.create({ data: { id: pumpId, userId: user.id, available: false } });
  try {
    await db.client.workOrder.update({ where: { id: orderId }, data: { technician_id: technician.id } });
    await expect(agent.completeWorkOrder(orderId, '', '', 60, { userId: 'someone-else', role: 'teknisi' })).rejects.toThrow('ditugaskan kepada akun Anda');
    expect((await db.client.workOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('terbuka');
    await expect(agent.completeWorkOrder(orderId, '', '', 60, { userId: user.id, role: 'teknisi' })).resolves.toMatchObject({ ok: true });
  } finally {
    await db.client.workOrder.update({ where: { id: orderId }, data: { technician_id: null } });
    await db.client.technician.delete({ where: { id: technician.id } });
    await db.client.user.delete({ where: { id: user.id } });
  }
});
