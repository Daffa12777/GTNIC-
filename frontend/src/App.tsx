import { useEffect, useRef, useState } from 'react';
import { api, setRole } from './api';
import Cases from './components/Cases';
import Chat from './components/Chat';
import Dashboard from './components/Dashboard';
import FacilityMap from './components/FacilityMap';
import Inventory from './components/Inventory';
import Profile from './components/Profile';
import ProfileAvatar from './components/ProfileAvatar';
import NotificationBell from './components/NotificationBell';
import ServiceStatus from './components/ServiceStatus';
import WorkOrders from './components/WorkOrders';
import type { Role, AuthUser } from './types';
import SessionGate from './SessionGate';
import ConnectionStatus from './components/ConnectionStatus';
import { RequestState, usePolling, errorMessage } from './usePolling';
import { useNavigation, type Tab } from './navigation';
import { UnsavedChangesPrompt } from './useUnsavedChanges';

const TABS: [Tab, string][] = [['kasus', 'Kasus'], ['wo', 'Work order'], ['inventaris', 'Inventaris'], ['asisten', 'Asisten']];

const store = {
  get(k: string, d: string) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* abaikan */ } },
};

export default function App() {
  return <><ConnectionStatus /><UnsavedChangesPrompt /><SessionGate>{(user, logout, loggingOut) => <Workspace key={user ? `${user.username}:${user.role}` : 'demo'} user={user} logout={logout} loggingOut={loggingOut} />}</SessionGate></>;
}

