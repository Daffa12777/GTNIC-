export const LOCATION_CHANGED = 'mm-location-changed';

export function writeLocation(url: string, replace = false): void {
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (url === current) return;
  const index = Number(window.history.state?.mmNavIndex) || 0;
  window.history[replace ? 'replaceState' : 'pushState']({ ...window.history.state, mmNavIndex: index + (replace ? 0 : 1) }, '', url);
  window.dispatchEvent(new Event(LOCATION_CHANGED));
}
