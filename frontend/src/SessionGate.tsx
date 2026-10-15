import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import type { AuthUser } from './types';
import { errorMessage, RequestState, usePolling } from './usePolling';

export default function SessionGate({ children }: { children: (user: AuthUser | null, logout: () => Promise<void>) => ReactNode }) {
  const session = usePolling(api.session, 30000);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  useEffect(() => { const expired = () => { void session.refresh(); }; window.addEventListener('session-expired', expired); return () => window.removeEventListener('session-expired', expired); }, [session.refresh]);
  const logout = async () => {
    if (submitting.current) return;
    submitting.current = true;
    try { await api.logout(); await session.refresh(); } catch (e: unknown) { setError(errorMessage(e)); } finally { submitting.current = false; }
  };
  if (!session.data) return <div className="page"><RequestState {...session} retry={session.refresh} /></div>;
  if (!session.data.enabled || session.data.user) return <>{session.error && <div className="page"><RequestState {...session} retry={session.refresh} /></div>}{error && <div className="page"><div className="notice bad" role="alert">{error}</div></div>}{children(session.data.user, logout)}</>;
  return <main className="login-page"><form className="card card-b login-form" onSubmit={async (e) => {
    e.preventDefault(); if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try { await api.login(username.trim(), password); setPassword(''); await session.refresh(); } catch (failure: unknown) { setError(errorMessage(failure)); } finally { submitting.current = false; setBusy(false); }
  }}>
    <h1>Masuk ke ManualMechanic</h1><p className="sub">Gunakan akun teknisi atau supervisor yang diberikan pengelola.</p>
    <RequestState {...session} retry={session.refresh} />
    <label className="field">Username<input className="input" autoComplete="username" required maxLength={100} disabled={busy} value={username} onChange={(e) => setUsername(e.target.value)} /></label>
    <label className="field">Kata sandi<input className="input" type="password" autoComplete="current-password" required maxLength={256} disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    {error && <div className="notice bad" role="alert">{error}</div>}
    <button className="btn primary" disabled={busy || !username.trim() || !password}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
  </form></main>;
}
