import type { ActionSummary } from '../types';
import { CaseBadge, WorkOrderBadge, fmtTime } from './ui';

export default function ChatActionSummary({ summary, onOpenCase }: { summary: ActionSummary; onOpenCase: (id: string) => void }) {
  return <section className="chat-action-summary" aria-label={`Hasil tersimpan ${summary.case_id}`}>
    <strong>Hasil tercatat · {summary.case_id}</strong>
    <p className="sub">Snapshot kasus pada {fmtTime(summary.checked_at)}. Termasuk pekerjaan yang sudah ada sebelum pesan ini.</p>
    {summary.status && <CaseBadge status={summary.status} />}
    {!summary.order_count && <p>Belum ada work order tercatat untuk kasus ini.</p>}
    {summary.orders.length > 0 && <ul>{summary.orders.map(order => <li key={order.id}>
      <strong>{order.id}</strong> {order.status && <WorkOrderBadge status={order.status} />}
      <p>{order.technician ? `Teknisi: ${order.technician}` : 'Belum ditugaskan ke teknisi.'}{order.scheduled_at ? ` · Jadwal: ${order.scheduled_at}` : ''}</p>
      {order.purchases.map(p => <p key={p.id}>Pengajuan {p.id}: {p.part_name ?? 'Part belum diisi'} × {p.qty ?? '—'} · {p.status ?? 'Status belum tersedia'}</p>)}
    </li>)}</ul>}
    {summary.order_count > summary.orders.length && <p className="sub">Menampilkan {summary.orders.length} dari {summary.order_count} pekerjaan. Rincian lengkap ada pada kasus dan Work order.</p>}
    <button className="btn sm" onClick={() => onOpenCase(summary.case_id)}>Periksa jejak kasus</button>
  </section>;
}
