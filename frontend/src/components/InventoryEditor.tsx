import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { InventoryItem } from '../types';
import { errorMessage, RequestState, usePolling } from '../usePolling';
import { useUnsavedChanges } from '../useUnsavedChanges';

export default function InventoryEditor({ parts, refresh }: { parts: InventoryItem[]; refresh: () => Promise<void> }) {
  const [part, setPart] = useState<InventoryItem>({ part_id: '', name: '', location: '', stock: 0, min_stock: 1 });
  const [selected, setSelected] = useState('');
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const operation = useRef<{ payload: string; id: string; expectedStock: number }>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const newPartDirty = !!part.part_id || !!part.name || !!part.location || part.stock !== 0 || part.min_stock !== 1;
  const stockDirty = !!reason || delta !== 1;
  useUnsavedChanges(newPartDirty || stockDirty || busy);
  const load = useCallback((signal: AbortSignal) => api.stockMovements(selected, signal), [selected]);
  const history = usePolling(load, 60000, !!selected, ['stock-movements', selected]);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return; pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); await refresh(); } catch (failure: unknown) { setError(errorMessage(failure)); if (failure instanceof ApiError && failure.status === 409) { operation.current = undefined; await refresh(); } }
    finally { pending.current = false; setBusy(false); }
  };
  const current = parts.find((item) => item.part_id === selected);
  return <details className="card card-b inventory-editor"><summary>Kelola inventaris</summary>
    {(newPartDirty || stockDirty) && <div className="notice warn" role="status">Ada perubahan inventaris yang belum disimpan.</div>}
    {error && <div role="alert" className="notice bad">{error}</div>}{message && <div role="status" className="notice">{message}</div>}
    <div className="profile-grid">
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await api.createPart(part); setPart({ part_id: '', name: '', location: '', stock: 0, min_stock: 1 }); setMessage('Part berhasil ditambahkan.'); }); }}><h3>Tambah spare part</h3><fieldset className="form-stack" disabled={busy}>
        {(['part_id', 'name', 'location'] as const).map((key) => <label className="field" key={key}>{key === 'part_id' ? 'ID part' : key === 'name' ? 'Nama part' : 'Lokasi'}<input className="input" required maxLength={key === 'part_id' ? 40 : key === 'name' ? 160 : 100} value={part[key]} onChange={(e) => setPart({ ...part, [key]: e.target.value })} /></label>)}
        {(['stock', 'min_stock'] as const).map((key) => <label className="field" key={key}>{key === 'stock' ? 'Stok awal' : 'Stok minimum'}<input className="input" type="number" required min={0} max={1000000} step={1} value={part[key]} onChange={(e) => setPart({ ...part, [key]: Number(e.target.value) })} /></label>)}
        <button className="btn primary">Tambah part</button>
      </fieldset></form>
      <form onSubmit={(event) => { event.preventDefault(); if (!current) return; void run(async () => {
        const payload = JSON.stringify({ selected, delta, reason: reason.trim() });
        if (operation.current?.payload !== payload) operation.current = { payload, id: crypto.randomUUID(), expectedStock: current.stock };
        await api.adjustStock(selected, { operationId: operation.current.id, delta, reason: reason.trim(), expectedStock: operation.current.expectedStock });
        operation.current = undefined; setReason(''); setDelta(1); setMessage('Perubahan stok tersimpan.'); await history.refresh();
      }); }}><h3>Stok masuk / koreksi</h3><fieldset className="form-stack" disabled={busy}>
        <label className="field">Spare part<select className="sel" required value={selected} onChange={(e) => { if (stockDirty && !window.confirm('Buang perubahan stok yang belum disimpan dan pilih part lain?')) return; setSelected(e.target.value); setReason(''); setDelta(1); operation.current = undefined; }}><option value="">Pilih part</option>{parts.map((item) => <option value={item.part_id} key={item.part_id}>{item.name} — stok {item.stock}</option>)}</select></label>
        <label className="field">Perubahan jumlah (+ masuk, − keluar)<input className="input" type="number" required min={-1000000} max={1000000} step={1} value={delta} onChange={(e) => setDelta(Number(e.target.value))} /></label>
        <label className="field">Alasan perubahan<textarea className="textarea" required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <p className="sub">Stok setelah perubahan: {current ? current.stock + delta : '—'}</p>
        <button className="btn primary" disabled={!current || !delta || current.stock + delta < 0}>Simpan perubahan stok</button>
      </fieldset></form>
    </div>
    {selected && <section><h3>Riwayat perubahan stok</h3><RequestState {...history} retry={history.refresh} /><ul>{history.data?.map((item) => <li key={item.id}>{new Date(item.createdAt).toLocaleString('id-ID')} · {item.actor}: {item.delta > 0 ? '+' : ''}{item.delta} → {item.balance}. {item.reason}</li>)}</ul>{history.data?.length === 0 && <p className="sub">Belum ada perubahan stok tercatat.</p>}</section>}
  </details>;
}
