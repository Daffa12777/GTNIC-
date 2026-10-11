import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Empty, fmtTime } from './ui';

export default function Inventory() {
  const [inv, setInv] = useState<any[]>([]);
  const [tech, setTech] = useState<any[]>([]);
  const [pr, setPr] = useState<any[]>([]);
  const [nt, setNt] = useState<any[]>([]);

  useEffect(() => {
    const load = () => {
      api.inventory().then(setInv).catch(() => {}); api.technicians().then(setTech).catch(() => {});
      api.purchases().then(setPr).catch(() => {}); api.notifications().then(setNt).catch(() => {});
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="page">
      <div className="page-head"><div><h1>Inventaris dan tim</h1><p>Data yang dibaca dan diubah agent lewat tool: stok, teknisi, permintaan pembelian, notifikasi.</p></div></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        <div className="card">
          <div className="card-h"><h3>Stok spare part</h3></div>
          <table><thead><tr><th>Part</th><th>Lokasi</th><th>Stok</th></tr></thead><tbody>
            {inv.map((i) => <tr key={i.part_id}><td>{i.name}</td><td className="sub">{i.location}</td><td>{Number(i.stock) === 0 ? <Badge tone="bad">Kosong</Badge> : <span className="num">{i.stock}</span>}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card">
          <div className="card-h"><h3>Teknisi</h3></div>
          <table><thead><tr><th>Nama</th><th>Keahlian</th><th>Level</th><th>Status</th></tr></thead><tbody>
            {tech.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.skill}</td><td>{t.level}</td><td>{t.available ? <Badge tone="ok">Tersedia</Badge> : <Badge tone="warn">Bertugas</Badge>}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card">
          <div className="card-h"><h3>Permintaan pembelian</h3></div>
          {pr.length === 0 ? <Empty>Belum ada. Agent membuatnya bila stok part kosong.</Empty> : (
            <table><thead><tr><th>ID</th><th>Part</th><th>Qty</th><th>Status</th></tr></thead><tbody>
              {pr.map((p) => <tr key={p.id}><td className="id">{p.id}</td><td>{p.part_name}<div className="sub">{p.reason}</div></td><td className="num">{p.qty}</td><td><Badge tone="warn">{p.status}</Badge></td></tr>)}
            </tbody></table>
          )}
        </div>
        <div className="card">
          <div className="card-h"><h3>Notifikasi</h3></div>
          {nt.length === 0 ? <Empty>Belum ada notifikasi.</Empty> : (
            <table><thead><tr><th>Penerima</th><th>Pesan</th><th>Status</th></tr></thead><tbody>
              {nt.slice(0, 12).map((n) => <tr key={n.id}><td>{n.recipient}<div className="sub">{fmtTime(n.ts)}</div></td><td style={{ maxWidth: 320 }}>{n.message}</td><td><Badge tone={n.status === 'terkirim' ? 'ok' : n.status === 'gagal' ? 'bad' : 'info'}>{n.status}</Badge></td></tr>)}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
