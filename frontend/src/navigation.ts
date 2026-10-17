import { useEffect, useState } from 'react';

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
  useEffect(() => { const update = () => setRoute(readRoute()); window.addEventListener('popstate', update); return () => window.removeEventListener('popstate', update); }, []);
  const navigate = (tab: Tab, id?: string, unit = false) => {
    const path = unit && id ? `/units/${encodeURIComponent(id)}` : `${paths[tab]}${id ? `/${encodeURIComponent(id)}` : ''}`;
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setRoute(readRoute());
  };
  return { ...route, navigate };
}
