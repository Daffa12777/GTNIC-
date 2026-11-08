import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { CaseStore } from '../src/agent/case.store';
import { DbService } from '../src/db/db.service';
import { ToolsService } from '../src/tools/tools.service';
import { ApiController } from '../src/api/api.controller';
import type { AgentService } from '../src/agent/agent.service';

let moduleRef: TestingModule, db: DbService, cases: CaseStore;
beforeAll(async () => {
  moduleRef = await Test.createTestingModule({ providers: [DbService, CaseStore, { provide: ToolsService, useValue: {} }] }).compile();
  await moduleRef.init(); db = moduleRef.get(DbService); cases = moduleRef.get(CaseStore);
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => { await moduleRef.close(); });

it('reads persisted results scoped to the exact case, including assignment and purchase state', async () => {
  const rollback = new Error('summary fixture rollback');
  try { await db.transaction(async () => {
    await db.client.maintenanceCase.createMany({ data: [{ id: 'summary-C-1', status: 'dieskalasi' }, { id: 'summary-C-2' }] });
    await db.client.technician.create({ data: { id: 'summary-T-1', name: 'Teknisi nyata' } });
    await db.client.workOrder.createMany({ data: [
      { id: 'summary-WO-1', case_id: 'summary-C-1', status: 'terjadwal', technician_id: 'summary-T-1', scheduled_at: '2026-11-09 08:00' },
      { id: 'summary-WO-2', case_id: 'summary-C-2', status: 'terbuka' },
    ] });
    await db.client.purchaseRequest.create({ data: { id: 'summary-PR-1', work_order_id: 'summary-WO-1', part_name: 'Seal', qty: 2, status: 'diajukan' } });
    const summary = await cases.actionSummary('summary-C-1');
    expect(summary).toMatchObject({ case_id: 'summary-C-1', status: 'dieskalasi', order_count: 1, orders: [{ id: 'summary-WO-1', technician: 'Teknisi nyata', scheduled_at: '2026-11-09 08:00', purchases: [{ id: 'summary-PR-1', qty: 2 }] }] });
    expect(summary!.checked_at).toBeGreaterThan(0);
    expect(await cases.actionSummary('summary-missing')).toBeNull();
    expect(await cases.actionSummary('summary-C-2')).toMatchObject({ orders: [{ id: 'summary-WO-2', technician: null, purchases: [] }] });
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
});

it('returns a successful action reply even if the summary query fails, without rerunning the agent', async () => {
  const chat = jest.fn().mockResolvedValue({ reply: 'Tindakan selesai.', case: { id: 'summary-C-1' } });
  jest.spyOn(cases, 'actionSummary').mockRejectedValue(new Error('temporary database error'));
  const controller = new ApiController(db, { chat } as unknown as AgentService, cases, {} as never, {} as never, {} as never, {} as never, {} as never);
  const result = await controller.chat({ message: 'Pump-01 panas', use_llm: false, history: [] });
  expect(result.reply).toBe('Tindakan selesai.');
  expect(result.action_summary_error).toContain('Periksa jejak kasus');
  expect(chat).toHaveBeenCalledTimes(1);
});

it('does not invent results for a reply without a linked case', async () => {
  const chat = jest.fn().mockResolvedValue({ reply: 'Stok seal = 3', case: null });
  const summary = jest.spyOn(cases, 'actionSummary');
  const controller = new ApiController(db, { chat } as unknown as AgentService, cases, {} as never, {} as never, {} as never, {} as never, {} as never);
  expect(await controller.chat({ message: 'Stok seal', use_llm: false, history: [] })).toEqual({ reply: 'Stok seal = 3', case: null });
  expect(summary).not.toHaveBeenCalled();
});
