import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import type { WorkOrder } from '../types';
import { Badge, Empty, WO_TONE, fmtTime } from './ui';

export default function WorkOrders({ flash, onChanged, onOpenCase }: { flash: (m: string) => void; onChanged: () => void; onOpenCase: (id: string) => void }) {
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [cause, setCause] = useState('');
  const [action, setAction] = useState('');

  const load = () => api.workOrders().then(setRows).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  const complete = async (id: string) => {
    try {
      await api.complete(id, cause, action);
      flash(`${id} selesai. Riwayat disimpan dan indeks pengetahuan agent diperbarui`);
      setOpen(null); setCause(''); setAction(''); load(); onChanged();
    } catch (e: any) { flash(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Work order</h1><p>Dibuat oleh agent melalui tool, lengkap dengan jadwal teknisi. Menutup work order menambah riwayat yang dipakai RAG.</p></div></div>
      <div className="card">
        {rows.length === 0 ? <Empty>Belum ada work order.</Empty> : (
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
                    <td style={{ textAlign: 'right' }}>{w.status !== 'selesai' && <button className="btn sm" onClick={() => setOpen(open === w.id ? null : w.id)}>Selesaikan</button>}</td>
                  </tr>
                  {open === w.id && (
                    <tr><td colSpan={7} style={{ background: '#fafbfc' }}>
                      <div className="row wrap">
                        <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Akar masalah yang ditemukan" value={cause} onChange={(e) => setCause(e.target.value)} />
                        <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Tindakan yang dilakukan" value={action} onChange={(e) => setAction(e.target.value)} />
                        <button className="btn primary" onClick={() => complete(w.id)}>Simpan dan tutup</button>
                      </div>
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
