'use client';

import type { CursorEvent, CursorState, GestureEvent, ScrollEvent, SwipeEvent } from '@gcs/types';
import { useEffect, useRef, useState } from 'react';
import { GESTURE_PRESS_END, GESTURE_PRESS_START } from '@/components/kiosk/HoldToConfirm';
import { useKioskActions } from '@/components/providers/ActionsProvider';
import { useInputMode } from '@/components/providers/InputModeProvider';
import { useKioskConfig } from '@/components/providers/KioskConfigProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { useVision } from '@/components/providers/VisionProvider';
import { config } from '@/lib/config';
import { SWIPE_GAIN } from '@/lib/carousel';
import { findScrollContainer, HandScroller, releaseVelocity } from '@/lib/gesture/handScroll';
import { findGestureTarget, isTargetDisabled, resolveHoverTarget } from '@/lib/gesture/hitTest';
import { SelectionController } from '@/lib/gesture/selectionController';
import { activeSwipeTarget, swipeTargetAt, type SwipeTarget } from '@/lib/gesture/swipe';
import { sounds } from '@/lib/sound';
import { VirtualCursor, type CursorHandle } from './VirtualCursor';

interface Visual {
  state: CursorState;
  visible: boolean;
  hoverKey: number;
}

const toViewport = (x: number, y: number) => ({
  x: x * window.innerWidth,
  y: y * window.innerHeight,
});

/**
 * Turns vision events into UI interaction:
 *   cursor  → move virtual cursor, highlight the button under it (hover)
 *   pinch   → activate the hovered button, but only after HOVER_DELAY and outside the cooldown
 *   palm    → "back";  thumbs up → "confirm" (only where a screen registered it)
 *   ✌️      → scroll the list under the cursor (content follows the hand), or
 *             move the slideshow left/right when the hand is over it
 *   ✋ moved sideways → move the slideshow left/right (a still palm is "back")
 * Nothing is ever clicked just because the cursor entered a button.
 */
