'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

/**
 * Global "back" and "confirm" actions triggered by gestures (open palm / thumbs up)
 * or the keyboard (Escape). Each screen registers what these mean for it;
 * the most recently mounted registration wins (e.g. an open dialog).
 */
export type KioskAction = 'back' | 'confirm';
type Handler = () => void;

interface ActionsValue {
  register: (action: KioskAction, handler: Handler) => () => void;
  trigger: (action: KioskAction) => boolean;
}

const ActionsContext = createContext<ActionsValue | null>(null);

export function ActionsProvider({ children }: { children: ReactNode }) {
  const stacks = useRef<Record<KioskAction, Handler[]>>({ back: [], confirm: [] });

  const register = useCallback((action: KioskAction, handler: Handler) => {
    stacks.current[action].push(handler);
    return () => {
      stacks.current[action] = stacks.current[action].filter((h) => h !== handler);
    };
  }, []);

  const trigger = useCallback((action: KioskAction) => {
    const stack = stacks.current[action];
    const handler = stack[stack.length - 1];
    if (!handler) return false;
    handler();
    return true;
  }, []);

  const value = useMemo(() => ({ register, trigger }), [register, trigger]);
  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

export function useKioskActions() {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useKioskActions must be used inside ActionsProvider');
  return ctx;
}

/** Registers a handler for a global action while the component is mounted. */
export function useKioskAction(action: KioskAction, handler: Handler | null) {
  const { register } = useKioskActions();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const enabled = handler !== null;
  useEffect(() => {
    if (!enabled) return;
    return register(action, () => ref.current?.());
  }, [action, enabled, register]);
}
