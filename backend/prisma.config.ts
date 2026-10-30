import { ROOT } from './src/config';
import { join } from 'path';
import { defineConfig } from 'prisma/config';

const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres');
if (url.hostname.endsWith('.supabase.com') || url.hostname.endsWith('.supabase.co')) {
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
  url.searchParams.set('sslcert', join(ROOT, 'certs', 'supabase-ca.crt').replace(/\\/g, '/'));
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: url.toString() },
});
