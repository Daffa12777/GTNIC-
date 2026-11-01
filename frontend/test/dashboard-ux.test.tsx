import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import Dashboard from '../src/components/Dashboard';
import { queryClient } from '../src/queryClient';
import type { Overview, PumpStatus } from '../src/types';

function overview(states: PumpStatus['state'][]): Overview {
  return {
    pumps: states.map((state, index) => ({
      id: `Pump-0${index + 1}`, name: `Unit ${index + 1}`, location: 'Pabrik', model: 'HPU', criticality: 'tinggi',
      status: { state }, open_work_orders: 0, open_case: index === 0 ? 'C-001' : null,
    })),
    auto: false, llm_available: false, llm_model: null, db: 'test', tick_seconds: 3, simulator: false,
    ml: { ok: !states.includes('ml_error'), error: 'Tidak tersedia' }, fault_labels: {},
  };
}

beforeEach(() => {
  queryClient.clear();
  vi.spyOn(api, 'cases').mockResolvedValue([{
    id: 'C-001', pump_id: 'Pump-01', status: 'menunggu_persetujuan', fault: 'pump', confidence: 0.9,
    risk: 'tinggi', summary: 'Menunggu keputusan', created_at: 1700000000, mode: 'policy',
  }]);
  vi.spyOn(api, 'workOrders').mockResolvedValue([]);
  vi.spyOn(api, 'readings').mockRejectedValue(new Error('Belum ada data'));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

const renderDashboard = (ov: Overview, onOpenCase = vi.fn()) => render(
  <Dashboard ov={ov} canManage selected={null} onSelect={vi.fn()} onOpenCase={onOpenCase} flash={vi.fn()} refresh={vi.fn()} />,
);

describe('Ringkasan unit', () => {
  it('distinguishes unavailable analysis from zero healthy or critical units', async () => {
    renderDashboard(overview(['ml_error', 'ml_error']));
    expect(screen.getByText('0 dari 2 unit dapat dinilai · 2 belum dapat dinilai')).toBeTruthy();
    for (const label of ['Normal', 'Waspada', 'Kritis']) {
      const card = screen.getByText(label, { selector: '.stat .k' }).parentElement!;
      expect(within(card).getByText('—')).toBeTruthy();
    }
    expect(await screen.findByRole('button', { name: 'Tinjau persetujuan C-001' })).toBeTruthy();
    expect(screen.getByText('Kondisi unit saat ini:')).toBeTruthy();
  });

  it('reports partially assessed units and shows real zeroes for known states', () => {
    renderDashboard(overview(['normal', 'sensor']));
    expect(screen.getByText('1 dari 2 unit dapat dinilai · 1 belum dapat dinilai')).toBeTruthy();
    const card = screen.getByText('Kritis', { selector: '.stat .k' }).parentElement!;
    expect(within(card).getByText('0')).toBeTruthy();
  });

  it('explains the analysis action and presents returned cases without hiding failures', async () => {
    const open = vi.fn();
    vi.spyOn(api, 'triage').mockResolvedValue({ ranking: [], cases: [{ pump_id: 'Pump-02', case_id: 'C-002', status: 'gagal' }] });
    renderDashboard(overview(['normal', 'kritis']), open);
    expect(screen.getByText(/Agent dapat membuat kasus dan tindakan/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Analisis unit prioritas' }));
    const result = await screen.findByRole('region', { name: 'Hasil analisis prioritas' });
    expect(within(result).getByText('Gagal')).toBeTruthy();
    fireEvent.click(within(result).getByRole('button', { name: 'Lihat kasus C-002' }));
    expect(open).toHaveBeenCalledWith('C-002');
  });

  it('explains an empty filtered table', async () => {
    renderDashboard(overview(['normal']));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'kritis' } });
    await waitFor(() => expect(screen.getByText('Tidak ada unit yang cocok dengan pencarian atau status ini.')).toBeTruthy());
  });
});
