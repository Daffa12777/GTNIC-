import type { AuthUser } from '../types';

export default function ProfileAvatar({ user, active, onClick }: { user: AuthUser; active: boolean; onClick: () => void }) {
  const displayName = user.name?.trim() || user.username;
  const words = displayName.split(/\s+/);
  const initials = (words.length > 1 ? `${Array.from(words[0])[0]}${Array.from(words[words.length - 1])[0]}` : Array.from(words[0]).slice(0, 2).join('')).toLocaleUpperCase('id-ID');
  return <button type="button" className={`profile-avatar ${active ? 'active' : ''}`} aria-label={`Profil ${displayName}`} title={`Profil ${displayName}`} aria-current={active ? 'page' : undefined} onClick={onClick}>{initials}</button>;
}
