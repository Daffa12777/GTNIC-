import { useId } from 'react';

export default function SearchField({ label, value, onChange, placeholder, pending }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; pending: boolean }) {
  const id = useId();
  return <div className="search-field"><label htmlFor={id}>{label}</label>
    <div className="search-input"><input id={id} className="input" type="search" maxLength={160} autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-describedby={pending ? `${id}-status` : undefined} />
      {value && <button type="button" className="btn sm" aria-label={`Hapus ${label.toLowerCase()}`} onClick={() => onChange('')}>Hapus</button>}
    </div>
    {pending && <span className="sub" id={`${id}-status`} role="status">Menyiapkan pencarian…</span>}
  </div>;
}
