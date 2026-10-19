import { useEffect, useState } from 'react';
import { LOCATION_CHANGED, writeLocation } from './location';

type Filters = Record<string, string | number>;
export function readFilters<T extends Filters>(defaults: T): T {
  const values = { ...defaults };
  const params = new URLSearchParams(window.location.search);
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const raw = params.get(key);
    if (raw === null) continue;
    const value = typeof defaults[key] === 'number'
      ? (key === 'pageSize' ? [10, 20, 50].includes(Number(raw)) : /^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 100000) ? Number(raw) : defaults[key]
      : raw.slice(0, 160);
    values[key] = value as T[typeof key];
  }
  return values;
}

/** URL is the source of truth for Back/Forward, refresh, and shareable filters. */
export function useUrlFilters<T extends Filters>(defaults: T): [T, (patch: Partial<T>, replace?: boolean) => void] {
  const [filters, setFilters] = useState(() => readFilters(defaults));
  const signature = JSON.stringify(defaults);
  useEffect(() => {
    const update = () => setFilters(readFilters(defaults));
    window.addEventListener('popstate', update); window.addEventListener(LOCATION_CHANGED, update);
    return () => { window.removeEventListener('popstate', update); window.removeEventListener(LOCATION_CHANGED, update); };
  }, [signature]);
  const change = (patch: Partial<T>, replace = false) => {
    const values = { ...readFilters(defaults), ...patch };
    const url = new URL(window.location.href);
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      if (values[key] === defaults[key] || values[key] === '') url.searchParams.delete(key);
      else url.searchParams.set(key, String(values[key]));
    }
    writeLocation(url.pathname + url.search + url.hash, replace);
  };
  return [filters, change];
}
