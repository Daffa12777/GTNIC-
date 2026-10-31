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

const TABS: [Tab, string][] = [['tampilan3d', 'Tampilan 3D'], ['kasus', 'Kasus'], ['wo', 'Work order'], ['inventaris', 'Inventaris'], ['asisten', 'Asisten']];

const store = {
  get(k: string, d: string) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* abaikan */ } },
};

export default function App() {
  return <><ConnectionStatus /><SessionGate>{(user, logout, loggingOut) => <Workspace key={user ? `${user.username}:${user.role}` : 'demo'} user={user} logout={logout} loggingOut={loggingOut} />}</SessionGate></>;
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
  const tt = useRef<number>();

  useEffect(() => { setRole(role); store.set('mm_role', role); }, [role]);
  useEffect(() => { if (user) setRoleState(user.role); }, [user?.role]);
  useEffect(() => { store.set('mm_llm', useLlm ? '1' : '0'); }, [useLlm]);

  useEffect(() => () => window.clearTimeout(tt.current), []);

  const flash = (m: string) => { setToast(m); window.clearTimeout(tt.current); tt.current = window.setTimeout(() => setToast(''), 3800); };
  const openCase = (id: string) => navigate('kasus', id);
  const toggleAuto = async () => {
    if (!ov || autoBusy) return;
    setAutoBusy(true);
    try { await api.auto(!ov.auto); await refresh(); } catch (error: unknown) { flash(errorMessage(error)); } finally { setAutoBusy(false); }
  };

  const waiting = ov?.pumps.filter((p) => p.open_case).length ?? 0;
  const woOpen = ov?.pumps.reduce((a, p) => a + p.open_work_orders, 0) ?? 0;

  return (
    <>
      <a className="skip-link" href="#main-content">Lewati ke konten utama</a>
      <header className="topbar">
        <div className="topbar-in">
          <a className="brand" href="/" aria-label="ManualMechanic — Dashboard" aria-current={tab === 'ringkasan' ? 'page' : undefined} onClick={(event) => { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate('ringkasan'); } }}>
            <span className="brand-mark"><svg width="16" height="16" viewBox="0 0 32 32"><path d="M7 23V9l9 9 9-9v14" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            ManualMechanic
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
          <div className="controls">
            {!user && <label className="ctl">Peran demo
              <select className="sel" value={role} onChange={(e) => setRoleState(e.target.value as Role)}>
                <option value="teknisi">Teknisi</option><option value="supervisor">Supervisor</option>
              </select>
            </label>}
            <label className="ctl" title={ov?.llm_available ? `Gemini: ${ov.llm_model}` : 'GEMINI_API_KEY belum diisi di backend'}>
              Mode LLM
              <button role="switch" aria-checked={useLlm && !!ov?.llm_available} className={`switch ${useLlm && ov?.llm_available ? 'on' : ''}`} disabled={!ov?.llm_available} onClick={() => setUseLlm(!useLlm)} aria-label="Mode LLM" />
            </label>
            <label className="ctl">Agent otomatis
              <button role="switch" aria-checked={!!ov?.auto} className={`switch ${ov?.auto ? 'on' : ''}`} disabled={role !== 'supervisor' || !ov || autoBusy || !!overview.error} onClick={toggleAuto} aria-label="Agent otomatis" title={role !== 'supervisor' ? 'Hanya supervisor yang dapat mengubah agent otomatis.' : undefined} />
            </label>
            <details className="mode-help">
              <summary aria-label="Penjelasan mode LLM dan agent otomatis">?</summary>
              <div className="mode-help-panel card" role="note">
                <strong>Cara kerja agent</strong>
                <p><b>Mode LLM</b> mengubah cara Asisten menyusun jawaban dan memilih tool.</p>
                <p><b>Agent otomatis</b> memantau unit dan dapat membuat kasus serta tindakan sesuai aturan risiko. Tindakan berisiko tinggi menunggu persetujuan supervisor.</p>
                <p className="sub">Ketersediaan dan hasil uji layanan dapat dilihat di Status layanan.</p>
              </div>
            </details>
          </div>
          {user && <><NotificationBell onOpenCase={openCase} /><ProfileAvatar user={user} active={tab === 'profil'} onClick={() => navigate('profil')} /></>}
        </div>
      </header>

      <main id="main-content">
      <div className="page service-container"><ServiceStatus /></div>
      {tab !== 'profil' && <div className="page connection"><RequestState {...overview} retry={refresh} />{!user && <span className="sub">Lingkungan demo · Pergantian peran bukan autentikasi pengguna.</span>}</div>}
      {user && tab === 'profil' && <Profile logout={logout} loggingOut={loggingOut} />}
      {ov && tab === 'ringkasan' && <Dashboard ov={ov} canManage={role === 'supervisor'} selected={pumpId} onSelect={(id) => navigate('ringkasan', id, true)} onOpenCase={openCase} flash={flash} refresh={refresh} />}
      {ov && tab === 'tampilan3d' && <FacilityMap ov={ov} selected={pumpId} onSelect={(id) => navigate('tampilan3d', id)} onOpenCase={openCase} onOpenUnit={(id) => navigate('ringkasan', id, true)} />}
      {ov && tab === 'kasus' && <Cases role={role} labels={ov.fault_labels} flash={flash} selected={caseId} onSelect={openCase} onClear={() => navigate('kasus')} onChanged={refresh} authenticated={!!user} />}
      {ov && tab === 'wo' && <WorkOrders flash={flash} onChanged={refresh} onOpenCase={openCase} />}
      {ov && tab === 'inventaris' && <Inventory role={role} />}
      {ov && <div hidden={tab !== 'asisten'}><Chat username={user?.username ?? 'demo'} useLlm={useLlm && ov.llm_available} onOpenCase={openCase} onChanged={refresh} /></div>}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
