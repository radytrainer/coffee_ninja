import { isTargetDisabled, TARGET_SELECTOR } from './gesture/hitTest';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/**
 * Picks the best candidate in a direction: it must lie in that direction, and
 * candidates closer along the travel axis and better aligned on the cross axis win.
 */
export function pickInDirection<T>(
  from: Box,
  items: { item: T; box: Box }[],
  direction: Direction,
): T | null {
  const origin = center(from);
  let best: { item: T; score: number } | null = null;
  for (const { item, box } of items) {
    const c = center(box);
    const dx = c.x - origin.x;
    const dy = c.y - origin.y;
    let primary: number;
    let cross: number;
    switch (direction) {
      case 'right':
        primary = dx;
        cross = Math.abs(dy);
        break;
      case 'left':
        primary = -dx;
        cross = Math.abs(dy);
        break;
      case 'down':
        primary = dy;
        cross = Math.abs(dx);
        break;
      case 'up':
        primary = -dy;
        cross = Math.abs(dx);
        break;
    }
    if (primary <= 4) continue;
    const score = primary + cross * 2;
    if (!best || score < best.score) best = { item, score };
  }
  return best?.item ?? null;
}

/** Visible, enabled interactive elements — restricted to an open modal dialog if present. */
export function focusableTargets(root: ParentNode = document): HTMLElement[] {
  const dialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
  const scope: ParentNode = dialogs.length > 0 ? dialogs[dialogs.length - 1]! : root;
  return Array.from(scope.querySelectorAll<HTMLElement>(TARGET_SELECTOR)).filter((el) => {
    if (isTargetDisabled(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

export function moveFocus(direction: Direction): HTMLElement | null {
  const targets = focusableTargets();
  if (targets.length === 0) return null;
  const active = document.activeElement as HTMLElement | null;
  const current = active && targets.includes(active) ? active : null;

  let next: HTMLElement | null;
  if (!current) {
    // Nothing focused yet: start from the first target in reading (DOM) order.
    next = targets[0]!;
  } else {
    next = pickInDirection(
      current.getBoundingClientRect(),
      targets
        .filter((t) => t !== current)
        .map((t) => ({ item: t, box: t.getBoundingClientRect() })),
      direction,
    );
  }
  if (next) {
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
  return next;
}
