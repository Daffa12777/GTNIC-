import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import { useSessionActivity } from '../src/useSessionActivity';
import { queryClient } from '../src/queryClient';
import type { SessionInfo } from '../src/types';

let session: SessionInfo;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-08T10:00:00Z'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  session = { enabled: true, user: { username: 'activity-test', role: 'supervisor' }, expiresAt: Date.now() + 30 * 60000, absoluteExpiresAt: Date.now() + 8 * 3600000 };
  queryClient.setQueryData(['session'], session);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('expires without extending the session when there is no input', async () => {
  const activity = vi.spyOn(api, 'activity');
  vi.spyOn(api, 'session').mockResolvedValue({ enabled: true, user: null });
  const expired = vi.fn();window.addEventListener('session-expired', expired);
  try {
    renderHook(() => useSessionActivity(session, true));
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60000); });
    expect(activity).not.toHaveBeenCalled(); expect(expired).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener('session-expired', expired); }
});
it('sends at most one heartbeat per minute for input and ignores hidden-tab activity', async () => {
  const activity = vi.spyOn(api, 'activity').mockImplementation(async () => ({ expiresAt: Date.now() + 30 * 60000, absoluteExpiresAt: session.absoluteExpiresAt! }));
  renderHook(() => useSessionActivity(session, true));
  await act(async () => { fireEvent.pointerDown(window); fireEvent.keyDown(window); fireEvent.wheel(window); });
  expect(activity).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); fireEvent.keyDown(window); });
  expect(activity).toHaveBeenCalledTimes(2);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); fireEvent.pointerDown(window); });
  expect(activity).toHaveBeenCalledTimes(2);
});
it('rechecks an old deadline against the server so an active second tab is not logged out', async () => {
  const fresh = { ...session, expiresAt: Date.now() + 60 * 60000 };
  vi.spyOn(api, 'session').mockResolvedValue(fresh);
  const expired = vi.fn();window.addEventListener('session-expired', expired);
  try {
    renderHook(() => useSessionActivity(session, true));
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60000); });
    expect(expired).not.toHaveBeenCalled(); expect(queryClient.getQueryData(['session'])).toEqual(fresh);
  } finally { window.removeEventListener('session-expired', expired); }
});
it('checks the absolute deadline even when the idle deadline is later', async () => {
  vi.spyOn(api, 'session').mockResolvedValue({ enabled: true, user: null });
  const expired = vi.fn();window.addEventListener('session-expired', expired);
  try {
    renderHook(() => useSessionActivity({ ...session, absoluteExpiresAt: Date.now() + 60000 }, true));
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(expired).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener('session-expired', expired); }
});
it('does not let an activity response from a previous account overwrite the next account', async () => {
  let finish!: (value: { expiresAt: number; absoluteExpiresAt: number }) => void;
  vi.spyOn(api, 'activity').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = renderHook(({ value }) => useSessionActivity(value, true), { initialProps: { value: session } });
  fireEvent.pointerDown(window);
  const next = { ...session, user: { username: 'other-account', role: 'teknisi' as const } };
  view.rerender({ value: next });queryClient.setQueryData(['session'], next);
  await act(async () => { finish({ expiresAt: Date.now() + 60 * 60000, absoluteExpiresAt: session.absoluteExpiresAt! }); });
  expect(queryClient.getQueryData(['session'])).toEqual(next);
});
