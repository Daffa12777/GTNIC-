import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Chat from '../src/components/Chat';
import { api } from '../src/api';

afterEach(() => sessionStorage.clear());
it('separates LLM claims from persisted orders and purchases and opens the evidence', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api, 'chat').mockResolvedValue({ reply: 'Teknisi sudah saya tugaskan.', case: null, action_summary: { case_id: 'C-1', status: 'dieskalasi', checked_at: 1, order_count: 1, orders: [{ id: 'WO-1', status: 'terbuka', technician: null, scheduled_at: null, purchases: [{ id: 'PR-1', part_name: 'Seal', qty: 2, status: 'diajukan' }] }] } });
  const open = vi.fn();
  render(<Chat username="summary-test" useLlm onOpenCase={open} onChanged={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Pesan untuk asisten'), { target: { value: 'Pump-01 oli panas' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
  const summary = await screen.findByRole('region', { name: 'Hasil tersimpan C-1' });
  expect(within(summary).getByText('Belum ditugaskan ke teknisi.')).toBeTruthy();
  expect(within(summary).getByText(/Pengajuan PR-1: Seal × 2/)).toBeTruthy();
  fireEvent.click(within(summary).getByRole('button', { name: 'Periksa jejak kasus' }));
  expect(open).toHaveBeenCalledWith('C-1');
});
it('keeps a successful chat reply when its result summary could not be loaded', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api, 'chat').mockResolvedValue({ reply: 'Analisis selesai.', case: null, action_summary_error: 'Ringkasan belum dapat dimuat. Periksa jejak kasus.' });
  render(<Chat username="summary-failure" useLlm={false} onOpenCase={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Pesan untuk asisten'), { target: { value: 'Pump-01 oli panas' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
  await screen.findByText('Analisis selesai.');
  expect(screen.getByText('Ringkasan belum dapat dimuat. Periksa jejak kasus.')).toBeTruthy();
  expect(screen.queryByText(/Terjadi kesalahan/)).toBeNull();
});
