import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomBytes, scryptSync } from 'crypto';
import request from 'supertest';
import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { AuthModule } from '../src/auth/auth.module';
import { WorkOrderAssignmentController } from '../src/api/work-order-assignment.controller';
import { RecordsController } from '../src/api/records.controller';
import { ToolsService } from '../src/tools/tools.service';
import { MlService } from '../src/ml/ml.service';
import { SimService } from '../src/sim/sim.service';
import { RagService } from '../src/rag/rag.service';
import { setupFirstOwner } from '../src/auth/owner-bootstrap';

let app: INestApplication, db: DbService, supervisor: string, technician: string, owner: string;
const password = randomBytes(20).toString('hex'), prefix = 'assignment-test';
const keys = ['AUTH_ENABLED', 'JWT_SECRET', 'AUTH_TECHNICIAN_USERNAME', 'AUTH_TECHNICIAN_PASSWORD_HASH', 'AUTH_SUPERVISOR_USERNAME', 'AUTH_SUPERVISOR_PASSWORD_HASH'];
const previous = keys.map(key => process.env[key]);
let availability: { id: string; available: boolean | null }[] = [];
const api = () => request(app.getHttpServer());
const send = (id: string, body: object, cookie = supervisor) => api().post(`/api/work-orders/${id}/assign`).set('x-mm-client', 'web').set('Cookie', cookie).send(body);
const cookies = (headers: Record<string, unknown>) => [...new Map((headers['set-cookie'] as string[]).map(line => { const value = line.split(';')[0], at = value.indexOf('='); return [value.slice(0, at), value.slice(at + 1)] as const; })).entries()].map(([k, v]) => `${k}=${v}`).join('; ');
async function order(suffix: string, risk = 'sedang', fault = 'pump') {
  const id = `${prefix}-${suffix}`;
  await db.client.pump.create({ data: { id } });
  await db.client.maintenanceCase.create({ data: { id, pump_id: id, fault, risk, status: 'disetujui_dijalankan', state: { pump_id: id, plan: { fault, risk } } } });
  await db.client.workOrder.create({ data: { id, pump_id: id, case_id: id, title: `Perbaikan ${suffix}`, priority: risk, status: 'terbuka' } });
  return id;
}
beforeAll(async () => {
  process.env.AUTH_ENABLED = 'true'; process.env.JWT_SECRET = randomBytes(48).toString('hex');
  for (const role of ['TECHNICIAN', 'SUPERVISOR']) {
    const salt = randomBytes(16).toString('hex');
    process.env[`AUTH_${role}_USERNAME`] = `${prefix}-${role.toLowerCase()}`;
    process.env[`AUTH_${role}_PASSWORD_HASH`] = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  }
  const testModule = await Test.createTestingModule({ imports: [DbModule, AuthModule], controllers: [WorkOrderAssignmentController, RecordsController], providers: [ToolsService, MlService, SimService, RagService] }).compile();
  app = testModule.createNestApplication(); app.setGlobalPrefix('api'); await app.init(); db = app.get(DbService);
  // Bootstrap intentionally skips nonempty installations; create only this suite's accounts.
  for (const [key, role] of [['TECHNICIAN', 'teknisi'], ['SUPERVISOR', 'supervisor']] as const) {
    const username = `${prefix}-${key.toLowerCase()}`, passwordHash = process.env[`AUTH_${key}_PASSWORD_HASH`]!;
    await db.client.user.upsert({ where: { username }, create: { username, passwordHash, role }, update: { passwordHash, role, active: true } });
  }
  supervisor = cookies((await api().post('/api/auth/login').set('x-mm-client', 'web').send({ username: `${prefix}-supervisor`, password }).expect(201)).headers);
  technician = cookies((await api().post('/api/auth/login').set('x-mm-client', 'web').send({ username: `${prefix}-technician`, password }).expect(201)).headers);
  await db.client.user.create({ data: { username: `${prefix}-owner`, passwordHash: process.env.AUTH_SUPERVISOR_PASSWORD_HASH!, role: 'supervisor' } });
  await setupFirstOwner(db, `${prefix}-owner`);
  owner = cookies((await api().post('/api/auth/login').set('x-mm-client', 'web').send({ username: `${prefix}-owner`, password }).expect(201)).headers);
});
beforeEach(async () => {
  availability = await db.client.technician.findMany({ select: { id: true, available: true } });
  await db.client.technician.createMany({ data: [
    { id: `${prefix}-A`, name: 'Teknisi A', skill: 'mekanik', level: 'junior', available: true },
    { id: `${prefix}-B`, name: 'Teknisi B', skill: 'mekanik', level: 'senior', available: true },
    { id: `${prefix}-E`, name: 'Teknisi E', skill: 'listrik', level: 'senior', available: true },
  ] });
  for (const suffix of ['A', 'B', 'E']) {
    const user = await db.client.user.create({ data: { username: `${prefix}-profile-${suffix}`, role: 'teknisi', passwordHash: process.env.AUTH_TECHNICIAN_PASSWORD_HASH! } });
    await db.client.technician.update({ where: { id: `${prefix}-${suffix}` }, data: { userId: user.id } });
  }
});
afterEach(async () => {
  await db.client.agentLog.deleteMany({ where: { step: 'manual_assignment', input: { contains: prefix } } });
  await db.client.agentLog.deleteMany({ where: { step: 'account_management', input: { contains: prefix }, tool: { not: 'setup_first_owner' } } });
  await db.client.workOrder.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.client.maintenanceCase.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.client.pump.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.client.technician.deleteMany({ where: { OR: [{ id: { startsWith: prefix } }, { user: { username: { startsWith: `${prefix}-new` } } }] } });
  await db.client.user.deleteMany({ where: { OR: [{ username: { startsWith: `${prefix}-profile-` } }, { username: { startsWith: `${prefix}-new` } }] } });
  for (const t of availability) await db.client.technician.update({ where: { id: t.id }, data: { available: t.available } });
});
afterAll(async () => {
  await db.client.user.deleteMany({ where: { username: { startsWith: prefix } } }); await app.close();
  keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
});

