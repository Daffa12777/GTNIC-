import type { ReactNode } from 'react';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'acc';
export const Badge = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`badge b-${tone}`}>{children}</span>;

const STATE: Record<string, [Tone, string]> = {
  normal: ['ok', 'Normal'], waspada: ['warn', 'Waspada'], kritis: ['bad', 'Kritis'], sensor: ['info', 'Sensor bermasalah'],
  ml_error: ['bad', 'ML tidak tersedia'], 'tidak ada data': ['info', 'Tidak ada data'],
};
export const StateBadge = ({ state }: { state: string }) => {
  const [t, l] = STATE[state] ?? ['info', state];
  return <Badge tone={t}>{l}</Badge>;
};

export const CASE: Record<string, [Tone, string]> = {
  selesai_otomatis: ['ok', 'Dijalankan otomatis'], disetujui_dijalankan: ['ok', 'Disetujui dan dijalankan'], selesai: ['ok', 'Selesai'],
  menunggu_persetujuan: ['warn', 'Menunggu persetujuan'], menunggu_klarifikasi: ['warn', 'Menunggu jawaban teknisi'],
  dieskalasi: ['acc', 'Dieskalasi ke senior'], ditolak: ['info', 'Ditolak'], sensor_bermasalah: ['info', 'Sensor bermasalah'],
  tidak_ada_gangguan: ['ok', 'Tidak ada gangguan'], dipantau: ['info', 'Dipantau'], gagal: ['bad', 'Gagal'], selesai_llm: ['acc', 'Selesai (LLM)'],
};
export const CaseBadge = ({ status }: { status: string }) => {
  const [t, l] = CASE[status] ?? ['info', status];
  return <Badge tone={t}>{l}</Badge>;
};

export const RiskBadge = ({ risk }: { risk: string | null }) =>
  !risk ? null : <Badge tone={risk === 'tinggi' ? 'bad' : risk === 'sedang' ? 'warn' : 'ok'}>Risiko {risk}</Badge>;

export const WO_TONE: Record<string, Tone> = { terbuka: 'warn', terjadwal: 'acc', selesai: 'ok', dibatalkan: 'info' };
export const WO_LABEL: Record<string, string> = { terbuka: 'Terbuka', terjadwal: 'Terjadwal', selesai: 'Selesai', dibatalkan: 'Dibatalkan' };
export const PRIORITY_LABEL: Record<string, string> = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' };
export const WorkOrderBadge = ({ status }: { status: string }) => <Badge tone={WO_TONE[status] ?? 'info'}>{WO_LABEL[status] ?? status}</Badge>;
export const PriorityBadge = ({ priority }: { priority: string }) => <Badge tone={priority === 'tinggi' ? 'bad' : priority === 'sedang' ? 'warn' : 'info'}>{PRIORITY_LABEL[priority] ?? priority}</Badge>;

export const fmtTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const pct = (v: number | null | undefined) => (v == null ? '-' : `${Math.round(v * 100)}%`);

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
