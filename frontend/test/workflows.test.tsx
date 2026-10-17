import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import { RequestState, usePolling } from '../src/usePolling';
import { useNavigation } from '../src/navigation';
import WorkOrders from '../src/components/WorkOrders';
import type { WorkOrder } from '../src/types';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function PollingView({ load }: { load: (signal: AbortSignal) => Promise<string> }) {
  const result = usePolling(load, 100);
  return <><span>{result.data ?? 'loading'}</span><RequestState {...result} retry={result.refresh} /><button onClick={result.refresh}>Refresh</button></>;
}

describe('Web workflow regressions', () => {
  it('hides previous unit data immediately and aborts its pending request', async () => {
    let oldSignal: AbortSignal | undefined;
    const old = (signal: AbortSignal) => { oldSignal = signal; return Promise.resolve('Pump-01 data'); };
    const next = deferred<string>();
    const loadNext = () => next.promise;
    const view = render(<PollingView load={old} />);
    await screen.findByText('Pump-01 data');
    view.rerender(<PollingView load={loadNext} />);
    expect(screen.queryByText('Pump-01 data')).toBeNull();
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => next.resolve('Pump-02 data'));
    expect(screen.getByText('Pump-02 data')).toBeTruthy();
  });

  it('preserves previous data with an explicit stale warning after refresh fails', async () => {
    let fails = false;
    const load = () => fails ? Promise.reject(new Error('offline')) : Promise.resolve('last good reading');
    render(<PollingView load={load} />);
    await screen.findByText('last good reading');
    fails = true;
    fireEvent.click(screen.getByText('Refresh'));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('belum diperbarui');
    expect(screen.getByText('last good reading')).toBeTruthy();
    fails = false;
    fireEvent.click(screen.getByText('Coba lagi'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('does not overlap polling requests when the service responds slowly', async () => {
    vi.useFakeTimers();
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);
    render(<PollingView load={load} />);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve('ready'));
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('restores a direct unit URL and follows browser popstate to a case', () => {
    window.history.replaceState(null, '', '/units/Pump-02');
    function NavigationView() {
      const route = useNavigation();
      return <><span>{route.pumpId ?? route.caseId}</span><button onClick={() => route.navigate('wo')}>Work orders</button></>;
    }
    render(<NavigationView />);
    expect(screen.getByText('Pump-02')).toBeTruthy();
    fireEvent.click(screen.getByText('Work orders'));
    expect(window.location.pathname).toBe('/work-orders');
    act(() => { window.history.replaceState(null, '', '/cases/C-001'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.getByText('C-001')).toBeTruthy();
  });

  it('requires a completion report and submits only once while saving', async () => {
    const workOrder: WorkOrder = { id: 'WO-1', pump_id: 'Pump-01', case_id: 'C-1', title: 'Periksa seal', description: '', priority: 'sedang', status: 'terbuka', technician: null, scheduled_at: null, part: '', created_at: 1 };
    vi.spyOn(api, 'workOrdersPage').mockResolvedValue({ items: [workOrder], total: 1, page: 1, pageSize: 20, technicians: [], units: ['Pump-01'] });
    const pending = deferred<unknown>();
    const complete = vi.spyOn(api, 'complete').mockImplementation(() => pending.promise);
    render(<WorkOrders flash={() => {}} onChanged={() => {}} onOpenCase={() => {}} />);
    fireEvent.click(await screen.findByText('Selesaikan'));
    expect((screen.getByText('Simpan dan tutup') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Akar masalah'), { target: { value: 'Seal aus' } });
    fireEvent.change(screen.getByLabelText('Tindakan'), { target: { value: 'Ganti seal' } });
    const form = screen.getByLabelText('Akar masalah').closest('form');
    if (!form) throw new Error('Completion form not found');
    fireEvent.submit(form); fireEvent.submit(form);
    expect(complete).toHaveBeenCalledTimes(1);
    expect((screen.getByText('Menyimpan…') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve({ ok: true }));
  });
});
