import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../src/api';

afterEach(() => vi.restoreAllMocks());

it('allows ML-dependent reads to wait for startup while keeping other read timeouts short', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
  const timer = vi.spyOn(window, 'setTimeout');
  await api.overview();
  await api.services();
  expect(timer.mock.calls.filter(([, delay]) => delay === 45000)).toHaveLength(2);
  await api.profile();
  expect(timer).toHaveBeenLastCalledWith(expect.any(Function), 15000);
});
