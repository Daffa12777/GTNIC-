import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { errorMessage, RequestState, usePolling } from '../usePolling';
import { fmtTime } from './ui';

export default function NotificationBell({ onOpenCase, demo = false }: { onOpenCase: (id: string) => void; demo?: boolean }) {
  const load = useCallback(async (signal: AbortSignal) => {
    if (!demo) return api.inbox(signal);
    const notifications = await api.notifications(signal);
    return { unread: 0, approvalCount: 0, approvals: [], notifications: notifications.map((item) => ({ ...item, read: true })) };
  }, [demo]);
  const inbox = usePolling(load, 30000, true, ['inbox', demo ? 'demo' : 'account']);
  const details = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!details.current?.contains(event.target as Node) && details.current) details.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && details.current) { details.current.open = false; details.current.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  const unread = inbox.data?.unread ?? 0;
  return <details className="notification-bell" ref={details}>
    <summary aria-label={demo ? 'Notifikasi operasional, mode demo' : `Notifikasi, ${unread} belum dibaca`} title="Notifikasi operasional">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
    </summary>
    <section className="notification-panel card card-b" aria-label="Notifikasi operasional">
      <h3>Notifikasi operasional</h3><RequestState {...inbox} retry={inbox.refresh} />
      {error && <div className="notice bad" role="alert">{error}</div>}
      {!!inbox.data?.approvalCount && <div className="callout warn"><b>{inbox.data.approvalCount} kasus menunggu supervisor</b>{inbox.data.approvals.map((item) => <button type="button" className="link-button" key={item.id} onClick={() => { if (details.current) details.current.open = false; onOpenCase(item.id); }}>{item.id} · {item.pump_id ?? 'Beberapa unit'}</button>)}</div>}
      {demo && <p className="sub">Mode demo: notifikasi hanya dapat dilihat; status dibaca tidak disimpan.</p>}
      {inbox.data && <>{!demo && <button type="button" className="btn sm" disabled={busy || !unread} onClick={async () => {
        setBusy(true); setError(''); try { await api.readInbox(inbox.data?.notifications[0]?.id ?? 0); await inbox.refresh(); } catch (failure: unknown) { setError(errorMessage(failure)); } finally { setBusy(false); }
      }}>Tandai semua dibaca</button>}<ul className="notification-list">{inbox.data.notifications.map((item) => <li key={item.id} className={item.read ? '' : 'unread'}><b>{item.recipient}</b><p>{item.message}</p><span className="sub">{fmtTime(item.ts)} · {item.status}</span></li>)}</ul>{inbox.data.notifications.length === 0 && <p className="sub">Belum ada notifikasi.</p>}</>}
    </section>
  </details>;
}
