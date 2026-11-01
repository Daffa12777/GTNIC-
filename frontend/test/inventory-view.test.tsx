import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Inventory from '../src/components/Inventory';
import { api } from '../src/api';
import { queryClient } from '../src/queryClient';

afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); });
it('marks low stock only when a minimum is available and does not duplicate notifications', async () => {
  vi.spyOn(api, 'inventory').mockResolvedValue([
    { part_id: 'A', name: 'Seal', location: 'A', stock: 2, min_stock: 2 },
    { part_id: 'B', name: 'Valve', location: 'B', stock: 3, min_stock: 1 },
    { part_id: 'C', name: 'Cooler', location: 'C', stock: 0, min_stock: 1 },
  ]);
  vi.spyOn(api, 'technicians').mockResolvedValue([]);
  vi.spyOn(api, 'purchases').mockResolvedValue([]);
  const notifications = vi.spyOn(api, 'notifications');
  render(<Inventory role="teknisi" />);
  const low = (await screen.findByText('Seal')).closest('tr')!;
  expect(within(low).getByText('Stok menipis')).toBeTruthy();
  expect(within(screen.getByText('Cooler').closest('tr')!).getByText('Kosong')).toBeTruthy();
  expect(within(screen.getByText('Valve').closest('tr')!).queryByText('Stok menipis')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Notifikasi' })).toBeNull();
  expect(notifications).not.toHaveBeenCalled();
});
