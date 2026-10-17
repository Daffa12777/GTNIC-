import { useCallback, useEffect, useRef, useState } from 'react';

export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Terjadi kesalahan. Coba lagi.';

/** One request at a time; changing resource cancels requests and hides previous data immediately. */
export function usePolling<T>(load: (signal: AbortSignal) => Promise<T>, interval: number, enabled = true) {
  const [snapshot, setSnapshot] = useState<{ owner: typeof load; data: T | null; error: string; updated: number | null }>({ owner: load, data: null, error: '', updated: null });
  const [loading, setLoading] = useState(true);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!enabled) { setLoading(false); refreshRef.current = async () => {}; return; }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const refresh = async () => {
      if (!active) return;
      clearTimeout(timer);
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setLoading(true);
      try {
        const data = await load(current.signal);
        if (active && !current.signal.aborted) setSnapshot({ owner: load, data, error: '', updated: Date.now() });
      } catch (error: unknown) {
        if (active && !current.signal.aborted) setSnapshot((old) => ({ owner: load, data: old.owner === load ? old.data : null, updated: old.owner === load ? old.updated : null, error: errorMessage(error) }));
      } finally {
        if (active && !current.signal.aborted) {
          setLoading(false);
          timer = setTimeout(refresh, interval);
        }
      }
    };
    refreshRef.current = refresh;
    void refresh();
    return () => { active = false; clearTimeout(timer); controller?.abort(); };
  }, [load, interval, enabled]);
  const refresh = useCallback(() => refreshRef.current(), []);
  const same = snapshot.owner === load;
  return { data: same ? snapshot.data : null, error: same ? snapshot.error : '', updated: same ? snapshot.updated : null, loading: enabled && (!same || loading), refresh };
}

export function RequestState({ error, loading, updated, retry, showUpdated = true }: { error: string; loading: boolean; updated: number | null; retry: () => void; showUpdated?: boolean }) {
  if (!error && updated && !showUpdated) return null;
  return <div className="request-state" aria-live="polite">
    {error ? <div className="notice bad" role="alert">Koneksi atau pemuatan gagal: {error}. {updated && showUpdated ? 'Data yang ditampilkan belum diperbarui.' : ''} <button type="button" className="btn sm" disabled={loading} onClick={retry}>Coba lagi</button></div>
      : !updated ? <div className="notice">Memuat data…</div> : null}
    {showUpdated && updated && <div className="sub">Pembaruan terakhir: <time dateTime={new Date(updated).toISOString()}>{new Date(updated).toLocaleTimeString('id-ID')}</time>{loading ? ' · Memperbarui…' : ''}</div>}
  </div>;
}
