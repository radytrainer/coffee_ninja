import type { InputMode } from '@gcs/types';

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Build-time configuration (NEXT_PUBLIC_* variables are inlined by Next.js). */
export const config = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
  visionWsUrl: process.env.NEXT_PUBLIC_VISION_WS_URL ?? 'ws://localhost:8765/ws/gesture',
  visionHttpUrl: (process.env.NEXT_PUBLIC_VISION_HTTP_URL ?? 'http://localhost:8765').replace(
    /\/$/,
    '',
  ),
  defaultInputMode: (process.env.NEXT_PUBLIC_INPUT_MODE === 'mouse'
    ? 'mouse'
    : 'gesture') as InputMode,
  kioskCode: process.env.NEXT_PUBLIC_KIOSK_CODE ?? 'KIOSK-01',
  /** Minimum time the cursor must rest on a button before a pinch can activate it. */
  hoverDelayMs: num(process.env.NEXT_PUBLIC_HOVER_DELAY, 250),
  /** Ignore further selections for this long after one is made. */
  selectionCooldownMs: num(process.env.NEXT_PUBLIC_SELECTION_COOLDOWN, 650),
  /** Hold duration for the order confirmation button. */
  confirmHoldMs: num(process.env.NEXT_PUBLIC_CONFIRM_HOLD_MS, 1200),
  sessionTimeoutSeconds: num(process.env.NEXT_PUBLIC_SESSION_TIMEOUT, 60),
  successResetSeconds: num(process.env.NEXT_PUBLIC_SUCCESS_RESET, 20),
  /** Countdown shown in the "Are you still there?" dialog. */
  inactivityWarningSeconds: 10,
};

/** Product images are served by the API (/static/...) or are absolute URLs. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${config.apiUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}