export function GestureLayer() {
  const { mode } = useInputMode();
  const { subscribe } = useVision();
  const { trigger } = useKioskActions();
  const { markActivity } = useSession();
  const { hoverDelayMs } = useKioskConfig();
  const toast = useToast();

  const cursor = useRef<CursorHandle>(null);
  const controller = useRef(
    new SelectionController<HTMLElement>({ hoverDelayMs, cooldownMs: config.selectionCooldownMs }),
  );
  const [visual, setVisual] = useState<Visual>({ state: 'NORMAL', visible: false, hoverKey: 0 });
  const visualRef = useRef(visual);

  useEffect(() => {
    controller.current.configure({ hoverDelayMs });
  }, [hoverDelayMs]);

  useEffect(() => {
    if (mode !== 'gesture') return;
    const ctl = controller.current;
    let hovered: HTMLElement | null = null;
    let pressed: HTMLElement | null = null;
    let lastActivity = 0;
    let hoverKey = visualRef.current.hoverKey;
    const scroller = new HandScroller();
    /** Slideshow being dragged by ✋ palm or ✌️, with its drag state. */
    let swipe: { target: SwipeTarget; offset: number; samples: { t: number; y: number }[] } | null =
      null;

    const commit = (next: Partial<Visual>) => {
      const merged = { ...visualRef.current, ...next };
      const prev = visualRef.current;
      if (
        merged.state !== prev.state ||
        merged.visible !== prev.visible ||
        merged.hoverKey !== prev.hoverKey
      ) {
        visualRef.current = merged;
        setVisual(merged);
      }
    };

    const setHovered = (el: HTMLElement | null) => {
      if (el === hovered) return;
      if (hovered) {
        hovered.removeAttribute('data-gesture-hover');
        hovered.removeAttribute('data-gesture-armed');
      }
      hovered = el;
      if (el) {
        el.setAttribute('data-gesture-hover', 'true');
        hoverKey += 1;
        sounds.hover();
      }
    };

    const endPress = () => {
      if (!pressed) return;
      pressed.removeAttribute('data-gesture-pressed');
      if (pressed.hasAttribute('data-gesture-hold'))
        pressed.dispatchEvent(new Event(GESTURE_PRESS_END));
      pressed = null;
    };

    const onCursor = (event: CursorEvent) => {
      const now = performance.now();
      if (!event.handDetected) {
        endPress();
        setHovered(null);
        ctl.reset();
        commit({ visible: false, state: 'NORMAL' });
        return;
      }
      if (now - lastActivity > 1000) {
        lastActivity = now;
        markActivity();
      }
      const { x, y } = toViewport(event.x, event.y);
      cursor.current?.moveTo(x, y);
      cursor.current?.setPinchStrength(event.pinchStrength);

      // ✌️ scroll / ✋ swipe: no hover, no clicks.
      if (event.scrolling || event.swiping) {
        endPress();
        setHovered(null);
        ctl.hover(null, now);
        commit({ visible: true, state: swipe || event.swiping ? 'SWIPE' : 'SCROLL', hoverKey });
        return;
      }

      const target = resolveHoverTarget(hovered, x, y);
      ctl.hover(target, now);
      setHovered(target);
      if (target && ctl.isArmed(now) && !target.hasAttribute('data-gesture-armed')) {
        target.setAttribute('data-gesture-armed', 'true');
      }

      // Pinch-and-hold → "press" (used by the hold-to-confirm button).
      if (event.pinching && target && !pressed && ctl.isArmed(now) && !isTargetDisabled(target)) {
        pressed = target;
        pressed.setAttribute('data-gesture-pressed', 'true');
        if (pressed.hasAttribute('data-gesture-hold'))
          pressed.dispatchEvent(new Event(GESTURE_PRESS_START));
      } else if (pressed && (!event.pinching || target !== pressed)) {
        endPress();
      }

      const disabled = target ? isTargetDisabled(target) : false;
      const state: CursorState =
        ctl.inCooldown(now) || disabled
          ? 'DISABLED'
          : event.pinching
            ? 'PINCH'
            : target
              ? 'HOVER'
              : 'NORMAL';
      commit({ visible: true, state, hoverKey });
    };

    const onGesture = (event: GestureEvent) => {
      const now = performance.now();
      markActivity();
      // The calibration screen handles its own capture; no clicks/back while calibrating.
      if (document.documentElement.dataset.calibrating === 'true') return;
      if (event.gesture === 'pinch') {
        // "What you see is what you click": the highlighted button wins. The pinch's
        // own position is only used when nothing is highlighted.
        const point =
          event.x !== undefined && event.y !== undefined ? toViewport(event.x, event.y) : null;
        const target = hovered ?? (point ? findGestureTarget(point.x, point.y) : null);
        // Hold buttons respond to press/release, not to a single pinch.
        if (target?.hasAttribute('data-gesture-hold')) return;
        const decision = ctl.decide(target, now, target ? isTargetDisabled(target) : false);
        switch (decision) {
          case 'activate':
            ctl.markActivated(now);
            cursor.current?.pulse('click');
            sounds.click();
            target?.click();
            commit({ state: 'DISABLED' });
            break;
          case 'no-target':
            cursor.current?.pulse('invalid');
            toast('Point at a button, then pinch to select', {
              dedupeKey: 'no-target',
              durationMs: 3500,
            });
            break;
          case 'hover-too-short':
            cursor.current?.pulse('invalid');
            toast('Hold still on the button for a moment, then pinch', {
              dedupeKey: 'too-fast',
              durationMs: 3500,
            });
            break;
          case 'disabled':
            cursor.current?.pulse('invalid');
            sounds.invalid();
            toast("That option isn't available", { dedupeKey: 'disabled', durationMs: 3000 });
            break;
          case 'cooldown':
            break;
        }
      } else if (event.gesture === 'open_palm' || event.gesture === 'eyes_closed') {
        if (trigger('back')) {
          sounds.back();
          toast('Going back', { durationMs: 1200, dedupeKey: 'back' });
        }
      } else if (event.gesture === 'thumbs_up') {
        if (trigger('confirm')) sounds.click();
      }
    };

    const onScroll = (event: ScrollEvent) => {
      markActivity();
      if (event.phase === 'start') {
        const { x, y } = toViewport(event.x, event.y);
        const target = swipeTargetAt(x, y);
        if (target) {
          // Slideshow: the cards follow the hand left/right.
          swipe = { target, offset: 0, samples: [{ t: performance.now(), y: 0 }] };
          target.dragStart();
          commit({ state: 'SWIPE' });
          return;
        }
        const container = findScrollContainer(x, y);
        scroller.start(container);
        if (!container)
          toast('Nothing to scroll on this screen', { dedupeKey: 'no-scroll', durationMs: 2500 });
        commit({ state: 'SCROLL' });
      } else if (swipe) {
        dragSwipe(event.dx, event.phase);
      } else if (event.phase === 'move') {
        scroller.move(event.dy);
      } else {
        scroller.end();
      }
    };

    const dragSwipe = (dx: number, phase: 'move' | 'end') => {
      if (!swipe) return;
      if (phase === 'move') {
        swipe.offset += dx * window.innerWidth * SWIPE_GAIN;
        swipe.samples.push({ t: performance.now(), y: swipe.offset });
        if (swipe.samples.length > 16) swipe.samples.shift();
        swipe.target.dragMove(swipe.offset);
      } else {
        swipe.target.dragEnd(releaseVelocity(swipe.samples, performance.now()));
        swipe = null;
      }
    };

    /** ✋ Palm swipe: drives the slideshow on screen wherever the hand is. */
    const onSwipe = (event: SwipeEvent) => {
      markActivity();
      if (event.phase === 'start') {
        const target = activeSwipeTarget();
        if (!target) return; // nothing to swipe on this screen — ignore a waving hand
        swipe?.target.dragEnd(0);
        swipe = { target, offset: 0, samples: [{ t: performance.now(), y: 0 }] };
        target.dragStart();
        commit({ state: 'SWIPE' });
      } else {
        dragSwipe(event.dx, event.phase);
      }
    };

    const unsubscribe = subscribe((event) => {
      if (event.type === 'cursor') onCursor(event);
      else if (event.type === 'gesture') onGesture(event);
      else if (event.type === 'scroll') onScroll(event);
      else if (event.type === 'swipe') onSwipe(event);
      else if (event.type === 'hand' && !event.handDetected)
        onCursor({
          ...event,
          type: 'cursor',
          x: 0,
          y: 0,
          rawX: 0,
          rawY: 0,
          pointing: false,
          pinching: false,
          pinchStrength: 0,
        });
    });

    return () => {
      unsubscribe();
      scroller.stop();
      swipe?.target.dragEnd(0);
      swipe = null;
      endPress();
      setHovered(null);
      ctl.reset();
      visualRef.current = { ...visualRef.current, visible: false };
    };
  }, [mode, subscribe, trigger, markActivity, toast]);

  if (mode !== 'gesture') return null;
  return (
    <VirtualCursor
      ref={cursor}
      state={visual.state}
      visible={visual.visible}
      hoverKey={visual.hoverKey}
      hoverDelayMs={hoverDelayMs}
    />
  );
}
