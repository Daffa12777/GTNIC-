import { useId, useState, type ComponentPropsWithoutRef } from 'react';

type PasswordInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type'>;

export default function PasswordInput({ id, className = '', disabled, ...props }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return <span className="password-field">
    <input {...props} id={inputId} disabled={disabled} className={`input password-input ${className}`} type={visible ? 'text' : 'password'} />
    <button type="button" className="password-toggle" disabled={disabled} aria-controls={inputId} aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {visible && <path d="m3 3 18 18" />}
      </svg>
    </button>
  </span>;
}
