import { AgentService } from '../src/agent/agent.service';
import { ApiController } from '../src/api/api.controller';

it('requires a nonblank reason server-side before rejecting a high-risk plan', async () => {
  const db = { transaction: async (work: () => Promise<unknown>) => work(), q: jest.fn() };
  const trace = { add: jest.fn() };
  const cases = { get: jest.fn().mockResolvedValue({ id: 'C-1', status: 'menunggu_persetujuan', risk: 'tinggi', state: {}, trace: [] }), trace: jest.fn().mockReturnValue(trace), save: jest.fn() };
  const agent = new AgentService(db as never, {} as never, cases as never, {} as never, {} as never, {} as never);
  expect(await agent.reject('C-1', '  ')).toEqual({ error: 'alasan penolakan wajib diisi untuk risiko tinggi' });
  expect(cases.save).not.toHaveBeenCalled();
  await agent.reject('C-1', ' Perlu inspeksi ');
  expect(trace.add).toHaveBeenCalledWith('decision', 'Ditolak supervisor', 'Perlu inspeksi');
  expect(cases.save).toHaveBeenCalled();
});

it('builds a read-only preview using the same fault mapping, stock and active order', async () => {
  const findFirst = jest.fn().mockResolvedValue({ id: 'WO-1' });
  const db = { client: { maintenanceCase: { findMany: jest.fn().mockResolvedValue([]) }, workOrder: { findMany: jest.fn().mockResolvedValue([]), findFirst } }, one: jest.fn().mockResolvedValue({ name: 'Seal kit pompa hidrolik', stock: 0 }) };
  const cases = { get: jest.fn().mockResolvedValue({ id: 'C-1', pump_id: 'Pump-01', plan: { fault: 'pump', risk: 'tinggi' } }) };
  const api = new ApiController(db as never, {} as never, cases as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const context = await api.caseContext('C-1');
  expect(context.preview).toMatchObject({ title: 'Kebocoran internal pompa pada Pump-01', part: 'Seal kit pompa hidrolik', stock: 0, senior: true, existing_order: 'WO-1' });
  expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ pump_id: 'Pump-01', title: 'Kebocoran internal pompa pada Pump-01' }) }));
});

it('switches units explicitly instead of treating a new unit report as an answer to the old case', async () => {
  const cases = { get: jest.fn().mockResolvedValue({ pump_id: 'Pump-01', mode: 'policy', status: 'menunggu_klarifikasi' }) };
  const tools = { getPump: jest.fn().mockResolvedValue({ id: 'Pump-02' }) };
  const agent = new AgentService({} as never, tools as never, cases as never, {} as never, {} as never, {} as never);
  const continueCase = jest.spyOn(agent, 'continueCase');
  const diagnose = jest.spyOn(agent, 'diagnose').mockResolvedValue({ id: 'C-2', summary: 'Unit baru' });
  expect(await agent.chat('Pump-02 panas', 'C-1')).toMatchObject({ case: { id: 'C-2' } });
  expect(continueCase).not.toHaveBeenCalled();
  expect(diagnose).toHaveBeenCalledWith('Pump-02', 'Pump-02 panas');
});

it('answers information requests without consuming a pending clarification in policy mode', async () => {
  const current = { id: 'C-1', pump_id: 'Pump-01', mode: 'policy', status: 'menunggu_klarifikasi', summary: 'Perlu pemeriksaan.', trace: [{ kind: 'reasoning', title: 'Bukti sensor', detail: 'Tekanan turun dan suhu naik.' }] };
  const db = { q: jest.fn().mockResolvedValue([{ name: 'Seal kit pompa', stock: 3 }]) };
  const cases = { get: jest.fn().mockResolvedValue(current) };
  const agent = new AgentService(db as never, {} as never, cases as never, {} as never, {} as never, {} as never);
  const continuation = jest.spyOn(agent, 'continueCase');
  expect((await agent.chat('Stok seal kit pompa', 'C-1')).reply).toContain('Seal kit pompa = 3');
  expect((await agent.chat('kenapa gitu?', 'C-1')).reply).toContain('Tekanan turun dan suhu naik');
  expect(continuation).not.toHaveBeenCalled();
});
