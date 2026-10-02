/**
 * Tiny WebAudio feedback tones (no audio files needed).
 * Kiosk browsers should be launched with --autoplay-policy=no-user-gesture-required.
 */
let ctx: AudioContext | null = null;
const STORAGE_KEY = 'gcs:sound';

export function isSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // storage unavailable: keep default
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !isSoundEnabled()) return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

function tone(
  freq: number,
  start: number,
  duration: number,
  volume = 0.08,
  type: OscillatorType = 'sine',
) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sounds = {
  click: () => tone(880, 0, 0.09, 0.06, 'triangle'),
  hover: () => tone(1320, 0, 0.04, 0.015, 'sine'),
  back: () => tone(520, 0, 0.12, 0.05, 'triangle'),
  invalid: () => {
    tone(260, 0, 0.12, 0.05, 'square');
    tone(220, 0.1, 0.14, 0.04, 'square');
  },
  success: () => {
    tone(660, 0, 0.18, 0.07);
    tone(880, 0.12, 0.18, 0.07);
    tone(1175, 0.24, 0.35, 0.07);
  },
};
