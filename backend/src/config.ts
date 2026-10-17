import * as fs from 'fs';
import * as path from 'path';

/** Cari folder backend (yang berisi package.json) dari lokasi file ini, jalan baik di src/ maupun dist/. */
function findRoot(): string {
  let d = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    d = path.dirname(d);
  }
  return process.cwd();
}
export const ROOT = findRoot();

// Baca .env sederhana (tanpa dependensi). Variabel yang sudah ada di environment tidak ditimpa.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

const env = (k: string, d = '') => (process.env[k] ?? d).trim();

export const CONFIG = {
  PORT: Number(env('PORT', '8000')),
  DATABASE_URL: env('DATABASE_URL'),
  ML_URL: env('ML_URL', 'http://127.0.0.1:8100'),
  ML_API_KEY: env('ML_API_KEY'),
  GEMINI_API_KEY: env('GEMINI_API_KEY'),
  GEMINI_MODEL: env('GEMINI_MODEL', 'gemini-2.5-flash'),
  TELEGRAM_BOT_TOKEN: env('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_CHAT_ID: env('TELEGRAM_CHAT_ID'),
  FRONTEND_ORIGIN: env('FRONTEND_ORIGIN', 'http://localhost:5173,http://localhost:8080'),
  TICK_SECONDS: Number(env('TICK_SECONDS', '3')),
  AUTO_AGENT: ['1', 'true', 'yes'].includes(env('AUTO_AGENT', 'true').toLowerCase()),
  SIM_ENABLED: ['1', 'true', 'yes'].includes(env('SIM_ENABLED', 'true').toLowerCase()),
  DEMO_SCENARIO: ['1', 'true', 'yes'].includes(env('DEMO_SCENARIO', 'false').toLowerCase()),
  SCENARIO_CONTROLS_ENABLED: ['1', 'true', 'yes'].includes(env('SCENARIO_CONTROLS_ENABLED', process.env.NODE_ENV === 'production' ? 'false' : 'true').toLowerCase()),
  KNOWLEDGE_DIR: path.join(ROOT, 'knowledge'),
  ASSETS_DIR: env('ASSETS_DIR', path.join(ROOT, 'assets')),
  WINDOW: 30,
  CONF_ACT: 0.8,
  CONF_CONFIRM: 0.5,
};
