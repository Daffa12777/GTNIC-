import type { ChildProcess } from 'child_process';

export default async function teardown() {
  const child = (globalThis as typeof globalThis & { gtnicTestDatabase?: ChildProcess }).gtnicTestDatabase;
  if (child) { child.kill(); }
}
