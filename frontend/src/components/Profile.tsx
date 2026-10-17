import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { errorMessage, RequestState, usePolling } from '../usePolling';
import PasswordInput from './PasswordInput';

export default function Profile({ logout, loggingOut }: { logout: (serverAlreadyClosed?: boolean) => Promise<void>; loggingOut: boolean }) {
  const profile = usePolling(api.profile, 60000);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Initialize once: background polling must not overwrite unsaved edits.
  const initialized = useRef(false);
  useEffect(() => {
    if (profile.data && !initialized.current) {
      setName(profile.data.name ?? ''); setEmail(profile.data.email ?? ''); setUsername(profile.data.username);
      initialized.current = true;
    }
  }, [profile.data]);
  const run = async (action: () => Promise<void>) => {
    if (pending.current || loggingOut) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (failure: unknown) { setError(errorMessage(failure)); }
    finally { pending.current = false; setBusy(false); }
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await api.updateProfile({ name: name.trim(), email: email.trim().toLowerCase(), username: username.trim() });
      setMessage('Profil berhasil disimpan.'); await profile.refresh();
      window.dispatchEvent(new Event('session-expired'));
    });
  };
  const password = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmation) { setError('Konfirmasi kata sandi tidak cocok.'); return; }
    void run(async () => { await api.changePassword({ currentPassword, newPassword }); await logout(true); });
  };
  const remove = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (deleteConfirmation !== profile.data?.username) { setError('Ketik username untuk mengonfirmasi penghapusan.'); return; }
    void run(async () => { await api.deleteAccount(deletePassword); await logout(true); });
  };
  const disabled = busy || loggingOut;
  return <div className="page profile-page">
    <h1>Profil saya</h1><p className="sub">Kelola identitas, keamanan, dan sesi akun.</p>
    <RequestState {...profile} retry={profile.refresh} />
    {error && <div className="notice bad" role="alert">{error}</div>}
    {message && <div className="notice" role="status">{message}</div>}
    {profile.data && <div className="profile-grid">
      <section className="card card-b"><h2>Informasi akun</h2>
        <form className="profile-form" onSubmit={save}>
          <fieldset disabled={disabled}>
            <label className="field">Nama<input className="input" autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field">Email<input className="input" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="field">Username<input className="input" autoComplete="username" required minLength={3} maxLength={100} pattern="[a-zA-Z0-9_.\-]+" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
            <label className="field">Role<input className="input" value={profile.data.role} readOnly /></label>
            <button className="btn primary" disabled={!name.trim() || !email.trim() || !username.trim()}>Simpan profil</button>
          </fieldset>
        </form>
      </section>
      <section className="card card-b"><h2>Ubah password</h2>
        <p className="sub">Gunakan minimal 12 karakter. Setelah password diubah, semua sesi akan keluar dan kamu perlu login kembali.</p>
        <form className="profile-form" onSubmit={password}><fieldset disabled={disabled}>
          <div className="field"><label htmlFor="current-password">Password saat ini</label><PasswordInput id="current-password" autoComplete="current-password" required maxLength={256} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
          <div className="field"><label htmlFor="new-password">Password baru</label><PasswordInput id="new-password" autoComplete="new-password" required minLength={12} maxLength={256} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          <div className="field"><label htmlFor="confirm-password">Konfirmasi password baru</label><PasswordInput id="confirm-password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div>
          <button className="btn primary">Ubah password</button>
        </fieldset></form>
      </section>
      <section className="card card-b"><h2>Sesi akun</h2><p className="sub">Keluar dari akun pada sesi browser ini.</p>
        <button type="button" className="btn danger" disabled={disabled} aria-busy={loggingOut} onClick={() => void logout()}>{loggingOut ? 'Keluar…' : 'Logout'}</button>
      </section>
      <section className="card card-b danger-zone"><h2>Hapus akun</h2><p className="sub">Akun dan seluruh sesi login akan dihapus permanen. Riwayat operasional tetap disimpan. Supervisor terakhir tidak dapat dihapus.</p>
        {!deleting ? <button className="btn danger" type="button" disabled={disabled} onClick={() => setDeleting(true)}>Hapus akun</button> :
          <form className="profile-form" onSubmit={remove}><fieldset disabled={disabled}>
            <div className="field"><label htmlFor="delete-password">Password untuk hapus akun</label><PasswordInput id="delete-password" autoComplete="current-password" required maxLength={256} value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} /></div>
            <label className="field">Ketik {profile.data.username} untuk konfirmasi<input className="input" autoComplete="off" required value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} /></label>
            <div className="profile-actions"><button className="btn danger" disabled={deleteConfirmation !== profile.data.username}>Hapus akun permanen</button><button className="btn" type="button" onClick={() => { setDeleting(false); setDeletePassword(''); setDeleteConfirmation(''); }}>Batal</button></div>
          </fieldset></form>}
      </section>
    </div>}
  </div>;
}
