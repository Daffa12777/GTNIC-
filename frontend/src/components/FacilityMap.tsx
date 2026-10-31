import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import type { Pump } from '../types';
import { StateBadge } from './ui';

const FacilityScene = lazy(() => import('./FacilityScene'));

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="facility-placeholder" role="status">Peta 3D tidak dapat ditampilkan di browser ini. Pilih unit dari daftar di bawah.</div> : this.props.children; }
}

export default function FacilityMap({ pumps, selected, onSelect, onOpenCase }: { pumps: Pump[]; selected: string; onSelect: (id: string) => void; onOpenCase: (id: string) => void }) {
  const [zoom, setZoom] = useState(42);
  const [view3d, setView3d] = useState(false);
  const pump = pumps.find((item) => item.id === selected) ?? pumps[0];
  return <section className="facility card" aria-labelledby="facility-title">
    <div className="facility-head"><div><h2 id="facility-title">Peta kondisi unit</h2><p>Posisi mesin merupakan ilustrasi, bukan denah sebenarnya.</p></div><button className="btn sm" onClick={() => setView3d(!view3d)}>{view3d ? 'Tutup peta 3D' : 'Buka peta 3D'}</button></div>
    {view3d && <div className="facility-layout">
      <div className="facility-visual">
        <SceneBoundary><Suspense fallback={<div className="facility-placeholder">Memuat peta 3D…</div>}><FacilityScene pumps={pumps} selected={pump?.id ?? ''} onSelect={onSelect} zoom={zoom} /></Suspense></SceneBoundary>
        <div className="facility-controls" aria-label="Kontrol peta"><button className="btn sm" aria-label="Perbesar peta" onClick={() => setZoom((value) => Math.min(70, value + 7))}>+</button><button className="btn sm" aria-label="Perkecil peta" onClick={() => setZoom((value) => Math.max(25, value - 7))}>−</button><button className="btn sm" onClick={() => setZoom(42)}>Reset</button></div>
      </div>
      <div className="facility-panel"><h3>Unit terpilih</h3>{pump && <><strong>{pump.id} · {pump.name}</strong><span className="sub">{pump.location}</span><div><StateBadge state={pump.status.state} /></div><p>{pump.open_work_orders} work order terbuka · {pump.open_case ? `Kasus ${pump.open_case}` : 'Tidak ada kasus terbuka'}</p><div className="row wrap">{pump.open_case && <button className="btn sm" onClick={() => onOpenCase(pump.open_case!)}>Buka kasus</button>}<a className="btn sm" href="#detail-unit">Lihat detail unit</a></div></>}
      </div>
    </div>}
    {view3d && <div className="facility-units" aria-label="Pilih unit pada peta">{pumps.map((item) => <button key={item.id} className={`facility-unit ${pump?.id === item.id ? 'is-selected' : ''}`} aria-pressed={pump?.id === item.id} onClick={() => onSelect(item.id)}><span>{item.id}</span><StateBadge state={item.status.state} /></button>)}</div>}
  </section>;
}
