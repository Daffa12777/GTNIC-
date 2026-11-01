import { useUrlFilters } from '../useUrlFilters';
import { api } from '../api';
import { Badge, Empty } from './ui';
import { RequestState, usePolling } from '../usePolling';
import InventoryEditor from './InventoryEditor';
import type { Role } from '../types';
import { useDebounced } from '../useDebounced';
import SearchField from './SearchField';

export default function Inventory({ role }: { role: Role }) {
  const result = usePolling(api.inventory, 60000, true, ['inventory']);
  const technicians = usePolling(api.technicians, 300000, true, ['technicians'], 300000);
  const purchases = usePolling(api.purchases, 60000, true, ['purchases']);
  const [filters, updateFilters] = useUrlFilters({ q: '' });
  const query = filters.q;
  const setQuery = (value: string) => updateFilters({ q: value }, true);
  const search = useDebounced(query);
  const inv = result.data ?? [];
  const tech = technicians.data ?? [];
  const pr = purchases.data ?? [];

  return (
    <div className="page">
      <div className="page-head"><div><h1>Inventaris dan tim</h1><p>Data yang dibaca dan diubah agent lewat tool: stok, teknisi, dan permintaan pembelian.</p></div></div>
      <RequestState {...result} retry={result.refresh} />
      {role === 'supervisor' && result.data && <InventoryEditor parts={inv} refresh={result.refresh} />}
      {role !== 'supervisor' && <p className="sub">Hanya supervisor yang dapat mengelola stok dan spare part.</p>}
      <div className="filters"><SearchField label="Cari spare part" value={query} onChange={(value) => { setQuery(value); }} placeholder="Nama atau lokasi" pending={query !== search} /></div>
      {result.data && <div className="grid inventory-grid">
        <div className="card">
          <div className="card-h"><h3>Stok spare part</h3></div>
          <table><thead><tr><th>Part</th><th>Lokasi</th><th>Stok</th></tr></thead><tbody>
            {inv.filter((i) => `${i.name} ${i.location}`.toLowerCase().includes(search.toLowerCase())).map((i) => <tr key={i.part_id}><td>{i.name}</td><td className="sub">{i.location}</td><td>{typeof i.stock !== 'number' ? '—' : i.stock <= 0 ? <Badge tone="bad">Kosong</Badge> : typeof i.min_stock === 'number' && i.stock <= i.min_stock ? <><span className="num">{i.stock}</span> <Badge tone="warn">Stok menipis</Badge></> : <span className="num">{i.stock}</span>}</td></tr>)}
          </tbody></table>
          {!inv.some((i) => `${i.name} ${i.location}`.toLowerCase().includes(search.toLowerCase())) && <Empty>Tidak ada spare part yang cocok.</Empty>}
        </div>
        <div className="card">
          <div className="card-h"><h3>Teknisi</h3></div>
          <RequestState {...technicians} retry={technicians.refresh} showUpdated={false} />
          <table><thead><tr><th>Nama</th><th>Keahlian</th><th>Level</th><th>Status</th></tr></thead><tbody>
            {tech.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.skill}</td><td>{t.level}</td><td>{t.available ? <Badge tone="ok">Tersedia</Badge> : <Badge tone="warn">Bertugas</Badge>}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card">
          <div className="card-h"><h3>Permintaan pembelian</h3></div>
          <RequestState {...purchases} retry={purchases.refresh} showUpdated={false} />
          {pr.length === 0 ? purchases.data && <Empty>Belum ada. Agent membuatnya bila stok part kosong.</Empty> : (
            <table><thead><tr><th>ID</th><th>Part</th><th>Qty</th><th>Status</th></tr></thead><tbody>
              {pr.map((p) => <tr key={p.id}><td className="id">{p.id}</td><td>{p.part_name}<div className="sub">{p.reason}</div></td><td className="num">{p.qty}</td><td><Badge tone="warn">{p.status}</Badge></td></tr>)}
            </tbody></table>
          )}
        </div>
      </div>}
    </div>
  );
}
