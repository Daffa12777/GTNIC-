import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SessionGate from '../src/SessionGate';
import { api } from '../src/api';
import { useNavigation } from '../src/navigation';
import type { AuthUser } from '../src/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

function Workspace({ user, exit }: { user: AuthUser | null; exit: () => Promise<void> }) {
  const { tab } = useNavigation();
  return <><span>{user?.username}:{tab}</span><button onClick={() => void exit()}>Logout</button></>;
}

it('opens the dashboard after logout from profile and login as a different account', async () => {
  window.history.replaceState(null, '', '/profile?old=1#details');
  let user: AuthUser | null = { username: 'account-A', role: 'supervisor' };
  vi.spyOn(api, 'session').mockImplementation(async () => ({ enabled: true, user }));
  vi.spyOn(api, 'logout').mockImplementation(async () => { user = null; return { ok: true }; });
  vi.spyOn(api, 'login').mockImplementation(async () => { user = { username: 'account-B', role: 'teknisi' }; return { enabled: true, user }; });
  render(<SessionGate>{(current, exit) => <Workspace key={current?.username} user={current} exit={exit} />}</SessionGate>);
  await screen.findByText('account-A:profil');
  fireEvent.click(screen.getByText('Logout'));
  await screen.findByText('Masuk ke ManualMechanic');
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'account-B' } });
  fireEvent.change(screen.getByLabelText('Kata sandi'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
  await screen.findByText('account-B:ringkasan');
  expect(window.location.pathname + window.location.search + window.location.hash).toBe('/');
});

it('keeps the route when login is rejected', async () => {
  window.history.replaceState(null, '', '/profile');
  vi.spyOn(api, 'session').mockResolvedValue({ enabled: true, user: null });
  vi.spyOn(api, 'login').mockRejectedValue(new Error('Kata sandi salah'));
  render(<SessionGate>{() => <span>Private</span>}</SessionGate>);
  await screen.findByText('Masuk ke ManualMechanic');
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'account-B' } });
  fireEvent.change(screen.getByLabelText('Kata sandi'), { target: { value: 'wrong-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
  await screen.findByText('Kata sandi salah');
  expect(window.location.pathname).toBe('/profile');
});

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
