import 'reflect-metadata';
import { MonitorService } from '../src/monitor/monitor.service';
import { StatusStore } from '../src/monitor/status.store';
import { CONFIG } from '../src/config';

afterEach(() => jest.restoreAllMocks());
it('keeps remote ML off the startup path when the simulator is disabled', async () => {
  const previous = CONFIG.SIM_ENABLED; CONFIG.SIM_ENABLED = false;
  const db = { q: jest.fn().mockResolvedValue([{ id: 'Pump-01' }]) };
  const sim = { init: jest.fn().mockResolvedValue(undefined) }, rag = { build: jest.fn().mockResolvedValue(1) };
  const monitor = new MonitorService(db as never, sim as never, {} as never, {} as never, {} as never, rag as never, new StatusStore());
  const refresh = jest.spyOn(monitor, 'refreshStatus');
  try {
    await monitor.onApplicationBootstrap();
    expect(sim.init).toHaveBeenCalledWith(['Pump-01']);
    expect(rag.build).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  } finally { CONFIG.SIM_ENABLED = previous; monitor.onModuleDestroy(); }
});

it('shares concurrent refreshes and bounds prediction concurrency to three machines', async () => {
  const db = { q: jest.fn().mockResolvedValue(Array.from({ length: 7 }, (_, i) => ({ id: `Pump-${i}` }))) };
  const status = new StatusStore();
  const monitor = new MonitorService(db as never, {} as never, {} as never, {} as never, {} as never, {} as never, status);
  let active = 0, peak = 0;
  const compute = jest.spyOn(monitor, 'computeStatus').mockImplementation(async () => {
    peak = Math.max(peak, ++active);
    await new Promise<void>(resolve => setImmediate(resolve)); active--;
    return { state: 'normal' };
  });
  await Promise.all([monitor.refreshStatus(), monitor.refreshStatus()]);
  expect(db.q).toHaveBeenCalledTimes(1);
  expect(compute).toHaveBeenCalledTimes(7);
  expect(peak).toBe(3);
  expect(Object.keys(status.map)).toHaveLength(7);
  await monitor.refreshStatus();
  expect(db.q).toHaveBeenCalledTimes(2);
});
