import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const database = await PGlite.create();
const directory = resolve('prisma/migrations');
for (const folder of (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  await database.exec(await readFile(resolve(directory, folder.name, 'migration.sql'), 'utf8'));
}
const server = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 0, maxConnections: 10 });
await server.start();
process.send?.({ url: `postgresql://postgres:postgres@${server.getServerConn()}/postgres` });
process.on('message', async (message: unknown) => {
  if (message === 'stop') { await server.stop(); await database.close(); process.exit(0); }
});
