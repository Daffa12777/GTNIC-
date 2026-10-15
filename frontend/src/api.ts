import type { Case, Overview, ReadingsResp, Role, WorkOrder, InventoryItem, Technician, PurchaseRequest, Notification, SessionInfo } from './types';

export const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

let role: Role = 'teknisi';
export const setRole = (r: Role) => { role = r; };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
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
  session: (signal?: AbortSignal) => req<SessionInfo>('/auth/session', { signal }),
  login: (username: string, password: string) => post<SessionInfo>('/auth/login', { username, password }),
  logout: () => post('/auth/logout'),
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
  technicians: (signal?: AbortSignal) => req<Technician[]>('/technicians', { signal }),
  purchases: (signal?: AbortSignal) => req<PurchaseRequest[]>('/purchase-requests', { signal }),
  notifications: (signal?: AbortSignal) => req<Notification[]>('/notifications', { signal }),
  auto: (enabled: boolean) => post('/auto', { enabled }),
  scenarioStart: () => post('/scenario/start'),
  scenarioFault: (pump_id: string, fault: string, sudden: boolean) => post('/scenario/fault', { pump_id, fault, rate: sudden ? 0 : 0.06, severity: sudden ? 1 : 0 }),
  scenarioDropout: (pump_id: string, sensor: string | null) => post('/scenario/dropout', { pump_id, sensor }),
  scenarioReset: () => post('/scenario/reset'),
  mlMeta: () => req<unknown>('/ml/meta'),
};
