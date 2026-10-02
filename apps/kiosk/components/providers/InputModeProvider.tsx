'use client';

import type { InputMode } from '@gcs/types';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { config } from '@/lib/config';
import { useKioskConfig } from './KioskConfigProvider';

const STORAGE_KEY = 'gcs:input-mode';

export function isLocalKioskHost(hostname: string | null | undefined): boolean {
  if (!hostname) return true;
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

interface InputModeValue {
  /** Configured mode (kiosk setting / override). The vision connection follows this. */
  mode: InputMode;
  /**
   * What the customer can actually use right now: 'mouse' while a gesture kiosk's
   * camera is unavailable (automatic fallback), otherwise the configured mode.
   */
  effectiveMode: InputMode;
  /** True while gesture mode is temporarily replaced by mouse/touch because the camera is down. */
  cameraFallback: boolean;
  setCameraFallback: (fallback: boolean) => void;
  setMode: (mode: InputMode) => void;
  /** True when the developer explicitly overrode the mode (URL or toggle). */
  overridden: boolean;
}

const InputModeContext = createContext<InputModeValue>({
  mode: config.defaultInputMode,
  effectiveMode: config.defaultInputMode,
  cameraFallback: false,
  setCameraFallback: () => undefined,
  setMode: () => undefined,
  overridden: false,
});

function readOverride(): InputMode | null {
  if (typeof window === 'undefined') return null;
  const fromUrl = new URLSearchParams(window.location.search).get('mode');
  if (fromUrl === 'mouse' || fromUrl === 'gesture') {
    try {
      window.localStorage.setItem(STORAGE_KEY, fromUrl);
    } catch {
      /* ignore */
    }
    return fromUrl;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'mouse' || stored === 'gesture' ? stored : null;
  } catch {
    return null;
  }
}

/**
 * GESTURE mode: virtual cursor driven by the vision service (production kiosk).
 * MOUSE mode: regular mouse/touch (developer & demo mode).
 * Priority: ?mode= URL param / saved toggle > kiosk setting from admin > NEXT_PUBLIC_INPUT_MODE.
 * Keyboard always works in both modes. Ctrl+Shift+M toggles.
 *
 * If a gesture kiosk's camera is unavailable, CameraFallbackWatcher switches the
 * *effective* mode to mouse/touch until the camera is back (automatic, temporary).
 */
export function InputModeProvider({ children }: { children: ReactNode }) {
  const { kiosk } = useKioskConfig();
  const [override, setOverride] = useState<InputMode | null>(null);
  const [cameraFallback, setCameraFallback] = useState(false);

  useEffect(() => {
    // Read the browser-only override after hydration to keep SSR markup stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverride(readOverride());
  }, []);

  const isLocalHost = isLocalKioskHost(typeof window !== 'undefined' ? window.location.hostname : null);
  const kioskMode: InputMode | null = kiosk
    ? kiosk.inputMode === 'MOUSE'
      ? 'mouse'
      : 'gesture'
    : null;
  const configuredMode = override ?? kioskMode ?? config.defaultInputMode;
  const mode = isLocalHost ? configuredMode : 'mouse';
  const effectiveMode: InputMode = mode === 'gesture' && cameraFallback ? 'mouse' : mode;

  const setMode = useCallback((next: InputMode) => {
    setOverride(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Drives CSS: gesture mode hides the OS pointer; mouse mode shows it + hover styles.
    document.documentElement.dataset.inputMode = effectiveMode;
  }, [effectiveMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setMode(mode === 'gesture' ? 'mouse' : 'gesture');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, setMode]);

  return (
    <InputModeContext.Provider
      value={{
        mode,
        effectiveMode,
        cameraFallback,
        setCameraFallback,
        setMode,
        overridden: override !== null,
      }}
    >
      {children}
    </InputModeContext.Provider>
  );
}

export const useInputMode = () => useContext(InputModeContext);
