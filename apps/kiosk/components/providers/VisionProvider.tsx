'use client';

import type { StatusEvent, VisionEvent } from '@gcs/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { config } from '@/lib/config';
import { useInputMode } from './InputModeProvider';

export type VisionConnection = 'disabled' | 'connecting' | 'connected' | 'disconnected';

export interface VisionState {
  connection: VisionConnection;
  camera: StatusEvent['camera'] | 'unknown';
  message: string | null;
  handDetected: boolean;
  fps: number;
  calibrated: boolean;
  /** Image too dark to see hands. */
  lowLight: boolean;
}

type Listener = (event: VisionEvent) => void;

interface VisionValue {
  state: VisionState;
  subscribe: (listener: Listener) => () => void;
  /** Keeps the connection open even in mouse mode (used by the calibration screen). */
  requireConnection: () => () => void;
  restartCamera: () => Promise<boolean>;
  reconnect: () => void;
}

const initial: VisionState = {
  connection: 'disabled',
  camera: 'unknown',
  message: null,
  handDetected: false,
  fps: 0,
  calibrated: false,
  lowLight: false,
};

const VisionContext = createContext<VisionValue | null>(null);

/**
 * One WebSocket connection to the local Python vision service. High-frequency
 * cursor events go straight to subscribers (no React re-render per frame);
 * only low-frequency state (hand detected, camera status) is kept in React state.
 */
export function VisionProvider({ children }: { children: ReactNode }) {
  const { mode } = useInputMode();
  const [state, setState] = useState<VisionState>(initial);
  const [forced, setForced] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const listeners = useRef(new Set<Listener>());
  const enabled = mode === 'gesture' || forced > 0;

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(initial);
      return;
    }
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let staleTimer: number | undefined;
    let retries = 0;
    let disposed = false;

    const markStale = () => {
      window.clearTimeout(staleTimer);
      // The service sends a status heartbeat every second; silence means trouble.
      staleTimer = window.setTimeout(() => socket?.close(), 5000);
    };

    const connect = () => {
      if (disposed) return;
      setState((s) => ({ ...s, connection: 'connecting' }));
      try {
        socket = new WebSocket(config.visionWsUrl);
      } catch {
        scheduleRetry();
        return;
      }
      socket.onopen = () => {
        retries = 0;
        setState((s) => ({ ...s, connection: 'connected' }));
        markStale();
      };
      socket.onmessage = (message) => {
        markStale();
        let event: VisionEvent;
        try {
          event = JSON.parse(String(message.data)) as VisionEvent;
        } catch {
          return;
        }
        if (event.type === 'status') {
          setState((s) =>
            s.camera === event.camera &&
            s.calibrated === event.calibrated &&
            s.message === (event.message ?? null) &&
            Math.round(s.fps) === Math.round(event.fps) &&
            s.lowLight === Boolean(event.lowLight)
              ? s
              : {
                  ...s,
                  camera: event.camera,
                  calibrated: event.calibrated,
                  message: event.message ?? null,
                  fps: event.fps,
                  lowLight: Boolean(event.lowLight),
                },
          );
          if (event.camera !== 'running') {
            setState((s) => (s.handDetected ? { ...s, handDetected: false } : s));
          }
        } else if (event.type === 'hand' || event.type === 'cursor') {
          const detected = event.handDetected;
          setState((s) => (s.handDetected === detected ? s : { ...s, handDetected: detected }));
        }
        listeners.current.forEach((listener) => listener(event));
      };
      socket.onclose = () => {
        window.clearTimeout(staleTimer);
        if (disposed) return;
        setState((s) => ({ ...s, connection: 'disconnected', handDetected: false }));
        scheduleRetry();
      };
      socket.onerror = () => socket?.close();
    };

    const scheduleRetry = () => {
      if (disposed) return;
      retries += 1;
      const delay = Math.min(5000, 400 * 2 ** Math.min(retries, 4));
      retryTimer = window.setTimeout(connect, delay);
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(staleTimer);
      socket?.close();
    };
  }, [enabled, attempt]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const requireConnection = useCallback(() => {
    setForced((n) => n + 1);
    return () => setForced((n) => n - 1);
  }, []);

  const restartCamera = useCallback(async () => {
    try {
      const res = await fetch(`${config.visionHttpUrl}/camera/restart`, { method: 'POST' });
      setAttempt((n) => n + 1);
      return res.ok;
    } catch {
      setAttempt((n) => n + 1);
      return false;
    }
  }, []);

  const reconnect = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(
    () => ({ state, subscribe, requireConnection, restartCamera, reconnect }),
    [state, subscribe, requireConnection, restartCamera, reconnect],
  );
  return <VisionContext.Provider value={value}>{children}</VisionContext.Provider>;
}

export function useVision() {
  const ctx = useContext(VisionContext);
  if (!ctx) throw new Error('useVision must be used inside VisionProvider');
  return ctx;
}

/** Camera is usable for gesture control right now. */
export function isVisionReady(state: VisionState) {
  return state.connection === 'connected' && state.camera === 'running';
}
