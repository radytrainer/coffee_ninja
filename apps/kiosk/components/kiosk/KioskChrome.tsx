'use client';

import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GestureLayer } from '@/components/gesture/GestureLayer';
import { useInputMode } from '@/components/providers/InputModeProvider';
import { isVisionReady, useVision } from '@/components/providers/VisionProvider';
import { KeyboardNavigator } from './KeyboardNavigator';

/**
 * Global overlays and behaviours that sit above every screen:
 * gesture layer + virtual cursor, keyboard navigation, offline banner and kiosk hardening.
 */
export function KioskChrome() {
  const online = useOnline();
  useKioskHardening();
  useCameraFallback();
  useMouseAnytime();
  return (
    <>
      <KeyboardNavigator />
      <GestureLayer />
      {!online ? (
        <div className="fixed inset-x-0 bottom-6 z-[55] flex justify-center" role="alert">
          <div className="flex items-center gap-3 rounded-full bg-berry-500/90 px-6 py-3 text-lg text-white shadow-2xl">
            <WifiOff className="size-6" aria-hidden /> Connection lost — trying to reconnect…
          </div>
        </div>
      ) : null}
    </>
  );
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** In production: no right-click menu, no pinch-zoom, no drag-select on the kiosk. */
function useKioskHardening() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const prevent = (e: Event) => e.preventDefault();
    const preventZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('dragstart', prevent);
    window.addEventListener('wheel', preventZoom, { passive: false });
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('dragstart', prevent);
      window.removeEventListener('wheel', preventZoom);
    };
  }, []);
}

/** How long the camera must be unavailable before mouse/touch takes over. */
const FALLBACK_AFTER_MS = 3000;

/**
 * Gesture kiosk without a working camera → temporarily use mouse/touch, so the kiosk
 * never becomes unusable. The vision connection keeps retrying; as soon as the camera
 * is running again, gesture mode resumes automatically.
 */
function useCameraFallback() {
  const { mode, setCameraFallback } = useInputMode();
  const { state } = useVision();
  const ready = isVisionReady(state);
  const problem = mode === 'gesture' && !ready && state.camera !== 'starting';

  useEffect(() => {
    if (mode !== 'gesture' || ready) {
      setCameraFallback(false);
      return;
    }
    if (!problem) return;
    const timer = window.setTimeout(() => setCameraFallback(true), FALLBACK_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [mode, ready, problem, setCameraFallback]);
}

/**
 * Staff (or a customer) can grab a real mouse at any time: moving it reveals the
 * pointer and mouse hover styles, which hide again after a few idle seconds.
 */
function useMouseAnytime() {
  useEffect(() => {
    let timer: number | undefined;
    const root = document.documentElement;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || (e.movementX === 0 && e.movementY === 0)) return;
      root.dataset.mouseActive = 'true';
      window.clearTimeout(timer);
      timer = window.setTimeout(() => delete root.dataset.mouseActive, 4000);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.clearTimeout(timer);
      delete root.dataset.mouseActive;
    };
  }, []);
}
