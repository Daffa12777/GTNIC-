import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { api } from '../src/api';
import SessionGate from '../src/SessionGate';
import { queryClient } from '../src/queryClient';
import { publishSessionChange } from '../src/sessionSync';

it('clears private content and cache when another tab ends the session', async () => {
  class Channel {
    static peers = new Set<Channel>();
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
    constructor(_name: string) { Channel.peers.add(this); }
    postMessage(data: unknown) { for (const peer of Channel.peers) if (peer !== this) peer.onmessage?.(new MessageEvent('message', { data })); }
    close() { Channel.peers.delete(this); }
  }
  vi.stubGlobal('BroadcastChannel', Channel);
  const session = vi.spyOn(api, 'session').mockResolvedValue({ enabled: true, user: { username: 'A', role: 'teknisi' } });
  try {
    render(<SessionGate>{() => <span>Private account A</span>}</SessionGate>);
    await screen.findByText('Private account A');
    queryClient.setQueryData(['inventory'], ['Private A']);
    session.mockResolvedValue({ enabled: true, user: null });
    act(() => publishSessionChange());
    await screen.findByText('Masuk ke ManualMechanic');
    await waitFor(() => expect(queryClient.getQueryData(['inventory'])).toBeUndefined());
    expect(screen.queryByText('Private account A')).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});
