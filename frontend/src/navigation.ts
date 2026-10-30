import { useEffect, useRef, useState } from 'react';
import { canLeavePage } from './useUnsavedChanges';
import { LOCATION_CHANGED, writeLocation } from './location';

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
  const currentPath = useRef(window.location.pathname + window.location.search);
  const searches = useRef(new Map<Tab, string>());
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
      index.current = Number(event.state?.mmNavIndex) || 0; currentPath.current = window.location.pathname + window.location.search; setRoute(readRoute());
    };
    const changed = () => { index.current = Number(window.history.state?.mmNavIndex) || 0; currentPath.current = window.location.pathname + window.location.search; setRoute(readRoute()); };
    window.addEventListener('popstate', update); window.addEventListener(LOCATION_CHANGED, changed);
    return () => { window.removeEventListener('popstate', update); window.removeEventListener(LOCATION_CHANGED, changed); };
  }, []);
  const navigate = (tab: Tab, id?: string, unit = false) => {
    searches.current.set(readRoute().tab, window.location.search);
    const search = tab === readRoute().tab ? window.location.search : searches.current.get(tab) ?? '';
    const path = (unit && id ? `/units/${encodeURIComponent(id)}` : `${paths[tab]}${id ? `/${encodeURIComponent(id)}` : ''}`) + search;
    if (window.location.pathname + window.location.search !== path) {
      if (!canLeavePage()) return;
      writeLocation(path); index.current = Number(window.history.state?.mmNavIndex) || 0; currentPath.current = path;
    }
    setRoute(readRoute());
  };
  return { ...route, navigate };
}
