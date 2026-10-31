import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { Overview } from '../types';
import { StateBadge, pct } from './ui';

const FacilityScene = lazy(() => import('./FacilityScene'));

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="facility-placeholder" role="status">Peta 3D tidak dapat ditampilkan di browser ini. Pilih unit dari daftar di bawah.</div> : this.props.children; }
}

export default function FacilityMap({ ov, selected, onSelect, onOpenCase, onOpenUnit }: { ov: Overview; selected: string | null; onSelect: (id: string) => void; onOpenCase: (id: string) => void; onOpenUnit: (id: string) => void }) {
  const [zoom, setZoom] = useState(60);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const pump = ov.pumps.find((item) => item.id === selected) ?? ov.pumps[0];
  const label = pump?.status.label;
  return <div className="page facility-page">
    <div className="page-head"><div><h1>Tampilan 3D</h1><p>Pantau kondisi unit berdasarkan analisis sensor dan model ML terbaru.</p></div></div>
    {ov.simulator && <div className="notice warn">Pembacaan sensor menggunakan simulasi.</div>}
    {ov.ml.source === 'demo_synthetic' && <div className="notice warn">Model ML dilatih menggunakan data sintetis untuk demo.</div>}
    {!ov.ml.ok && <div className="notice bad">Layanan ML tidak tersedia. Status terakhir mungkin belum mencerminkan kondisi terbaru.</div>}
    <section className="facility card" aria-labelledby="facility-title">
      <div className="facility-head"><div><h2 id="facility-title">Peta kondisi unit</h2><p>Posisi dan bentuk mesin adalah ilustrasi. Warna dan animasi menandai status analisis, bukan gerakan mesin sebenarnya.</p></div></div>
      {!pump ? <div className="facility-placeholder">Belum ada unit terdaftar.</div> : <>
        <div className="facility-layout">
          <div className="facility-visual">
            <SceneBoundary><Suspense fallback={<div className="facility-placeholder">Memuat peta 3D…</div>}><FacilityScene pumps={ov.pumps} selected={pump.id} onSelect={onSelect} zoom={zoom} reducedMotion={reducedMotion} /></Suspense></SceneBoundary>
            <div className="facility-controls" aria-label="Kontrol peta"><button className="btn sm" aria-label="Perbesar peta" onClick={() => setZoom((value) => Math.min(100, value + 7))}>+</button><button className="btn sm" aria-label="Perkecil peta" onClick={() => setZoom((value) => Math.max(25, value - 7))}>−</button><button className="btn sm" onClick={() => setZoom(60)}>Reset</button></div>
          </div>
          <div className="facility-panel"><h3>Unit terpilih</h3><strong>{pump.id} · {pump.name}</strong><span className="sub">{pump.location} · {pump.model}</span><div><StateBadge state={pump.status.state} /></div>
            <dl className="facility-facts"><div><dt>Dugaan model</dt><dd>{label && label !== 'sensor' ? ov.fault_labels[label] ?? label : 'Belum tersedia'}</dd></div><div><dt>Keyakinan</dt><dd>{pct(pump.status.confidence)}</dd></div><div><dt>Work order terbuka</dt><dd>{pump.open_work_orders}</dd></div><div><dt>Kasus terbuka</dt><dd>{pump.open_case ?? 'Tidak ada'}</dd></div></dl>
            {pump.status.error && <p role="status">{pump.status.error}</p>}
            <div className="row wrap">{pump.open_case && <button className="btn sm" onClick={() => onOpenCase(pump.open_case!)}>Buka kasus</button>}<button className="btn sm" onClick={() => onOpenUnit(pump.id)}>Lihat detail unit</button></div>
          </div>
        </div>
        <div className="facility-units" aria-label="Pilih unit pada peta">{ov.pumps.map((item) => <button key={item.id} className={`facility-unit ${pump.id === item.id ? 'is-selected' : ''}`} aria-pressed={pump.id === item.id} onClick={() => onSelect(item.id)}><span>{item.id}</span><StateBadge state={item.status.state} /></button>)}</div>
      </>}
    </section>
  </div>;
}
