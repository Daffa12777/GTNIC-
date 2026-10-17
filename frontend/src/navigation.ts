import { useEffect, useRef, useState } from 'react';
import { canLeavePage } from './useUnsavedChanges';

export type Tab = 'ringkasan' | 'kasus' | 'wo' | 'inventaris' | 'asisten' | 'profil';
const paths: Record<Tab, string> = { ringkasan: '/', kasus: '/cases', wo: '/work-orders', inventaris: '/inventory', asisten: '/assistant', profil: '/profile' };
function readRoute() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const tab: Tab = parts[0] === 'profile' ? 'profil' : parts[0] === 'cases' ? 'kasus' : parts[0] === 'work-orders' ? 'wo' : parts[0] === 'inventory' ? 'inventaris' : parts[0] === 'assistant' ? 'asisten' : 'ringkasan';
  let id: string | null = null;
  try { id = parts[1] ? decodeURIComponent(parts[1]) : null; } catch { /* Invalid encoded URLs show the overview. */ }
  return { tab, caseId: tab === 'kasus' ? id : null, pumpId: parts[0] === 'units' ? id : null };
}
export function useNavigation() {
  const [route, setRoute] = useState(readRoute);
  const index = useRef<number>(Number(window.history.state?.mmNavIndex) || 0);
  const currentPath = useRef(window.location.pathname);
  const restoring = useRef(false);
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, mmNavIndex: index.current }, '', window.location.href);
    const update = (event: PopStateEvent) => {
      if (restoring.current) { restoring.current = false; return; }
      if (!canLeavePage()) {
        const target: unknown = event.state?.mmNavIndex;
        if (typeof target === 'number' && target !== index.current) { restoring.current = true; window.history.go(index.current - target); }
        else window.history.pushState({ mmNavIndex: index.current }, '', currentPath.current);
        return;
      }
      index.current = Number(event.state?.mmNavIndex) || 0; currentPath.current = window.location.pathname; setRoute(readRoute());
    };
    window.addEventListener('popstate', update); return () => window.removeEventListener('popstate', update);
  }, []);
  const navigate = (tab: Tab, id?: string, unit = false) => {
    const path = unit && id ? `/units/${encodeURIComponent(id)}` : `${paths[tab]}${id ? `/${encodeURIComponent(id)}` : ''}`;
    if (window.location.pathname !== path) {
      if (!canLeavePage()) return;
      index.current++; window.history.pushState({ mmNavIndex: index.current }, '', path); currentPath.current = path;
    }
    setRoute(readRoute());
  };
  return { ...route, navigate };
}
