import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Role } from '../types';
import { canSupervise } from '../types';
import { RequestState, usePolling } from '../usePolling';
import { CaseBadge, Empty, PriorityBadge, RiskBadge, fmtTime } from './ui';
import WorkOrderAssignment from './WorkOrderAssignment';
import { useUnsavedChanges } from '../useUnsavedChanges';

export default function SupervisorTasks({ role, onOpenCase, flash, onChanged }: { role: Role; onOpenCase: (id: string) => void; flash: (text: string) => void; onChanged: () => void }) {
  const enabled = canSupervise(role);
  const pendingLoad = useCallback((signal: AbortSignal) => api.casesPage(new URLSearchParams({ status: 'group:keputusan', pageSize: '5' }), signal), []);
  const escalatedLoad = useCallback((signal: AbortSignal) => api.casesPage(new URLSearchParams({ status: 'group:eskalasi', pageSize: '5' }), signal), []);
  const ordersLoad = useCallback((signal: AbortSignal) => api.workOrdersPage(new URLSearchParams({ status: 'group:active', technician: 'unassigned', pageSize: '5' }), signal), []);
  const pending = usePolling(pendingLoad, 30000, enabled, ['cases', 'supervisor-decisions']);
  const escalated = usePolling(escalatedLoad, 30000, enabled, ['cases', 'supervisor-escalations']);
  const orders = usePolling(ordersLoad, 30000, enabled, ['work-orders', 'supervisor-unassigned']);
  const [assignment, setAssignment] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useUnsavedChanges(busy);
  useEffect(() => { title.current?.focus(); }, []);
  return <div className="page">
    <div className="page-head"><div><h1 className="task-heading" ref={title} tabIndex={-1}>Tugas saya</h1><p>Antrean keputusan dan penugasan tim untuk peran supervisor.</p></div></div>
    {!enabled ? <p className="notice warn" role="alert">Halaman ini hanya tersedia untuk supervisor.</p> : <div className="supervisor-queues">
      <section className="card task-queue" aria-label="Persetujuan supervisor">
        <h2>Perlu persetujuan {pending.data && <span className="count">{pending.data.total}</span>}</h2>
        <p className="sub">Tinjau bukti dan risiko sebelum menyetujui tindakan agent.</p>
        <RequestState {...pending} retry={pending.refresh} />
        {pending.data && (!pending.data.items.length ? <Empty>Tidak ada persetujuan tertunda.</Empty> : <ul className="task-list">{pending.data.items.map(c => <li key={c.id}><strong>{c.pump_id} · {c.id}</strong><p>{c.summary || 'Tinjau rincian kasus.'}</p><div className="row wrap"><RiskBadge risk={c.risk} /><button className="btn sm" disabled={busy} onClick={() => onOpenCase(c.id)}>Tinjau keputusan</button></div></li>)}</ul>)}
        <a href="/cases?status=group%3Akeputusan">Lihat semua persetujuan</a>
      </section>
      <section className="card task-queue" aria-label="Penugasan teknisi">
        <h2>Belum ditugaskan {orders.data && <span className="count">{orders.data.total}</span>}</h2>
        <p className="sub">Pekerjaan aktif yang belum memiliki teknisi.</p>
        <RequestState {...orders} retry={orders.refresh} />
        {orders.data && (!orders.data.items.length ? <Empty>Semua pekerjaan aktif sudah memiliki teknisi.</Empty> : <ul className="task-list">{orders.data.items.map(w => <li key={w.id}><strong>{w.pump_id} · {w.id}</strong><p>{w.title}</p><p className="sub">{w.assignment_reason}</p><div className="row wrap"><PriorityBadge priority={w.priority} /><button className="btn sm" disabled={busy} onClick={() => setAssignment(w.id)}>Tugaskan {w.id}</button></div></li>)}</ul>)}
        <a href="/work-orders?technician=unassigned&status=group%3Aactive">Lihat semua pekerjaan tanpa teknisi</a>
      </section>
      <section className="card task-queue" aria-label="Kasus eskalasi">
        <h2>Kasus eskalasi {escalated.data && <span className="count">{escalated.data.total}</span>}</h2>
        <p className="sub">Koordinasikan pemeriksaan teknisi senior dan pantau tindak lanjutnya.</p>
        <RequestState {...escalated} retry={escalated.refresh} />
        {escalated.data && (!escalated.data.items.length ? <Empty>Tidak ada kasus eskalasi.</Empty> : <ul className="task-list">{escalated.data.items.map(c => <li key={c.id}><strong>{c.pump_id} · {c.id}</strong><p>{c.summary || 'Perlu pemeriksaan lanjutan.'}</p><p className="sub">{fmtTime(c.created_at)}</p><div className="row wrap"><CaseBadge status={c.status} /><button className="btn sm" disabled={busy} onClick={() => onOpenCase(c.id)}>Lihat tindak lanjut</button></div></li>)}</ul>)}
        <a href="/cases?status=group%3Aeskalasi">Lihat semua eskalasi</a>
      </section>
    </div>}
    {enabled && assignment && <div className="card task-assignment"><WorkOrderAssignment key={assignment} orderId={assignment} onBusy={setBusy} onCancel={() => setAssignment(null)} onDone={result => { setAssignment(null); flash(`${assignment} ditugaskan kepada ${result.technician}.`); void orders.refresh(); onChanged(); }} /></div>}
  </div>;
}
