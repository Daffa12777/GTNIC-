import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from '../config';
import { DbService } from '../db/db.service';

export interface Hit {
  source: string; locator: string; heading: string; score: number; kind: string; citation: string; text: string;
  pump_id?: string; fault?: string;
}
interface Chunk {
  source: string; file: string; locator: string; heading: string; text: string; kind: 'manual' | 'history';
  pump_id?: string; fault?: string; tf: Map<string, number>; norm: number;
}

const STOP = new Set(['yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'pada', 'atau', 'dengan', 'itu', 'ini', 'the', 'of', 'a']);
const tokens = (s: string) => {
  const w = (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((x) => !STOP.has(x));
  const out = [...w];
  for (let i = 0; i < w.length - 1; i++) out.push(`${w[i]}_${w[i + 1]}`);
  return out;
};

/** RAG ringan: potongan per bagian "## x.y Judul" dari manual markdown + riwayat perbaikan, TF-IDF + cosine, dengan sitasi. */
@Injectable()
export class RagService {
  private chunks: Chunk[] = [];
  private idf = new Map<string, number>();

  constructor(private db: DbService) {}

  private manualChunks(): Chunk[] {
    const out: Chunk[] = [];
    if (!fs.existsSync(CONFIG.KNOWLEDGE_DIR)) return out;
    for (const f of fs.readdirSync(CONFIG.KNOWLEDGE_DIR).filter((x) => x.endsWith('.md')).sort()) {
      const text = fs.readFileSync(path.join(CONFIG.KNOWLEDGE_DIR, f), 'utf8');
      const title = (text.split('\n').find((l) => l.startsWith('# ')) || f).replace(/^#\s*/, '').trim();
      const parts = text.split(/^## /m).slice(1);
      for (const p of parts) {
        const nl = p.indexOf('\n');
        const head = p.slice(0, nl).trim();
        const body = p.slice(nl + 1).trim();
        const m = head.match(/^([\d.]+)\s+(.*)/);
        out.push({
          source: title, file: f, locator: m ? `bagian ${m[1]}` : head, heading: m ? m[2] : head,
          text: `${m ? m[2] : head}. ${body}`, kind: 'manual', tf: new Map(), norm: 0,
        });
      }
    }
    return out;
  }

  async build(): Promise<number> {
    const chunks = this.manualChunks();
    const hist = await this.db.q('SELECT * FROM case_history');
    for (const h of hist) {
      chunks.push({
        source: 'Riwayat perbaikan', file: h.id, locator: h.id, heading: `${h.pump_id} - ${h.fault}`, kind: 'history',
        text: `Gejala: ${h.symptoms}. Jenis gangguan: ${h.fault}. Penyebab: ${h.root_cause}. Tindakan: ${h.action}.`,
        pump_id: h.pump_id, fault: h.fault, tf: new Map(), norm: 0,
      });
    }
    const df = new Map<string, number>();
    for (const c of chunks) {
      for (const t of tokens(c.text)) c.tf.set(t, (c.tf.get(t) || 0) + 1);
      for (const t of c.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    }
    const N = chunks.length;
    const idf = new Map<string, number>();
    for (const [t, d] of df) idf.set(t, Math.log((1 + N) / (1 + d)) + 1);
    for (const c of chunks) {
      let s = 0;
      for (const [t, f] of c.tf) { const w = (1 + Math.log(f)) * (idf.get(t) || 0); s += w * w; }
      c.norm = Math.sqrt(s) || 1;
    }
    this.chunks = chunks; this.idf = idf;
    return N;
  }

  async search(query: string, k = 3, kind?: 'manual' | 'history'): Promise<Hit[]> {
    if (!this.chunks.length) await this.build();
    const qt = new Map<string, number>();
    for (const t of tokens(query)) qt.set(t, (qt.get(t) || 0) + 1);
    let qn = 0;
    const qw = new Map<string, number>();
    for (const [t, f] of qt) { const w = (1 + Math.log(f)) * (this.idf.get(t) || 0); if (w) { qw.set(t, w); qn += w * w; } }
    qn = Math.sqrt(qn) || 1;
    const scored: [number, Chunk][] = [];
    for (const c of this.chunks) {
      if (kind && c.kind !== kind) continue;
      let dot = 0;
      for (const [t, w] of qw) { const f = c.tf.get(t); if (f) dot += w * (1 + Math.log(f)) * (this.idf.get(t) || 0); }
      const s = dot / (qn * c.norm);
      if (s > 0.01) scored.push([s, c]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, k).map(([s, c]) => ({
      source: c.source, locator: c.locator, heading: c.heading, score: Math.round(s * 1000) / 1000, kind: c.kind,
      citation: `${c.source}, ${c.locator}`, text: c.text.slice(0, 700), pump_id: c.pump_id, fault: c.fault,
    }));
  }
}
