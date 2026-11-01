import { queryClient } from './queryClient';

/** Invalidate only after server success, including cached pages that are not mounted. */
export function invalidateAfterMutation(path: string): void {
  let roots: string[] = [];
  if (path === '/profile') roots = ['profile', 'session'];
  else if (path === '/inbox/read') roots = ['inbox'];
  else if (path === '/services/llm/check') roots = ['services'];
  else if (path.startsWith('/inventory')) roots = ['inventory', 'stock-movements', 'overview', 'case-context'];
  else if (path === '/auto') roots = ['overview'];
  else if (/^\/(cases|work-orders|scenario)\//.test(path) || ['/diagnose', '/chat', '/triage'].includes(path)) {
    roots = ['overview', 'readings', 'cases', 'case', 'case-context', 'work-orders', 'inventory', 'stock-movements', 'technicians', 'purchases', 'notifications', 'inbox'];
  }
  if (roots.length) void queryClient.invalidateQueries({ predicate: (query) => roots.includes(String(query.queryKey[0])) });
}
