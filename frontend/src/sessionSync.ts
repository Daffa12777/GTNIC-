const CHANNEL = 'manualmechanic-session';

export function publishSessionChange(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage('changed'); channel.close();
}

export function subscribeSessionChange(changed: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => { if (event.data === 'changed') changed(); };
  return () => channel.close();
}
