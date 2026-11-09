import { runtimeDatabaseUrl } from '../src/db/connection-url';

it('uses transaction pooling on Vercel while preserving the host, credentials, database and parameters', () => {
  const value = 'postgresql://postgres.demo:p%40ss@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require';
  const result = runtimeDatabaseUrl(value, true), original = new URL(value);
  expect(result.port).toBe('6543');
  expect(result.hostname).toBe(original.hostname);
  expect(result.username).toBe(original.username);
  expect(result.password).toBe(original.password);
  expect(result.pathname).toBe(original.pathname);
  expect(result.search).toBe(original.search);
  expect(runtimeDatabaseUrl(value, false).port).toBe('5432');
});

it('preserves direct connections, other providers and explicit transaction pooling', () => {
  for (const value of ['postgresql://u:p@db.demo.supabase.co:5432/postgres', 'postgresql://u:p@localhost:5432/test', 'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres']) {
    expect(runtimeDatabaseUrl(value, true).toString()).toBe(new URL(value).toString());
  }
});
