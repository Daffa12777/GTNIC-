import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useNavigation } from '../src/navigation';
import { UnsavedChangesPrompt, useUnsavedChanges } from '../src/useUnsavedChanges';
import { RequestState } from '../src/usePolling';
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
function Editor() {
  const route = useNavigation(); const [dirty, setDirty] = useState(true); useUnsavedChanges(dirty);
  return <><span>{route.tab}</span><button onClick={() => route.navigate('wo')}>Leave</button><button onClick={() => setDirty(false)}>Saved</button></>;
}
it('blocks internal navigation and refresh while unsaved, then permits it after save', () => {
  render(<><UnsavedChangesPrompt /><Editor /></>);
  fireEvent.click(screen.getByText('Leave'));
  expect(window.location.pathname).toBe('/');
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
  const unload = new Event('beforeunload', { cancelable: true }); act(() => { window.dispatchEvent(unload); }); expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByText('Saved')); fireEvent.click(screen.getByText('Leave'));
  expect(window.location.pathname).toBe('/work-orders');
});
it('can hide the timestamp while retaining errors and a non-submit retry button', () => {
  const view = render(<RequestState error="" loading={false} updated={1} retry={vi.fn()} showUpdated={false} />);
  expect(view.container.textContent).toBe('');
  view.rerender(<RequestState error="offline" loading={false} updated={1} retry={vi.fn()} showUpdated={false} />);
  expect(screen.getByRole('alert').textContent).toContain('offline');
  expect(screen.getByRole('button').getAttribute('type')).toBe('button');
});
it('restores the current URL when browser Back is cancelled', async () => {
  render(<><UnsavedChangesPrompt /><Editor /></>); fireEvent.click(screen.getByText('Leave'));
  fireEvent.click(screen.getByRole('button', { name: 'Buang dan lanjutkan' }));
  expect(window.location.pathname).toBe('/work-orders');
  act(() => { window.history.back(); });
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
  await waitFor(() => expect(window.location.pathname).toBe('/work-orders'));
  expect(screen.getByText('wo')).toBeTruthy();
  act(() => { window.history.back(); });
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Buang dan lanjutkan' }));
  await waitFor(() => expect(window.location.pathname).toBe('/'));
});
