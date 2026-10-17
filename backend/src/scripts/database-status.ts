import 'reflect-metadata';
import { DbService } from '../db/db.service';

async function main() {
  const db = new DbService();
  try {
    await db.prisma.$connect();
    await db.q('SELECT 1 AS ready');
    const tables = await db.q<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    const profileColumns = await db.q<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='app_users' AND column_name IN ('name', 'email') ORDER BY column_name");
    const uniqueEmail = await db.one<{ ready: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='app_users' AND indexname='app_users_email_key' AND indexdef LIKE 'CREATE UNIQUE INDEX%') AS ready");
    console.log(JSON.stringify({ connected: true, tables: tables.map((table) => table.table_name), profileColumns: profileColumns.map((column) => column.column_name), uniqueEmail: uniqueEmail?.ready }));
  } catch (error: unknown) {
    const safe = error && typeof error === 'object' && 'meta' in error ? error.meta as { driverAdapterError?: { cause?: { kind?: string; reason?: string } } } : undefined;
    console.error(JSON.stringify({ connected: false, code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'CONNECTION_FAILED', cause: safe?.driverAdapterError?.cause?.kind, reason: safe?.driverAdapterError?.cause?.reason }));
    process.exitCode = 1;
  } finally { await db.onModuleDestroy(); }
}
void main();
