import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DbService } from '../db/db.service';
import { MlService } from '../ml/ml.service';
import { SimService } from '../sim/sim.service';
import { RagService } from '../rag/rag.service';
import { ToolsService } from '../tools/tools.service';

async function main() {
  const db = new DbService();
  const fixture = `verify-${randomUUID()}`;
  try {
    await db.prisma.$connect();
    const tools = new ToolsService(db, new MlService(), new SimService(db), new RagService(db));
    await db.client.pump.create({ data: { id: fixture, name: 'Disposable verification fixture' } });
    await db.client.technician.create({ data: { id: fixture, name: 'Disposable fixture', skill: fixture, available: true } });
    const orders = await Promise.all([0, 1].map(() => tools.create_work_order({ pump_id: fixture, title: fixture, description: fixture, priority: 'rendah' })));
    const [first, second] = orders;
    if (!('id' in first) || !('id' in second) || !first.id || first.id !== second.id) throw new Error('Concurrent work order idempotency failed');
    const orderId = first.id;
    const purchases = await Promise.all([0, 1].map(() => tools.create_purchase_request({ work_order_id: orderId, part_name: fixture, reason: fixture, qty: 1 })));
    if (!('id' in purchases[0]) || !('id' in purchases[1]) || purchases[0].id !== purchases[1].id) throw new Error('Concurrent purchase idempotency failed');
    const schedules = await Promise.all([0, 1].map(() => tools.schedule_technician({ work_order_id: orderId, skill: fixture })));
    if (!schedules.every((value) => value.scheduled && value.technician_id === fixture)) throw new Error('Concurrent scheduling failed');
    try {
      await db.transaction(async () => {
        await db.client.inventory.create({ data: { part_id: fixture, stock: 1 } });
        throw new Error('ROLLBACK_FIXTURE');
      });
    } catch (error: unknown) { if (!(error instanceof Error) || error.message !== 'ROLLBACK_FIXTURE') throw error; }
    if (await db.client.inventory.findUnique({ where: { part_id: fixture } })) throw new Error('Rollback failed');
    const unprotected = await db.q<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity");
    if (unprotected.length) throw new Error('RLS missing on public tables');
    console.log(JSON.stringify({ verified: true, concurrentWorkOrders: true, concurrentPurchases: true, concurrentScheduling: true, rollback: true, publicTablesProtected: true }));
  } catch (error: unknown) {
    console.error(error instanceof Error && !('code' in error) ? error.message : 'Database verification failed; credentials omitted.');
    process.exitCode = 1;
  } finally {
    await db.transaction(async () => {
      await db.client.purchaseRequest.deleteMany({ where: { workOrder: { pump_id: fixture } } });
      await db.client.workOrder.deleteMany({ where: { pump_id: fixture } });
      await db.client.technician.deleteMany({ where: { id: fixture } });
      await db.client.pump.deleteMany({ where: { id: fixture } });
    });
    await db.onModuleDestroy();
  }
}
void main();
