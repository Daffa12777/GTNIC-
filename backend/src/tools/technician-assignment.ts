import { asObj, FAULT_SKILL } from '../domain';

export interface AssignmentRequirements { skill: string; senior: boolean }
export interface AssignmentTechnician { id: string; name: string | null; skill: string | null; level: string | null; available: boolean | null; busy: boolean }
export function assignmentRequirements(order: { title: string | null; priority: string | null }, current?: { fault: string | null; risk: string | null; status: string | null; state: unknown } | null): AssignmentRequirements {
  if (current?.status === 'sensor_bermasalah') return { skill: 'listrik', senior: false };
  const plan = (asObj(current?.state, {}) as { plan?: { fault?: string; risk?: string } }).plan;
  const inspection = order.title?.startsWith('Eskalasi diagnosis ');
  return { skill: inspection ? 'mekanik' : FAULT_SKILL[plan?.fault ?? current?.fault ?? ''] ?? 'mekanik', senior: !!inspection || [current?.risk, plan?.risk].includes('tinggi') || (!current && order.priority === 'tinggi') };
}
export function technicianReason(technician: AssignmentTechnician, needs: AssignmentRequirements): string | null {
  if (technician.skill !== needs.skill) return `Memerlukan keahlian ${needs.skill}.`;
  if (needs.senior && technician.level !== 'senior') return 'Pekerjaan ini memerlukan teknisi senior.';
  if (!technician.available || technician.busy) return 'Teknisi sedang sibuk atau tidak tersedia.';
  return null;
}
export function unassignedReason(technicians: AssignmentTechnician[], needs: AssignmentRequirements): string {
  const skilled = technicians.filter(t => t.skill === needs.skill);
  if (!skilled.length) return `Belum ada teknisi dengan keahlian ${needs.skill}.`;
  if (needs.senior && !skilled.some(t => t.level === 'senior')) return `Belum ada teknisi senior bidang ${needs.skill}.`;
  const available = skilled.filter(t => !technicianReason(t, needs)).length;
  return available ? `${available} teknisi sesuai tersedia; penugasan belum dilakukan.` : `Semua teknisi ${needs.senior ? 'senior ' : ''}${needs.skill} sedang sibuk atau tidak tersedia.`;
}
