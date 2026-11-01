import 'reflect-metadata';
import { DbService } from '../src/db/db.service';
import { ADDITIONAL_DEMO_PUMPS } from '../src/db/additional-demo-pumps';

it('registers both units without duplicating or overwriting existing machines', async () => {
  const db = new DbService();
  try {
    await db.prisma.$connect();
    const existing = await db.prisma.pump.findMany({ where: { id: { in: ADDITIONAL_DEMO_PUMPS.map((pump) => pump.id) } } });
    const added = await db.prisma.pump.createMany({ data: ADDITIONAL_DEMO_PUMPS, skipDuplicates: true });
    expect(added.count).toBe(2 - existing.length);
    expect((await db.prisma.pump.createMany({ data: ADDITIONAL_DEMO_PUMPS, skipDuplicates: true })).count).toBe(0);
    for (const pump of existing) expect(await db.prisma.pump.findUniqueOrThrow({ where: { id: pump.id } })).toEqual(pump);
    expect(await db.prisma.pump.count({ where: { id: { in: ADDITIONAL_DEMO_PUMPS.map((pump) => pump.id) } } })).toBe(2);
  } finally { await db.onModuleDestroy(); }
});
