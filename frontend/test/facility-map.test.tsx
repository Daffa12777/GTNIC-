import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FacilityMap from '../src/components/FacilityMap';
import type { Overview, Pump } from '../src/types';

vi.mock('../src/components/FacilityScene', () => ({ default: ({ zoom, rotation }: { zoom: number; rotation: number }) => <div data-testid="scene" data-zoom={zoom} data-rotation={rotation}>Peta tersedia</div> }));
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
  const view = render(<FacilityMap ov={ov} selected={null} onSelect={select} onOpenCase={openCase} onOpenUnit={openUnit} />);
  expect(screen.queryByText('Unit terpilih')).toBeNull();
  fireEvent.click(screen.getByText('Pilih dari daftar unit'));
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
  fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
  expect(select).toHaveBeenCalledWith(null);
});

it('zooms relative to the fitted view and resets the selection', async () => {
  const pump: Pump = { id: 'Pump-01', name: 'Press', location: 'Produksi', model: 'HPU', criticality: 'tinggi', status: { state: 'normal' }, open_work_orders: 0, open_case: null };
  const ov: Overview = { pumps: [pump], auto: false, llm_available: false, llm_model: null, db: 'test', tick_seconds: 3, simulator: false, ml: { ok: true }, fault_labels: {} };
  const select = vi.fn();
  render(<FacilityMap ov={ov} updated={1700000000000} selected="Pump-01" onSelect={select} onOpenCase={() => {}} onOpenUnit={() => {}} />);
  expect(screen.getByLabelText('Ringkasan kondisi').textContent).toContain('0 kritis · 0 waspada · 1 normal');
  expect(screen.getByText('Pembaruan terakhir:').querySelector('time')?.dateTime).toBe(new Date(1700000000000).toISOString());
  const scene = await screen.findByTestId('scene');
  expect(scene.getAttribute('data-zoom')).toBe('2');
  fireEvent.click(screen.getByRole('button', { name: 'Perbesar peta' }));
  expect(Number(scene.getAttribute('data-zoom'))).toBeGreaterThan(2);
  fireEvent.click(screen.getByRole('button', { name: 'Putar peta ke kanan 90 derajat' }));
  expect(scene.getAttribute('data-rotation')).toBe('1');
  expect(screen.getByText('Arah tampilan 90 derajat.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(scene.getAttribute('data-zoom')).toBe('1');
  expect(scene.getAttribute('data-rotation')).toBe('0');
  expect(select).toHaveBeenCalledWith(null);
});
