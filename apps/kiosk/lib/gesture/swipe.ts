import { isScrollable } from './handScroll';

/**
 * A horizontal slideshow that the ✌️ hand gesture can drive (one per screen).
 * The GestureLayer routes ✌️ movement here instead of vertical scrolling when
 * the hand is over the slideshow (or over nothing else scrollable).
 */
export interface SwipeTarget {
  element: HTMLElement;
  dragStart(): void;
  /** Total horizontal offset (px) since the drag started. */
  dragMove(offsetPx: number): void;
  /** Release velocity in px/ms (positive = moving right). */
  dragEnd(velocityPxPerMs: number): void;
}

let current: SwipeTarget | null = null;

export function registerSwipeTarget(target: SwipeTarget): () => void {
  current = target;
  return () => {
    if (current === target) current = null;
  };
}

/** The slideshow on screen, if any (✋ palm swipes drive it wherever the hand is). */
export function activeSwipeTarget(): SwipeTarget | null {
  return current;
}

/** The slideshow a ✌️ gesture at (x, y) should drive — null to scroll vertically instead. */
export function swipeTargetAt(x: number, y: number): SwipeTarget | null {
  if (!current) return null;
  for (let el: Element | null = document.elementFromPoint(x, y); el; el = el.parentElement) {
    if (el === current.element) return current;
    if (isScrollable(el)) return null; // e.g. the category list keeps vertical scrolling
  }
  return current;
}
