import { fork, type ChildProcess } from 'child_process';
import { resolve } from 'path';

export default async function setup() {
  const child = fork(resolve('test/postgres-server.mts'), [], { execArgv: ['--experimental-strip-types'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  (globalThis as typeof globalThis & { gtnicTestDatabase?: ChildProcess }).gtnicTestDatabase = child;
  const url = await new Promise<string>((resolveUrl, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Test database startup timed out')); }, 30000);
    child.once('error', reject);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Test database exited: ${code}`)); });
    child.once('message', (message: unknown) => {
      if (message && typeof message === 'object' && 'url' in message && typeof message.url === 'string') { clearTimeout(timer); resolveUrl(message.url); }
      else reject(new Error('Test database did not provide a URL'));
    });
  });
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  process.env.DB_POOL_MAX = '1';
  process.env.SEED_DEMO_DATA = 'true';
  process.env.AUTH_ENABLED = 'false';
  process.env.TELEGRAM_BOT_TOKEN = '';
  process.env.TELEGRAM_CHAT_ID = '';
}
