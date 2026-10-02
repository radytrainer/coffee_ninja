export const TARGET_SELECTOR = '[data-gesture-target]';

export function isTargetDisabled(el: Element): boolean {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.closest('[inert]') !== null
  );
}

function targetAt(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y);
  return (el?.closest(TARGET_SELECTOR) as HTMLElement | null) ?? null;
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function withinExpandedRect(rect: RectLike, x: number, y: number, margin: number): boolean {
  return (
    x >= rect.left - margin &&
    x <= rect.right + margin &&
    y >= rect.top - margin &&
    y <= rect.bottom + margin
  );
}

/**
 * Hover hysteresis: once a button is hovered it stays hovered while the cursor is
 * within `margin` px of it, unless the cursor is clearly over a *different* button.
 * Without this, hand jitter at a button's edge makes the hover flicker on/off and
 * the hover timer restarts endlessly (pinches never register).
 */
export function resolveHoverTarget(
  current: HTMLElement | null,
  x: number,
  y: number,
  margin = 28,
): HTMLElement | null {
  const direct = findGestureTarget(x, y, 0);
  if (direct) return direct;
  if (current && current.isConnected && !isTargetDisabled(current)) {
    if (withinExpandedRect(current.getBoundingClientRect(), x, y, margin)) return current;
  }
  return findGestureTarget(x, y);
}

/**
 * Finds the interactive element under a viewport point. A small tolerance ring
 * makes buttons slightly "magnetic", which helps with hand jitter.
 */
export function findGestureTarget(x: number, y: number, tolerance = 18): HTMLElement | null {
  const direct = targetAt(x, y);
  if (direct) return direct;
  if (tolerance <= 0) return null;
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const hit = targetAt(x + Math.cos(angle) * tolerance, y + Math.sin(angle) * tolerance);
    if (hit) return hit;
  }
  return null;
}
