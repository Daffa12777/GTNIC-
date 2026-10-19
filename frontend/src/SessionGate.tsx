import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import PasswordInput from './components/PasswordInput';
import { clearChats } from './chatSession';
import { canLeavePage } from './useUnsavedChanges';
import type { AuthUser } from './types';
import { errorMessage, RequestState, usePolling } from './usePolling';
import { clearPrivateCache, queryClient } from './queryClient';

export default function SessionGate({ children }: { children: (user: AuthUser | null, logout: (serverAlreadyClosed?: boolean) => Promise<void>, loggingOut: boolean) => ReactNode }) {
  const identity = useRef<string | null>(null);
  const loadSession = useCallback(async (signal: AbortSignal) => {
    const value = await api.session(signal);
    const next = value.user ? `${value.user.username}:${value.user.role}` : null;
    if (next !== identity.current) { clearPrivateCache(); identity.current = next; }
    return value;
  }, []);
  const session = usePolling(loadSession, 30000, true, ['session'], 0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    const expired = () => { clearPrivateCache(); clearChats(); setLoggedOut(true); queryClient.setQueryData(['session'], { enabled: true, user: null }); };
    const updated = () => { void session.refresh(); };
    window.addEventListener('session-expired', expired); window.addEventListener('session-updated', updated);
    return () => { window.removeEventListener('session-expired', expired); window.removeEventListener('session-updated', updated); };
  }, [session.refresh]);
  const logout = async (serverAlreadyClosed = false) => {
    if (submitting.current) return;
    if (!serverAlreadyClosed && !canLeavePage()) return;
    submitting.current = true;
    setLoggingOut(true); setError('');
    try { if (!serverAlreadyClosed) await api.logout(); clearPrivateCache(); clearChats(); setLoggedOut(true); setPassword(''); queryClient.setQueryData(['session'], { enabled: true, user: null }); await session.refresh(); } catch (e: unknown) { setError(errorMessage(e)); } finally { submitting.current = false; setLoggingOut(false); }
  };
  if (!session.data) return <div className="page"><RequestState {...session} retry={session.refresh} /></div>;
  if (!session.data.enabled || (session.data.user && !loggedOut)) return <>{session.error && <div className="page"><RequestState {...session} retry={session.refresh} /></div>}{error && <div className="page"><div className="notice bad" role="alert">{error}</div></div>}{children(session.data.user, logout, loggingOut)}</>;
  return <main className="login-page"><form className="card card-b login-form" onSubmit={async (e) => {
    e.preventDefault(); if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try { const value = await api.login(username.trim(), password); clearPrivateCache(); identity.current = value.user ? `${value.user.username}:${value.user.role}` : null; queryClient.setQueryData(['session'], value); setLoggedOut(false); setPassword(''); await session.refresh(); } catch (failure: unknown) { setError(errorMessage(failure)); } finally { submitting.current = false; setBusy(false); }
  }}>
    <h1>Masuk ke ManualMechanic</h1><p className="sub">Gunakan akun teknisi atau supervisor yang diberikan pengelola.</p>
    <RequestState {...session} retry={session.refresh} showUpdated={false} />
    <label className="field">Username<input className="input" autoComplete="username" required maxLength={100} disabled={busy} value={username} onChange={(e) => setUsername(e.target.value)} /></label>
    <div className="field"><label htmlFor="login-password">Kata sandi</label><PasswordInput id="login-password" autoComplete="current-password" required maxLength={256} disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
    {error && <div className="notice bad" role="alert">{error}</div>}
    <button className="btn primary" disabled={busy || !username.trim() || !password}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
  </form></main>;
}
