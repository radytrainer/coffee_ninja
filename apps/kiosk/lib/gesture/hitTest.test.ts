import { describe, expect, it } from 'vitest';
import { withinExpandedRect } from './hitTest';

describe('hover hysteresis', () => {
  const rect = { left: 100, top: 100, right: 160, bottom: 180 };

  it('keeps a hovered button while the cursor jitters just outside its edge', () => {
    expect(withinExpandedRect(rect, 95, 140, 28)).toBe(true); // 5 px left of the edge
    expect(withinExpandedRect(rect, 185, 140, 28)).toBe(true); // 25 px right of the edge
  });

  it('releases it once the cursor clearly leaves', () => {
    expect(withinExpandedRect(rect, 60, 140, 28)).toBe(false);
    expect(withinExpandedRect(rect, 130, 230, 28)).toBe(false);
  });
});