function Workspace({ user, logout, loggingOut }: { user: AuthUser | null; logout: (serverAlreadyClosed?: boolean) => Promise<void>; loggingOut: boolean }) {
  const { tab, caseId, pumpId, navigate } = useNavigation();
  const overview = usePolling(api.overview, 15000, true, ['overview'], 10000);
  const ov = overview.data;
  const refresh = overview.refresh;
  const [role, setRoleState] = useState<Role>(user?.role ?? (store.get('mm_role', 'teknisi') === 'supervisor' ? 'supervisor' : 'teknisi'));
  const [useLlm, setUseLlm] = useState(store.get('mm_llm', '0') === '1');
  const [autoBusy, setAutoBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const tt = useRef<number>();
  const settings = useRef<HTMLDetailsElement>(null);

  useEffect(() => { setRole(role); store.set('mm_role', role); }, [role]);
  useEffect(() => { if (user) setRoleState(user.role); }, [user?.role]);
  useEffect(() => { store.set('mm_llm', useLlm ? '1' : '0'); }, [useLlm]);

  useEffect(() => () => window.clearTimeout(tt.current), []);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (settings.current && !settings.current.contains(event.target as Node)) settings.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && settings.current?.open) { settings.current.open = false; settings.current.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);

  const flash = (m: string) => { setToast(m); window.clearTimeout(tt.current); tt.current = window.setTimeout(() => setToast(''), 3800); };
  const openCase = (id: string) => navigate('kasus', id);
  const toggleAuto = async () => {
    if (!ov || autoBusy) return;
    setAutoBusy(true);
    try { await api.auto(!ov.auto); await refresh(); } catch (error: unknown) { flash(errorMessage(error)); } finally { setAutoBusy(false); }
  };

  const waiting = ov?.pumps.filter((p) => p.open_case).length ?? 0;
  const woOpen = ov?.pumps.reduce((a, p) => a + p.open_work_orders, 0) ?? 0;
  const isMap = (tab === 'ringkasan' && !pumpId) || tab === 'tampilan3d';

  return (
    <>
      <a className="skip-link" href="#main-content">Lewati ke konten utama</a>
      <header className="topbar">
        <div className="topbar-in">
          <a className="brand" href="/" title="Kembali ke dashboard" aria-label="ManualMechanic — Dashboard" aria-current={tab === 'ringkasan' ? 'page' : undefined} onClick={(event) => { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); setSelectedMachine(null); navigate('ringkasan'); } }}>
            <span className="brand-mark"><svg width="16" height="16" viewBox="0 0 32 32"><path d="M7 23V9l9 9 9-9v14" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <span className="brand-name">ManualMechanic</span>
          </a>
          <nav className="nav" aria-label="Navigasi utama">
            {TABS.map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => navigate(k)}>
                {l}
                {k === 'kasus' && waiting > 0 && <span className="count alert">{waiting}</span>}
                {k === 'wo' && woOpen > 0 && <span className="count">{woOpen}</span>}
              </button>
            ))}
          </nav>
          <details className="controls agent-settings" ref={settings}><summary>Pengaturan agent</summary><div className="agent-settings-panel card">
            {!user && <label className="ctl">Peran demo
              <select className="sel" value={role} onChange={(e) => setRoleState(e.target.value as Role)}>
                <option value="teknisi">Teknisi</option><option value="supervisor">Supervisor</option>
              </select>
            </label>}
            <label className="ctl" title={ov?.llm_available ? `Gemini: ${ov.llm_model}` : 'GEMINI_API_KEY belum diisi di backend'}>
              Mode LLM
              <button role="switch" aria-checked={useLlm && !!ov?.llm_available} className={`switch ${useLlm && ov?.llm_available ? 'on' : ''}`} disabled={!ov?.llm_available} onClick={() => setUseLlm(!useLlm)} aria-label="Mode LLM" />
            </label>
            {!ov?.llm_available && <span className="sub">Mode LLM belum tersedia pada layanan.</span>}
            <label className="ctl">Agent otomatis
              <button role="switch" aria-checked={!!ov?.auto} className={`switch ${ov?.auto ? 'on' : ''}`} disabled={role !== 'supervisor' || !ov || autoBusy || !!overview.error} onClick={toggleAuto} aria-label="Agent otomatis" title={role !== 'supervisor' ? 'Hanya supervisor yang dapat mengubah agent otomatis.' : undefined} />
              {role !== 'supervisor' && <span className="sub">Hanya supervisor</span>}
            </label>
            <p className="sub">Mode LLM mengubah cara Asisten menjawab. Agent otomatis memantau unit dan dapat membuat kasus serta tindakan; risiko tinggi memerlukan persetujuan supervisor.</p>
          </div></details>
          {user && <><NotificationBell onOpenCase={openCase} /><ProfileAvatar user={user} active={tab === 'profil'} onClick={() => navigate('profil')} /></>}
        </div>
      </header>

      <main id="main-content">
      <div className="page service-container"><ServiceStatus /></div>
      {tab !== 'profil' && (!isMap || !ov) && <div className="page connection"><RequestState {...overview} retry={refresh} />{!user && <span className="sub">Lingkungan demo · Pergantian peran bukan autentikasi pengguna.</span>}</div>}
      {user && tab === 'profil' && <Profile logout={logout} loggingOut={loggingOut} />}
      {ov && tab === 'ringkasan' && pumpId && <Dashboard ov={ov} canManage={role === 'supervisor'} selected={pumpId} onSelect={(id) => navigate('ringkasan', id, true)} onOpenCase={openCase} onBack={() => { setSelectedMachine(null); navigate('ringkasan'); }} flash={flash} refresh={refresh} />}
      {ov && isMap && <FacilityMap ov={ov} updated={overview.updated} freshness={<RequestState {...overview} retry={refresh} />} demoRole={!user} selected={selectedMachine ?? (tab === 'tampilan3d' ? pumpId : null)} onSelect={(id) => { if (tab === 'tampilan3d') navigate('ringkasan'); setSelectedMachine(id); }} onOpenCase={openCase} onOpenUnit={(id) => navigate('ringkasan', id, true)} onChanged={refresh} />}
      {ov && tab === 'kasus' && <Cases role={role} labels={ov.fault_labels} overview={ov} updated={overview.updated} onOpenUnit={(id) => navigate('ringkasan', id, true)} flash={flash} selected={caseId} onSelect={openCase} onClear={() => navigate('kasus')} onChanged={refresh} authenticated={!!user} />}
      {ov && tab === 'wo' && <WorkOrders flash={flash} onChanged={refresh} onOpenCase={openCase} />}
      {ov && tab === 'inventaris' && <Inventory role={role} />}
      {ov && <div hidden={tab !== 'asisten'}><Chat username={user?.username ?? 'demo'} useLlm={useLlm && ov.llm_available} onOpenCase={openCase} onChanged={refresh} /></div>}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
