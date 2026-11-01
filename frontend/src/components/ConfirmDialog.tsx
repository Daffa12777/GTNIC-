import { useEffect, useId, useRef } from 'react';

export default function ConfirmDialog({ title, description, confirmLabel, onConfirm, onCancel }: { title: string; description: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="confirm-backdrop"><div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    if (event.key === 'Tab' && event.shiftKey && document.activeElement === cancel.current) { event.preventDefault(); confirm.current?.focus(); }
    else if (event.key === 'Tab' && !event.shiftKey && document.activeElement === confirm.current) { event.preventDefault(); cancel.current?.focus(); }
  }}><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p><div className="row wrap"><button ref={cancel} className="btn" type="button" onClick={onCancel}>Batal</button><button ref={confirm} className="btn danger" type="button" onClick={onConfirm}>{confirmLabel}</button></div></div></div>;
}
