'use client';

import type { CursorState } from '@gcs/types';
import { ChevronsLeftRight, ChevronsUpDown } from 'lucide-react';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';

export interface CursorHandle {
  /** Target position in viewport pixels; the cursor glides there each animation frame. */
  moveTo: (x: number, y: number) => void;
  /** Click ripple or "invalid" wobble. */
  pulse: (kind: 'click' | 'invalid') => void;
  /** 0..1 — how close thumb and index are (tightens the ring as a pinch approaches). */
  setPinchStrength: (strength: number) => void;
}

interface Props {
  ref?: Ref<CursorHandle>;
  state: CursorState;
  visible: boolean;
  /** Changes whenever a new target is hovered, restarting the hover-progress ring. */
  hoverKey: number;
  hoverDelayMs: number;
}

const SIZE = 72; // px, the cursor box (dot is much smaller)

/**
 * The virtual cursor. Position updates bypass React (direct transform writes in
 * requestAnimationFrame) so 30–60 updates/second never re-render the app.
 *
 * NORMAL: small glowing dot · HOVER: ring expands + progress ring fills ·
 * PINCH: ring compresses · DISABLED: dimmed grey (cooldown / unavailable) ·
 * SCROLL: ✌️ scrolling (up/down badge) · SWIPE: ✌️ moving a slideshow (left/right badge).
 */
export function VirtualCursor({ ref, state, visible, hoverKey, hoverDelayMs }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const ripple = useRef<HTMLDivElement>(null);
  const target = useRef({ x: -100, y: -100 });
  const current = useRef({ x: -100, y: -100 });
  const hasPosition = useRef(false);

  useImperativeHandle(ref, () => ({
    moveTo(x, y) {
      target.current = { x, y };
      if (!hasPosition.current) {
        current.current = { x, y };
        hasPosition.current = true;
      }
    },
    pulse(kind) {
      const el = ripple.current;
      if (!el) return;
      el.dataset.kind = kind;
      el.classList.remove('cursor-ripple-run');
      void el.offsetWidth; // restart CSS animation
      el.classList.add('cursor-ripple-run');
    },
    setPinchStrength(strength) {
      ring.current?.style.setProperty('--pinch', String(Math.max(0, Math.min(1, strength))));
    },
  }));

  useEffect(() => {
    if (!visible) {
      hasPosition.current = false;
      return;
    }
    let frame = 0;
    const tick = () => {
      // Light interpolation between vision updates (30 fps) for a fluid 60 fps cursor.
      const c = current.current;
      const t = target.current;
      c.x += (t.x - c.x) * 0.5;
      c.y += (t.y - c.y) * 0.5;
      if (root.current) {
        root.current.style.transform = `translate3d(${c.x - SIZE / 2}px, ${c.y - SIZE / 2}px, 0)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return (
    <div
      ref={root}
      aria-hidden
      data-state={state}
      className="virtual-cursor pointer-events-none fixed left-0 top-0 z-[80]"
      style={{
        width: SIZE,
        height: SIZE,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}
    >
      <div ref={ring} className="cursor-ring" />
      {state === 'HOVER' ? (
        <svg key={hoverKey} className="cursor-progress" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" style={{ animationDuration: `${hoverDelayMs}ms` }} />
        </svg>
      ) : null}
      <div className="cursor-dot" />
      {state === 'SCROLL' || state === 'SWIPE' ? (
        <div className="cursor-mode">
          {state === 'SCROLL' ? (
            <ChevronsUpDown className="size-6" />
          ) : (
            <ChevronsLeftRight className="size-6" />
          )}
        </div>
      ) : null}
      <div ref={ripple} className="cursor-ripple" />
    </div>
  );
}
