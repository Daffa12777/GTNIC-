import { useRef, useState } from 'react';
import { api } from '../api';
import { errorMessage, usePolling } from '../usePolling';
import { Badge } from './ui';
import type { LlmConnectionStatus } from '../types';
export default function ServiceStatus() {
  const services = usePolling(api.services, 30000);
  const [probe, setProbe] = useState<LlmConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const current = services.data?.llm;
  const llm = probe && (!current?.checkedAt || (probe.checkedAt ?? 0) >= current.checkedAt) ? probe : current;
  return <details className="service-status"><summary>Status layanan <Badge tone={services.error || llm?.state === 'error' || services.data?.ml.ok === false ? 'warn' : 'info'}>{services.error ? 'Koneksi terganggu' : llm?.state === 'error' ? 'Gemini bermasalah' : 'Detail'}</Badge></summary>
    <div className="card card-b"><div className="row wrap">
      <Badge tone={services.data?.database.ok ? 'ok' : 'warn'}>Database: {services.data?.database.ok ? 'Terhubung' : 'Belum terkonfirmasi'}</Badge>
      <Badge tone={services.data?.ml.ok ? 'ok' : 'warn'}>ML sensor: {services.data?.ml.ok ? 'Terhubung' : 'Belum terkonfirmasi'}</Badge>
      <Badge tone={llm?.state === 'ready' ? 'ok' : llm?.state === 'error' ? 'bad' : 'info'}>Gemini: {llm?.state === 'ready' ? 'Uji terakhir berhasil' : llm?.state === 'error' ? 'Gagal' : llm?.state === 'unconfigured' ? 'Belum dikonfigurasi' : 'Belum diuji'}</Badge>
    </div><p>{llm?.message ?? 'Memeriksa koneksi backend…'}{llm?.code ? ` (${llm.code})` : ''}</p>
    {llm?.checkedAt && <p className="sub">Hasil Gemini terakhir: {new Date(llm.checkedAt).toLocaleString('id-ID')}. Status ini bukan jaminan kuota untuk permintaan berikutnya.</p>}
    {(error || services.error) && <p className="notice bad" role="alert">{error || services.error}</p>}
    <div className="row wrap"><button type="button" className="btn sm" disabled={busy || !services.data || llm?.state === 'unconfigured'} onClick={async () => {
      if (pending.current) return; pending.current = true; setBusy(true); setError('');
      try { setProbe(await api.checkLlm()); await services.refresh(); } catch (failure: unknown) { setError(errorMessage(failure)); } finally { pending.current = false; setBusy(false); }
    }}>{busy ? 'Menguji Gemini…' : 'Uji Gemini'}</button><button type="button" className="btn sm" disabled={services.loading} onClick={() => void services.refresh()}>Periksa ulang layanan</button><span className="sub">Uji Gemini mengirim satu permintaan singkat dan memakai kuota API.</span></div>
    </div>
  </details>;
}
