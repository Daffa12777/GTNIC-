import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import ConnectionStatus from '../src/components/ConnectionStatus';
import { RequestState } from '../src/usePolling';
import { api } from '../src/api';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); onlineManager.setOnline(true); });
it('shows offline state without losing data freshness and hides it after reconnecting', () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  render(<><ConnectionStatus /><RequestState error="" loading={false} updated={1000} retry={vi.fn()} /></>);
  expect(screen.getByText(/Koneksi internet terputus/)).toBeTruthy();
  expect(screen.getByText('Data tersimpan · Offline', { exact: false })).toBeTruthy();
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event('online')));
  expect(screen.queryByText(/Koneksi internet terputus/)).toBeNull();
});
it('does not queue or send mutations while the browser is offline', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(api.auto(true)).rejects.toThrow('Tindakan belum dikirim');
  expect(fetch).not.toHaveBeenCalled();
});
