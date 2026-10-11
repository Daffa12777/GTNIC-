import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from '../config';
import { COMP_KEYS, DISPLAY_SENSORS, asObj, now } from '../domain';
import { DbService } from '../db/db.service';

type Vec = number[];
interface Profiles {
  source: string; features: string[]; healthy: Vec[]; banks: Record<string, Record<string, Vec[]>>;
  sensors: Record<string, { name: string; unit: string }>;
  components: Record<string, { name: string; levels: number[]; meaning: Record<string, string> }>;
}
export interface Reading { ts: number; features: Record<string, number> }
interface PumpSim { fault: string | null; severity: number; rate: number; dropout: string | null }

const KEEP = 240;

/**
 * Simulator sensor: memutar ulang siklus NYATA dari bank profiles.json (diekspor oleh ml/train.py dari split uji).
 * Gangguan berkembang bertahap: severity naik, bank tingkat kerusakan yang dipakai ikut naik.
 */
@Injectable()
export class SimService {
  private log = new Logger('Sim');
  profiles!: Profiles;
  nominalMap: Record<string, number> = {};
  state: Record<string, PumpSim> = {};
  private ring: Record<string, Reading[]> = {};
  private tickN = 0;

  constructor(private db: DbService) {
    const p = path.join(CONFIG.ASSETS_DIR, 'profiles.json');
    if (!fs.existsSync(p)) throw new Error(`profiles.json tidak ada di ${p}. Jalankan: cd ml && python train.py --demo`);
    this.profiles = JSON.parse(fs.readFileSync(p, 'utf8'));
    const f = this.profiles.features;
    f.forEach((name, j) => {
      const col = this.profiles.healthy.map((r) => r[j]);
      this.nominalMap[name] = col.reduce((a, b) => a + b, 0) / (col.length || 1);
    });
  }

  vec2obj(v: Vec): Record<string, number> {
    const o: Record<string, number> = {};
    this.profiles.features.forEach((n, i) => (o[n] = v[i]));
    return o;
  }

  async init(pumpIds: string[]) {
    for (const id of pumpIds) {
      this.state[id] = { fault: null, severity: 0, rate: 0, dropout: null };
      const rows = await this.db.q('SELECT ts, features FROM sensor_readings WHERE pump_id=$1 ORDER BY id DESC LIMIT $2', [id, KEEP]);
      this.ring[id] = rows.reverse().map((r: any) => ({ ts: Number(r.ts), features: asObj(r.features) }));
    }
    for (const id of pumpIds) {
      if (this.ring[id].length < 40) {
        const t0 = now() - 40 * CONFIG.TICK_SECONDS;
        for (let i = 0; i < 40; i++) await this.push(id, this.sample(id, true), t0 + i * CONFIG.TICK_SECONDS);
      }
    }
  }

  private pick(a: Vec[]): Vec { return a[Math.floor(Math.random() * a.length)]; }

  private sample(id: string, forceHealthy = false): Record<string, number> {
    const s = this.state[id];
    let v: Vec;
    if (!forceHealthy && s?.fault && s.severity > 0) {
      const lv = Object.keys(this.profiles.banks[s.fault] || {}).sort((a, b) => this.sevOf(s.fault!, a) - this.sevOf(s.fault!, b));
      if (lv.length) {
        const idx = Math.min(lv.length - 1, Math.max(0, Math.ceil(s.severity * lv.length) - 1));
        v = this.pick(this.profiles.banks[s.fault][lv[idx]]);
      } else v = this.pick(this.profiles.healthy);
    } else v = this.pick(this.profiles.healthy);
    const o = this.vec2obj(v);
    if (!forceHealthy && s?.dropout) { o[`${s.dropout}_mean`] = 0; o[`${s.dropout}_std`] = 0; }
    return o;
  }

  private sevOf(comp: string, level: string) {
    const lv = this.profiles.components[comp].levels;
    return lv.indexOf(Number(level)) / (lv.length - 1);
  }

  private async push(id: string, features: Record<string, number>, ts = now()) {
    const arr = (this.ring[id] ||= []);
    arr.push({ ts, features });
    if (arr.length > KEEP) arr.shift();
    await this.db.x('INSERT INTO sensor_readings (pump_id, ts, features) VALUES ($1,$2,$3::jsonb)', [id, ts, JSON.stringify(features)]);
  }

  /** Satu siklus baru untuk semua pompa. */
  async stepAll() {
    this.tickN++;
    for (const id of Object.keys(this.state)) {
      const s = this.state[id];
      if (s.fault) s.severity = Math.min(1, s.severity + s.rate);
      await this.push(id, this.sample(id));
    }
    if (this.tickN % 50 === 0) {
      await this.db.x('DELETE FROM sensor_readings WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY pump_id ORDER BY id DESC) rn FROM sensor_readings) t WHERE rn > $1)', [KEEP]);
    }
  }

  recent(id: string, n: number): Reading[] { return (this.ring[id] || []).slice(-n); }

  /** Rata-rata fitur pada n pembacaan terakhir (meredam derau antar siklus). */
  smoothed(id: string, n = 3): Record<string, number> | null {
    const r = this.recent(id, n);
    if (!r.length) return null;
    const o: Record<string, number> = {};
    for (const k of Object.keys(r[0].features)) o[k] = r.reduce((a, b) => a + b.features[k], 0) / r.length;
    return o;
  }

  display(features: Record<string, number>): Record<string, number> {
    const o: Record<string, number> = {};
    for (const s of DISPLAY_SENSORS) o[s] = Math.round(features[`${s}_mean`] * 1000) / 1000;
    return o;
  }

  nominalDisplay(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const s of DISPLAY_SENSORS) o[s] = Math.round(this.nominalMap[`${s}_mean`] * 1000) / 1000;
    return o;
  }

  startFault(id: string, comp: string, rate = 0.07, severity = 0) {
    if (!this.state[id] || !COMP_KEYS.includes(comp as any)) return false;
    this.state[id] = { fault: comp, severity: Math.max(0, Math.min(1, severity)), rate, dropout: this.state[id].dropout };
    return true;
  }
  setDropout(id: string, sensor: string | null) { if (this.state[id]) this.state[id].dropout = sensor; }
  resetPump(id: string) { if (this.state[id]) this.state[id] = { fault: null, severity: 0, rate: 0, dropout: null }; }

  /** Skenario demo: Pump-02 pendingin menurun bertahap (jalur otomatis), Pump-03 kebocoran pompa berat mendadak (jalur persetujuan). */
  startScenario() {
    this.startFault('Pump-02', 'cooler', 0.06);
    this.startFault('Pump-03', 'pump', 0, 1);
  }
}
