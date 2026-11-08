import { useEffect } from 'react';
import { api } from './api';
import { queryClient } from './queryClient';
import { publishSessionChange } from './sessionSync';
import type { SessionInfo } from './types';

/** Only user input extends idle time; polling and token rotation never do. */
export function useSessionActivity(session: SessionInfo | null, enabled: boolean) {
  const user = session?.user;
  const tracking = enabled && session?.expiresAt != null;
  useEffect(() => {
    if (!tracking || !user) return;
    let sent = 0, pending = false, disposed = false;
    const activity = () => {
      if (document.visibilityState === 'hidden' || pending || Date.now() - sent < 60000) return;
      pending = true; sent = Date.now();
      void api.activity().then(deadlines => {
        if (disposed) return;
        queryClient.setQueryData<SessionInfo>(['session'], current => current?.user?.username === user.username && current.user.role === user.role ? { ...current, ...deadlines } : current);
      }).catch(() => {}).finally(() => { pending = false; });
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const name of events) window.addEventListener(name, activity, { passive: true });
    return () => { disposed = true; for (const name of events) window.removeEventListener(name, activity); };
  }, [tracking, user?.username, user?.role]);
  useEffect(() => {
    if (!enabled || !user || session?.expiresAt == null) return;
    const deadline = Math.min(session.expiresAt, session.absoluteExpiresAt ?? Infinity);
    let expired = false, checking = false, disposed = false;
    const expire = () => {
      if (disposed) return;
      expired = true;
      window.dispatchEvent(new Event('session-expired'));
      publishSessionChange();
    };
    const check = () => {
      if (expired || checking || Date.now() < deadline) return;
      checking = true;
      // Another tab may have extended the same server session while this tab slept.
      void api.session().then(current => {
        if (disposed) return;
        if (current.user?.username === user.username && current.user.role === user.role && (current.expiresAt ?? 0) > Date.now()) queryClient.setQueryData(['session'], current);
        else expire();
      }).catch(expire).finally(() => { checking = false; });
    };
    const timer = window.setTimeout(check, Math.max(0, deadline - Date.now()));
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { disposed = true; window.clearTimeout(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [enabled, user?.username, user?.role, session?.expiresAt, session?.absoluteExpiresAt]);
}
