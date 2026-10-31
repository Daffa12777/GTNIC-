import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FacilityMap from '../src/components/FacilityMap';
import type { Overview, Pump } from '../src/types';

vi.mock('../src/components/FacilityScene', () => ({ default: () => <div>Peta tersedia</div> }));
afterEach(cleanup);

it('selects an actual unit and keeps its unavailable status and case accessible', () => {
  const pumps: Pump[] = [
    { id: 'Pump-01', name: 'Press', location: 'A', model: 'HPU', criticality: 'tinggi', status: { state: 'normal' }, open_work_orders: 0, open_case: null },
    { id: 'Pump-02', name: 'Injeksi', location: 'B', model: 'HPU', criticality: 'tinggi', status: { state: 'ml_error' }, open_work_orders: 2, open_case: 'C-002' },
  ];
  const ov: Overview = { pumps, auto: false, llm_available: false, llm_model: null, db: 'test', tick_seconds: 3, simulator: false, ml: { ok: false }, fault_labels: {} };
  const select = vi.fn();
  const openCase = vi.fn();
  const openUnit = vi.fn();
  const view = render(<FacilityMap ov={ov} selected="Pump-01" onSelect={select} onOpenCase={openCase} onOpenUnit={openUnit} />);
  const list = screen.getByLabelText('Pilih unit pada peta');
  fireEvent.click(within(list).getByRole('button', { name: /Pump-02/ }));
  expect(select).toHaveBeenCalledWith('Pump-02');
  view.rerender(<FacilityMap ov={ov} selected="Pump-02" onSelect={select} onOpenCase={openCase} onOpenUnit={openUnit} />);
  expect(within(list).getByRole('button', { name: /Pump-02/ }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('C-002')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Buka kasus' }));
  expect(openCase).toHaveBeenCalledWith('C-002');
  fireEvent.click(screen.getByRole('button', { name: 'Lihat detail unit' }));
  expect(openUnit).toHaveBeenCalledWith('Pump-02');
  const updated = { ...ov, pumps: [pumps[0], { ...pumps[1], status: { state: 'kritis' as const, label: 'pump', confidence: 0.82 } }], ml: { ok: true }, fault_labels: { pump: 'Kebocoran pompa' } };
  view.rerender(<FacilityMap ov={updated} selected="Pump-02" onSelect={select} onOpenCase={openCase} onOpenUnit={openUnit} />);
  expect(within(list).getByRole('button', { name: /Pump-02 Kritis/ })).toBeTruthy();
  expect(screen.getByText('Kebocoran pompa')).toBeTruthy();
  expect(screen.getByText('82%')).toBeTruthy();
});
