import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { usePolling } from '../src/usePolling';
import { clearPrivateCache, queryClient } from '../src/queryClient';

it('reuses fresh data on remount and separates resource identifiers', async () => {
  const load = vi.fn(async () => 'Part A');
  function View({ id }: { id: string }) {
    const result = usePolling(load, 60000, true, ['stock-movements', id]);
    return <span>{result.data ?? 'Loading'}</span>;
  }
  const first = render(<View id="A" />);
  await screen.findByText('Part A');
  first.unmount();
  const next = render(<View id="A" />);
  expect(screen.getByText('Part A')).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(1);
  load.mockResolvedValue('Part B');
  next.rerender(<View id="B" />);
  expect(screen.queryByText('Part A')).toBeNull();
  await screen.findByText('Part B');
});

it('cancels in-flight private data and removes every private cache on account exit', async () => {
  queryClient.setQueryData(['session'], { user: null });
  queryClient.setQueryData(['inventory'], ['private part']);
  let aborted = false;
  void queryClient.fetchQuery({ queryKey: ['case', 'A'], queryFn: ({ signal }) => new Promise<string>(() => { signal.addEventListener('abort', () => { aborted = true; }); }) }).catch(() => {});
  clearPrivateCache();
  await waitFor(() => expect(aborted).toBe(true));
  expect(queryClient.getQueryData(['inventory'])).toBeUndefined();
  expect(queryClient.getQueryData(['case', 'A'])).toBeUndefined();
  expect(queryClient.getQueryData(['session'])).toBeTruthy();
});
