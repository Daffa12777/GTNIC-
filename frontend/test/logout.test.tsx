import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SessionGate from '../src/SessionGate';
import { api } from '../src/api';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('hides authenticated content after logout even if reloading the session fails', async () => {
  vi.spyOn(api, 'session').mockResolvedValueOnce({ enabled: true, user: { username: 'teknisi', role: 'teknisi' } }).mockRejectedValue(new Error('offline'));
  const logout = vi.spyOn(api, 'logout').mockResolvedValue({ ok: true });
  render(<SessionGate>{(_user, exit, busy) => <><span>Private dashboard</span><button disabled={busy} onClick={() => void exit()}>Logout</button></>}</SessionGate>);
  fireEvent.click(await screen.findByText('Logout'));
  await screen.findByText('Masuk ke ManualMechanic');
  expect(screen.queryByText('Private dashboard')).toBeNull();
  expect(logout).toHaveBeenCalledTimes(1);
});

it('keeps the dashboard and shows an error when logout fails', async () => {
  vi.spyOn(api, 'session').mockResolvedValue({ enabled: true, user: { username: 'teknisi', role: 'teknisi' } });
  vi.spyOn(api, 'logout').mockRejectedValue(new Error('Logout gagal'));
  render(<SessionGate>{(_user, exit) => <button onClick={() => void exit()}>Logout</button>}</SessionGate>);
  fireEvent.click(await screen.findByText('Logout'));
  expect((await screen.findByRole('alert')).textContent).toContain('Logout gagal');
  expect(screen.getByText('Logout')).toBeTruthy();
});
