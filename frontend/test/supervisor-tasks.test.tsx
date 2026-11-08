import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import SupervisorTasks from '../src/components/SupervisorTasks';
import { api } from '../src/api';
import type { Case, WorkOrder } from '../src/types';

const current: Case = { id: 'C-1', pump_id: 'Pump-01', status: 'menunggu_persetujuan', fault: 'pump', confidence: .9, risk: 'tinggi', summary: 'Tinjau bukti pompa', created_at: 1, mode: 'policy' };
const order: WorkOrder = { id: 'WO-1', pump_id: 'Pump-01', case_id: 'C-1', title: 'Periksa pompa', description: '', priority: 'tinggi', status: 'terbuka', technician: null, scheduled_at: null, part: '', created_at: 1, assignment_reason: 'Belum ada teknisi tersedia.' };
const props = { onOpenCase: vi.fn(), flash: vi.fn(), onChanged: vi.fn() };
it('prevents technician access without fetching supervisor queues', () => {
  const cases = vi.spyOn(api, 'casesPage'); const orders = vi.spyOn(api, 'workOrdersPage');
  render(<SupervisorTasks {...props} role="teknisi" />);
  expect(screen.getByRole('alert').textContent).toContain('hanya tersedia untuk supervisor');
  expect(cases).not.toHaveBeenCalled(); expect(orders).not.toHaveBeenCalled();
});
it('shows queue totals, opens a decision and assigns an unassigned order', async () => {
  vi.spyOn(api, 'casesPage').mockImplementation(async query => ({ items: [current], total: query.get('status') === 'group:keputusan' ? 12 : 1, page: 1, pageSize: 5 }));
  const orders = vi.spyOn(api, 'workOrdersPage').mockResolvedValue({ items: [order], total: 1, page: 1, pageSize: 5, units: [], technicians: [] });
  vi.spyOn(api, 'assignmentOptions').mockResolvedValue({ work_order_id: 'WO-1', current_technician_id: null, status: 'terbuka', requirements: { skill: 'mekanik', senior: true }, reason: null, technicians: [] });
  vi.spyOn(api, 'assignTechnician').mockResolvedValue({ scheduled: true, technician: 'Adi', technician_id: 'T-1', scheduled_at: null });
  render(<SupervisorTasks {...props} role="supervisor" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Tinjau keputusan' }));
  expect(props.onOpenCase).toHaveBeenCalledWith('C-1');
  expect(within(screen.getByRole('region', { name: 'Persetujuan supervisor' })).getByRole('heading').textContent).toContain('12');
  expect(orders.mock.calls[0][0].get('status')).toBe('group:active');
  fireEvent.click(screen.getByRole('button', { name: 'Tugaskan WO-1' }));
  await screen.findByLabelText('Pilih teknisi');
  fireEvent.click(screen.getByRole('button', { name: 'Simpan penugasan' }));
  await waitFor(() => expect(props.flash).toHaveBeenCalledWith('WO-1 ditugaskan kepada Adi.'));
});
it('isolates queue errors and supports retry while other queues remain usable', async () => {
  let fails = true;
  vi.spyOn(api, 'casesPage').mockImplementation(async query => {
    if (fails && query.get('status') === 'group:keputusan') throw new Error('Antrean keputusan gagal dimuat');
    return { items: [], total: 0, page: 1, pageSize: 5 };
  });
  vi.spyOn(api, 'workOrdersPage').mockResolvedValue({ items: [order], total: 1, page: 1, pageSize: 5, units: [], technicians: [] });
  render(<SupervisorTasks {...props} role="supervisor" />);
  expect((await screen.findByRole('alert')).textContent).toContain('Antrean keputusan gagal dimuat');
  expect(screen.getByRole('button', { name: 'Tugaskan WO-1' })).toBeTruthy();
  fails = false;
  fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
  await screen.findByText('Tidak ada persetujuan tertunda.');
  expect(screen.queryByRole('alert')).toBeNull();
});