it('requires a real supervisor session and rejects forged roles and malformed assignment input', async () => {
  const id = await order('auth');
  await api().post(`/api/work-orders/${id}/assign`).set('x-mm-client', 'web').set('x-role', 'supervisor').send({ expected_technician_id: null }).expect(401);
  await send(id, { expected_technician_id: null }, technician).set('x-role', 'supervisor').expect(403);
  await api().get(`/api/work-orders/${id}/assignment`).set('Cookie', technician).expect(403);
  await send(id, {}).expect(400);
  await send(id, { expected_technician_id: null, approved: true }).expect(400);
});

it('allows only a supervisor to create a linked technician account and forbids role escalation', async () => {
  const body = { username: `${prefix}-new`, name: 'Teknisi Baru', password, skill: 'mekanik', level: 'junior' };
  await api().post('/api/technicians').set('x-mm-client', 'web').set('x-role', 'supervisor').send(body).expect(401);
  await api().post('/api/technicians').set('x-mm-client', 'web').set('Cookie', technician).set('x-role', 'supervisor').send(body).expect(403);
  await api().post('/api/technicians').set('x-mm-client', 'web').set('Cookie', supervisor).send({ ...body, role: 'supervisor' }).expect(400);
  const created = await api().post('/api/technicians').set('x-mm-client', 'web').set('Cookie', supervisor).send(body).expect(201);
  expect(created.body).toMatchObject({ name: body.name, skill: 'mekanik', level: 'junior', user: { username: body.username, role: 'teknisi' } });
  expect(JSON.stringify(created.body)).not.toContain('password');
  const user = await db.client.user.findUniqueOrThrow({ where: { username: body.username } });
  expect(user.passwordHash).not.toBe(password);
  const login = await api().post('/api/auth/login').set('x-mm-client', 'web').send({ username: body.username, password }).expect(201);
  expect(login.body.user.role).toBe('teknisi');
  await api().post('/api/technicians').set('x-mm-client', 'web').set('Cookie', supervisor).send(body).expect(409);
});

