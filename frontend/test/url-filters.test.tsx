import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useUrlFilters } from '../src/useUrlFilters';
import { useNavigation } from '../src/navigation';

afterEach(() => window.history.replaceState(null, '', '/'));
function View() {
  const route = useNavigation();
  const [filters, change] = useUrlFilters({ q: '', status: '', page: 1, pageSize: 20 });
  return <><output>{JSON.stringify(filters)}</output><span>{route.caseId}</span>
    <button onClick={() => change({ status: 'selesai', page: 1 })}>Filter</button>
    <button onClick={() => change({ page: 2 })}>Next</button>
    <button onClick={() => route.navigate('kasus', 'C-1')}>Detail</button>
    <button onClick={() => route.navigate('tampilan3d', 'Pump-02')}>3D</button>
    <span data-testid="tab">{route.tab}:{route.pumpId}</span>
  </>;
}
it('restores shared URL filters, keeps them on details and follows Back', async () => {
  window.history.replaceState(null, '', '/cases?q=pump&page=3&pageSize=50');
  const view = render(<View />);
  expect(screen.getByRole('status').textContent).toContain('"page":3');
  fireEvent.click(screen.getByText('Filter'));
  expect(window.location.search).toContain('status=selesai');
  expect(window.location.search).not.toContain('page=');
  fireEvent.click(screen.getByText('Next'));
  expect(window.location.search).toContain('page=2');
  act(() => window.history.back());
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('"page":1'));
  fireEvent.click(screen.getByText('Detail'));
  expect(window.location.pathname).toBe('/cases/C-1');
  expect(window.location.search).toContain('q=pump');
  view.unmount();
  render(<View />);
  expect(screen.getByRole('status').textContent).toContain('"status":"selesai"');
});

it('opens a unit in the 3D page and restores it from the URL', () => {
  const view = render(<View />);
  fireEvent.click(screen.getByText('3D'));
  expect(window.location.pathname).toBe('/3d/Pump-02');
  expect(screen.getByTestId('tab').textContent).toBe('tampilan3d:Pump-02');
  view.unmount();
  render(<View />);
  expect(screen.getByTestId('tab').textContent).toBe('tampilan3d:Pump-02');
});

it('normalizes invalid pagination values without passing them into API requests', () => {
  window.history.replaceState(null, '', '/cases?page=-5&pageSize=999');
  render(<View />);
  expect(screen.getByRole('status').textContent).toContain('"page":1');
  expect(screen.getByRole('status').textContent).toContain('"pageSize":20');
});
