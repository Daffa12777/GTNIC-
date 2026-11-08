import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { AssignmentResult } from '../types';
import { errorMessage, RequestState, usePolling } from '../usePolling';
import { useUnsavedChanges } from '../useUnsavedChanges';

export default function WorkOrderAssignment({ orderId, onDone, onCancel, onBusy }: { orderId: string; onDone: (result: AssignmentResult) => void; onCancel: () => void; onBusy: (busy: boolean) => void }) {
  const load = useCallback((signal: AbortSignal) => api.assignmentOptions(orderId, signal), [orderId]);
  const options = usePolling(load, 0, true, ['assignment-options', orderId], 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const section = useRef<HTMLElement>(null);
  useEffect(() => { section.current?.focus(); }, []);
  useUnsavedChanges(busy);
  const data = options.data;
  const value = selected ?? data?.current_technician_id ?? '';
  const eligible = !value || !!data?.technicians.some(t => t.id === value && t.eligible);
  const closed = !!data && ['selesai', 'dibatalkan'].includes(data.status);
  const submit = async () => {
    if (!data || !eligible || saving.current || closed) return;
    saving.current = true; setBusy(true); onBusy(true); setError('');
    try { onDone(await api.assignTechnician(orderId, value || null, data.current_technician_id)); }
    catch (error: unknown) { setError(errorMessage(error)); }
    finally { saving.current = false; setBusy(false); onBusy(false); }
  };
  return <section ref={section} tabIndex={-1} style={{ padding: 16 }} aria-label={`Penugasan ${orderId}`}>
    <h2>Penugasan teknisi · {orderId}</h2>
    <RequestState {...options} retry={options.refresh} showUpdated={false} />
    {data && <form className="form-stack" aria-busy={busy} onSubmit={e => { e.preventDefault(); void submit(); }}>
      <p className="sub">Keahlian: {data.requirements.skill}{data.requirements.senior ? ' · Memerlukan teknisi senior' : ''}. Penugasan lama tetap berlaku jika pilihan baru gagal.</p>
      {data.reason && <p className="notice warn" role="status">{data.reason}</p>}
      {closed && <p className="notice warn">Pekerjaan sudah ditutup dan tidak dapat ditugaskan.</p>}
      <label className="field">Pilih teknisi<select className="sel" value={value} disabled={busy || options.loading || closed} onChange={e => setSelected(e.target.value)}>
        <option value="">Pilih otomatis{data.current_technician_id ? ' (pertahankan penugasan saat ini)' : ''}</option>
        {data.technicians.map(t => <option key={t.id} value={t.id} disabled={!t.eligible}>{t.name ?? t.id} · {t.skill ?? 'keahlian belum diisi'}{t.level === 'senior' ? ' · senior' : ''}{t.current ? ' · saat ini' : t.reason ? ` · ${t.reason}` : ' · tersedia'}</option>)}
      </select></label>
      <details><summary>Ketersediaan teknisi</summary><ul>{data.technicians.map(t => <li key={t.id}>{t.name ?? t.id}: {t.current ? 'ditugaskan saat ini' : t.reason ?? 'tersedia dan sesuai keahlian'}</li>)}</ul></details>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row wrap"><button className="btn primary" disabled={busy || options.loading || !eligible || closed}>{busy ? 'Menyimpan penugasan…' : 'Simpan penugasan'}</button><button type="button" className="btn" disabled={busy || options.loading} onClick={() => void options.refresh()}>Perbarui pilihan</button><button type="button" className="btn" disabled={busy} onClick={onCancel}>Batal</button></div>
    </form>}
    {!data && <button className="btn" onClick={onCancel}>Batal</button>}
  </section>;
}
