import { ToolsService } from '../src/tools/tools.service';
import type { Analysis } from '../src/ml/ml.service';

function fixture() {
  const order = { pump_id: 'Pump-01', title: 'Perbaikan pompa', description: 'Ganti seal', priority: 'rendah', risk: 'rendah', case_id: 'C-1' };
  const state = { pump_id: 'Pump-01', risk: 'tinggi', plan: { risk: 'tinggi' }, approved_by: null as string | null };
  const stored = { pump_id: 'Pump-01', status: 'menunggu_persetujuan', risk: 'tinggi', state };
  const db = {
    client: { maintenanceCase: { findUnique: jest.fn().mockResolvedValue(stored) }, workOrder: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } },
    transaction: async (work: () => Promise<unknown>) => work(), one: jest.fn().mockResolvedValue({ id: 'Pump-01' }), nextId: jest.fn().mockResolvedValue('WO-1'),
  };
  const tools = new ToolsService(db as never, {} as never, {} as never, {} as never);
  const analysis = { label: 'pump', components: { pump: { severity: 1 } }, flags: [] } as unknown as Analysis;
  jest.spyOn(tools, 'analyze').mockResolvedValue(analysis);
  return { tools, order, state, stored, db, analysis };
}

it('does not let low tool risk override a high-risk case or current ML diagnosis', async () => {
  const f = fixture();
  expect(await f.tools.create_work_order(f.order)).toMatchObject({ requires_approval: true });
  f.stored.risk = f.state.risk = f.state.plan.risk = 'rendah';
  expect(await f.tools.create_work_order(f.order)).toMatchObject({ requires_approval: true });
  expect(f.db.client.workOrder.create).not.toHaveBeenCalled();
});

it('requires persisted approval for the same unit and a pending high-risk plan', async () => {
  const f = fixture();
  expect(await f.tools.create_work_order({ ...f.order, approved: true })).toMatchObject({ requires_approval: true });
  f.state.approved_by = 'supervisor'; f.stored.pump_id = 'Pump-02';
  expect(await f.tools.create_work_order({ ...f.order, approved: true })).toMatchObject({ error: 'kasus tidak sesuai dengan unit tindakan' });
  f.stored.pump_id = 'Pump-01'; f.stored.status = 'ditolak';
  expect(await f.tools.create_work_order({ ...f.order, approved: true })).toMatchObject({ requires_approval: true });
  f.stored.status = 'menunggu_persetujuan';
  expect(await f.tools.create_work_order({ ...f.order, approved: true })).toMatchObject({ id: 'WO-1' });
  expect(f.db.client.workOrder.create).toHaveBeenCalledTimes(1);
});

it('fails closed without ML but keeps the internal inspection path available', async () => {
  const f = fixture();
  jest.mocked(f.tools.analyze).mockResolvedValue({ error: 'ML tidak tersedia' });
  expect(await f.tools.call('create_work_order', { ...f.order, inspection: true })).toMatchObject({ error: expect.stringContaining('Tindakan ditunda') });
  expect(f.db.client.workOrder.create).not.toHaveBeenCalled();
  expect(await f.tools.create_work_order(f.order, true)).toMatchObject({ id: 'WO-1' });
});
