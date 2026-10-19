import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, gcTime: 5 * 60000, retry: false, refetchOnWindowFocus: true, refetchOnReconnect: true },
    mutations: { retry: false },
  },
});

/** Only in-memory server data; never persist credentials or API responses. */
export function clearPrivateCache(): void {
  void queryClient.cancelQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
}
