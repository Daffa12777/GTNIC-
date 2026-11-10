import { useUrlFilters } from '../useUrlFilters';
import { Fragment, useCallback, useRef, useState } from 'react';
import Pagination from './Pagination';
import SearchField from './SearchField';
import { useDebounced } from '../useDebounced';
import { api } from '../api';
import { RequestState, usePolling, errorMessage } from '../usePolling';
import { Empty, PriorityBadge, PRIORITY_LABEL, WO_LABEL, WorkOrderBadge, fmtTime } from './ui';
import { useUnsavedChanges } from '../useUnsavedChanges';
import ConfirmDialog from './ConfirmDialog';
import WorkOrderAssignment from './WorkOrderAssignment';
import type { Role } from '../types';
import { canSupervise } from '../types';

export default function WorkOrders({ role = 'teknisi', mine = false, flash, onChanged, onOpenCase }: { role?: Role; mine?: boolean; flash: (m: string) => void; onChanged: () => void; onOpenCase: (id: string) => void }) {
  const [filters, updateFilters] = useUrlFilters({ q: '', status: '', priority: '', unit: '', technician: '', page: 1, pageSize: 20 }, (resume) => discardCompletion(resume));
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
  const load = useCallback((signal: AbortSignal) => api.workOrdersPage(new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: search, status, priority, unit, ...(mine ? { mine: 'true' } : { technician }) }), signal), [page, pageSize, search, status, priority, unit, technician, mine]);
  const result = usePolling(load, 30000, true, ['work-orders', mine ? 'mine' : 'all', page, pageSize, search, status, priority, unit, technician]);
  const rows = result.data?.items ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<string | null>(null);
  const [cause, setCause] = useState('');
  const [action, setAction] = useState('');

  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState<{ run: () => void } | null>(null);
  const dirty = !!cause || !!action;
  useUnsavedChanges(dirty || busy);
  const discardCompletion = (resume?: () => void) => {
    if (busy) return false;
    if (dirty) { setDiscard({ run: () => { setCause(''); setAction(''); setError(''); setOpen(null); resume?.(); } }); return false; }
    setCause(''); setAction(''); setError(''); setOpen(null);
    return true;
  };

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
      <div className="page-head"><div><h1>{mine ? 'Tugas saya' : 'Work order'}</h1><p>{mine ? 'Pekerjaan yang ditugaskan kepada akun Anda. Catat hasil pemeriksaan setelah pekerjaan selesai.' : 'Tinjau pekerjaan, penanggung jawab, dan hasil perawatan.'}</p>{!canSupervise(role) && <p className="sub">Penugasan teknisi hanya dapat diubah oleh owner atau supervisor.</p>}</div></div>
      <RequestState {...result} retry={result.refresh} />
      {dirty && <div className="notice warn" role="status">Ada laporan penyelesaian yang belum disimpan.</div>}
      <div className="filters">
        <SearchField label="Cari pekerjaan" value={query} onChange={(value) => { setQuery(value); }} placeholder="ID, judul, unit, teknisi" pending={query !== search} />
        <label>Status<select className="sel" value={status} onChange={(e) => { setStatus(e.target.value); }}><option value="">Semua status</option><option value="group:active">Semua pekerjaan aktif</option>{Object.entries(WO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Prioritas<select className="sel" value={priority} onChange={(e) => { setPriority(e.target.value); }}><option value="">Semua prioritas</option>{Object.entries(PRIORITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Unit<select className="sel" value={unit} onChange={(e) => { setUnit(e.target.value); }}><option value="">Semua unit</option>{result.data?.units.map((s) => <option key={s}>{s}</option>)}</select></label>
        {!mine && <label>Teknisi<select className="sel" value={technician} onChange={(e) => { setTechnician(e.target.value); }}><option value="">Semua teknisi</option><option value="unassigned">Belum ditugaskan</option>{result.data?.technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </div>
      <Pagination page={page} pageSize={pageSize} total={result.data?.total ?? 0} loading={result.loading} onPage={setPage} onPageSize={(size) => { setPageSize(size); }} />
      <div className="card">
        {rows.length === 0 ? result.data && <Empty>Tidak ada pekerjaan pada halaman ini atau sesuai filter.</Empty> : (
          <table className="work-orders-table">
            <thead><tr><th>ID</th><th>Unit</th><th>Pekerjaan</th><th>Prioritas</th><th>Status</th><th>Teknisi</th><th></th></tr></thead>
            <tbody>
              {rows.map((w) => (
                <Fragment key={w.id}>
                  <tr className="work-order-row">
                    <td className="id" data-label="Work order">{w.id}</td>
                    <td data-label="Unit">{w.pump_id}</td>
                    <td className="work-order-title" data-label="Pekerjaan">{w.title}<div className="sub">{fmtTime(w.created_at)}{w.part ? ` · Part: ${w.part}` : ''}{w.case_id ? <> · <a href="#kasus" onClick={(e) => { e.preventDefault(); onOpenCase(w.case_id); }}>{w.case_id}</a></> : null}</div></td>
                    <td data-label="Prioritas"><PriorityBadge priority={w.priority} /></td>
                    <td data-label="Status"><WorkOrderBadge status={w.status} /></td>
                    <td data-label="Teknisi">{w.technician ?? (['selesai', 'dibatalkan'].includes(w.status) ? 'Tanpa penugasan' : 'Belum ditugaskan')}<div className="sub">{w.scheduled_at ?? w.assignment_reason ?? ''}</div></td>
                    <td className="work-order-actions">{!['selesai', 'dibatalkan'].includes(w.status) && <div className="row wrap">{canSupervise(role) && <button className="btn sm" disabled={busy} onClick={() => { if (discardCompletion()) setAssignment(assignment === w.id ? null : w.id); }}>{w.technician ? 'Ubah teknisi' : 'Tugaskan teknisi'}</button>}{(canSupervise(role) || w.can_complete !== false) && <button className="btn sm" disabled={busy} onClick={() => { const next = open === w.id ? null : w.id; if (discardCompletion(() => { setAssignment(null); setOpen(next); })) { setAssignment(null); setOpen(next); } }}>Selesaikan</button>}</div>}</td>
                  </tr>
                  {assignment === w.id && canSupervise(role) && <tr className="work-order-report"><td colSpan={7}><WorkOrderAssignment orderId={w.id} onBusy={setBusy} onCancel={() => setAssignment(null)} onDone={assigned => { setAssignment(null); flash(`${w.id} ditugaskan kepada ${assigned.technician}.`); void result.refresh(); onChanged(); }} /></td></tr>}
                  {open === w.id && (
                    <tr className="work-order-report"><td colSpan={7} style={{ background: '#fafbfc' }}>
                      <form className="row wrap" aria-busy={busy} onSubmit={(e) => { e.preventDefault(); void complete(w.id); }}>
                        <label className="field">Akar masalah<textarea className="textarea" rows={3} required maxLength={2000} disabled={busy} placeholder="Akar masalah yang ditemukan" value={cause} onChange={(e) => setCause(e.target.value)} /></label>
                        <label className="field">Tindakan<textarea className="textarea" rows={3} required maxLength={2000} disabled={busy} placeholder="Tindakan yang dilakukan" value={action} onChange={(e) => setAction(e.target.value)} /></label>
                        {w.part?.trim() && <p className="sub">Menyelesaikan pekerjaan akan mengurangi stok {w.part} sebanyak 1 unit.</p>}
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
      {discard && <ConfirmDialog title="Buang laporan?" description="Laporan penyelesaian yang belum disimpan akan hilang." confirmLabel="Buang laporan" onCancel={() => setDiscard(null)} onConfirm={() => { const run = discard.run; setDiscard(null); run(); }} />}
    </div>
  );
}
