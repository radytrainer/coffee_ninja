'use client';

import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export const GESTURE_PRESS_START = 'gesturepressstart';
export const GESTURE_PRESS_END = 'gesturepressend';

interface Props {
  onConfirm: () => void;
  holdMs: number;
  disabled?: boolean;
  children: ReactNode;
  hint?: ReactNode;
}

/**
 * Deliberate confirmation: the customer must press and HOLD (pinch-and-hold,
 * mouse press, or Enter/Space held) for `holdMs`. A single accidental pinch or
 * click never submits an order.
 */
export function HoldToConfirm({ onConfirm, holdMs, disabled = false, children, hint }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const raf = useRef<number | null>(null);
  const startedAt = useRef(0);
  const done = useRef(false);
  const confirmRef = useRef(onConfirm);
  useEffect(() => {
    confirmRef.current = onConfirm;
  });

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    setHolding(false);
    if (!done.current) setProgress(0);
  }, []);

  const start = useCallback(() => {
    if (disabled || raf.current !== null || done.current) return;
    startedAt.current = performance.now();
    setHolding(true);
    const tick = () => {
      const p = Math.min(1, (performance.now() - startedAt.current) / holdMs);
      setProgress(p);
      if (p >= 1) {
        done.current = true;
        raf.current = null;
        setHolding(false);
        confirmRef.current();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [disabled, holdMs]);

  // Disabling cancels an in-progress hold (the visual reset is derived from `disabled` below).
  useEffect(() => {
    if (disabled) {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    } else {
      done.current = false;
    }
  }, [disabled]);

  // Gesture press events are dispatched by the GestureLayer while pinching over this button.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener(GESTURE_PRESS_START, start);
    el.addEventListener(GESTURE_PRESS_END, stop);
    return () => {
      el.removeEventListener(GESTURE_PRESS_START, start);
      el.removeEventListener(GESTURE_PRESS_END, stop);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [start, stop]);

  const pct = disabled ? 0 : Math.round(progress * 100);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        ref={ref}
        type="button"
        data-gesture-target
        data-gesture-hold
        disabled={disabled}
        aria-describedby="hold-hint"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === 'Enter' || e.key === ' ') stop();
        }}
        onClick={(e) => e.preventDefault()}
        className="btn btn-primary gesture-target relative w-full overflow-hidden px-12 py-6 text-2xl"
        style={{ minHeight: '5.5rem' }}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-mint-400/80"
          style={{ width: `${pct}%`, transition: holding ? 'none' : 'width 0.25s ease' }}
        />
        <span className="relative flex items-center gap-3">
          {progress >= 1 ? <Check className="size-8" aria-hidden /> : null}
          {children}
        </span>
      </button>
      <p id="hold-hint" className="text-lg text-crema-300">
        {hint}
      </p>
    </div>
  );
}
