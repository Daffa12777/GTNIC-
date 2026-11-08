import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import WorkOrders from '../src/components/WorkOrders';
import WorkOrderAssignment from '../src/components/WorkOrderAssignment';
import { api } from '../src/api';
import type { AssignmentOptions, WorkOrder } from '../src/types';

const options: AssignmentOptions = { work_order_id: 'WO-1', current_technician_id: null, status: 'terbuka', requirements: { skill: 'mekanik', senior: true }, reason: '1 teknisi sesuai tersedia; penugasan belum dilakukan.', technicians: [
  { id: 'T-1', name: 'Adi', skill: 'mekanik', level: 'senior', current: false, eligible: true, reason: null },
  { id: 'T-2', name: 'Budi', skill: 'mekanik', level: 'junior', current: false, eligible: false, reason: 'Pekerjaan ini memerlukan teknisi senior.' },
] };
const order: WorkOrder = { id: 'WO-1', pump_id: 'Pump-01', case_id: 'C-1', title: 'Periksa pompa', description: '', priority: 'tinggi', status: 'terbuka', technician: null, technician_id: null, scheduled_at: null, part: '', created_at: 1, assignment_reason: options.reason };
afterEach(() => window.history.replaceState(null, '', '/'));

it('shows assignment only to supervisors and explains an unassigned order', async () => {
  vi.spyOn(api, 'workOrdersPage').mockResolvedValue({ items: [order], total: 1, page: 1, pageSize: 20, technicians: [], units: ['Pump-01'] });
  vi.spyOn(api, 'assignmentOptions').mockResolvedValue(options);
  const props = { flash: vi.fn(), onChanged: vi.fn(), onOpenCase: vi.fn() };
  const view = render(<WorkOrders {...props} role="teknisi" />);
  await screen.findByText(options.reason!);
  expect(screen.queryByRole('button', { name: 'Tugaskan teknisi' })).toBeNull();
  view.rerender(<WorkOrders {...props} role="supervisor" />);
  fireEvent.click(screen.getByRole('button', { name: 'Tugaskan teknisi' }));
  await screen.findByLabelText('Pilih teknisi');
  expect((screen.getByRole('option', { name: /Budi/ }) as HTMLOptionElement).disabled).toBe(true);
});

it('retains selection and inline failure, then saves the selected technician', async () => {
  vi.spyOn(api, 'assignmentOptions').mockResolvedValue(options);
  const save = vi.spyOn(api, 'assignTechnician').mockRejectedValueOnce(new Error('Teknisi sedang sibuk atau tidak tersedia.')).mockResolvedValueOnce({ scheduled: true, technician: 'Adi', technician_id: 'T-1', scheduled_at: '2026-11-09 08:00' });
  const done = vi.fn();
  render(<WorkOrderAssignment orderId="WO-1" onDone={done} onBusy={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('Pilih teknisi'), { target: { value: 'T-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan penugasan' }));
  expect((await screen.findByRole('alert')).textContent).toContain('sedang sibuk');
  expect((screen.getByLabelText('Pilih teknisi') as HTMLSelectElement).value).toBe('T-1');
  expect(done).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Simpan penugasan' }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(save).toHaveBeenLastCalledWith('WO-1', 'T-1', null);
});

it('supports automatic assignment and sends the current assignment snapshot when replacing', async () => {
  const load = vi.spyOn(api, 'assignmentOptions').mockResolvedValue(options);
  const save = vi.spyOn(api, 'assignTechnician').mockResolvedValue({ scheduled: true, technician: 'Adi', technician_id: 'T-1', scheduled_at: null });
  const props = { orderId: 'WO-1', onDone: vi.fn(), onBusy: vi.fn(), onCancel: vi.fn() };
  const view = render(<WorkOrderAssignment {...props} />);
  await screen.findByLabelText('Pilih teknisi');
  fireEvent.click(screen.getByRole('button', { name: 'Simpan penugasan' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith('WO-1', null, null));
  view.unmount();
  load.mockResolvedValue({ ...options, current_technician_id: 'T-old', technicians: [...options.technicians, { ...options.technicians[0], id: 'T-old', name: 'Teknisi saat ini', current: true }] });
  render(<WorkOrderAssignment {...props} />);
  await waitFor(() => expect((screen.getByLabelText('Pilih teknisi') as HTMLSelectElement).value).toBe('T-old'));
  fireEvent.change(screen.getByLabelText('Pilih teknisi'), { target: { value: 'T-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan penugasan' }));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith('WO-1', 'T-1', 'T-old'));
});
