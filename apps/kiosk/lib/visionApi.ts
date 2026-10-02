import { config } from './config';

/** HTTP client for the local vision service (calibration & tuning). */
export interface VisionTuning {
  cursor_smoothing: number;
  pinch_threshold: number;
  pinch_release_threshold: number;
  pinch_cooldown_ms: number;
  pinch_min_frames: number;
  gesture_confidence: number;
  open_palm_hold_ms: number;
  thumbs_up_hold_ms: number;
  gesture_cooldown_ms: number;
  pinch_lookback_ms: number;
  eyes_closed_back: boolean;
  eyes_closed_hold_ms: number;
}

export interface CalibrationPair {
  camera: { x: number; y: number };
  screen: { x: number; y: number };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.visionHttpUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error('The gesture service is not reachable on this kiosk.');
  }
  const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
  if (!res.ok) {
    const detail = body?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? String(detail[0]?.msg ?? 'Invalid value')
          : 'Request failed';
    throw new Error(message);
  }
  return body as T;
}

export const visionApi = {
  getConfig: () => call<VisionTuning>('/config'),
  updateConfig: (update: Partial<VisionTuning>) =>
    call<VisionTuning>('/config', { method: 'PUT', body: JSON.stringify(update) }),
  saveCalibration: (points: CalibrationPair[]) =>
    call<{ calibrated: boolean }>('/calibration', {
      method: 'POST',
      body: JSON.stringify({ points }),
    }),
  resetCalibration: () => call<{ calibrated: boolean }>('/calibration', { method: 'DELETE' }),
};

/** Robust centre of a set of samples (median per axis). */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** True when the samples are tightly clustered (finger held still). */
export function isStable(samples: { x: number; y: number }[], tolerance = 0.012): boolean {
  if (samples.length < 5) return false;
  const mx = median(samples.map((s) => s.x));
  const my = median(samples.map((s) => s.y));
  return samples.every((s) => Math.abs(s.x - mx) <= tolerance && Math.abs(s.y - my) <= tolerance);
}
