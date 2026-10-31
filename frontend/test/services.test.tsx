import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ServiceStatus from '../src/components/ServiceStatus';
import { api } from '../src/api';
import { queryClient } from '../src/queryClient';
beforeEach(() => queryClient.clear());
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); });
it('does not probe Gemini automatically and shows an explicit test failure', async () => {
  vi.spyOn(api, 'services').mockResolvedValue({ checkedAt: Date.now(), database: { ok: true }, ml: { ok: true }, llm: { state: 'unchecked', checkedAt: null, code: null, message: 'Belum diuji' } });
  const check = vi.spyOn(api, 'checkLlm').mockResolvedValue({ state: 'error', checkedAt: Date.now(), code: 'HTTP_429', message: 'Kuota tercapai' });
  render(<ServiceStatus />);
  await screen.findByText('Belum diuji'); expect(check).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Status layanan'));
  fireEvent.click(screen.getByRole('button', { name: 'Uji Gemini' }));
  await waitFor(() => expect(screen.getByText('Kuota tercapai (HTTP_429)')).toBeTruthy());
  expect(check).toHaveBeenCalledTimes(1);
});

it('distinguishes a confirmed unavailable ML service from an unconfirmed connection', async () => {
  vi.spyOn(api, 'services').mockResolvedValue({ checkedAt: Date.now(), database: { ok: true }, ml: { ok: false }, llm: { state: 'unconfigured', checkedAt: null, code: null, message: 'Gemini belum dikonfigurasi.' } });
  render(<ServiceStatus />);
  await screen.findByText('Gemini belum dikonfigurasi.');
  fireEvent.click(screen.getByText('Status layanan'));
  expect(screen.getByText('ML sensor: Tidak tersedia')).toBeTruthy();
  expect(screen.getByText('Database: Terhubung')).toBeTruthy();
});
