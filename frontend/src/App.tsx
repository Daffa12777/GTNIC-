import { useCallback, useEffect, useRef, useState } from 'react';
import { api, setRole } from './api';
import Cases from './components/Cases';
import Chat from './components/Chat';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import WorkOrders from './components/WorkOrders';
import type { Overview, Role } from './types';

type Tab = 'ringkasan' | 'kasus' | 'wo' | 'inventaris' | 'asisten';
const TABS: [Tab, string][] = [['ringkasan', 'Ringkasan'], ['kasus', 'Kasus'], ['wo', 'Work order'], ['inventaris', 'Inventaris'], ['asisten', 'Asisten']];

const store = {
  get(k: string, d: string) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* abaikan */ } },
};

export default function App() {
  const [tab, setTab] = useState<Tab>('ringkasan');
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [role, setRoleState] = useState<Role>(store.get('mm_role', 'teknisi') as Role);
  const [useLlm, setUseLlm] = useState(store.get('mm_llm', '0') === '1');
  const [caseId, setCaseId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const tt = useRef<number>();

  useEffect(() => { setRole(role); store.set('mm_role', role); }, [role]);
  useEffect(() => { store.set('mm_llm', useLlm ? '1' : '0'); }, [useLlm]);

  const refresh = useCallback(() => api.overview().then((o) => { setOv(o); setErr(''); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t); }, [refresh]);

  const flash = (m: string) => { setToast(m); window.clearTimeout(tt.current); tt.current = window.setTimeout(() => setToast(''), 3800); };
  const openCase = (id: string) => { setCaseId(id); setTab('kasus'); };

  const waiting = ov?.pumps.filter((p) => p.open_case).length ?? 0;
  const woOpen = ov?.pumps.reduce((a, p) => a + p.open_work_orders, 0) ?? 0;

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="brand-mark"><svg width="16" height="16" viewBox="0 0 32 32"><path d="M7 23V9l9 9 9-9v14" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            ManualMechanic
          </div>
          <nav className="nav">
            {TABS.map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}
                {k === 'kasus' && waiting > 0 && <span className="count alert">{waiting}</span>}
                {k === 'wo' && woOpen > 0 && <span className="count">{woOpen}</span>}
              </button>
            ))}
          </nav>
          <div className="controls">
            <label className="ctl">Peran
              <select className="sel" value={role} onChange={(e) => setRoleState(e.target.value as Role)}>
                <option value="teknisi">Teknisi</option><option value="supervisor">Supervisor</option>
              </select>
            </label>
            <label className="ctl" title={ov?.llm_available ? `Gemini: ${ov.llm_model}` : 'GEMINI_API_KEY belum diisi di backend'}>
              Mode LLM
              <button className={`switch ${useLlm ? 'on' : ''}`} disabled={!ov?.llm_available} onClick={() => setUseLlm(!useLlm)} aria-label="Mode LLM" />
            </label>
            <label className="ctl">Agent otomatis
              <button className={`switch ${ov?.auto ? 'on' : ''}`} disabled={!ov} onClick={() => api.auto(!ov?.auto).then(refresh)} aria-label="Agent otomatis" />
            </label>
          </div>
        </div>
      </header>

      {err && !ov && (
        <div className="page"><div className="notice bad">Tidak dapat menghubungi backend: {err}. Pastikan backend berjalan dan <code>VITE_API_URL</code> benar.</div></div>
      )}
      {ov && tab === 'ringkasan' && <Dashboard ov={ov} onOpenCase={openCase} flash={flash} refresh={refresh} useLlm={useLlm} />}
      {ov && tab === 'kasus' && <Cases role={role} labels={ov.fault_labels} flash={flash} selected={caseId} onSelect={setCaseId} onChanged={refresh} />}
      {ov && tab === 'wo' && <WorkOrders flash={flash} onChanged={refresh} onOpenCase={openCase} />}
      {ov && tab === 'inventaris' && <Inventory />}
      {ov && tab === 'asisten' && <Chat useLlm={useLlm} onOpenCase={openCase} onChanged={refresh} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}