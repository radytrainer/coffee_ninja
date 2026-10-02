import { describe, expect, it } from 'vitest';
import { pickInDirection, type Box } from './spatialNavigation';

const box = (x: number, y: number, width = 100, height = 50): Box => ({ x, y, width, height });

// A 3×2 grid of buttons:
//  a b c
//  d e f
const grid = [
  { item: 'a', box: box(0, 0) },
  { item: 'b', box: box(150, 0) },
  { item: 'c', box: box(300, 0) },
  { item: 'd', box: box(0, 100) },
  { item: 'e', box: box(150, 100) },
  { item: 'f', box: box(300, 100) },
];
const others = (id: string) => grid.filter((g) => g.item !== id);
const from = (id: string) => grid.find((g) => g.item === id)!.box;

describe('spatial keyboard navigation', () => {
  it('moves to the nearest aligned neighbour', () => {
    expect(pickInDirection(from('a'), others('a'), 'right')).toBe('b');
    expect(pickInDirection(from('a'), others('a'), 'down')).toBe('d');
    expect(pickInDirection(from('e'), others('e'), 'up')).toBe('b');
    expect(pickInDirection(from('e'), others('e'), 'left')).toBe('d');
  });

  it('returns null at the edges', () => {
    expect(pickInDirection(from('c'), others('c'), 'right')).toBeNull();
    expect(pickInDirection(from('a'), others('a'), 'up')).toBeNull();
  });

  it('prefers alignment over raw distance', () => {
    const items = [
      { item: 'far-aligned', box: box(0, 300) },
      { item: 'near-diagonal', box: box(160, 120) },
    ];
    expect(pickInDirection(box(0, 0), items, 'down')).toBe('far-aligned');
  });
});
