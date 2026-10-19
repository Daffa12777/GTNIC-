export default function LoadingSkeleton() {
  return <div className="loading-skeleton card card-b" role="status" aria-label="Memuat data" aria-busy="true">
    <span className="skeleton-label">Memuat data…</span>
    <div className="skeleton-line skeleton-title" aria-hidden="true" />
    <div className="skeleton-row" aria-hidden="true"><span /><span /><span /></div>
    <div className="skeleton-row" aria-hidden="true"><span /><span /><span /></div>
    <div className="skeleton-row" aria-hidden="true"><span /><span /><span /></div>
  </div>;
}
