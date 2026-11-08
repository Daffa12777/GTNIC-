import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';

afterEach(() => vi.unstubAllGlobals());
describe('JWT cookie renewal', () => {
  it('renews an expired access token for authenticated activity without extending it by polling', async () => {
    let renewed = false;
    const fetch = vi.fn(async (input: string) => {
      if (input.endsWith('/auth/session')) return new Response(JSON.stringify({ enabled: true, user: null }));
      if (input.endsWith('/auth/refresh')) { renewed = true; return new Response('{}', { status: 201 }); }
      return new Response(JSON.stringify(renewed ? { expiresAt: 123, absoluteExpiresAt: 456 } : { message: 'expired' }), { status: renewed ? 201 : 401 });
    });
    vi.stubGlobal('fetch', fetch);
    expect(await api.activity()).toEqual({ expiresAt: 123, absoluteExpiresAt: 456 });
    expect(fetch.mock.calls.filter(([path]) => path.endsWith('/auth/refresh'))).toHaveLength(1);
  });
  it('renews once for concurrent unauthorized requests and retries each request', async () => {
    let renewed = false;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith('/auth/session')) return new Response(JSON.stringify({ enabled: true, user: null }), { status: 200 });
      if (input.endsWith('/auth/refresh')) { refreshCalls++; await Promise.resolve(); renewed = true; return new Response('{}', { status: 201 }); }
      return new Response(JSON.stringify(renewed ? { pumps: [] } : { message: 'expired' }), { status: renewed ? 200 : 401 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const responses = await Promise.all([api.overview(), api.overview()]);
    expect(refreshCalls).toBe(1);
    expect(responses.every((response) => response.pumps.length === 0)).toBe(true);
  });
  it('stops retrying and signals login when renewal fails', async () => {
    const expired = vi.fn();
    window.addEventListener('session-expired', expired);
    vi.stubGlobal('fetch', vi.fn(async (input: string) => new Response(JSON.stringify(input.endsWith('/auth/session') ? { enabled: true, user: null } : { message: 'expired' }), { status: input.endsWith('/auth/session') ? 200 : 401 })));
    try { await expect(api.overview()).rejects.toThrow('expired'); expect(expired).toHaveBeenCalledTimes(1); }
    finally { window.removeEventListener('session-expired', expired); }
  });
});
