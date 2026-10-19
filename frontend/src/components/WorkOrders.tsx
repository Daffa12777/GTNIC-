import { useUrlFilters } from '../useUrlFilters';
import { Fragment, useCallback, useRef, useState } from 'react';
import Pagination from './Pagination';
import SearchField from './SearchField';
import { useDebounced } from '../useDebounced';
import { api } from '../api';
import { RequestState, usePolling, errorMessage } from '../usePolling';
import { Badge, Empty, WO_TONE, fmtTime } from './ui';

export default function WorkOrders({ flash, onChanged, onOpenCase }: { flash: (m: string) => void; onChanged: () => void; onOpenCase: (id: string) => void }) {
  const [filters, updateFilters] = useUrlFilters({ q: '', status: '', priority: '', unit: '', technician: '', page: 1, pageSize: 20 });
  const query = filters.q;
  const setQuery = (value: string) => updateFilters({ q: value, page: 1 }, true);
  const status = filters.status;
  const setStatus = (value: string) => updateFilters({ status: value, page: 1 });
  const priority = filters.priority;
  const setPriority = (value: string) => updateFilters({ priority: value, page: 1 });
  const unit = filters.unit;
  const setUnit = (value: string) => updateFilters({ unit: value, page: 1 });
  const technician = filters.technician;
  const setTechnician = (value: string) => updateFilters({ technician: value, page: 1 });
  const page = filters.page;
  const setPage = (value: number) => updateFilters({ page: value });
  const pageSize = filters.pageSize;
  const setPageSize = (value: number) => updateFilters({ pageSize: value, page: 1 });
  const search = useDebounced(query);
  const load = useCallback((signal: AbortSignal) => api.workOrdersPage(new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: search, status, priority, unit, technician }), signal), [page, pageSize, search, status, priority, unit, technician]);
  const result = usePolling(load, 30000, true, ['work-orders', page, pageSize, search, status, priority, unit, technician]);
  const rows = result.data?.items ?? [];
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
        <SearchField label="Cari pekerjaan" value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ID, judul, unit, teknisi" pending={query !== search} />
        <label>Status<select className="sel" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Semua status</option>{Object.keys(WO_TONE).map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Prioritas<select className="sel" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}><option value="">Semua prioritas</option>{['rendah', 'sedang', 'tinggi'].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Unit<select className="sel" value={unit} onChange={(e) => { setUnit(e.target.value); setPage(1); }}><option value="">Semua unit</option>{result.data?.units.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Teknisi<select className="sel" value={technician} onChange={(e) => { setTechnician(e.target.value); setPage(1); }}><option value="">Semua teknisi</option><option value="unassigned">Belum ditugaskan</option>{result.data?.technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <Pagination page={page} pageSize={pageSize} total={result.data?.total ?? 0} loading={result.loading} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} />
      <div className="card">
        {rows.length === 0 ? result.data && <Empty>Tidak ada pekerjaan pada halaman ini atau sesuai filter.</Empty> : (
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
