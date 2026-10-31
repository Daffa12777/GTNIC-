import { Injectable } from '@nestjs/common';
import { CONFIG } from '../config';
import { COMP_KEYS, Fault } from '../domain';

export interface CompResult {
  level: number; severity: number; confidence: number; probs: Record<string, number>; p_degraded: number;
}
export interface MlRaw {
  anomaly: { score: number; threshold: number; is_anomaly: boolean };
  components: Record<string, CompResult>;
  source: string;
}
export interface Analysis {
  ready: true;
  is_anomaly: boolean; anomaly_score: number; threshold: number;
  label: Fault; confidence: number; probs: Record<string, number>;
  components: Record<string, CompResult>; flags: string[]; source: string;
}

/** Klien layanan ML (FastAPI). Mengubah keluaran per komponen menjadi hipotesis gangguan bernormalisasi. */
@Injectable()
export class MlService {
  private headers() {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (CONFIG.ML_API_KEY) h['x-api-key'] = CONFIG.ML_API_KEY;
    return h;
  }

  async predict(features: Record<string, number>): Promise<MlRaw> {
    const r = await fetch(`${CONFIG.ML_URL}/predict`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ features }), signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`ML service HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return (await r.json()) as MlRaw;
  }

  async meta(): Promise<any> {
    try {
      const r = await fetch(`${CONFIG.ML_URL}/meta`, { headers: this.headers(), signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } catch (e: any) {
      return { error: `layanan ML tidak dapat dihubungi (${e?.message ?? e})` };
    }
  }

  /** Ranking normal/gangguan tunggal dengan asumsi komponen independen; gangguan majemuk diperiksa agent dari components. */
  toAnalysis(raw: MlRaw, names: Record<string, string>): Analysis {
    const comps = raw.components;
    const degraded = COMP_KEYS.map((k) => {
      const pd = comps[k]?.p_degraded;
      if (!Number.isFinite(pd) || pd < 0 || pd > 1) throw new Error(`Probabilitas ML tidak valid: ${k}`);
      return pd;
    });
    const probsRaw: Record<string, number> = {};
    for (const [i, k] of COMP_KEYS.entries()) {
      probsRaw[k] = degraded[i] * degraded.reduce((p, pd, j) => p * (i === j ? 1 : 1 - pd), 1);
    }
    probsRaw.normal = degraded.reduce((p, pd) => p * (1 - pd), 1);
    // Dua kerusakan pasti membuat semua hipotesis tunggal nol; pertahankan ranking untuk jalur eskalasi majemuk.
    if (Object.values(probsRaw).every((p) => p === 0)) {
      COMP_KEYS.forEach((k, i) => { probsRaw[k] = degraded[i]; });
    }
    const tot = Object.values(probsRaw).reduce((a, b) => a + b, 0) || 1;
    const probs: Record<string, number> = {};
    for (const [k, v] of Object.entries(probsRaw)) probs[k] = Math.round((v / tot) * 10000) / 10000;
    const label = Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0] as Fault;
    const flags: string[] = [];
    for (const k of COMP_KEYS) {
      const c = comps[k];
      if (c && c.severity >= 1 && c.confidence >= 0.6) flags.push(`${names[k] ?? k}: mendekati gagal total`);
    }
    return {
      ready: true, is_anomaly: raw.anomaly.is_anomaly, anomaly_score: raw.anomaly.score, threshold: raw.anomaly.threshold,
      label, confidence: probs[label], probs, components: comps, flags, source: raw.source,
    };
  }
}
