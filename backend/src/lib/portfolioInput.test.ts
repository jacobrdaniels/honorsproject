import { describe, expect, it } from 'vitest';

import {
  formatAllocationString,
  normalizeAllocationWeights,
  parseAllocationString,
  parseValidatedAllocationString,
  PortfolioInputError,
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

  it('validates allocation strings for long-only saved portfolios', () => {
    expect(parseValidatedAllocationString('vti:60, vxus:20, bnd:20')).toEqual([
      { symbol: 'VTI', weight: 60 },
      { symbol: 'VXUS', weight: 20 },
      { symbol: 'BND', weight: 20 },
    ]);

    expect(() => parseValidatedAllocationString('vti:60, vxus:-20, bnd:60')).toThrowError(PortfolioInputError);
    expect(() => parseValidatedAllocationString('vti:120, vti:-20')).toThrowError(/greater than 0/);
    expect(() => parseValidatedAllocationString('vti:60, vxus:20')).toThrowError(/add to 100/);
    expect(() => parseValidatedAllocationString('vti:100, bad-input')).toThrowError(/Invalid allocation entries/);
  });

  it('parses unique ticker lists', () => {
    expect(parseTickerList('vti, vxus, vti, bnd')).toEqual(['VTI', 'VXUS', 'BND']);
  });
});
