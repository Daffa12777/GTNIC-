import { randomBytes, scryptSync } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ROOT } from '../config';

const path = join(ROOT, '.env');
if (!existsSync(path)) throw new Error('Buat backend/.env dan isi DATABASE_URL terlebih dahulu.');
let content = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
const credentials: { username: string; password: string; role: string }[] = [];
function set(key: string, value: string) {
  const pattern = new RegExp(`^\\s*${key}=.*$`, 'm');
  content = pattern.test(content) ? content.replace(pattern, `${key}=${value}`) : `${content.trimEnd()}\n${key}=${value}\n`;
}
if (!process.env.JWT_SECRET) set('JWT_SECRET', randomBytes(48).toString('hex'));
for (const [prefix, role] of [['TECHNICIAN', 'teknisi'], ['SUPERVISOR', 'supervisor']] as const) {
  const username = process.env[`AUTH_${prefix}_USERNAME`] || role;
  set(`AUTH_${prefix}_USERNAME`, username);
  if (!process.env[`AUTH_${prefix}_PASSWORD_HASH`]) {
    const password = randomBytes(24).toString('base64url');
    const salt = randomBytes(16).toString('hex');
    set(`AUTH_${prefix}_PASSWORD_HASH`, `${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
    credentials.push({ username, password, role });
  }
}
set('AUTH_ENABLED', 'true');
set('SEED_DEMO_DATA', process.env.SEED_DEMO_DATA || 'false');
writeFileSync(path, content, { mode: 0o600 });
if (credentials.length) {
  writeFileSync(join(ROOT, '.auth-bootstrap.json'), JSON.stringify({ note: 'Initial development credentials. Keep private. Change passwords through the Profile page after initial bootstrap.', credentials }, null, 2), { mode: 0o600 });
}
console.log('Login JWT diaktifkan di backend/.env. Akun baru (jika ada) disimpan privat di backend/.auth-bootstrap.json. Restart backend untuk membuat akun di PostgreSQL.');
