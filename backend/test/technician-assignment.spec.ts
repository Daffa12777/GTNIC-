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

let app: INestApplication, db: DbService, supervisor: string, technician: string;
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
});
beforeEach(async () => {
  availability = await db.client.technician.findMany({ select: { id: true, available: true } });
  await db.client.technician.createMany({ data: [
    { id: `${prefix}-A`, name: 'Teknisi A', skill: 'mekanik', level: 'junior', available: true },
    { id: `${prefix}-B`, name: 'Teknisi B', skill: 'mekanik', level: 'senior', available: true },
    { id: `${prefix}-E`, name: 'Teknisi E', skill: 'listrik', level: 'senior', available: true },
  ] });
});
afterEach(async () => {
  await db.client.agentLog.deleteMany({ where: { step: 'manual_assignment', input: { contains: prefix } } });
  await db.client.workOrder.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.client.maintenanceCase.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.client.pump.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.client.technician.deleteMany({ where: { id: { startsWith: prefix } } });
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
