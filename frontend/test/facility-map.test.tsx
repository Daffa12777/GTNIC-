import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FacilityMap from '../src/components/FacilityMap';
import type { Pump } from '../src/types';

vi.mock('../src/components/FacilityScene', () => ({ default: () => <div>Peta tersedia</div> }));
afterEach(cleanup);

it('selects an actual unit and keeps its unavailable status and case accessible', () => {
  const pumps: Pump[] = [
    { id: 'Pump-01', name: 'Press', location: 'A', model: 'HPU', criticality: 'tinggi', status: { state: 'normal' }, open_work_orders: 0, open_case: null },
    { id: 'Pump-02', name: 'Injeksi', location: 'B', model: 'HPU', criticality: 'tinggi', status: { state: 'ml_error' }, open_work_orders: 2, open_case: 'C-002' },
  ];
  const select = vi.fn();
  const openCase = vi.fn();
  const view = render(<FacilityMap pumps={pumps} selected="Pump-01" onSelect={select} onOpenCase={openCase} />);
  fireEvent.click(screen.getByRole('button', { name: 'Buka peta 3D' }));
  const list = screen.getByLabelText('Pilih unit pada peta');
  fireEvent.click(within(list).getByRole('button', { name: /Pump-02/ }));
  expect(select).toHaveBeenCalledWith('Pump-02');
  view.rerender(<FacilityMap pumps={pumps} selected="Pump-02" onSelect={select} onOpenCase={openCase} />);
  expect(within(list).getByRole('button', { name: /Pump-02/ }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('2 work order terbuka · Kasus C-002')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Buka kasus' }));
  expect(openCase).toHaveBeenCalledWith('C-002');
});
