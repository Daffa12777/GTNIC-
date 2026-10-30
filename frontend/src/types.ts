export type Role = 'teknisi' | 'supervisor';
export interface AuthUser { username: string; role: Role; name?: string | null }
export interface UserProfile extends AuthUser { name: string | null; email: string | null }
export interface SessionInfo { enabled: boolean; user: AuthUser | null }

export interface Comp {
  level: number; severity: number; confidence: number; p_degraded: number; probs: Record<string, number>;
}
export interface PumpStatus {
  state: 'normal' | 'waspada' | 'kritis' | 'sensor' | 'tidak ada data' | 'ml_error';
  label?: string; confidence?: number; probs?: Record<string, number>; flags?: string[];
  suspect?: string[]; components?: Record<string, Comp>; is_anomaly?: boolean; anomaly_score?: number; threshold?: number; error?: string;
}
export interface Pump {
  id: string; name: string; location: string; model: string; criticality: string;
  status: PumpStatus; open_work_orders: number; open_case: string | null;
}
export interface Overview {
  pumps: Pump[]; auto: boolean; llm_available: boolean; llm_model: string | null; db: string; tick_seconds: number; simulator: boolean;
  scenario_controls_enabled?: boolean;
  ml: { ok: boolean; source?: string; trained_at?: string; error?: string };
  fault_labels: Record<string, string>;
}
export interface SensorMeta { key: string; name: string; unit: string }
export interface ReadingsResp {
  pump: Pump; sensors: SensorMeta[]; nominal: Record<string, number>;
  readings: ({ ts: number } & Record<string, number>)[]; status: PumpStatus | null;
  components: Record<string, { name: string; levels: number[]; meaning: Record<string, string> }>;
}
export interface TraceItem {
  n: number; kind: 'reasoning' | 'tool' | 'decision' | 'action'; title: string; detail: string; tool: string | null; result?: string; ts: number;
}
export interface Case {
  id: string; pump_id: string | null; status: string; fault: string | null; confidence: number | null; risk: string | null;
  summary: string | null; created_at: number; mode: string;
  trace?: TraceItem[]; question?: string | null; plan?: { fault: string; confidence: number; risk: string; citation: string; advice?: string } | null; probs?: Record<string, number> | null;
}
export interface WorkOrder {
  id: string; pump_id: string; case_id: string; title: string; description: string; priority: string; status: string;
  technician: string | null; scheduled_at: string | null; part: string; created_at: number;
}
export interface ChatMsg { from: 'user' | 'agent'; text: string; case?: Case | null; caseId?: string }
export interface InventoryItem { part_id: string; name: string; stock: number; location: string; min_stock: number }
export interface Technician { id: string; name: string; skill: string; level: string; available: boolean }
export interface PurchaseRequest { id: string; part_name: string; qty: number; reason: string; status: string }
export interface Notification { id: number; ts: number; recipient: string; message: string; status: string }
export interface Inbox { unread: number; approvalCount: number; approvals: { id: string; pump_id: string | null; summary: string | null }[]; notifications: (Notification & { read: boolean })[] }
export interface RecordsPage<T> { items: T[]; total: number; page: number; pageSize: number }
export interface WorkOrdersPage extends RecordsPage<WorkOrder> { technicians: { id: string; name: string }[]; units: string[] }
export interface LlmConnectionStatus { state: 'unconfigured' | 'unchecked' | 'ready' | 'error'; checkedAt: number | null; code: string | null; message: string }
export interface ServicesStatus { checkedAt: number; database: { ok: boolean }; ml: { ok: boolean }; llm: LlmConnectionStatus }
