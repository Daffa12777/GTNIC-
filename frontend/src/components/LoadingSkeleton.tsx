import { useEffect, useState } from 'react';

export default function LoadingSkeleton() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setSlow(true), 6000); return () => window.clearTimeout(timer); }, []);
  return <div className="loading-skeleton card card-b" role="status" aria-label="Memuat data" aria-busy="true">
    <span className="skeleton-label">Memuat data…</span>
    {slow && <p className="sub">Pemuatan lebih lama dari biasanya. Permintaan masih berjalan, mohon tunggu.</p>}
    <div className="skeleton-line skeleton-title" aria-hidden="true" />
    <div className="skeleton-row" aria-hidden="true"><span /><span /><span /></div>
    <div className="skeleton-row" aria-hidden="true"><span /><span /><span /></div>
    <div className="skeleton-row" aria-hidden="true"><span /><span /><span /></div>
  </div>;
}
