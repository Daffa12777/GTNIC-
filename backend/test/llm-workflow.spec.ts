import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { AgentService } from '../src/agent/agent.service';
import { CaseStore } from '../src/agent/case.store';
import { LlmService } from '../src/agent/llm.service';
import { ApiController } from '../src/api/api.controller';
import { DbService } from '../src/db/db.service';
import { MlService, type Analysis } from '../src/ml/ml.service';
import { StatusStore } from '../src/monitor/status.store';
import { MonitorService } from '../src/monitor/monitor.service';
import { RagService } from '../src/rag/rag.service';
import { SimService } from '../src/sim/sim.service';
import { ToolsService } from '../src/tools/tools.service';
import { CONFIG } from '../src/config';

const response = (parts: unknown[]) => new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200 });
const call = (name: string, args: Record<string, unknown>) => ({ functionCall: { name, args } });
const order = { pump_id: 'Pump-91', title: 'Ganti seal', description: 'Perbaikan pompa', priority: 'rendah', risk: 'rendah', approved: true, inspection: true };
let testModule: TestingModule, db: DbService, agent: AgentService, llm: LlmService, tools: ToolsService, cases: CaseStore;
let diagnosis: Analysis;
const oldKey = CONFIG.GEMINI_API_KEY;

beforeAll(async () => {
  CONFIG.GEMINI_API_KEY = 'test-key';
  testModule = await Test.createTestingModule({ providers: [DbService, MlService, SimService, RagService, ToolsService, CaseStore, LlmService, AgentService, StatusStore] }).compile();
  await testModule.init();
  db = testModule.get(DbService); agent = testModule.get(AgentService); llm = testModule.get(LlmService); tools = testModule.get(ToolsService); cases = testModule.get(CaseStore);
  await testModule.get(RagService).build();
});
beforeEach(() => {
  diagnosis = {
    ready: true, label: 'pump', confidence: 0.95, probs: { pump: 0.95, normal: 0.05 }, flags: [], source: 'test',
    is_anomaly: true, anomaly_score: -0.7, threshold: -0.5,
    components: { pump: { severity: 1, level: 2, confidence: 0.95, p_degraded: 0.95, probs: { '2': 0.95 } } },
  };
  jest.spyOn(tools, 'analyze').mockImplementation(async () => diagnosis);
  jest.spyOn(tools, 'check_sensor_validity').mockResolvedValue({ valid: true, suspect_sensors: [] });
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => { CONFIG.GEMINI_API_KEY = oldKey; await testModule.close(); });

it('keeps general chat out of cases and only exposes read-only tools', async () => fixture(async () => {
  const before = await db.client.maintenanceCase.count();
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response([{ text: 'Prioritas berdasarkan risiko; belum ada tindakan dijalankan.' }]));
  const result = await llm.chat('Urutan prioritas penanganan');
  expect(result.case).toBeNull();
  expect(await db.client.maintenanceCase.count()).toBe(before);
  const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
  expect(body.tools[0].function_declarations.map((tool: { name: string }) => tool.name)).not.toContain('create_work_order');
}));

it('does not turn a failed general LLM question into an operational triage', async () => fixture(async () => {
  const before = await db.client.maintenanceCase.count();
  jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 400 }));
  const triage = jest.spyOn(agent, 'triage');
  const result = await agent.chat('Urutan prioritas penanganan', null, true);
  expect(result).toMatchObject({ case: null, llm_error: expect.any(String) });
  expect(triage).not.toHaveBeenCalled();
  expect(await db.client.maintenanceCase.count()).toBe(before);
}));

it('logs general read-only queries without a case and rejects forged actions', async () => fixture(async () => {
  const before = await db.client.maintenanceCase.count();
  jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(response([call('check_inventory', { part_name: 'seal' }), call('create_work_order', order)]))
    .mockResolvedValueOnce(response([{ text: 'Stok diperiksa; tindakan tidak dijalankan.' }]));
  const result = await llm.chat('Bagaimana mempersiapkan perawatan?');
  expect(result.case).toBeNull();
  expect(await db.client.maintenanceCase.count()).toBe(before);
  expect(await db.client.agentLog.findFirst({ where: { case_id: null, tool: 'check_inventory' } })).toBeTruthy();
  expect(await db.client.workOrder.count({ where: { pump_id: 'Pump-91' } })).toBe(0);
}));

