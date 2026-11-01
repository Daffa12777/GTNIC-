import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import NotificationBell from '../src/components/NotificationBell';
import { api } from '../src/api';
import { queryClient } from '../src/queryClient';

afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); });
it('shows demo notifications without claiming a per-user read state', async () => {
  vi.spyOn(api, 'notifications').mockResolvedValue([{ id: 1, ts: 1700000000, recipient: 'Tim', message: 'Periksa unit', status: 'disimulasikan' }]);
  const mark = vi.spyOn(api, 'readInbox');
  render(<NotificationBell demo onOpenCase={() => {}} />);
  fireEvent.click(screen.getByLabelText('Notifikasi operasional, mode demo'));
  expect(await screen.findByText('Periksa unit')).toBeTruthy();
  expect(screen.getByText(/status dibaca tidak disimpan/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Tandai semua dibaca' })).toBeNull();
  expect(mark).not.toHaveBeenCalled();
});
