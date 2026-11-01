import { useEffect, useState } from 'react';
import ConfirmDialog from './components/ConfirmDialog';
import { createElement } from 'react';

export function canLeavePage(resume?: () => void): boolean {
  if (window.dispatchEvent(new Event('before-navigation', { cancelable: true }))) return true;
  window.dispatchEvent(new CustomEvent('confirm-unsaved', { detail: { resume } }));
  return false;
}

export function UnsavedChangesPrompt() {
  const [resume, setResume] = useState<{ run?: () => void } | null>(null);
  useEffect(() => {
    const show = (event: Event) => setResume({ run: (event as CustomEvent<{ resume?: () => void }>).detail.resume });
    window.addEventListener('confirm-unsaved', show);
    return () => window.removeEventListener('confirm-unsaved', show);
  }, []);
  if (!resume) return null;
  return createElement(ConfirmDialog, { title: 'Perubahan belum disimpan', description: 'Tinggalkan halaman dan buang perubahan yang belum disimpan?', confirmLabel: 'Buang dan lanjutkan', onCancel: () => setResume(null), onConfirm: () => { const run = resume.run; setResume(null); run?.(); } });
}
export function useUnsavedChanges(dirty: boolean, internalNavigation = true): void {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: Event) => { event.preventDefault(); };
    window.addEventListener('beforeunload', unload); if (internalNavigation) window.addEventListener('before-navigation', navigate);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('before-navigation', navigate); };
  }, [dirty, internalNavigation]);
}
