import { describe, expect, it } from 'vitest';
import { easeFactor, glideDistance, releaseVelocity, scrollDelta } from './gesture/handScroll';
import { rubberBand, snapIndex, trackOffset } from './carousel';

describe('hand scroll', () => {
  it('drags content with the hand: moving up scrolls down the list', () => {
    expect(scrollDelta(-0.1, 1000, 2)).toBe(200);
    expect(scrollDelta(0.05, 1000, 2)).toBe(-100);
  });

  it('eases toward the target independently of frame rate', () => {
    // Two 8 ms frames ≈ one 16 ms frame (60 fps vs 120 fps render the same motion).
    const two = 1 - (1 - easeFactor(8)) * (1 - easeFactor(8));
    expect(two).toBeCloseTo(easeFactor(16), 10);
    expect(easeFactor(0)).toBe(0);
    expect(easeFactor(1000)).toBeGreaterThan(0.99);
  });

  it('measures release velocity from recent hand samples and glides a finite distance', () => {
    const samples = [
      { t: 0, y: 0 },
      { t: 50, y: 50 },
      { t: 100, y: 100 },
    ];
    expect(releaseVelocity(samples, 100)).toBeCloseTo(1); // px/ms
    expect(releaseVelocity(samples, 1000)).toBe(0); // stale samples → no glide
    expect(glideDistance(1)).toBeGreaterThan(100);
    expect(glideDistance(0.001)).toBe(0);
  });
});

describe('product slideshow', () => {
  const STEP = 800; // card width + gap

  it('snaps to the nearest card after a slow drag', () => {
    expect(snapIndex(2, -300, 0, STEP, 6)).toBe(2); // not far enough → stays
    expect(snapIndex(2, -500, 0, STEP, 6)).toBe(3); // dragged left past half → next
    expect(snapIndex(2, 500, 0, STEP, 6)).toBe(1); // dragged right → previous
    expect(snapIndex(2, -1700, 0, STEP, 6)).toBe(4); // long drag skips cards
  });

  it('a quick flick always moves one card', () => {
    expect(snapIndex(2, -60, -0.8, STEP, 6)).toBe(3);
    expect(snapIndex(2, 60, 0.8, STEP, 6)).toBe(1);
    expect(snapIndex(2, -5, -0.8, STEP, 6)).toBe(2); // a twitch is not a flick
  });

  it('never goes past the first or last card, and resists being pulled past them', () => {
    expect(snapIndex(0, 900, 1, STEP, 6)).toBe(0);
    expect(snapIndex(5, -900, -1, STEP, 6)).toBe(5);
    expect(rubberBand(100, 0, 6)).toBeCloseTo(35);
    expect(rubberBand(-100, 5, 6)).toBeCloseTo(-35);
    expect(rubberBand(100, 3, 6)).toBe(100);
  });

  it('hand sweeps move on after 30 % of a card', () => {
    expect(snapIndex(2, -250, 0, STEP, 6, 0.3)).toBe(3); // 31 % → next
    expect(snapIndex(2, -200, 0, STEP, 6, 0.3)).toBe(2); // 25 % → stays
    expect(snapIndex(2, 250, 0, STEP, 6, 0.3)).toBe(1);
    expect(snapIndex(2, -1000, 0, STEP, 6, 0.3)).toBe(3); // 1.25 cards → 1 (0.25 < 30 %)
    expect(snapIndex(2, -1100, 0, STEP, 6, 0.3)).toBe(4); // 1.375 cards → 2
  });

  it('centres the current card', () => {
    // viewport 1000, card 600, gap 40: card 0 starts at 200; each next card 640 further left
    expect(trackOffset(0, 1000, 600, 40)).toBe(200);
    expect(trackOffset(2, 1000, 600, 40)).toBe(200 - 1280);
  });
});
