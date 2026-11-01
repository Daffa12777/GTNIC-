import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import Cases from '../src/components/Cases';
import { queryClient } from '../src/queryClient';
import type { Case } from '../src/types';

const testCase: Case = {
  id: 'C-001', pump_id: 'Pump-01', status: 'menunggu_persetujuan', fault: 'pump', confidence: 0.9,
  risk: 'tinggi', summary: 'Perlu persetujuan', created_at: 1700000000, mode: 'policy',
  plan: { fault: 'pump', confidence: 0.9, risk: 'tinggi', citation: 'Manual 1.1' }, probs: { pump: 0.51, valve: 0.43 },
  trace: [{ n: 1, kind: 'reasoning', title: 'Perbandingan dengan kondisi sehat', detail: 'tekanan -20%', tool: null, ts: 1700000000 }],
};

beforeEach(() => {
  queryClient.clear();
  vi.spyOn(api, 'casesPage').mockResolvedValue({ items: [testCase], total: 1, page: 1, pageSize: 20 });
  vi.spyOn(api, 'getCase').mockResolvedValue(testCase);
  vi.spyOn(api, 'caseContext').mockResolvedValue({ related: [{ id: 'C-000', status: 'dieskalasi', fault: 'pump', created_at: 1700000000 }], orders: [], recent_closed: [{ id: 'WO-000', pump_id: 'Pump-01', case_id: 'C-000', title: 'Perbaikan pompa', description: '', priority: 'tinggi', status: 'selesai', technician: 'Teknisi', scheduled_at: null, part: '', created_at: 1700000000 }], preview: { title: 'Kebocoran internal pompa pada Pump-01', priority: 'tinggi', part: 'Seal kit pompa hidrolik', stock: 0, inventory_found: true, skill: 'mekanik', senior: true, existing_order: null } });
});
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

it('offers a way back to the list and explains when the pending case was created', async () => {
  const onClear = vi.fn();
  render(<Cases role="supervisor" labels={{}} flash={vi.fn()} selected="C-001" onSelect={vi.fn()} onClear={onClear} onChanged={vi.fn()} />);
  expect(await screen.findByText(/Kondisi sensor saat ini dapat berubah/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '← Kembali ke daftar kasus' }));
  expect(onClear).toHaveBeenCalledOnce();
  expect(api.getCase).toHaveBeenCalledWith('C-001', expect.any(AbortSignal));
});

it('does not claim a technician was scheduled when approved actions fail', async () => {
  const flash = vi.fn();
  vi.spyOn(api, 'approve').mockResolvedValue({ ...testCase, status: 'gagal', summary: 'Persetujuan diberikan tetapi tindakan gagal dijalankan.' });
  render(<Cases role="supervisor" labels={{}} flash={flash} selected="C-001" onSelect={vi.fn()} onClear={vi.fn()} onChanged={vi.fn()} />);
  const review = await screen.findByRole('button', { name: 'Tinjau persetujuan' });
  await waitFor(() => expect(review.hasAttribute('disabled')).toBe(false));
  expect(within(screen.getByLabelText('Bukti saat diagnosis')).getByText('tekanan -20%')).toBeTruthy();
  expect(screen.getByText(/Seal kit pompa hidrolik · stok 0/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'C-000' })).toBeTruthy();
  fireEvent.click(screen.getByText('Pekerjaan selesai atau dibatalkan (1)'));
  expect(screen.getByText('WO-000')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Setujui dan jalankan' })).toBeNull();
  fireEvent.click(review);
  const confirm = await screen.findByRole('region', { name: 'Konfirmasi persetujuan' });
  const approve = within(confirm).getByRole('button', { name: 'Setujui dan jalankan' });
  await waitFor(() => expect(approve.hasAttribute('disabled')).toBe(false));
  fireEvent.click(approve);
  expect((await screen.findByRole('alert')).textContent).toContain('Persetujuan diberikan tetapi tindakan gagal dijalankan.');
  expect(flash).not.toHaveBeenCalled();
});

it('requires a reason before rejecting a high-risk recommendation', async () => {
  const reject = vi.spyOn(api, 'reject').mockResolvedValue({ ...testCase, status: 'ditolak' });
  render(<Cases role="supervisor" labels={{}} flash={vi.fn()} selected="C-001" onSelect={vi.fn()} onClear={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Tolak' }));
  const confirm = screen.getByRole('button', { name: 'Konfirmasi penolakan' });
  expect(confirm.hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Alasan penolakan (wajib)'), { target: { value: 'Perlu inspeksi lapangan' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(reject).toHaveBeenCalledWith('C-001', 'Perlu inspeksi lapangan'));
});

it('does not allow review of an approval when the action preview cannot be loaded', async () => {
  vi.mocked(api.caseContext).mockRejectedValue(new Error('offline'));
  render(<Cases role="supervisor" labels={{}} flash={vi.fn()} selected="C-001" onSelect={vi.fn()} onClear={vi.fn()} onChanged={vi.fn()} />);
  expect(await screen.findByText(/Rencana dan data terkait tidak dapat dimuat/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Tinjau persetujuan' }).hasAttribute('disabled')).toBe(true);
});
