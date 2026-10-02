/**
 * Slideshow math (pure, unit tested). The content follows the hand/finger like on
 * a touchscreen: dragging right (positive px) brings the *previous* card in.
 */

/** How far the content moves per unit of ✌️ hand movement (screen widths → px). */
export const SWIPE_GAIN = 1.6;
/** Flick look-ahead: release velocity (px/ms) × this = extra distance. */
const FLICK_MS = 250;
/** A fast release always moves at least one card. */
const FLICK_MIN_SPEED = 0.35; // px/ms
/** Past the first/last card the content resists (rubber band). */
const EDGE_RESISTANCE = 0.35;

export const clampIndex = (index: number, count: number) =>
  Math.min(Math.max(index, 0), Math.max(count - 1, 0));

/**
 * The card to settle on after a drag of `dragPx` released at `velocity` px/ms.
 * `commitRatio`: fraction of a card the drag must cover to move on (0.5 = halfway;
 * hand swipes use less — a hand sweep is short and deliberate).
 */
export function snapIndex(
  index: number,
  dragPx: number,
  velocity: number,
  stepPx: number,
  count: number,
  commitRatio = 0.5,
): number {
  if (stepPx <= 0 || count <= 1) return clampIndex(index, count);
  const travel = -(dragPx + velocity * FLICK_MS) / stepPx; // in cards; + = forward
  let delta = Math.sign(travel) * Math.floor(Math.abs(travel) + (1 - commitRatio));
  if (delta === 0 && Math.abs(velocity) >= FLICK_MIN_SPEED && Math.abs(dragPx) > 12)
    delta = velocity < 0 ? 1 : -1;
  return clampIndex(index + delta, count);
}

/** Drag offset with resistance when pulling past the first or last card. */
export function rubberBand(dragPx: number, index: number, count: number): number {
  const pastStart = index <= 0 && dragPx > 0;
  const pastEnd = index >= count - 1 && dragPx < 0;
  return pastStart || pastEnd ? dragPx * EDGE_RESISTANCE : dragPx;
}

/** Track translation (px) that centres card `index` in a viewport of `viewportPx`. */
export function trackOffset(
  index: number,
  viewportPx: number,
  slidePx: number,
  gapPx: number,
): number {
  return viewportPx / 2 - slidePx / 2 - index * (slidePx + gapPx);
}
