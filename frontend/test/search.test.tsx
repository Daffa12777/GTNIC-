import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDebounced } from '../src/useDebounced';
import SearchField from '../src/components/SearchField';

afterEach(() => vi.useRealTimers());
it('applies only the final search after 300 ms and allows clearing it', () => {
  vi.useFakeTimers();
  function Search() {
    const [value, setValue] = useState(''); const search = useDebounced(value);
    return <><SearchField label="Cari kasus" value={value} onChange={setValue} placeholder="ID" pending={value !== search} /><output>{search || 'Semua hasil'}</output></>;
  }
  render(<Search />);
  fireEvent.change(screen.getByLabelText('Cari kasus'), { target: { value: 'Pump' } });
  act(() => vi.advanceTimersByTime(200));
  fireEvent.change(screen.getByLabelText('Cari kasus'), { target: { value: 'Pump-02' } });
  act(() => vi.advanceTimersByTime(299));
  expect(screen.getByText('Semua hasil')).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText('Pump-02')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Hapus cari kasus'));
  act(() => vi.advanceTimersByTime(300));
  expect(screen.getByText('Semua hasil')).toBeTruthy();
});
