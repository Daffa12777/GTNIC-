import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import TeamManagement from '../src/components/TeamManagement';
import { api } from '../src/api';

it('does not fetch management data for a technician', () => {
  const load = vi.spyOn(api, 'team');
  render(<TeamManagement role="teknisi" />);
  expect(screen.getByRole('alert').textContent).toContain('owner atau supervisor');
  expect(load).not.toHaveBeenCalled();
});

it('lets supervisor create only technicians and retains an inline error', async () => {
  vi.spyOn(api, 'team').mockResolvedValue({ technicians: [], accounts: [], supervisors: [] });
  const create = vi.spyOn(api, 'createTechnician').mockRejectedValueOnce(new Error('Username sudah digunakan.')).mockResolvedValueOnce({});
  render(<TeamManagement role="supervisor" />);
  await screen.findByRole('heading', { name: 'Tambah akun' });
  expect(screen.queryByLabelText('Peran akun baru')).toBeNull();
  fireEvent.change(screen.getByLabelText('Nama lengkap'), { target: { value: 'Adi Teknisi' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'adi' } });
  fireEvent.change(screen.getByLabelText('Kata sandi awal'), { target: { value: 'PasswordFixture123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buat akun teknisi' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Username sudah digunakan');
  expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('adi');
  fireEvent.click(screen.getByRole('button', { name: 'Buat akun teknisi' }));
  await screen.findByText('Akun adi berhasil dibuat.');
  expect(create).toHaveBeenLastCalledWith({ username: 'adi', name: 'Adi Teknisi', password: 'PasswordFixture123!', skill: 'mekanik', level: 'junior' });
  expect((screen.getByLabelText('Kata sandi awal') as HTMLInputElement).value).toBe('');
});

it('lets Owner create a supervisor without sending a role chosen by the client', async () => {
  vi.spyOn(api, 'team').mockResolvedValue({ technicians: [], accounts: [], supervisors: [] });
  const create = vi.spyOn(api, 'createSupervisor').mockResolvedValue({});
  render(<TeamManagement role="owner" />);
  fireEvent.change(await screen.findByLabelText('Peran akun baru'), { target: { value: 'supervisor' } });
  fireEvent.change(screen.getByLabelText('Nama lengkap'), { target: { value: 'Dewi' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'dewi' } });
  fireEvent.change(screen.getByLabelText('Kata sandi awal'), { target: { value: 'PasswordFixture123!' } });
  expect(screen.queryByLabelText('Keahlian')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Buat akun supervisor' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith({ username: 'dewi', name: 'Dewi', password: 'PasswordFixture123!' }));
});
