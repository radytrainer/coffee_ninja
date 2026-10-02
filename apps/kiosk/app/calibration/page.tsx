'use client';

import type { CursorEvent } from '@gcs/types';
import { Crosshair, Minus, Plus, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraRequired } from '@/components/kiosk/CameraRequired';
import { TopBar } from '@/components/kiosk/TopBar';
import { useKioskAction } from '@/components/providers/ActionsProvider';
import { isVisionReady, useVision } from '@/components/providers/VisionProvider';
import { Button } from '@/components/ui/Button';
import { isSoundEnabled, setSoundEnabled, sounds } from '@/lib/sound';
import {
  isStable,
  median,
  visionApi,
  type CalibrationPair,
  type VisionTuning,
} from '@/lib/visionApi';

const CORNERS = [
  { label: 'top-left', screen: { x: 0.08, y: 0.12 } },
  { label: 'top-right', screen: { x: 0.92, y: 0.12 } },
  { label: 'bottom-right', screen: { x: 0.92, y: 0.88 } },
  { label: 'bottom-left', screen: { x: 0.08, y: 0.88 } },
] as const;

/** The fingertip must stay still for this long to capture a corner. */
const DWELL_MS = 1200;

type Phase =
  | { kind: 'idle' }
  | { kind: 'capturing'; step: number }
  | { kind: 'saving' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

export default function CalibrationPage() {
  const router = useRouter();
  const { state, subscribe, requireConnection } = useVision();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [tuning, setTuning] = useState<VisionTuning | null>(null);
  const [tuningError, setTuningError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const captured = useRef<CalibrationPair[]>([]);
  const samples = useRef<{ t: number; x: number; y: number }[]>([]);
  const stableSince = useRef<number | null>(null);
  const marker = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoundOn(isSoundEnabled());
  }, []);

  // Keep the gesture connection open even when the kiosk is in mouse mode.
  useEffect(() => requireConnection(), [requireConnection]);

  useEffect(() => {
    visionApi
      .getConfig()
      .then(setTuning)
      .catch((e: Error) => setTuningError(e.message));
  }, [state.connection]);

  const capturing = phase.kind === 'capturing';
  useEffect(() => {
    document.documentElement.dataset.calibrating = capturing ? 'true' : 'false';
    return () => {
      delete document.documentElement.dataset.calibrating;
    };
  }, [capturing]);

  const save = useCallback(async (points: CalibrationPair[]) => {
    setPhase({ kind: 'saving' });
    try {
      await visionApi.saveCalibration(points);
      setPhase({ kind: 'done' });
    } catch (e) {
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  }, []);

  const captureCurrent = useCallback(
    (step: number) => {
      const recent = samples.current;
      if (recent.length === 0) return;
      const point: CalibrationPair = {
        camera: { x: median(recent.map((s) => s.x)), y: median(recent.map((s) => s.y)) },
        screen: CORNERS[step]!.screen,
      };
      captured.current = [...captured.current.slice(0, step), point];
      samples.current = [];
      stableSince.current = null;
      setProgress(0);
      if (step + 1 < CORNERS.length) setPhase({ kind: 'capturing', step: step + 1 });
      else void save(captured.current);
    },
    [save],
  );

  // Raw camera position → on-screen marker + dwell-based capture.
  useEffect(() => {
    if (!capturing) return;
    const step = phase.step;
    return subscribe((event) => {
      if (event.type !== 'cursor') return;
      const e = event as CursorEvent;
      const now = performance.now();
      if (marker.current) {
        marker.current.style.opacity = e.handDetected ? '1' : '0';
        marker.current.style.transform = `translate(${e.rawX * window.innerWidth - 20}px, ${e.rawY * window.innerHeight - 20}px)`;
      }
      if (!e.handDetected) {
        samples.current = [];
        stableSince.current = null;
        setProgress(0);
        return;
      }
      samples.current = [
        ...samples.current.filter((s) => now - s.t < 600),
        { t: now, x: e.rawX, y: e.rawY },
      ];
      if (isStable(samples.current)) {
        stableSince.current ??= now;
        const p = Math.min(1, (now - stableSince.current) / DWELL_MS);
        setProgress(p);
        if (p >= 1) captureCurrent(step);
      } else {
        stableSince.current = null;
        setProgress(0);
      }
    });
  }, [capturing, phase, subscribe, captureCurrent]);

  // Keyboard: Space captures immediately, Escape cancels.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        captureCurrent(phase.step);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        setPhase({ kind: 'idle' });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, phase, captureCurrent]);

  const back = () => router.push('/');
  useKioskAction('back', capturing ? null : back);

  const start = () => {
    captured.current = [];
    samples.current = [];
    setProgress(0);
    setPhase({ kind: 'capturing', step: 0 });
  };

  const reset = async () => {
    try {
      await visionApi.resetCalibration();
      setPhase({ kind: 'idle' });
    } catch (e) {
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  };

  const updateTuning = async (update: Partial<VisionTuning>) => {
    try {
      setTuning(await visionApi.updateConfig(update));
      setTuningError(null);
    } catch (e) {
      setTuningError((e as Error).message);
    }
  };

  if (!isVisionReady(state) && state.connection !== 'connecting') {
    return (
      <div className="flex h-full flex-col">
        <TopBar
          onBack={back}
          backLabel="Exit"
          title="Camera calibration"
          showCart={false}
          showHelp={false}
        />
        <div className="flex flex-1 items-center justify-center px-8">
          <CameraRequired />
        </div>
      </div>
    );
  }

  if (capturing) {
    const corner = CORNERS[phase.step]!;
    return (
      <div className="fixed inset-0 z-[70] bg-espresso-950/95">
        <div className="absolute inset-x-0 top-[38%] flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-semibold uppercase tracking-[0.3em] text-caramel-300">
            Step {phase.step + 1} of {CORNERS.length}
          </p>
          <h1 className="text-display text-5xl text-crema-50">Move your finger to the corners.</h1>
          <p className="max-w-3xl text-2xl text-crema-200">
            Point your index finger at the glowing target in the <strong>{corner.label}</strong>{' '}
            corner and hold still.
          </p>
          <p className="text-lg text-crema-400">
            {state.handDetected
              ? 'Hand detected — hold steady…'
              : 'Raise your hand so the camera can see it.'}
          </p>
          <button
            type="button"
            onClick={() => setPhase({ kind: 'idle' })}
            className="btn btn-secondary mt-4 min-h-0 px-6 py-3 text-lg"
          >
            Cancel (Esc)
          </button>
        </div>

        {/* Target */}
        <div
          className="absolute size-28 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${corner.screen.x * 100}%`, top: `${corner.screen.y * 100}%` }}
          aria-hidden
        >
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-caramel-400/40" />
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="rgb(255 248 240 / 0.15)"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="rgb(111 214 168)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={276}
              strokeDashoffset={276 * (1 - progress)}
            />
          </svg>
          <Crosshair className="absolute inset-0 m-auto size-12 text-caramel-300" />
        </div>

        {/* Where the camera currently sees the fingertip (uncalibrated) */}
        <div
          ref={marker}
          className="pointer-events-none fixed left-0 top-0 size-10 rounded-full border-4 border-mint-400 bg-mint-400/30 opacity-0 shadow-[0_0_24px_rgba(111,214,168,0.8)]"
          aria-hidden
        />
        {/* Captured corners */}
        {CORNERS.slice(0, phase.step).map((done) => (
          <div
            key={done.label}
            className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mint-400"
            style={{ left: `${done.screen.x * 100}%`, top: `${done.screen.y * 100}%` }}
            aria-hidden
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar
        onBack={back}
        backLabel="Exit"
        title="Camera calibration"
        showCart={false}
        showHelp={false}
      />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-8 px-8 pb-8 pt-6">
        <section className="glass flex flex-col rounded-[2rem] p-8">
          <h2 className="text-display text-4xl text-crema-50">Screen mapping</h2>
          <p className="mt-3 text-xl text-crema-300">
            Calibration maps the area your hand can comfortably reach onto the whole screen. You
            will point at four corner targets; each is captured automatically when your finger holds
            still.
          </p>
          <div className="mt-6 flex items-center gap-3 text-lg">
            <span
              className={`size-3 rounded-full ${state.calibrated ? 'bg-mint-400' : 'bg-caramel-400'}`}
            />
            <span className="text-crema-100">
              {state.calibrated ? 'Calibrated for this kiosk' : 'Using the default mapping'}
            </span>
            <span className="text-crema-400">· {Math.round(state.fps)} fps</span>
          </div>

          {phase.kind === 'saving' ? (
            <p className="mt-6 text-xl text-crema-200">Saving calibration…</p>
          ) : null}
          {phase.kind === 'done' ? (
            <p
              className="mt-6 rounded-2xl bg-mint-500/15 px-5 py-4 text-xl text-mint-300 ring-1 ring-mint-400/30"
              role="status"
            >
              ✓ Calibration saved. Move your hand around — the cursor should now reach every corner
              comfortably.
            </p>
          ) : null}
          {phase.kind === 'error' ? (
            <p
              className="mt-6 rounded-2xl bg-berry-500/15 px-5 py-4 text-xl text-berry-300 ring-1 ring-berry-400/30"
              role="alert"
            >
              {phase.message}
            </p>
          ) : null}

          <div className="mt-auto flex flex-wrap gap-4 pt-8">
            <Button onClick={start} icon={<Crosshair className="size-6" aria-hidden />}>
              {state.calibrated ? 'Recalibrate' : 'Start calibration'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void reset()}
              icon={<RotateCcw className="size-6" aria-hidden />}
            >
              Reset to default
            </Button>
          </div>
        </section>

        <section className="glass flex flex-col rounded-[2rem] p-8">
          <h2 className="text-display text-4xl text-crema-50">Sensitivity</h2>
          <p className="mt-3 text-xl text-crema-300">
            Changes apply instantly and are saved on this kiosk.
          </p>
          {tuningError ? <p className="mt-4 text-lg text-berry-300">{tuningError}</p> : null}
          {tuning ? (
            <div className="mt-6 flex flex-col gap-5">
              <TuningRow
                label="Cursor smoothing"
                hint="Higher = steadier but slower cursor"
                value={`${Math.round(tuning.cursor_smoothing * 100)}%`}
                onMinus={() =>
                  void updateTuning({
                    cursor_smoothing: round(Math.max(0, tuning.cursor_smoothing - 0.05)),
                  })
                }
                onPlus={() =>
                  void updateTuning({
                    cursor_smoothing: round(Math.min(0.9, tuning.cursor_smoothing + 0.05)),
                  })
                }
              />
              <TuningRow
                label="Pinch sensitivity"
                hint="Higher = a looser pinch still counts"
                value={`${Math.round(tuning.pinch_threshold * 100)}`}
                onMinus={() => void updatePinch(tuning.pinch_threshold - 0.02, updateTuning)}
                onPlus={() => void updatePinch(tuning.pinch_threshold + 0.02, updateTuning)}
              />
              <TuningRow
                label="Back gesture hold"
                hint="How long to hold an open palm to go back"
                value={`${(tuning.open_palm_hold_ms / 1000).toFixed(2)} s`}
                onMinus={() =>
                  void updateTuning({
                    open_palm_hold_ms: Math.max(500, tuning.open_palm_hold_ms - 250),
                  })
                }
                onPlus={() =>
                  void updateTuning({
                    open_palm_hold_ms: Math.min(2500, tuning.open_palm_hold_ms + 250),
                  })
                }
              />
              <TuningRow
                label="Close-eyes back"
                hint="Keep both eyes closed this long to go back (normal blinks are ignored)"
                value={
                  tuning.eyes_closed_back
                    ? `${(tuning.eyes_closed_hold_ms / 1000).toFixed(2)} s`
                    : 'Off'
                }
                onMinus={() =>
                  void updateTuning(
                    tuning.eyes_closed_hold_ms <= 400
                      ? { eyes_closed_back: false }
                      : { eyes_closed_hold_ms: tuning.eyes_closed_hold_ms - 100 },
                  )
                }
                onPlus={() =>
                  void updateTuning(
                    tuning.eyes_closed_back
                      ? { eyes_closed_hold_ms: Math.min(2500, tuning.eyes_closed_hold_ms + 100) }
                      : { eyes_closed_back: true, eyes_closed_hold_ms: 600 },
                  )
                }
              />
            </div>
          ) : !tuningError ? (
            <p className="mt-6 text-lg text-crema-400">Loading…</p>
          ) : null}
          <div className="mt-5 flex items-center gap-4 rounded-2xl bg-crema-50/5 px-5 py-3">
            <div className="flex-1">
              <p className="text-xl font-semibold text-crema-50">Sound feedback</p>
              <p className="text-base text-crema-400">
                Clicks, confirmations and order-ready chime on this kiosk
              </p>
            </div>
            <Button
              variant="secondary"
              icon={
                soundOn ? (
                  <Volume2 className="size-6" aria-hidden />
                ) : (
                  <VolumeX className="size-6" aria-hidden />
                )
              }
              onClick={() => {
                setSoundEnabled(!soundOn);
                setSoundOn(!soundOn);
                if (!soundOn) sounds.success();
              }}
            >
              {soundOn ? 'On' : 'Off'}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

const round = (v: number) => Math.round(v * 100) / 100;

function updatePinch(threshold: number, update: (u: Partial<VisionTuning>) => Promise<void>) {
  const t = round(Math.min(0.45, Math.max(0.2, threshold)));
  // Keep the hysteresis gap between start and release thresholds.
  return update({ pinch_threshold: t, pinch_release_threshold: round(t + 0.15) });
}

function TuningRow({
  label,
  hint,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  hint: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-crema-50/5 px-5 py-3">
      <div className="flex-1">
        <p className="text-xl font-semibold text-crema-50">{label}</p>
        <p className="text-base text-crema-400">{hint}</p>
      </div>
      <button
        type="button"
        data-gesture-target
        aria-label={`Decrease ${label}`}
        onClick={onMinus}
        className="icon-btn gesture-target"
      >
        <Minus className="size-6" aria-hidden />
      </button>
      <span className="w-24 text-center text-2xl font-semibold tabular-nums text-caramel-300">
        {value}
      </span>
      <button
        type="button"
        data-gesture-target
        aria-label={`Increase ${label}`}
        onClick={onPlus}
        className="icon-btn gesture-target"
      >
        <Plus className="size-6" aria-hidden />
      </button>
    </div>
  );
}
