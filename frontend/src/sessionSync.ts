const CHANNEL = 'manualmechanic-session';
const SOURCE = crypto.randomUUID();

export function publishSessionChange(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ type: 'changed', source: SOURCE }); channel.close();
}

export function subscribeSessionChange(changed: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (data === 'changed' || (data && typeof data === 'object' && 'type' in data && data.type === 'changed' && 'source' in data && data.source !== SOURCE)) changed();
  };
  return () => channel.close();
}