// Real PostgreSQL-compatible transactions; provider/ML outputs are deterministic fixtures.
async function fixture(work: () => Promise<void>) {
  const rollback = new Error('ROLLBACK_LLM_FIXTURE');
  try {
    await db.transaction(async () => {
      await db.client.pump.createMany({ data: [{ id: 'Pump-91' }, { id: 'Pump-92' }] });
      // Scheduling must not depend on seed technicians consumed by other integration suites.
      await db.client.technician.create({ data: { id: 'llm-fixture-senior', name: 'Teknisi fixture LLM', skill: 'mekanik', level: 'senior', available: true } });
      await work();
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}

it('holds forged low-risk/approved arguments and persists an executable plan for supervisor approval', async () => fixture(async () => {
  const fetch = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(response([call('classify_fault', { pump_id: 'Pump-91' }), call('create_work_order', order)]))
    .mockResolvedValueOnce(response([{ text: 'Perbaikan memerlukan persetujuan.' }]))
    .mockResolvedValueOnce(response([{ text: 'Foto tambahan dapat dijelaskan, keputusan tetap menunggu supervisor.' }]));
  const result = await agent.chat('Pump-91 oli panas', null, true);
  expect(result.case).toMatchObject({ pump_id: 'Pump-91', status: 'menunggu_persetujuan', mode: 'llm', plan: { fault: 'pump', risk: 'tinggi' } });
  expect(result.case.plan.citation).not.toBe('belum ada sitasi');
  expect(await db.client.workOrder.count({ where: { pump_id: 'Pump-91' } })).toBe(0);
  const image = { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5lEAAAAASUVORK5CYII=' };
  const pendingPhoto = await agent.chat('Periksa foto tambahan', result.case.id, true, [], image);
  expect(pendingPhoto.reply).toContain('Foto tambahan dapat dijelaskan');
  expect(pendingPhoto.case).toEqual(result.case);
  const api = new ApiController(db, agent, cases, llm, {} as never, tools as never, {} as never, {} as never);
  await expect(api.approve(result.case.id, 'teknisi')).rejects.toMatchObject({ status: 403 });
  const approved = await api.approve(result.case.id, 'supervisor');
  expect(approved).toMatchObject({ status: 'disetujui_dijalankan', mode: 'llm' });
  expect(await db.client.workOrder.count({ where: { case_id: result.case.id } })).toBe(1);
  await expect(api.approve(result.case.id, 'supervisor')).rejects.toMatchObject({ status: 400 });
  expect(fetch).toHaveBeenCalledTimes(3);
}));

it('creates a low-risk order, schedules it, and keeps the same case on a follow-up', async () => fixture(async () => {
  diagnosis.components.pump.severity = 0.5;
  const fetch = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(response([call('classify_fault', { pump_id: 'Pump-91' }), call('create_work_order', order)]))
    .mockImplementationOnce(async (_url, options) => {
      const payload = JSON.parse(String(options?.body));
      const id = payload.contents.at(-1).parts.find((p: { functionResponse: { name: string } }) => p.functionResponse.name === 'create_work_order').functionResponse.response.result.id;
      return response([call('schedule_technician', { work_order_id: id, skill: 'mekanik' })]);
    })
    .mockResolvedValueOnce(response([{ text: 'Work order dan jadwal tersimpan.' }]))
    .mockResolvedValueOnce(response([{ text: 'Penjelasan lanjutan untuk unit yang sama.' }]))
    .mockResolvedValueOnce(response([call('create_work_order', { ...order, title: 'Judul lain untuk pekerjaan yang sama' })]))
    .mockResolvedValueOnce(response([{ text: 'Pekerjaan aktif digunakan kembali.' }]));
  const first = await agent.chat('Pump-91 oli panas', null, true);
  const saved = await db.client.workOrder.findFirst({ where: { case_id: first.case.id } });
  expect(saved).toMatchObject({ pump_id: 'Pump-91', status: 'terjadwal' });
  const next = await agent.chat('Kenapa begitu?', first.case.id, true);
  expect(next.case.id).toBe(first.case.id);
  expect(await db.client.maintenanceCase.count({ where: { pump_id: 'Pump-91' } })).toBe(1);
  expect(await db.client.workOrder.count({ where: { case_id: first.case.id } })).toBe(1);
  expect(JSON.stringify(fetch.mock.calls[3][1]?.body)).toContain('Pump-91');
  const fresh = await agent.chat('Pump-91 masih perlu ditangani', null, true);
  expect(fresh.case.id).toBe(first.case.id);
  expect(await db.client.workOrder.count({ where: { pump_id: 'Pump-91' } })).toBe(1);
}));

it('reuses a sensor/policy case without overwriting its pending decision', async () => fixture(async () => {
  const reserved = await cases.reserve('Pump-91');
  await cases.save(reserved.id, cases.trace(reserved.id), 'menunggu_persetujuan', { pump_id: 'Pump-91', plan: { fault: 'pump', risk: 'tinggi' } }, { summary: 'Menunggu supervisor', mode: 'policy' });
  const before = await cases.get(reserved.id);
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response([call('create_work_order', order), call('check_inventory', { part_name: 'Seal kit pompa' })]))
    .mockResolvedValueOnce(response([{ text: 'Stok seal kit sudah dibaca; rencana tetap menunggu supervisor.' }]));
  const result = await agent.chat('Pump-91 masih panas', null, true);
  expect(result.case).toMatchObject({ id: reserved.id, mode: 'policy', status: 'menunggu_persetujuan' });
  expect(result.reply).toContain('Stok seal kit');
  expect(await cases.get(reserved.id)).toEqual(before);
  expect(await db.client.workOrder.count({ where: { pump_id: 'Pump-91' } })).toBe(0);
  const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body));
  expect(payload.tools[0].function_declarations.map((tool: { name: string }) => tool.name)).not.toContain('create_work_order');
  expect(await db.client.maintenanceCase.count({ where: { pump_id: 'Pump-91' } })).toBe(1);
}));

it('does not duplicate a pending case and can reject it without creating work', async () => fixture(async () => {
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response([call('classify_fault', { pump_id: 'Pump-91' })])).mockResolvedValueOnce(response([{ text: 'Tinjau rencana.' }]))
    .mockResolvedValueOnce(response([{ text: 'Panas masih perlu pemeriksaan; persetujuan tetap melalui supervisor.' }]));
  const first = await agent.chat('Pump-91 rusak', null, true);
  const next = await agent.chat('Pump-91 masih panas', null, true);
  expect(next.case.id).toBe(first.case.id);
  expect(next.reply).toContain('Panas masih perlu pemeriksaan');
  expect(fetch).toHaveBeenCalledTimes(3);
  await agent.reject(first.case.id, 'Perlu verifikasi lapangan');
  expect((await cases.get(first.case.id)).status).toBe('ditolak');
  expect(await db.client.workOrder.count({ where: { pump_id: 'Pump-91' } })).toBe(0);
}));

