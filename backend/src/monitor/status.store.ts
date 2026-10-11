import { Injectable } from '@nestjs/common';

export interface PumpStatus {
  state: 'normal' | 'waspada' | 'kritis' | 'sensor' | 'tidak ada data' | 'ml_error';
  label?: string; confidence?: number; anomaly_score?: number; threshold?: number; is_anomaly?: boolean;
  probs?: Record<string, number>; flags?: string[]; suspect?: string[]; components?: any; error?: string;
  latest?: Record<string, number>;
}

@Injectable()
export class StatusStore {
  map: Record<string, PumpStatus> = {};
  auto = { enabled: true };
}
