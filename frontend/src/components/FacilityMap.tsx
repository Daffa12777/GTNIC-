import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { Overview } from '../types';
import { StateBadge, pct } from './ui';

const FacilityScene = lazy(() => import('./FacilityScene'));

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="facility-placeholder" role="status">Peta 3D tidak dapat ditampilkan di browser ini. Pilih unit dari daftar di bawah.</div> : this.props.children; }
}

export default function FacilityMap({ ov, updated, freshness, demoRole = false, selected, onSelect, onOpenCase, onOpenUnit }: { ov: Overview; updated?: number | null; freshness?: ReactNode; demoRole?: boolean; selected: string | null; onSelect: (id: string | null) => void; onOpenCase: (id: string) => void; onOpenUnit: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const [announcement, setAnnouncement] = useState('');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => { if (selected) { setZoom(2); setPan([0, 0]); } }, [selected]);
  useEffect(() => { if (zoom <= 1) setPan([0, 0]); }, [zoom]);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const pump = ov.pumps.find((item) => item.id === selected);
  const selectUnit = (id: string) => { setZoom(2); setPan([0, 0]); onSelect(id); };
  const rotate = (step: number) => { const next = rotation + step; setRotation(next); setAnnouncement(`Arah tampilan ${((next % 4 + 4) % 4) * 90} derajat.`); };
  const label = pump?.status.label;
  const counts = { normal: 0, waspada: 0, kritis: 0, unavailable: 0 };
  ov.pumps.forEach(({ status }) => { if (status.state === 'normal' || status.state === 'waspada' || status.state === 'kritis') counts[status.state]++; else counts.unavailable++; });
  const zones = [
    ['produksi', 'Produksi'], ['fabrikasi', 'Fabrikasi'], ['gudang', 'Gudang'],
  ].filter(([key]) => ov.pumps.some((item) => (item.location ?? '').toLowerCase().includes(key)));
  return <div className="page facility-page">
    <div className="page-head"><div><h1>Dashboard</h1><p>Pilih mesin atau simbol status untuk melihat kondisinya.</p></div></div>
    {(ov.simulator || ov.ml.source === 'demo_synthetic' || demoRole) && <div className="notice warn facility-demo">Demo: {[ov.simulator && 'sensor simulasi', ov.ml.source === 'demo_synthetic' && 'model dilatih dengan data sintetis', demoRole && 'peran demo bukan autentikasi'].filter(Boolean).join(' · ')}.</div>}
    {!ov.ml.ok && <div className="notice bad">Layanan ML tidak tersedia. Status terakhir mungkin belum mencerminkan kondisi terbaru.</div>}
    <section className="facility card" aria-labelledby="facility-title">
      <div className="facility-head"><div><h2 id="facility-title">Peta kondisi unit</h2><p>Posisi dan bentuk mesin adalah ilustrasi. Warna dan animasi menandai status analisis, bukan gerakan mesin sebenarnya.</p></div>{freshness ?? (updated != null && <span className="sub">Pembaruan terakhir: <time dateTime={new Date(updated).toISOString()}>{new Date(updated).toLocaleTimeString('id-ID')}</time></span>)}</div>
      {!ov.pumps.length ? <div className="facility-placeholder">Belum ada unit terdaftar.</div> : <>
        <div className={`facility-layout ${pump ? '' : 'facility-layout-overview'}`}>
          <div className="facility-canvas-panel"><div className="facility-meta">
            {zones.length > 0 && <div className="facility-zones" aria-label="Warna zona ilustratif">{zones.map(([key, name]) => <span key={key}><i className={`zone-dot zone-${key}`} aria-hidden="true" />{name}</span>)}</div>}
            <div className="facility-status-legend" aria-label="Keterangan status"><span><b className="symbol-normal" aria-hidden="true">●</b>Normal</span><span><b className="symbol-warning" aria-hidden="true">▲</b>Waspada</span><span><b className="symbol-critical" aria-hidden="true">✖</b>Kritis</span><span><b className="symbol-unavailable" aria-hidden="true">◆</b>Data bermasalah</span></div>
            <div className="facility-summary" aria-label="Ringkasan kondisi"><strong>{counts.kritis} kritis · {counts.waspada} waspada · {counts.normal} normal</strong>{counts.unavailable > 0 && <span>{counts.unavailable} data bermasalah</span>}</div>
          </div><div className="facility-visual">
            <SceneBoundary><Suspense fallback={<div className="facility-placeholder">Memuat peta 3D…</div>}><FacilityScene pumps={ov.pumps} selected={pump?.id ?? null} onSelect={selectUnit} zoom={zoom} rotation={rotation} pan={pan} setPan={setPan} reducedMotion={reducedMotion} /></Suspense></SceneBoundary>
            <div className="facility-controls" aria-label="Kontrol peta"><button className="btn sm" aria-label="Perbesar peta" onClick={() => setZoom((value) => Math.min(2.5, value + 0.2))}>+</button><button className="btn sm" aria-label="Perkecil peta" onClick={() => setZoom((value) => Math.max(1, value - 0.2))}>−</button><button className="btn sm" aria-label="Putar peta ke kiri 90 derajat" onClick={() => rotate(-1)}>↶</button><button className="btn sm" aria-label="Putar peta ke kanan 90 derajat" onClick={() => rotate(1)}>↷</button><button className="btn sm" onClick={() => { setZoom(1); setRotation(0); setPan([0, 0]); setAnnouncement('Tampilan peta direset.'); onSelect(null); }}>Reset</button></div>
            <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
          </div></div>
          {pump && <div className="facility-panel"><div className="facility-panel-head"><h3>Unit terpilih</h3><button className="btn sm" onClick={() => { setZoom(1); setPan([0, 0]); onSelect(null); }}>Tutup</button></div><strong>{pump.id} · {pump.name}</strong><span className="sub">{pump.location} · {pump.model}</span><div><StateBadge state={pump.status.state} /></div>
            <dl className="facility-facts"><div><dt>Dugaan model</dt><dd>{label && label !== 'sensor' ? ov.fault_labels[label] ?? label : 'Belum tersedia'}</dd></div><div><dt>Keyakinan</dt><dd>{pct(pump.status.confidence)}</dd></div><div><dt>Work order terbuka</dt><dd>{pump.open_work_orders}</dd></div><div><dt>Kasus terbuka</dt><dd>{pump.open_case ?? 'Tidak ada'}</dd></div></dl>
            {pump.status.error && <p role="status">{pump.status.error}</p>}
            <div className="row wrap">{pump.open_case && <button className="btn sm" onClick={() => onOpenCase(pump.open_case!)}>Buka kasus</button>}<button className="btn sm" onClick={() => onOpenUnit(pump.id)}>Lihat detail unit</button></div>
          </div>}
        </div>
        <details className="facility-unit-list"><summary>Pilih dari daftar unit</summary><div className="facility-units" aria-label="Pilih unit pada peta">{ov.pumps.map((item) => <button key={item.id} className={`facility-unit ${pump?.id === item.id ? 'is-selected' : ''}`} aria-pressed={pump?.id === item.id} onClick={() => selectUnit(item.id)}><span>{item.id}</span><StateBadge state={item.status.state} /></button>)}</div></details>
      </>}
    </section>
  </div>;
}
