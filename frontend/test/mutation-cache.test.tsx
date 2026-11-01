import { expect, it, vi } from 'vitest';
import { queryClient } from '../src/queryClient';
import { api } from '../src/api';

it('invalidates cached inventory and history pages only after successful stock mutation', async () => {
  for (const key of [['inventory'], ['stock-movements', 'A'], ['case-context', 'C-1'], ['profile']]) queryClient.setQueryData(key, []);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 201 })));
  try {
    await api.adjustStock('A', { operationId: 'test', delta: 1, expectedStock: 0, reason: 'Stock update' });
    expect(queryClient.getQueryState(['inventory'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['stock-movements', 'A'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['case-context', 'C-1'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['profile'])?.isInvalidated).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});

it('invalidates case context after a decision changes the work order', async () => {
  queryClient.setQueryData(['case-context', 'C-2'], {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 201 })));
  try {
    await api.approve('C-2');
    expect(queryClient.getQueryState(['case-context', 'C-2'])?.isInvalidated).toBe(true);
  } finally { vi.unstubAllGlobals(); }
});

it('retains valid cached data when the server rejects a mutation', async () => {
  queryClient.setQueryData(['inventory'], []);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"Conflict"}', { status: 409 })));
  try {
    await expect(api.createPart({ part_id: 'A', name: 'A', stock: 1, min_stock: 0, location: 'A' })).rejects.toThrow('Conflict');
    expect(queryClient.getQueryState(['inventory'])?.isInvalidated).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});