it('links an existing account explicitly and cannot link a supervisor or steal an account', async () => {
  await db.client.technician.update({ where: { id: `${prefix}-A` }, data: { userId: null } });
  const path = `/api/technicians/${prefix}-A/account`;
  await api().post(path).set('Cookie', supervisor).set('x-mm-client', 'web').send({ username: `${prefix}-supervisor` }).expect(400);
  await api().post(path).set('Cookie', supervisor).set('x-mm-client', 'web').send({ username: `${prefix}-technician` }).expect(201);
  await api().post(`/api/technicians/${prefix}-B/account`).set('Cookie', supervisor).set('x-mm-client', 'web').send({ username: `${prefix}-technician` }).expect(409);
  const mine = await order('mine'), other = await order('other');
  await db.client.workOrder.update({ where: { id: mine }, data: { technician_id: `${prefix}-A` } });
  await db.client.workOrder.update({ where: { id: other }, data: { technician_id: `${prefix}-B` } });
  const rows = await api().get('/api/records/work-orders').set('Cookie', technician).query({ mine: 'true', technician: `${prefix}-B`, q: prefix }).expect(200);
  expect(rows.body.items.map((item: { id: string }) => item.id)).toEqual([mine]);
  await api().get('/api/technicians/manage').set('Cookie', technician).expect(403);
});

it('only allows Owner to create or deactivate supervisors and protects the last Owner', async () => {
  const body = { username: `${prefix}-new-supervisor`, name: 'Supervisor Baru', password };
  await api().post('/api/technicians/supervisors').set('Cookie', supervisor).set('x-mm-client', 'web').set('x-role', 'owner').send(body).expect(403);
  await api().post('/api/technicians/supervisors').set('Cookie', owner).set('x-mm-client', 'web').send({ ...body, role: 'owner' }).expect(400);
  const response = await api().post('/api/technicians/supervisors').set('Cookie', owner).set('x-mm-client', 'web').send(body).expect(201);
  expect(response.body).toMatchObject({ username: body.username, role: 'supervisor', active: true });
  const session = cookies((await api().post('/api/auth/login').set('x-mm-client', 'web').send({ username: body.username, password }).expect(201)).headers);
  const id = await order('owner');
  await send(id, { technician_id: `${prefix}-A`, expected_technician_id: null }, owner).expect(201);
  await api().post(`/api/technicians/supervisors/${body.username}/deactivate`).set('Cookie', owner).set('x-mm-client', 'web').send({}).expect(201);
  await api().get('/api/technicians/manage').set('Cookie', session).expect(401);
  await api().post(`/api/technicians/supervisors/${prefix}-owner/deactivate`).set('Cookie', owner).set('x-mm-client', 'web').send({}).expect(400);
  await api().post('/api/profile/delete').set('Cookie', owner).set('x-mm-client', 'web').send({ currentPassword: password }).expect(409);
  await expect(setupFirstOwner(db, `${prefix}-supervisor`)).rejects.toThrow('Owner sudah tersedia');
});

it('filters supervisor assignment tasks to active unassigned work orders', async () => {
  const active = await order('queue-active'), closed = await order('queue-closed'), assigned = await order('queue-assigned');
  await db.client.workOrder.update({ where: { id: closed }, data: { status: 'selesai' } });
  await db.client.workOrder.update({ where: { id: assigned }, data: { status: 'terjadwal', technician_id: `${prefix}-A` } });
  const response = await api().get('/api/records/work-orders').set('Cookie', supervisor).query({ status: 'group:active', technician: 'unassigned', q: prefix, pageSize: 5 }).expect(200);
  expect(response.body.total).toBe(1);
  expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([active]);
});

it('assigns manually, reserves availability, audits the actor and rejects a stale repeat', async () => {
  const id = await order('manual');
  const result = await send(id, { technician_id: `${prefix}-A`, expected_technician_id: null }).expect(201);
  expect(result.body).toMatchObject({ scheduled: true, technician_id: `${prefix}-A` });
  expect(await db.client.workOrder.findUnique({ where: { id } })).toMatchObject({ status: 'terjadwal', technician_id: `${prefix}-A` });
  expect(await db.client.technician.findUnique({ where: { id: `${prefix}-A` } })).toMatchObject({ available: false });
  const audit = await db.client.agentLog.findFirst({ where: { step: 'manual_assignment', input: { contains: id } } });
  expect(JSON.parse(audit!.input!).actor).toBe(`${prefix}-supervisor`);
  await send(id, { technician_id: `${prefix}-B`, expected_technician_id: null }).expect(409);
});

