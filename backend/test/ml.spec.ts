import { COMP_KEYS } from '../src/domain';
import { MlService, type MlRaw } from '../src/ml/ml.service';

const raw = (degraded: Partial<Record<typeof COMP_KEYS[number], number>> = {}): MlRaw => ({
  anomaly: { score: -0.4, threshold: -0.5, is_anomaly: false }, source: 'demo_synthetic',
  components: Object.fromEntries(COMP_KEYS.map((k) => [k, {
    level: 100, severity: 0, confidence: 1 - (degraded[k] ?? 0), probs: {}, p_degraded: degraded[k] ?? 0,
  }])),
});
const service = new MlService();

it('keeps normal first when every component is more likely healthy', () => {
  const analysis = service.toAnalysis(raw({ pump: 0.3, valve: 0.3, cooler: 0.3, accumulator: 0.3 }), {});
  expect(analysis.label).toBe('normal');
  expect(analysis.probs.normal).toBeCloseTo(0.3684, 4);
  expect(Object.values(analysis.probs).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
});

it('preserves the marginal probability when only one component can be degraded', () => {
  const analysis = service.toAnalysis(raw({ cooler: 0.9 }), {});
  expect(analysis.label).toBe('cooler');
  expect(analysis.confidence).toBe(0.9);
  expect(analysis.probs.normal).toBe(0.1);
});

it('keeps multiple certain faults available for escalation and high-risk flags', () => {
  const input = raw({ pump: 1, cooler: 1 });
  input.components.pump.severity = 1;
  input.components.pump.confidence = 1;
  const analysis = service.toAnalysis(input, { pump: 'Pompa' });
  expect(analysis.components.pump.p_degraded).toBe(1);
  expect(analysis.components.cooler.p_degraded).toBe(1);
  expect(analysis.flags).toEqual(['Pompa: mendekati gagal total']);
  expect(analysis.probs).toMatchObject({ normal: 0, pump: 0.5, cooler: 0.5 });
});

it('reports fully healthy inputs as normal with full confidence', () => {
  expect(service.toAnalysis(raw(), {})).toMatchObject({ label: 'normal', confidence: 1 });
});

it.each([NaN, Infinity, -0.1, 1.1])('rejects an invalid component probability: %s', (p) => {
  expect(() => service.toAnalysis(raw({ pump: p }), {})).toThrow('Probabilitas ML tidak valid');
});

it('rejects missing component results instead of silently treating them as healthy', () => {
  const input = raw();
  delete input.components.pump;
  expect(() => service.toAnalysis(input, {})).toThrow('Probabilitas ML tidak valid');
});
