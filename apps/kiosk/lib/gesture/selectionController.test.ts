import { describe, expect, it } from 'vitest';
import { SelectionController } from './selectionController';

describe('SelectionController (gesture safety)', () => {
  const make = () => new SelectionController<string>({ hoverDelayMs: 250, cooldownMs: 600 });

  it('never activates immediately when the cursor enters a button', () => {
    const c = make();
    c.hover('start', 1000);
    expect(c.decide('start', 1000)).toBe('hover-too-short');
    expect(c.decide('start', 1200)).toBe('hover-too-short');
    expect(c.decide('start', 1250)).toBe('activate');
  });

  it('restarts the hover timer when moving to another button', () => {
    const c = make();
    c.hover('a', 0);
    c.hover('b', 300);
    expect(c.decide('b', 400)).toBe('hover-too-short');
    expect(c.decide('b', 560)).toBe('activate');
  });

  it('a pinch landing on a different element never resets the hovered button (edge regression)', () => {
    const c = make();
    c.hover('scroll-up', 0);
    // Pinch position resolved just outside the hovered button:
    expect(c.decide('other', 500)).toBe('hover-too-short');
    // The hovered button stays armed — the next pinch works without moving out and back in.
    expect(c.isArmed(600)).toBe(true);
    expect(c.decide('scroll-up', 600)).toBe('activate');
  });

  it('pinching on empty space is reported as no-target', () => {
    const c = make();
    expect(c.decide(null, 1000)).toBe('no-target');
  });

  it('ignores pinches during the cooldown after a selection', () => {
    const c = make();
    c.hover('a', 0);
    expect(c.decide('a', 300)).toBe('activate');
    c.markActivated(300);
    expect(c.decide('a', 500)).toBe('cooldown');
    expect(c.isArmed(500)).toBe(false);
    expect(c.decide('a', 950)).toBe('activate');
  });

  it('reports disabled targets', () => {
    const c = make();
    c.hover('x', 0);
    expect(c.decide('x', 500, true)).toBe('disabled');
  });

  it('exposes hover progress for the cursor ring', () => {
    const c = make();
    c.hover('a', 0);
    expect(c.hoverProgress(125)).toBeCloseTo(0.5);
    expect(c.hoverProgress(1000)).toBe(1);
    expect(c.isArmed(260)).toBe(true);
  });
});