it('answers why and stock questions on an escalated policy case without repeating or changing its decision', async () => fixture(async () => {
  const reserved = await cases.reserve('Pump-91');
  const trace = cases.trace(reserved.id);
  trace.add('reasoning', 'Gangguan majemuk', 'Pompa dan pendingin sama-sama menurun; inspeksi senior diperlukan.');
  await cases.save(reserved.id, trace, 'dieskalasi', { pump_id: 'Pump-91', probs: { pump: 0.5, cooler: 0.5 } }, { summary: 'Kasus dieskalasi ke senior.', risk: 'tinggi', mode: 'policy' });
  const before = await cases.get(reserved.id);
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response([{ text: 'Karena pompa dan pendingin sama-sama menurun, teknisi senior perlu memeriksa langsung.' }]));
  const why = await agent.chat('kenapa gitu?', reserved.id, true);
  expect(why.reply).toContain('pompa dan pendingin');
  expect(why.reply).not.toBe(before.summary);
  const stock = await agent.chat('Stok seal kit pompa', reserved.id, true);
  expect(stock.reply).toMatch(/^Stok: .*Seal kit.* = \d+/i);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(why.case.id).toBe(reserved.id);
  expect(stock.case.id).toBe(reserved.id);
  expect(await cases.get(reserved.id)).toEqual(before);
  expect(await db.client.workOrder.count({ where: { pump_id: 'Pump-91' } })).toBe(0);
}));

it('binds an explicit new unit to a different case and rejects a cross-unit tool call', async () => fixture(async () => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce(response([{ text: 'Jawaban pertama.' }]))
    .mockResolvedValueOnce(response([call('create_work_order', order)]))
    .mockResolvedValueOnce(response([{ text: 'Unit pada tindakan tidak sesuai.' }]));
  const first = await agent.chat('Pump-91 bagaimana?', null, true);
  const next = await agent.chat('Sekarang periksa Pump-92', first.case.id, true);
  expect(next.case.pump_id).toBe('Pump-92');
  expect(next.case.id).not.toBe(first.case.id);
  expect(await db.client.workOrder.count({ where: { pump_id: { in: ['Pump-91', 'Pump-92'] } } })).toBe(0);
}));

