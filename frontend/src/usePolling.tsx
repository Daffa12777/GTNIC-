import { useCallback } from 'react';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { queryClient } from './queryClient';
import LoadingSkeleton from './components/LoadingSkeleton';
import { useConnectivity } from './useConnectivity';

export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Terjadi kesalahan. Coba lagi.';

const loaderIds = new WeakMap<object, number>();
let nextLoaderId = 0;
function loaderKey(load: object): QueryKey {
  if (!loaderIds.has(load)) loaderIds.set(load, ++nextLoaderId);
  return ['resource', loaderIds.get(load)];
}

/** Stable resource keys share cache and requests; filters never show another resource's data. */
export function usePolling<T>(load: (signal: AbortSignal) => Promise<T>, interval: number, enabled = true, key?: QueryKey, staleTime = 30000) {
  const query = useQuery({ queryKey: key ?? loaderKey(load), queryFn: ({ signal }) => load(signal), enabled, staleTime, refetchInterval: interval, refetchIntervalInBackground: false }, queryClient);
  const refresh = useCallback(async () => { await query.refetch({ cancelRefetch: false }); }, [query.refetch]);
  return { data: enabled ? query.data ?? null : null, error: query.error ? errorMessage(query.error) : '', updated: query.dataUpdatedAt || null, loading: enabled && query.fetchStatus !== 'paused' && (query.isFetching || query.isPending), stale: query.isStale, refresh };
}

export function RequestState({ error, loading, updated, retry, showUpdated = true, stale = false }: { error: string; loading: boolean; updated: number | null; retry: () => void; showUpdated?: boolean; stale?: boolean }) {
  const online = useConnectivity();
  if (!error && updated && !showUpdated && !loading) return null;
  return <div className="request-state" aria-live="polite">
    {!online ? <div className="notice warn">Sedang offline. {updated ? 'Menampilkan data terakhir yang berhasil dimuat.' : 'Belum ada data tersimpan untuk halaman ini.'} <button type="button" className="btn sm" disabled>Coba lagi setelah tersambung</button></div>
      : error ? <div className="notice bad" role="alert">Koneksi atau pemuatan gagal: {error}. {updated && showUpdated ? 'Data yang ditampilkan belum diperbarui.' : ''} <button type="button" className="btn sm" disabled={loading} onClick={retry}>Coba lagi</button></div>
      : !updated ? <LoadingSkeleton /> : null}
    {updated && <div className="data-freshness row wrap">
      <span className={`freshness-dot ${loading ? 'updating' : error || stale ? 'stale' : ''}`} aria-hidden="true" />
      <span className="sub">{!online ? 'Data tersimpan · Offline' : loading ? 'Memperbarui…' : error || stale ? 'Menampilkan data terakhir' : 'Data terbaru'}{showUpdated && <> · Pembaruan terakhir: <time dateTime={new Date(updated).toISOString()}>{new Date(updated).toLocaleTimeString('id-ID')}</time></>}</span>
      {showUpdated && !error && <button type="button" className="btn sm" disabled={loading || !online} onClick={retry}>Perbarui data</button>}
    </div>}
  </div>;
}
