import { useEffect, useRef, useState } from 'react';
import { canLeavePage } from './useUnsavedChanges';
import { LOCATION_CHANGED, writeLocation } from './location';

export type Tab = 'ringkasan' | 'tampilan3d' | 'kasus' | 'wo' | 'inventaris' | 'asisten' | 'profil';
const paths: Record<Tab, string> = { ringkasan: '/', tampilan3d: '/3d', kasus: '/cases', wo: '/work-orders', inventaris: '/inventory', asisten: '/assistant', profil: '/profile' };
function readRoute() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const tab: Tab = parts[0] === '3d' ? 'tampilan3d' : parts[0] === 'profile' ? 'profil' : parts[0] === 'cases' ? 'kasus' : parts[0] === 'work-orders' ? 'wo' : parts[0] === 'inventory' ? 'inventaris' : parts[0] === 'assistant' ? 'asisten' : 'ringkasan';
  let id: string | null = null;
  try { id = parts[1] ? decodeURIComponent(parts[1]) : null; } catch { /* Invalid encoded URLs show the overview. */ }
  return { tab, caseId: tab === 'kasus' ? id : null, pumpId: parts[0] === 'units' || tab === 'tampilan3d' ? id : null };
}
export function useNavigation() {
  const [route, setRoute] = useState(readRoute);
  const index = useRef<number>(Number(window.history.state?.mmNavIndex) || 0);
  const currentPath = useRef(window.location.pathname + window.location.search);
  const searches = useRef(new Map<Tab, string>());
  const restoring = useRef(false);
  const confirmed = useRef(false);
  const afterRestore = useRef<(() => void) | null>(null);
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, mmNavIndex: index.current }, '', window.location.href);
    const update = (event: PopStateEvent) => {
      if (restoring.current) { restoring.current = false; const pending = afterRestore.current; afterRestore.current = null; pending?.(); return; }
      const target: unknown = event.state?.mmNavIndex;
      const targetPath = window.location.pathname + window.location.search;
      const resume = () => {
        const proceed = () => {
          if (typeof target === 'number' && target !== index.current) { confirmed.current = true; window.history.go(target - index.current); }
          else { writeLocation(targetPath); index.current = Number(window.history.state?.mmNavIndex) || 0; currentPath.current = targetPath; setRoute(readRoute()); }
        };
        if (restoring.current) afterRestore.current = proceed; else proceed();
      };
      if (!confirmed.current && !canLeavePage(resume)) {
        if (typeof target === 'number' && target !== index.current) { restoring.current = true; window.history.go(index.current - target); }
        else window.history.pushState({ mmNavIndex: index.current }, '', currentPath.current);
        return;
      }
      confirmed.current = false;
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
      const proceed = () => { writeLocation(path); index.current = Number(window.history.state?.mmNavIndex) || 0; currentPath.current = path; setRoute(readRoute()); };
      if (!canLeavePage(proceed)) return;
      proceed();
    }
    setRoute(readRoute());
  };
  return { ...route, navigate };
}
