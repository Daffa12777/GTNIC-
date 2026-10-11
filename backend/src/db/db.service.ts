import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG, ROOT } from '../config';
import { now } from '../domain';

/**
 * Akses PostgreSQL.
 * - DATABASE_URL terisi  -> Postgres sungguhan (Supabase) lewat `pg`.
 * - DATABASE_URL kosong  -> PGlite (Postgres WASM, tersimpan di folder .pgdata) agar dev lokal tanpa setup.
 * SQL yang sama berjalan di keduanya.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Db');
  private pool: any = null;
  private lite: any = null;
  mode: 'supabase/postgres' | 'pglite' = 'pglite';

  async onModuleInit() {
    if (CONFIG.DATABASE_URL) {
      const { Pool } = await import('pg');
      const needSsl = /supabase|pooler|sslmode=require/i.test(CONFIG.DATABASE_URL);
      this.pool = new Pool({
        connectionString: CONFIG.DATABASE_URL.replace(/[?&]sslmode=[^&]*/i, ''),
        max: 5,
        ssl: needSsl ? { rejectUnauthorized: false } : undefined,
      });
      this.mode = 'supabase/postgres';
    } else {
      const { PGlite } = await import('@electric-sql/pglite');
      const dir = process.env.PGLITE_MEMORY === '1' ? undefined : CONFIG.PGLITE_DIR;
      this.lite = dir ? new PGlite(dir) : new PGlite();
      await this.lite.waitReady;
      this.mode = 'pglite';
    }
    await this.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
    await this.seed();
    this.log.log(`Database siap (${this.mode})`);
  }

  async onModuleDestroy() {
    if (this.pool) await this.pool.end();
    if (this.lite) await this.lite.close();
  }

  /** Jalankan banyak pernyataan SQL tanpa parameter (skema). */
  async exec(sql: string) {
    if (this.pool) await this.pool.query(sql);
    else await this.lite.exec(sql);
  }

  async q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (this.pool) return (await this.pool.query(sql, params)).rows as T[];
    return (await this.lite.query(sql, params)).rows as T[];
  }
  async one<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return (await this.q<T>(sql, params))[0] ?? null;
  }
  async x(sql: string, params: any[] = []) {
    await this.q(sql, params);
  }

  /** ID berurutan tanpa balapan: UPDATE atomik pada tabel counters. */
  async nextId(prefix: string, counter: string): Promise<string> {
    await this.x('INSERT INTO counters (name, n) VALUES ($1, 0) ON CONFLICT (name) DO NOTHING', [counter]);
    const r = await this.one<{ n: number }>('UPDATE counters SET n = n + 1 WHERE name = $1 RETURNING n', [counter]);
    return `${prefix}-${String(Number(r!.n)).padStart(4, '0')}`;
  }

  /** Data awal yang mensimulasikan CMMS/ERP perusahaan (idempoten). */
  private async seed() {
    const c = await this.one<{ n: any }>('SELECT COUNT(*) AS n FROM pumps');
    if (Number(c!.n) > 0) return;
    const pumps = [
      ['Pump-01', 'HPU Press Line 1', 'Produksi, Line 1', 'HPU-75', 'tinggi'],
      ['Pump-02', 'HPU Injeksi Plastik', 'Produksi, Line 2', 'HPU-75', 'tinggi'],
      ['Pump-03', 'HPU Pengepres Logam', 'Fabrikasi, Area B', 'HPU-55', 'sedang'],
      ['Pump-04', 'HPU Conveyor Hidrolik', 'Gudang, Area C', 'HPU-37', 'sedang'],
    ];
    for (const p of pumps) await this.x('INSERT INTO pumps VALUES ($1,$2,$3,$4,$5)', p);
    const inv = [
      ['SP-001', 'Seal kit pompa hidrolik', 2, 'Gudang A-1', 1],
      ['SP-002', 'Kumparan katup proporsional', 0, 'Gudang A-2', 1],
      ['SP-003', 'Elemen pendingin oli', 1, 'Gudang A-2', 1],
      ['SP-004', 'Bladder akumulator', 3, 'Gudang B-1', 1],
      ['SP-005', 'Kit pengisi nitrogen', 2, 'Gudang B-3', 1],
      ['SP-006', 'Filter oli', 8, 'Gudang C-1', 4],
      ['SP-007', 'Sensor getaran VS1', 1, 'Gudang C-2', 1],
    ];
    for (const i of inv) await this.x('INSERT INTO inventory VALUES ($1,$2,$3,$4,$5)', i);
    const techs = [
      ['T-01', 'Andi Pratama', 'mekanik', 'junior', true, '@andi'],
      ['T-02', 'Budi Santoso', 'listrik', 'junior', true, '@budi'],
      ['T-03', 'Citra Lestari', 'mekanik', 'senior', true, '@citra'],
      ['T-04', 'Dewi Anggraini', 'supervisor', 'senior', true, '@dewi'],
      ['T-05', 'Eko Wahyudi', 'mekanik', 'junior', true, '@eko'],
      ['T-06', 'Fajar Nugroho', 'listrik', 'senior', true, '@fajar'],
    ];
    for (const t of techs) await this.x('INSERT INTO technicians VALUES ($1,$2,$3,$4,$5,$6)', t);
    const t = now();
    const hist = [
      ['H-0001', 'Pump-02', t - 40 * 86400, 'oli cepat panas, suhu naik, efisiensi pendingin turun', 'cooler',
        'Elemen pendingin tersumbat endapan karena filter air tidak dibersihkan', 'Bersihkan elemen pendingin, ganti filter air, cek aliran media pendingin', 95],
      ['H-0002', 'Pump-03', t - 75 * 86400, 'tekanan turun, debit turun, daya motor naik', 'pump',
        'Seal pompa aus karena oli terkontaminasi partikel', 'Ganti seal kit pompa, ganti filter dan oli, uji drain casing', 140],
      ['H-0003', 'Pump-04', t - 120 * 86400, 'gerak aktuator tersendat, respons katup lambat', 'valve',
        'Spool katup kotor akibat oli terkontaminasi', 'Bersihkan spool, ganti kumparan, ganti filter oli', 60],
      ['H-0004', 'Pump-01', t - 200 * 86400, 'hentakan tekanan, denyut tekanan membesar', 'accumulator',
        'Pre-charge nitrogen turun karena bladder merembes', 'Ganti bladder akumulator, isi nitrogen sesuai spesifikasi', 110],
    ];
    for (const h of hist) await this.x('INSERT INTO case_history VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', h);
    await this.x("INSERT INTO counters (name, n) VALUES ('case_history', 4) ON CONFLICT (name) DO UPDATE SET n = 4");
  }
}
