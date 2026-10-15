process.env.PGLITE_MEMORY = '1';
process.env.SIM_ENABLED = 'false';
process.env.AUTO_AGENT = 'false';
process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_MODEL = 'test-model';

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Analysis } from '../src/ml/ml.service';
const { AppModule } = require('../src/app.module');
const { CONFIG } = require('../src/config');
const { ToolsService } = require('../src/tools/tools.service');

let app: INestApplication;
let mlUp = false;
const realFetch = global.fetch;
const SUP = { 'x-role': 'supervisor' };

const api = () => request(app.getHttpServer());
const tick = async (n = 1) => { for (let i = 0; i < n; i++) await api().post('/api/scenario/tick'); };

beforeAll(async () => {
  try { mlUp = (await realFetch(`${CONFIG.ML_URL}/health`)).ok; } catch { mlUp = false; }
  if (!mlUp) throw new Error('Layanan ML wajib aktif untuk tes integrasi. Jalankan ML di ML_URL terlebih dahulu.');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  await app.get(require('../src/monitor/monitor.service').MonitorService).onApplicationBootstrap();
});
afterAll(async () => { global.fetch = realFetch; if (app) await app.close(); });

const run = (name: string, fn: () => Promise<void>) => it(name, fn);

describe('ManualMechanic end-to-end', () => {
  run('health dan overview', async () => {
    expect((await api().get('/api/health')).body.ok).toBe(true);
    const o = (await api().get('/api/overview')).body;
    expect(o.pumps).toHaveLength(4);
    expect(o.ml.ok).toBe(true);
    expect(o.pumps.every((p: any) => p.status.state === 'normal')).toBe(true);
  });

  run('RAG mengembalikan sitasi bagian manual', async () => {
    const r = await app.get(ToolsService).call('search_manual', { query: 'pendingin oli tidak efisien suhu naik' });
    expect(r.results[0].citation).toMatch(/bagian 1\.3|Pendingin/);
  });

  run('guardrail: risiko tinggi tanpa persetujuan ditolak di lapisan tool', async () => {
    const r = await app.get(ToolsService).call('create_work_order', { pump_id: 'Pump-01', title: 'x', description: 'y', priority: 'tinggi', risk: 'tinggi' });
    expect(r.requires_approval).toBe(true);
  });

  run('tingkat menengah: agent bertindak otomatis (WO, jadwal, notifikasi)', async () => {
    await api().post('/api/scenario/fault').send({ pump_id: 'Pump-02', fault: 'cooler', rate: 0.5 });
    await tick(1);
    // Policy assertions use a fixed diagnosis; random UCI cycles can contain multiple faults.
    const spy = jest.spyOn(app.get(ToolsService), 'analyze').mockResolvedValue(fake({ cooler: 0.95, normal: 0.05 }));
    try {
    const c = (await api().post('/api/diagnose').send({ pump_id: 'Pump-02' })).body;
    expect(c.fault).toBe('cooler');
    expect(c.status).toBe('selesai_otomatis');
    expect(c.trace.some((t: any) => t.tool === 'create_work_order')).toBe(true);
    const wos = (await api().get('/api/work-orders')).body;
    expect(wos.some((w: any) => w.pump_id === 'Pump-02' && w.status === 'terjadwal')).toBe(true);
    } finally { spy.mockRestore(); }
  });

  run('tingkat parah: menunggu persetujuan supervisor, lalu dieksekusi', async () => {
    await api().post('/api/scenario/fault').send({ pump_id: 'Pump-03', fault: 'pump', rate: 1 });
    await tick(1);
    const diagnosis = fake({ pump: 0.95, normal: 0.05 });
    diagnosis.components.pump.severity = 1;
    diagnosis.components.pump.confidence = 0.95;
    diagnosis.flags = ['Pompa: mendekati gagal total'];
    const spy = jest.spyOn(app.get(ToolsService), 'analyze').mockResolvedValue(diagnosis);
    try {
    const c = (await api().post('/api/diagnose').send({ pump_id: 'Pump-03' })).body;
    expect(c.risk).toBe('tinggi');
    expect(c.status).toBe('menunggu_persetujuan');
    expect(c.trace.some((t: any) => t.tool === 'create_work_order')).toBe(false);
    const again = (await api().post('/api/diagnose').send({ pump_id: 'Pump-03' })).body;
    expect(again.id).toBe(c.id); // satu kasus terbuka per unit, tidak duplikat
    expect((await api().post(`/api/cases/${c.id}/approve`)).status).toBe(403);
    const ok = (await api().post(`/api/cases/${c.id}/approve`).set(SUP)).body;
    expect(ok.status).toBe('disetujui_dijalankan');
    const wo = (await api().get('/api/work-orders')).body.find((w: any) => w.pump_id === 'Pump-03');
    expect(wo).toBeTruthy();
    await api().post(`/api/work-orders/${wo.id}/complete`).send({ root_cause: ' ', action: '' }).expect(400);
    const completions = await Promise.all([0, 1].map(() => api().post(`/api/work-orders/${wo.id}/complete`).send({ root_cause: 'Seal aus', action: 'Ganti seal kit' })));
    expect(completions.map((r) => r.status).sort()).toEqual([201, 400]);
    const hist = await app.get(ToolsService).call('search_history', { pump_id: 'Pump-03' });
    expect(hist.cases.filter((h: { root_cause: string }) => h.root_cause === 'Seal aus')).toHaveLength(1);
    } finally { spy.mockRestore(); }
  });

  run('sensor mati: agent tidak menuduh mesin, membuat tiket sensor', async () => {
    await api().post('/api/scenario/dropout').send({ pump_id: 'Pump-04', sensor: 'VS1' });
    await tick(5);
    const c = (await api().post('/api/diagnose').send({ pump_id: 'Pump-04' })).body;
    expect(c.status).toBe('sensor_bermasalah');
    expect(c.summary).toMatch(/VS1/);
  });

  run('chat: keluhan pada unit sehat memicu inspeksi fisik, bukan perbaikan', async () => {
    const r = (await api().post('/api/chat').send({ message: 'Unit 1 terasa agak berisik' })).body;
    expect(r.case.status).toBe('tidak_ada_gangguan');
  });

  const fake = (probs: Record<string, number>): Analysis => {
    const top = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
    const comp = (k: string) => ({ level: 1, severity: 0.5, confidence: 0.6, probs: {}, p_degraded: probs[k] ?? 0 });
    return {
      ready: true, is_anomaly: true, anomaly_score: -0.6, threshold: -0.48, label: top[0] as Analysis['label'], confidence: top[1], probs,
      components: { pump: comp('pump'), valve: comp('valve'), cooler: comp('cooler'), accumulator: comp('accumulator') }, flags: [], source: 'test',
    };
  };

  run('keyakinan menengah: agent bertanya balik, jawaban teknisi memperbarui hipotesis', async () => {
    await api().post('/api/scenario/reset');
    await tick(5);
    const tools = app.get(ToolsService);
    const spy = jest.spyOn(tools, 'analyze').mockResolvedValue(fake({ pump: 0.62, valve: 0.33, normal: 0.05 }) as any);
    const c = (await api().post('/api/diagnose').send({ pump_id: 'Pump-01' })).body;
    expect(c.status).toBe('menunggu_klarifikasi');
    expect(c.question).toMatch(/tersendat|berisik/);
    const r = (await api().post(`/api/cases/${c.id}/answer`).send({ text: 'ya gerak aktuator tersendat dan macet' })).body;
    spy.mockRestore();
    expect(r.probs.valve).toBeGreaterThan(r.probs.pump);
    expect(r.fault).toBe('valve');
    expect(['menunggu_persetujuan', 'selesai_otomatis']).toContain(r.status);
  });

  run('keyakinan rendah (<50%): eskalasi ke teknisi senior', async () => {
    const tools = app.get(ToolsService);
    const spy = jest.spyOn(tools, 'analyze').mockResolvedValue(fake({ pump: 0.4, valve: 0.35, cooler: 0.25 }) as any);
    const c = (await api().post('/api/diagnose').send({ pump_id: 'Pump-04' })).body;
    spy.mockRestore();
    expect(c.status).toBe('dieskalasi');
    expect(c.trace.some((t: any) => t.tool === 'escalate_to_senior')).toBe(true);
  });

  run('mode LLM: loop function calling (Gemini dimock) memanggil tool nyata', async () => {
    let n = 0;
    global.fetch = (async (url: any, init: any) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        n++;
        const body = n === 1
          ? { candidates: [{ content: { parts: [{ functionCall: { name: 'get_sensor_data', args: { pump_id: 'Pump-01' } } }] } }] }
          : { candidates: [{ content: { parts: [{ text: 'Pump-01 normal.' }] } }] };
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return realFetch(url, init);
    }) as any;
    const r = (await api().post('/api/chat').send({ message: 'cek Pump-01', use_llm: true })).body;
    global.fetch = realFetch;
    expect(r.reply).toBe('Pump-01 normal.');
    expect(r.case.mode).toBe('llm');
    expect(r.case.trace.some((t: any) => t.tool === 'get_sensor_data')).toBe(true);
  });
});
