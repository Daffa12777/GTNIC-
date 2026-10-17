import type { Case, Overview, ReadingsResp, Role, WorkOrder, InventoryItem, Technician, PurchaseRequest, Notification, SessionInfo } from './types';
import type { UserProfile } from './types';
import type { Inbox } from './types';

export const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

let role: Role = 'teknisi';
export const setRole = (r: Role) => { role = r; };
let refreshPending: Promise<boolean> | null = null;
const authHeaders = { 'content-type': 'application/json', 'x-mm-client': 'web' };

async function renewAccess(): Promise<boolean> {
  if (!refreshPending) {
    const renew = async () => {
      // Another tab may already have renewed the shared cookie while we waited for the lock.
      const session = await fetch(`${API}/auth/session`, { credentials: 'include', signal: AbortSignal.timeout(15000) });
      if (session.ok) { const value = await session.json() as SessionInfo; if (value.user) return true; }
      return (await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include', headers: authHeaders, signal: AbortSignal.timeout(15000) })).ok;
    };
    refreshPending = (async () => navigator.locks ? await navigator.locks.request('manualmechanic-refresh', renew) : await renew())().catch(() => false).finally(() => { refreshPending = null; });
  }
  return refreshPending ? await refreshPending : false;
}

async function req<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const timeout = new AbortController();
  const abort = () => timeout.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) timeout.abort();
  const timer = window.setTimeout(() => timeout.abort(), init?.method === 'POST' ? 130000 : 15000);
  try {
  const r = await fetch(`${API}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-role': role, 'x-mm-client': 'web', ...(init?.headers || {}) },
    signal: timeout.signal,
  });
  const data: unknown = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/auth/') && retry && await renewAccess()) return req<T>(path, init, false);
    if (r.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    const body = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    throw new Error(String(body.detail || body.message || `Permintaan gagal (${r.status})`));
  }
  if (data === null) throw new Error('Respons server tidak valid');
  return data as T;
  } catch (error: unknown) {
    if (timeout.signal.aborted && !init?.signal?.aborted) throw new Error('Server belum merespons. Periksa status sebelum mengulangi tindakan.');
    throw error;
  } finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
}
const post = <T,>(path: string, body: unknown = {}) => req<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  session: async (signal?: AbortSignal) => {
    const session = await req<SessionInfo>('/auth/session', { signal });
    if (session.enabled && !session.user && await renewAccess()) return req<SessionInfo>('/auth/session', { signal });
    return session;
  },
  login: (username: string, password: string) => post<SessionInfo>('/auth/login', { username, password }),
  logout: () => post('/auth/logout'),
  profile: (signal?: AbortSignal) => req<UserProfile>('/profile', { signal }),
  updateProfile: (body: { name: string; email: string; username: string }) => post<UserProfile>('/profile', body),
  changePassword: (body: { currentPassword: string; newPassword: string }) => post('/profile/password', body),
  deleteAccount: (currentPassword: string) => post('/profile/delete', { currentPassword }),
  overview: (signal?: AbortSignal) => req<Overview>('/overview', { signal }),
  readings: (id: string, limit = 60, signal?: AbortSignal) => req<ReadingsResp>(`/pumps/${encodeURIComponent(id)}/readings?limit=${limit}`, { signal }),
  cases: (signal?: AbortSignal) => req<Case[]>('/cases', { signal }),
  getCase: (id: string, signal?: AbortSignal) => req<Case>(`/cases/${encodeURIComponent(id)}`, { signal }),
  diagnose: (pump_id: string, complaint: string, use_llm: boolean) => post<Case>('/diagnose', { pump_id, complaint, use_llm }),
  chat: (message: string, case_id: string | null, use_llm: boolean) => post<{ reply: string; case: Case | null; llm_error?: string }>('/chat', { message, case_id, use_llm }),
  answer: (id: string, text: string) => post<Case>(`/cases/${id}/answer`, { text }),
  approve: (id: string) => post<Case>(`/cases/${id}/approve`),
  reject: (id: string, note: string) => post<Case>(`/cases/${id}/reject`, { note }),
  triage: () => post<{ ranking: unknown[]; cases: unknown[] }>('/triage'),
  workOrders: (signal?: AbortSignal) => req<WorkOrder[]>('/work-orders', { signal }),
  complete: (id: string, root_cause: string, action: string) => post(`/work-orders/${id}/complete`, { root_cause, action }),
  inventory: (signal?: AbortSignal) => req<InventoryItem[]>('/inventory', { signal }),
  createPart: (data: InventoryItem) => post<InventoryItem>('/inventory', data),
  adjustStock: (id: string, data: { operationId: string; delta: number; expectedStock: number; reason: string }) => post(`/inventory/${encodeURIComponent(id)}/stock`, data),
  stockMovements: (id: string, signal?: AbortSignal) => req<{ id: string; delta: number; balance: number; reason: string; actor: string; createdAt: string }[]>(`/inventory/${encodeURIComponent(id)}/movements`, { signal }),
  technicians: (signal?: AbortSignal) => req<Technician[]>('/technicians', { signal }),
  purchases: (signal?: AbortSignal) => req<PurchaseRequest[]>('/purchase-requests', { signal }),
  notifications: (signal?: AbortSignal) => req<Notification[]>('/notifications', { signal }),
  inbox: (signal?: AbortSignal) => req<Inbox>('/inbox', { signal }),
  readInbox: (through: number) => post('/inbox/read', { through }),
  auto: (enabled: boolean) => post('/auto', { enabled }),
  scenarioStart: () => post('/scenario/start'),
  scenarioFault: (pump_id: string, fault: string, sudden: boolean) => post('/scenario/fault', { pump_id, fault, rate: sudden ? 0 : 0.06, severity: sudden ? 1 : 0 }),
  scenarioDropout: (pump_id: string, sensor: string | null) => post('/scenario/dropout', { pump_id, sensor }),
  scenarioReset: () => post('/scenario/reset'),
  mlMeta: () => req<unknown>('/ml/meta'),
};
