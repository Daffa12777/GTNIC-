import type { Case, Overview, ReadingsResp, Role, WorkOrder } from './types';

export const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000/api';

let role: Role = 'teknisi';
export const setRole = (r: Role) => { role = r; };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-role': role, ...(init?.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || data?.message || `Permintaan gagal (${r.status})`);
  return data as T;
}
const post = <T,>(path: string, body: unknown = {}) => req<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  overview: () => req<Overview>('/overview'),
  readings: (id: string, limit = 60) => req<ReadingsResp>(`/pumps/${id}/readings?limit=${limit}`),
  cases: () => req<Case[]>('/cases'),
  getCase: (id: string) => req<Case>(`/cases/${id}`),
  diagnose: (pump_id: string, complaint: string, use_llm: boolean) => post<Case>('/diagnose', { pump_id, complaint, use_llm }),
  chat: (message: string, case_id: string | null, use_llm: boolean) => post<{ reply: string; case: Case | null }>('/chat', { message, case_id, use_llm }),
  answer: (id: string, text: string) => post<Case>(`/cases/${id}/answer`, { text }),
  approve: (id: string) => post<Case>(`/cases/${id}/approve`),
  reject: (id: string, note: string) => post<Case>(`/cases/${id}/reject`, { note }),
  triage: () => post<{ ranking: unknown[]; cases: unknown[] }>('/triage'),
  workOrders: () => req<WorkOrder[]>('/work-orders'),
  complete: (id: string, root_cause: string, action: string) => post(`/work-orders/${id}/complete`, { root_cause, action }),
  inventory: () => req<any[]>('/inventory'),
  technicians: () => req<any[]>('/technicians'),
  purchases: () => req<any[]>('/purchase-requests'),
  notifications: () => req<any[]>('/notifications'),
  auto: (enabled: boolean) => post('/auto', { enabled }),
  scenarioStart: () => post('/scenario/start'),
  scenarioFault: (pump_id: string, fault: string, sudden: boolean) => post('/scenario/fault', { pump_id, fault, rate: sudden ? 0 : 0.06, severity: sudden ? 1 : 0 }),
  scenarioDropout: (pump_id: string, sensor: string | null) => post('/scenario/dropout', { pump_id, sensor }),
  scenarioReset: () => post('/scenario/reset'),
  mlMeta: () => req<any>('/ml/meta'),
};
