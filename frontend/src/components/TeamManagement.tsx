import { useRef, useState } from 'react';
import { api } from '../api';
import { canSupervise, type Role } from '../types';
import { errorMessage, RequestState, usePolling } from '../usePolling';
import { useUnsavedChanges } from '../useUnsavedChanges';
import PasswordInput from './PasswordInput';
import ConfirmDialog from './ConfirmDialog';
import { Badge, Empty } from './ui';

export default function TeamManagement({ role }: { role: Role }) {
  const enabled = canSupervise(role);
  const result = usePolling(api.team, 60000, enabled, ['team']);
  const [kind, setKind] = useState<'teknisi' | 'supervisor'>('teknisi');
  const [name, setName] = useState(''), [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [skill, setSkill] = useState('mekanik'), [level, setLevel] = useState('junior');
  const [profileId, setProfileId] = useState(''), [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [deactivate, setDeactivate] = useState<string | null>(null);
  const pending = useRef(false);
  useUnsavedChanges(!!name || !!username || !!password || !!profileId || !!account || busy);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); await result.refresh(); }
    catch (failure: unknown) { setError(errorMessage(failure)); }
    finally { pending.current = false; setBusy(false); }
  };
  const unlinked = result.data?.technicians.filter(t => !t.user) ?? [];
  if (!enabled) return <div className="page"><p className="notice warn" role="alert">Halaman ini hanya tersedia untuk owner atau supervisor.</p></div>;
  return <div className="page">
    <div className="page-head"><div><h1>Kelola tim</h1><p>{role === 'owner' ? 'Buat akun supervisor dan teknisi, lalu hubungkan penugasan ke orang yang tepat.' : 'Buat akun teknisi dan hubungkan profil tim dengan akun login.'}</p></div></div>
    <RequestState {...result} retry={result.refresh} />
    {error && <div className="notice bad" role="alert">{error}</div>}
    {message && <div className="notice" role="status">{message}</div>}
    <div className="profile-grid">
      <section className="card card-b"><h2>Tambah akun</h2>
        <form onSubmit={event => { event.preventDefault(); void run(async () => {
          const body = { name: name.trim(), username: username.trim(), password };
          if (kind === 'supervisor' && role === 'owner') await api.createSupervisor(body);
          else await api.createTechnician({ ...body, skill, level });
          setName(''); setUsername(''); setPassword(''); setMessage(`Akun ${body.username} berhasil dibuat.`);
        }); }}><fieldset className="form-stack" disabled={busy}>
          {role === 'owner' ? <label className="field">Peran akun baru<select className="sel" value={kind} onChange={e => setKind(e.target.value as 'teknisi' | 'supervisor')}><option value="teknisi">Teknisi</option><option value="supervisor">Supervisor</option></select></label> : <p className="sub">Akun baru berperan teknisi. Hanya Owner yang dapat membuat supervisor.</p>}
          <label className="field">Nama lengkap<input className="input" required maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="field">Username<input className="input" required minLength={3} maxLength={100} pattern="[a-zA-Z0-9_.\-]+" autoComplete="off" autoCapitalize="none" value={username} onChange={e => setUsername(e.target.value)} /></label>
          <label className="field">Kata sandi awal<PasswordInput required minLength={12} maxLength={256} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <p className="sub">Minimal 12 karakter. Bagikan kepada pemilik akun melalui jalur pribadi.</p>
          {kind === 'teknisi' && <>
            <label className="field">Keahlian<select className="sel" value={skill} onChange={e => setSkill(e.target.value)}><option value="mekanik">Mekanik</option><option value="listrik">Listrik</option></select></label>
            <label className="field">Tingkat teknisi<select className="sel" value={level} onChange={e => setLevel(e.target.value)}><option value="junior">Junior</option><option value="senior">Senior</option></select></label>
          </>}
          <button className="btn primary">{busy ? 'Menyimpan…' : `Buat akun ${kind}`}</button>
        </fieldset></form>
      </section>
      <section className="card card-b"><h2>Hubungkan akun yang sudah ada</h2><p className="sub">Pilih profil lama untuk menghubungkan riwayat penugasannya ke akun teknisi.</p>
        {!unlinked.length || !result.data?.accounts.length ? <Empty>Belum ada pasangan profil dan akun yang perlu dihubungkan.</Empty> : <form onSubmit={event => { event.preventDefault(); void run(async () => { await api.linkTechnician(profileId, account); setProfileId(''); setAccount(''); setMessage('Profil teknisi berhasil dihubungkan.'); }); }}><fieldset className="form-stack" disabled={busy}>
          <label className="field">Profil teknisi<select className="sel" required value={profileId} onChange={e => setProfileId(e.target.value)}><option value="">Pilih profil</option>{unlinked.map(t => <option value={t.id} key={t.id}>{t.name} · {t.skill} · {t.level}</option>)}</select></label>
          <label className="field">Akun teknisi<select className="sel" required value={account} onChange={e => setAccount(e.target.value)}><option value="">Pilih akun</option>{result.data.accounts.map(a => <option value={a.username} key={a.username}>{a.name ?? a.username} (@{a.username})</option>)}</select></label>
          <button className="btn primary">Hubungkan akun</button>
        </fieldset></form>}
      </section>
    </div>
    <section className="card card-b"><h2>Teknisi</h2>{result.data?.technicians.length === 0 && <Empty>Belum ada teknisi. Tambahkan akun pertama di atas.</Empty>}<ul className="task-list">{result.data?.technicians.map(t => <li key={t.id}><div className="row wrap"><strong>{t.name}</strong><Badge tone={t.user?.active ? 'ok' : 'warn'}>{t.user ? t.user.active ? `@${t.user.username}` : 'Akun nonaktif' : 'Belum terhubung ke akun'}</Badge></div><p className="sub">{t.skill} · {t.level} · {t.available ? 'Tersedia' : 'Sedang bertugas'}</p></li>)}</ul></section>
    {role === 'owner' && <section className="card card-b"><h2>Supervisor</h2>{!result.data?.supervisors.length && <Empty>Belum ada akun supervisor.</Empty>}<ul className="task-list">{result.data?.supervisors.map(a => <li key={a.username}><div className="row wrap"><strong>{a.name ?? a.username}</strong><span>@{a.username}</span><Badge tone={a.active ? 'ok' : 'info'}>{a.active ? 'Aktif' : 'Nonaktif'}</Badge>{a.active && <button className="btn sm" disabled={busy} onClick={() => setDeactivate(a.username)}>Nonaktifkan {a.username}</button>}</div></li>)}</ul></section>}
    {deactivate && <ConfirmDialog title="Nonaktifkan supervisor?" description={`Akun ${deactivate} akan keluar dan tidak bisa login kembali.`} confirmLabel="Nonaktifkan akun" onCancel={() => setDeactivate(null)} onConfirm={() => { const target = deactivate; setDeactivate(null); void run(async () => { await api.deactivateSupervisor(target); setMessage(`Akun ${target} dinonaktifkan.`); }); }} />}
  </div>;
}
