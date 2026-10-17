import { useEffect } from 'react';
export function canLeavePage(): boolean { return window.dispatchEvent(new Event('before-navigation', { cancelable: true })); }
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: Event) => { if (!window.confirm('Ada perubahan yang belum disimpan. Tinggalkan halaman dan buang perubahan?')) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('before-navigation', navigate);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('before-navigation', navigate); };
  }, [dirty]);
}
