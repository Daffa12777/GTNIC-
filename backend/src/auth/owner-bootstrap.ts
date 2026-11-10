import { DbService } from '../db/db.service';
import { now } from '../domain';

export async function setupFirstOwner(db: DbService, username: string) {
  return db.transaction(async () => {
    await db.q("SELECT pg_advisory_xact_lock(hashtext('manualmechanic-user-bootstrap'))::text");
    const user = await db.client.user.findUnique({ where: { username } });
    if (!user?.active) throw new Error('Pilih akun supervisor aktif yang sudah ada.');
    if (user.role === 'owner') return { username, role: 'owner', changed: false };
    if (user.role !== 'supervisor') throw new Error('Owner pertama harus berasal dari akun supervisor.');
    if (await db.client.user.count({ where: { role: 'owner' } })) throw new Error('Owner sudah tersedia. Setup pertama tidak dapat digunakan lagi.');
    await db.client.user.update({ where: { id: user.id }, data: { role: 'owner' } });
    await db.client.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await db.client.agentLog.create({ data: { ts: now(), step: 'account_management', tool: 'setup_first_owner', input: JSON.stringify({ username, previous_role: 'supervisor', actor: 'installation-operator' }), output: JSON.stringify({ role: 'owner' }) } });
    return { username, role: 'owner', changed: true };
  });
}
