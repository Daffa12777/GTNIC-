import { Fragment, useRef, useState } from 'react';
import { api } from '../api';
import { RequestState, usePolling, errorMessage } from '../usePolling';
import { Badge, Empty, WO_TONE, fmtTime } from './ui';

export default function WorkOrders({ flash, onChanged, onOpenCase }: { flash: (m: string) => void; onChanged: () => void; onOpenCase: (id: string) => void }) {
  const result = usePolling(api.workOrders, 4000);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [unit, setUnit] = useState('');
  const [technician, setTechnician] = useState('');
  const rows = (result.data ?? []).filter((w) => (!status || w.status === status) && (!priority || w.priority === priority) && (!unit || w.pump_id === unit) && (!technician || (w.technician ?? 'Belum ditugaskan') === technician) && `${w.id} ${w.title} ${w.pump_id} ${w.technician ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const [open, setOpen] = useState<string | null>(null);
  const [cause, setCause] = useState('');
  const [action, setAction] = useState('');

  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');

  const complete = async (id: string) => {
    if (saving.current) return;
    if (!cause.trim() || !action.trim()) { setError('Akar masalah dan tindakan wajib diisi.'); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      await api.complete(id, cause.trim(), action.trim());
      flash(`${id} selesai. Riwayat disimpan dan indeks pengetahuan agent diperbarui`);
      setOpen(null); setCause(''); setAction(''); await result.refresh(); onChanged();
    } catch (e: unknown) { setError(errorMessage(e)); }
    finally { saving.current = false; setBusy(false); }
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Work order</h1><p>Dibuat oleh agent melalui tool, lengkap dengan jadwal teknisi. Menutup work order menambah riwayat yang dipakai RAG.</p></div></div>
      <RequestState {...result} retry={result.refresh} />
      <div className="filters">
        <label>Cari pekerjaan<input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID, judul, unit, teknisi" /></label>
        <label>Status<select className="sel" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Semua status</option>{Array.from(new Set((result.data ?? []).map((w) => w.status))).map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Prioritas<select className="sel" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Semua prioritas</option>{['rendah', 'sedang', 'tinggi'].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Unit<select className="sel" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">Semua unit</option>{Array.from(new Set((result.data ?? []).map((w) => w.pump_id))).map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Teknisi<select className="sel" value={technician} onChange={(e) => setTechnician(e.target.value)}><option value="">Semua teknisi</option>{Array.from(new Set((result.data ?? []).map((w) => w.technician ?? 'Belum ditugaskan'))).map((s) => <option key={s}>{s}</option>)}</select></label>
        <span className="sub">Maksimal 60 pekerjaan terbaru</span>
      </div>
      <div className="card">
        {rows.length === 0 ? result.data && <Empty>{result.data.length ? 'Tidak ada pekerjaan yang cocok dengan filter.' : 'Belum ada work order.'}</Empty> : (
          <table>
            <thead><tr><th>ID</th><th>Unit</th><th>Pekerjaan</th><th>Prioritas</th><th>Status</th><th>Teknisi</th><th></th></tr></thead>
            <tbody>
              {rows.map((w) => (
                <Fragment key={w.id}>
                  <tr>
                    <td className="id">{w.id}</td>
                    <td>{w.pump_id}</td>
                    <td style={{ maxWidth: 380 }}>{w.title}<div className="sub">{fmtTime(w.created_at)}{w.part ? ` · Part: ${w.part}` : ''}{w.case_id ? <> · <a href="#kasus" onClick={(e) => { e.preventDefault(); onOpenCase(w.case_id); }}>{w.case_id}</a></> : null}</div></td>
                    <td>{w.priority}</td>
                    <td><Badge tone={WO_TONE[w.status] ?? 'info'}>{w.status}</Badge></td>
                    <td>{w.technician ?? '-'}<div className="sub">{w.scheduled_at ?? ''}</div></td>
                    <td style={{ textAlign: 'right' }}>{!['selesai', 'dibatalkan'].includes(w.status) && <button className="btn sm" disabled={busy} onClick={() => { setOpen(open === w.id ? null : w.id); setCause(''); setAction(''); setError(''); }}>Selesaikan</button>}</td>
                  </tr>
                  {open === w.id && (
                    <tr><td colSpan={7} style={{ background: '#fafbfc' }}>
                      <form className="row wrap" aria-busy={busy} onSubmit={(e) => { e.preventDefault(); void complete(w.id); }}>
                        <label className="field">Akar masalah<input className="input" required maxLength={2000} disabled={busy} placeholder="Akar masalah yang ditemukan" value={cause} onChange={(e) => setCause(e.target.value)} /></label>
                        <label className="field">Tindakan<input className="input" required maxLength={2000} disabled={busy} placeholder="Tindakan yang dilakukan" value={action} onChange={(e) => setAction(e.target.value)} /></label>
                        <button className="btn primary" disabled={busy || !cause.trim() || !action.trim()}>{busy ? 'Menyimpan…' : 'Simpan dan tutup'}</button>
                        {error && <div className="form-error" role="alert">{error}</div>}
                      </form>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