it('keeps the old assignment after failure and frees its slot only after successful reassignment', async () => {
  const id = await order('change'), busy = await order('busy');
  await send(id, { technician_id: `${prefix}-A`, expected_technician_id: null }).expect(201);
  await db.client.workOrder.update({ where: { id: busy }, data: { technician_id: `${prefix}-B`, status: 'terjadwal' } });
  const failed = await send(id, { technician_id: `${prefix}-B`, expected_technician_id: `${prefix}-A` }).expect(409);
  expect(failed.body.detail).toContain('sibuk');
  expect(await db.client.workOrder.findUnique({ where: { id } })).toMatchObject({ technician_id: `${prefix}-A` });
  await db.client.workOrder.update({ where: { id: busy }, data: { status: 'selesai' } });
  await send(id, { technician_id: `${prefix}-B`, expected_technician_id: `${prefix}-A` }).expect(201);
  expect(await db.client.technician.findUnique({ where: { id: `${prefix}-A` } })).toMatchObject({ available: true });
  expect(await db.client.technician.findUnique({ where: { id: `${prefix}-B` } })).toMatchObject({ available: false });
});

it('explains incompatible skill and seniority and refuses a closed work order', async () => {
  const id = await order('senior', 'tinggi');
  const options = await api().get(`/api/work-orders/${id}/assignment`).set('Cookie', supervisor).expect(200);
  expect(options.body.requirements).toEqual({ skill: 'mekanik', senior: true });
  expect(options.body.technicians.find((t: { id: string }) => t.id === `${prefix}-A`)).toMatchObject({ eligible: false, reason: expect.stringContaining('senior') });
  expect((await send(id, { technician_id: `${prefix}-A`, expected_technician_id: null }).expect(409)).body.detail).toContain('senior');
  expect((await send(id, { technician_id: `${prefix}-E`, expected_technician_id: null }).expect(409)).body.detail).toContain('keahlian mekanik');
  await db.client.workOrder.update({ where: { id }, data: { status: 'selesai' } });
  await send(id, { technician_id: `${prefix}-B`, expected_technician_id: null }).expect(409);
});

it('refuses dummy profiles and profiles with an inactive login account', async () => {
  const id = await order('account-required');
  await db.client.technician.update({ where: { id: `${prefix}-A` }, data: { userId: null } });
  expect((await send(id, { technician_id: `${prefix}-A`, expected_technician_id: null }).expect(409)).body.detail).toContain('akun teknisi aktif');
  await db.client.user.update({ where: { username: `${prefix}-profile-B` }, data: { active: false } });
  expect((await send(id, { technician_id: `${prefix}-B`, expected_technician_id: null }).expect(409)).body.detail).toContain('akun teknisi aktif');
  expect((await db.client.workOrder.findUniqueOrThrow({ where: { id } })).technician_id).toBeNull();
});

it('explains why an unassigned order cannot be automatically assigned', async () => {
  const id = await order('unavailable');
  await db.client.technician.updateMany({ data: { available: false } });
  const rows = await api().get(`/api/records/work-orders?unit=${id}`).set('Cookie', supervisor).expect(200);
  expect(rows.body.items[0].assignment_reason).toContain('sibuk atau tidak tersedia');
  expect((await send(id, { expected_technician_id: null }).expect(409)).body.detail).toContain('Tidak ada teknisi mekanik');
});

it('automatically selects an eligible technician and serializes competing manual requests', async () => {
  const auto = await order('auto');
  const selected = await send(auto, { expected_technician_id: null }).expect(201);
  expect(selected.body.technician_id).toBeTruthy();
  const a = await order('race-a'), b = await order('race-b');
  const target = selected.body.technician_id === `${prefix}-A` ? `${prefix}-B` : `${prefix}-A`;
  const results = await Promise.all([a, b].map(id => send(id, { technician_id: target, expected_technician_id: null })));
  expect(results.map(r => r.status).sort()).toEqual([201, 409]);
  expect(await db.client.workOrder.count({ where: { technician_id: target, status: 'terjadwal' } })).toBe(1);
});
