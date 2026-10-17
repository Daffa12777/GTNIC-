import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Profile from '../src/components/Profile';
import { api } from '../src/api';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const user = { name: 'Farras', email: 'farras@example.test', username: 'farras', role: 'teknisi' as const };
const setup = async () => {
  vi.spyOn(api, 'profile').mockResolvedValue(user);
  const logout = vi.fn().mockResolvedValue(undefined);
  render(<Profile logout={logout} loggingOut={false} />);
  await screen.findByDisplayValue('Farras');
  return logout;
};

it('saves profile fields and shows logout in the profile', async () => {
  const save = vi.spyOn(api, 'updateProfile').mockResolvedValue(user);
  const logout = await setup();
  fireEvent.change(screen.getByLabelText('Nama'), { target: { value: 'Farras Mumtaz' } });
  fireEvent.click(screen.getByText('Simpan profil'));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ name: 'Farras Mumtaz', email: user.email, username: user.username }));
  await screen.findByText('Profil berhasil disimpan.');
  fireEvent.click(screen.getByText('Logout'));
  expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Role').getAttribute('readonly')).not.toBeNull();
});

it('requires matching passwords and supports visibility toggles', async () => {
  const change = vi.spyOn(api, 'changePassword').mockResolvedValue({ ok: true });
  const logout = await setup();
  fireEvent.change(screen.getByLabelText('Password saat ini'), { target: { value: 'old-password-123' } });
  fireEvent.change(screen.getByLabelText('Password baru'), { target: { value: 'new-password-123' } });
  fireEvent.change(screen.getByLabelText('Konfirmasi password baru'), { target: { value: 'other-password-123' } });
  fireEvent.click(screen.getAllByLabelText('Tampilkan kata sandi')[0]);
  expect(screen.getByLabelText('Password saat ini').getAttribute('type')).toBe('text');
  fireEvent.click(screen.getByRole('button', { name: 'Ubah password' }));
  expect((await screen.findByRole('alert')).textContent).toContain('tidak cocok');
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Konfirmasi password baru'), { target: { value: 'new-password-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ubah password' }));
  await waitFor(() => expect(logout).toHaveBeenCalledWith(true));
});

it('requires explicit username and password confirmation before deleting', async () => {
  const remove = vi.spyOn(api, 'deleteAccount').mockResolvedValue({ ok: true });
  const logout = await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Hapus akun' }));
  expect((screen.getByText('Hapus akun permanen') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Password untuk hapus akun'), { target: { value: 'old-password-123' } });
  fireEvent.change(screen.getByLabelText('Ketik farras untuk konfirmasi'), { target: { value: 'farras' } });
  fireEvent.click(screen.getByText('Hapus akun permanen'));
  await waitFor(() => expect(remove).toHaveBeenCalledWith('old-password-123'));
  await waitFor(() => expect(logout).toHaveBeenCalledWith(true));
});
