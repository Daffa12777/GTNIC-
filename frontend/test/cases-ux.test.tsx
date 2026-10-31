import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import Cases from '../src/components/Cases';
import { queryClient } from '../src/queryClient';
import type { Case } from '../src/types';

const testCase: Case = {
  id: 'C-001', pump_id: 'Pump-01', status: 'menunggu_persetujuan', fault: 'pump', confidence: 0.9,
  risk: 'tinggi', summary: 'Perlu persetujuan', created_at: 1700000000, mode: 'policy',
  plan: { fault: 'pump', confidence: 0.9, risk: 'tinggi', citation: 'Manual 1.1' },
};

beforeEach(() => {
  queryClient.clear();
  vi.spyOn(api, 'casesPage').mockResolvedValue({ items: [testCase], total: 1, page: 1, pageSize: 20 });
  vi.spyOn(api, 'getCase').mockResolvedValue(testCase);
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
  fireEvent.click(await screen.findByRole('button', { name: 'Setujui dan jalankan' }));
  await waitFor(() => expect(flash).toHaveBeenCalledWith('Persetujuan diberikan tetapi tindakan gagal dijalankan.'));
});
