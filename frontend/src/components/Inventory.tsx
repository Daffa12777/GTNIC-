import { useState } from 'react';
import { api } from '../api';
import { Badge, Empty, fmtTime } from './ui';
import { RequestState, usePolling } from '../usePolling';

const loadInventory = async (signal: AbortSignal) => {
  const [inv, tech, pr, nt] = await Promise.all([api.inventory(signal), api.technicians(signal), api.purchases(signal), api.notifications(signal)]);
  return { inv, tech, pr, nt };
};

export default function Inventory() {
  const result = usePolling(loadInventory, 5000);
  const [query, setQuery] = useState('');
  const { inv = [], tech = [], pr = [], nt = [] } = result.data ?? {};

  return (
    <div className="page">
      <div className="page-head"><div><h1>Inventaris dan tim</h1><p>Data yang dibaca dan diubah agent lewat tool: stok, teknisi, permintaan pembelian, notifikasi.</p></div></div>
      <RequestState {...result} retry={result.refresh} />
      <div className="filters"><label>Cari spare part<input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nama atau lokasi" /></label></div>
      {result.data && <div className="grid inventory-grid">
        <div className="card">
          <div className="card-h"><h3>Stok spare part</h3></div>
          <table><thead><tr><th>Part</th><th>Lokasi</th><th>Stok</th></tr></thead><tbody>
            {inv.filter((i) => `${i.name} ${i.location}`.toLowerCase().includes(query.toLowerCase())).map((i) => <tr key={i.part_id}><td>{i.name}</td><td className="sub">{i.location}</td><td>{Number(i.stock) === 0 ? <Badge tone="bad">Kosong</Badge> : <span className="num">{i.stock}</span>}</td></tr>)}
          </tbody></table>
          {!inv.some((i) => `${i.name} ${i.location}`.toLowerCase().includes(query.toLowerCase())) && <Empty>Tidak ada spare part yang cocok.</Empty>}
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
      </div>}
    </div>
  );
}
