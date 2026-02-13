import { describe, expect, it } from 'vitest';

import {
  formatAllocationString,
  normalizeAllocationWeights,
  parseAllocationString,
  parseTickerList,
  sumAllocationWeights,
} from './portfolioInput';

describe('portfolioInput helpers', () => {
  it('parses and merges allocation strings', () => {
    expect(parseAllocationString('vti:60, vxus:20, vti:5, bad-input')).toEqual([
      { symbol: 'VTI', weight: 65 },
      { symbol: 'VXUS', weight: 20 },
    ]);
  });

  it('formats allocation strings', () => {
    expect(formatAllocationString([
      { symbol: 'VTI', weight: 60 },
      { symbol: 'VXUS', weight: 20.5 },
    ])).toBe('VTI:60, VXUS:20.5');
  });

  it('normalizes weights to one hundred percent', () => {
    const allocations = normalizeAllocationWeights([
      { symbol: 'VTI', weight: 3 },
      { symbol: 'VXUS', weight: 1 },
    ]);

    expect(sumAllocationWeights(allocations)).toBe(100);
    expect(allocations[0]?.weight).toBe(75);
    expect(allocations[1]?.weight).toBe(25);
  });

  it('parses unique ticker lists', () => {
    expect(parseTickerList('vti, vxus, vti, bnd')).toEqual(['VTI', 'VXUS', 'BND']);
  });
});
