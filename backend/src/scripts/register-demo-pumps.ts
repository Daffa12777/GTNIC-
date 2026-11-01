import 'reflect-metadata';
import { DbService } from '../db/db.service';
import { ADDITIONAL_DEMO_PUMPS } from '../db/additional-demo-pumps';

async function main() {
  const db = new DbService();
  try {
    await db.prisma.$connect();
    const result = await db.prisma.pump.createMany({ data: ADDITIONAL_DEMO_PUMPS, skipDuplicates: true });
    const pumps = await db.prisma.pump.findMany({ where: { id: { in: ADDITIONAL_DEMO_PUMPS.map((pump) => pump.id) } }, orderBy: { id: 'asc' } });
    console.log(JSON.stringify({ added: result.count, pumps, next: 'Restart backend agar simulator dan pemantauan memuat unit baru.' }, null, 2));
  } finally { await db.onModuleDestroy(); }
}

void main().catch(() => { console.error('Pendaftaran mesin gagal. Periksa koneksi DATABASE_URL dan coba lagi.'); process.exitCode = 1; });