it('requires clarification instead of repairing a low-confidence diagnosis', async () => fixture(async () => {
  diagnosis.confidence = 0.6; diagnosis.components.pump.severity = 0.5;
  jest.spyOn(global, 'fetch').mockResolvedValueOnce(response([call('create_work_order', order)])).mockResolvedValueOnce(response([{ text: 'Apakah ada kebocoran yang terlihat?' }]))
    .mockResolvedValueOnce(response([call('classify_fault', { pump_id: 'Pump-91' }), call('escalate_to_senior', { pump_id: 'Pump-91', summary: 'Diagnosis belum cukup yakin; perlu inspeksi.' })]))
    .mockResolvedValueOnce(response([{ text: 'Inspeksi teknisi senior dijadwalkan.' }]));
  const result = await agent.chat('Pump-91 panas', null, true);
  expect(result.case.status).toBe('menunggu_klarifikasi');
  expect(result.case.question).toContain('kebocoran');
  expect(await db.client.workOrder.count({ where: { pump_id: 'Pump-91' } })).toBe(0);
  const stock = await agent.chat('Stok seal kit pompa', result.case.id, true);
  expect(stock.reply).toMatch(/^Stok: Seal kit pompa hidrolik = \d+/);
  expect(stock.case).toEqual(result.case);
  diagnosis.confidence = 0.4;
  const escalated = await agent.chat('Gejalanya belum jelas', result.case.id, true);
  expect(escalated.case.status).toBe('dieskalasi');
  expect(await db.client.workOrder.findFirst({ where: { case_id: result.case.id } })).toMatchObject({ title: 'Eskalasi diagnosis Pump-91', status: 'terjadwal' });
}));

it('stops before starting an action when the total deadline has passed and keeps the failed case', async () => fixture(async () => {
  let clock = Date.now();
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  const fetch = jest.spyOn(global, 'fetch').mockImplementationOnce(async () => {
    clock += 46000;
    return response([call('create_work_order', order)]);
  });
  await expect(llm.chat('Pump-91 periksa pompa')).rejects.toThrow('batas waktu');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await db.client.maintenanceCase.findFirst({ where: { pump_id: 'Pump-91' } })).toMatchObject({ status: 'gagal' });
  expect(await db.client.workOrder.count({ where: { pump_id: 'Pump-91' } })).toBe(0);
}));

it('does not report success for an empty response or an exhausted tool loop', async () => fixture(async () => {
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response([]));
  await expect(llm.chat('Pump-91 periksa')).rejects.toThrow('tidak mengembalikan jawaban');
  fetch.mockImplementation(async () => response([call('unknown_tool', {})]));
  await expect(llm.chat('Pump-92 periksa')).rejects.toThrow('Batas langkah');
  expect(await db.client.workOrder.count({ where: { pump_id: { in: ['Pump-91', 'Pump-92'] } } })).toBe(0);
}));

it('runs the autonomous monitor workflow without a chat request and skips the next tick once work exists', async () => fixture(async () => {
  diagnosis.components.pump.severity = 0.5;
  const sim = testModule.get(SimService), status = testModule.get(StatusStore);
  await sim.init(['Pump-91']);
  status.auto.enabled = true;
  const monitor = new MonitorService(db, sim, tools, agent, cases, testModule.get(RagService), status);
  const fetch = jest.spyOn(global, 'fetch');
  await monitor.tick();
  const stored = await db.client.maintenanceCase.findFirst({ where: { pump_id: 'Pump-91' } });
  expect(stored).toMatchObject({ status: 'selesai_otomatis' });
  expect((await cases.get(stored!.id)).trace).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Pemicu analisis', detail: expect.stringContaining('Otomatis oleh monitor') })]));
  expect(await db.client.workOrder.findFirst({ where: { pump_id: 'Pump-91' } })).toMatchObject({ status: 'terjadwal' });
  await monitor.tick();
  expect(await db.client.maintenanceCase.count({ where: { pump_id: 'Pump-91' } })).toBe(1);
  expect(await db.client.workOrder.count({ where: { pump_id: 'Pump-91' } })).toBe(1);
  expect(fetch).not.toHaveBeenCalled();
}));
