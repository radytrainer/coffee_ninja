'use client';

import { CameraOff, MousePointer2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useInputMode } from '@/components/providers/InputModeProvider';
import { useVision } from '@/components/providers/VisionProvider';

/**
 * Shown when gesture mode is active but the camera / vision service is unavailable.
 * `compact`: small notice under the START button while the kiosk keeps working with
 * mouse/touch (automatic fallback).
 */
export function CameraRequired({ compact = false }: { compact?: boolean }) {
  const { state, restartCamera } = useVision();
  const { setMode } = useInputMode();
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    await restartCamera();
    window.setTimeout(() => setBusy(false), 1500);
  };

  if (compact) {
    return (
      <div
        className="glass flex w-full max-w-4xl animate-fade-up items-center gap-5 rounded-[1.5rem] px-6 py-4 text-left"
        role="status"
      >
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-berry-500/15 text-berry-300 ring-1 ring-berry-400/40">
          <CameraOff className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold text-crema-50">
            Camera unavailable — use the mouse or touch screen
          </p>
          <p className="text-base text-crema-300">
            To enable gestures: connect the camera, allow camera permission, then try again.
            Gestures resume automatically.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={retry}
          disabled={busy}
          className="min-h-0 shrink-0 px-5 py-3 text-lg"
          icon={<RefreshCw className={`size-5 ${busy ? 'animate-spin' : ''}`} aria-hidden />}
        >
          {busy ? 'Retrying…' : 'Try again'}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="glass mx-auto w-full max-w-4xl animate-fade-up rounded-[2rem] px-10 py-8 text-left"
      role="alert"
    >
      <div className="flex items-center gap-5">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-berry-500/15 text-berry-300 ring-1 ring-berry-400/40">
          <CameraOff className="size-8" aria-hidden />
        </div>
        <h2 className="text-display text-3xl text-crema-50">Camera access is required.</h2>
      </div>
      <p className="mt-5 text-xl text-crema-200">Please:</p>
      <ol className="mt-3 grid grid-cols-3 gap-3 text-xl text-crema-100">
        {['Connect your camera.', 'Allow camera permission.', 'Try again.'].map((step, i) => (
          <li key={step} className="flex items-center gap-3 rounded-2xl bg-crema-50/5 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-caramel-400 font-semibold text-espresso-950">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      {state.message ? (
        <p className="mt-4 text-base text-crema-400">Details: {state.message}</p>
      ) : null}
      {state.connection !== 'connected' ? (
        <p className="mt-4 text-base text-crema-400">
          The gesture service is not reachable on this kiosk.
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-4">
        <Button
          onClick={retry}
          disabled={busy}
          icon={<RefreshCw className={`size-6 ${busy ? 'animate-spin' : ''}`} aria-hidden />}
        >
          {busy ? 'Retrying…' : 'TRY AGAIN'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setMode('mouse')}
          icon={<MousePointer2 className="size-6" aria-hidden />}
        >
          Use touch / mouse
        </Button>
      </div>
    </div>
  );
}
