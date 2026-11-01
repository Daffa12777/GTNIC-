import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import InventoryEditor from '../src/components/InventoryEditor';
import WorkOrders from '../src/components/WorkOrders';
import { api } from '../src/api';
import { canLeavePage, UnsavedChangesPrompt } from '../src/useUnsavedChanges';
import type { WorkOrder } from '../src/types';

afterEach(() => window.history.replaceState(null, '', '/'));
it('retains stock inputs when changing part is cancelled and guards page exit', () => {
  vi.spyOn(api, 'stockMovements').mockResolvedValue([]);
  const parts = ['A', 'B'].map((id) => ({ part_id: id, name: id, stock: 5, min_stock: 1, location: 'Test' }));
  render(<><UnsavedChangesPrompt /><InventoryEditor parts={parts} refresh={async () => {}} /></>);
  fireEvent.click(screen.getByText('Kelola inventaris'));
  fireEvent.change(screen.getByLabelText('Spare part'), { target: { value: 'A' } });
  fireEvent.change(screen.getByLabelText('Alasan perubahan'), { target: { value: 'Stok masuk baru' } });
  fireEvent.change(screen.getByLabelText('Spare part'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
  expect((screen.getByLabelText('Spare part') as HTMLSelectElement).value).toBe('A');
  expect((screen.getByLabelText('Alasan perubahan') as HTMLTextAreaElement).value).toBe('Stok masuk baru');
  expect(canLeavePage()).toBe(false);
});

it('does not discard a work report when filtering or closing its form is cancelled', async () => {
  window.history.replaceState(null, '', '/work-orders');
  const order: WorkOrder = { id: 'WO-1', pump_id: 'Pump-01', case_id: 'C-1', title: 'Periksa seal', description: '', priority: 'sedang', status: 'terbuka', technician: null, scheduled_at: null, part: '', created_at: 1 };
  vi.spyOn(api, 'workOrdersPage').mockResolvedValue({ items: [order], total: 1, page: 1, pageSize: 20, technicians: [], units: ['Pump-01'] });
  render(<WorkOrders flash={() => {}} onChanged={() => {}} onOpenCase={() => {}} />);
  fireEvent.click(await screen.findByText('Selesaikan'));
  fireEvent.change(screen.getByLabelText('Akar masalah'), { target: { value: 'Seal aus' } });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'selesai' } });
  fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
  expect(window.location.search).toBe('');
  fireEvent.click(screen.getByText('Selesaikan'));
  fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
  expect((screen.getByLabelText('Akar masalah') as HTMLInputElement).value).toBe('Seal aus');
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'selesai' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buang laporan' }));
  expect(window.location.search).toContain('status=selesai');
  expect(screen.queryByLabelText('Akar masalah')).toBeNull();
});
