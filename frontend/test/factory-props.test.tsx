import { expect, it } from 'vitest';
import { factoryPlacements } from '../src/components/FactoryProps';

it('keeps static decoration inside the slab and clear of pads and aisles', () => {
  const keepOut = [{ x: -3.6, z: 0, w: 2.9, d: 3.1 }, { x: 0, z: 0, w: 0.8, d: 10.4 }];
  const placements = factoryPlacements(14, 10.4, keepOut);
  expect(placements.length).toBeGreaterThan(0);
  expect(factoryPlacements(14, 10.4, keepOut)).toEqual(placements);
  for (const [index, p] of placements.entries()) {
    expect(Math.abs(p.x) + p.size).toBeLessThanOrEqual(7);
    expect(Math.abs(p.z) + p.size).toBeLessThanOrEqual(5.2);
    for (const r of keepOut) expect(Math.abs(p.x - r.x) >= r.w / 2 + p.size + 0.1 || Math.abs(p.z - r.z) >= r.d / 2 + p.size + 0.1).toBe(true);
    for (const other of placements.slice(index + 1)) expect(Math.abs(p.x - other.x) >= p.size + other.size || Math.abs(p.z - other.z) >= p.size + other.size).toBe(true);
  }
});
