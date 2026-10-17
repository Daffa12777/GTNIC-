import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { CONFIG, ROOT } from '../config';
import { now } from '../domain';

/** Shape of legacy SQL projections. New mutations use generated Prisma model types. */
export interface DbRow {
  id: string; name: string; pump_id: string; case_id: string; technician_id: string | null;
  title: string; description: string; priority: string; status: string; part: string; criticality: string;
  scheduled_at: string | null; created_at: number; closed_at: number | null; updated_at: number;
  n: number; ts: number; features: unknown; trace: unknown; state: unknown;
  fault: string; confidence: number; risk: string; summary: string; mode: string;
  symptoms: string; root_cause: string; action: string; duration_min: number;
  stock: number; part_id: string; location: string; available: boolean; skill: string; level: string; contact: string;
}

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Db');
  private readonly context = new AsyncLocalStorage<Prisma.TransactionClient>();
  readonly prisma: PrismaClient;
  readonly mode = 'postgres/prisma';

  constructor() {
    if (!CONFIG.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi. Gunakan PostgreSQL lokal/Docker atau Session pooler.');
    const url = new URL(CONFIG.DATABASE_URL);
    const hostname = url.hostname;
    const supabase = hostname.endsWith('.supabase.com') || hostname.endsWith('.supabase.co');
    if (supabase) for (const key of ['sslmode', 'sslcert', 'sslrootcert', 'sslaccept']) url.searchParams.delete(key);
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), ssl: supabase ? { rejectUnauthorized: true, ca: readFileSync(join(ROOT, 'certs', 'supabase-ca.crt'), 'utf8') } : undefined, max: Number(process.env.DB_POOL_MAX || 5), connectionTimeoutMillis: 10000 }) });
  }
  get client(): Prisma.TransactionClient { return this.context.getStore() ?? this.prisma; }
  async onModuleInit() {
    await this.prisma.$connect();
    // Schema changes are explicit Prisma migrations, never performed by application startup.
    if (process.env.SEED_DEMO_DATA === 'true') await this.transaction(async () => {
      await this.q('SELECT pg_advisory_xact_lock(157001)::text');
      await this.seed();
    });
    this.log.log(`Database siap (${this.mode})`);
  }
  async onModuleDestroy() { await this.prisma.$disconnect(); }
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    return this.prisma.$transaction((tx) => this.context.run(tx, work), { maxWait: 10000, timeout: 30000 });
  }
  async q<T = DbRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.client.$queryRawUnsafe<T[]>(sql, ...params);
  }
  async one<T = DbRow>(sql: string, params: unknown[] = []): Promise<T | null> { return (await this.q<T>(sql, params))[0] ?? null; }
  async x(sql: string, params: unknown[] = []): Promise<void> { await this.client.$executeRawUnsafe(sql, ...params); }
  async nextId(prefix: string, counter: string): Promise<string> {
    const row = await this.client.counter.upsert({ where: { name: counter }, create: { name: counter, n: 1 }, update: { n: { increment: 1 } } });
    return `${prefix}-${String(row.n).padStart(4, '0')}`;
  }
  /** Data awal yang mensimulasikan CMMS/ERP perusahaan (idempoten). */
  private async seed() {
    const c = await this.one<{ n: number }>('SELECT COUNT(*) AS n FROM pumps');
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
    for (const h of hist) await this.x('INSERT INTO case_history (id,pump_id,ts,symptoms,fault,root_cause,action,duration_min) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', h);
    await this.x("INSERT INTO counters (name, n) VALUES ('case_history', 4) ON CONFLICT (name) DO UPDATE SET n = 4");
  }
}
