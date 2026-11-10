import 'reflect-metadata';
import { DbService } from '../db/db.service';
import { setupFirstOwner } from '../auth/owner-bootstrap';

async function main() {
  const username = process.argv[2]?.trim();
  if (!username || !/^[a-zA-Z0-9_.-]{3,100}$/.test(username)) throw new Error('Berikan username supervisor untuk Owner pertama.');
  const db = new DbService();
  try {
    await db.prisma.$connect();
    console.log(JSON.stringify(await setupFirstOwner(db, username)));
  } finally { await db.onModuleDestroy(); }
}
void main().catch(() => { console.error('Setup Owner gagal. Periksa username supervisor, migrasi, dan koneksi database. Setup hanya berlaku sebelum Owner pertama tersedia.'); process.exitCode = 1; });
