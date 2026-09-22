import { describe, expect, it } from 'vitest';
import { spread } from '../src/modules/payments/allocation.js';

const lines = [
  { id: 'parts', weight: 12000 },
  { id: 'labor', weight: 8500 },
  { id: 'trip', weight: 4505 },
];

describe('allocation', () => {
  it('The allocated parts always add up to the total amount', () => {
    for (const total of [1, 2, 7, 2500, 25005, 999999]) {
      const out = spread(total, lines);
      const sum = Object.values(out).reduce((a, b) => a + b, 0);
      expect(sum).toBe(total);
    }
  });

  it('The same input always produces the same allocation, even with tied remainders', () => {
    const even = [
      { id: 'b', weight: 1 },
      { id: 'a', weight: 1 },
      { id: 'c', weight: 1 },
    ];
    const inOrder = spread(100, even);
    const reversed = spread(100, [...even].reverse());
    expect(inOrder).toEqual(reversed);
    expect(inOrder).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('Returns an empty result when there is nothing to allocate: never divide by zero', () => {
    expect(spread(0, lines)).toEqual({});
    expect(spread(100, [])).toEqual({});
    expect(spread(100, [{ id: 'x', weight: 0 }])).toEqual({});
  });

  it('Remainder cents go to the lines with the largest remainders', () => {
    const out = spread(2500, lines);
    expect(out).toEqual({ parts: 1200, labor: 850, trip: 450 });
  });
});
