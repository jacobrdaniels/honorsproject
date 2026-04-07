import { describe, expect, it } from 'vitest';

import {
  buildPortfolioOptimizationResponseFromStoredRows,
  PortfolioOptimizationInputError,
} from './portfolioOptimization';
import type { StoredFactorRow } from '../db/factorDataRepository';
import type { StoredPriceBar } from '../db/marketDataRepository';
import type { OptimizationRequest } from '../types';

function toIsoDate(dayOffset: number): string {
  const baseDate = new Date('2024-01-02T00:00:00Z');
  baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
  return baseDate.toISOString().slice(0, 10);
}

function createPriceSeries(symbol: string, dailyReturns: number[]): StoredPriceBar[] {
  const rows: StoredPriceBar[] = [];
  let price = 100;

  rows.push({
    symbol,
    tradingDay: toIsoDate(0),
    open: price,
    high: price,
    low: price,
    close: price,
    adjustedClose: price,
    volume: 1000,
  });

  dailyReturns.forEach((dailyReturn, index) => {
    price *= 1 + dailyReturn;
    rows.push({
      symbol,
      tradingDay: toIsoDate(index + 1),
      open: price,
      high: price,
      low: price,
      close: price,
      adjustedClose: price,
      volume: 1000,
    });
  });

  return rows;
}

function buildUniverseFixture(observationCount = 150): {
  input: OptimizationRequest;
  priceRows: StoredPriceBar[];
  factorRows: StoredFactorRow[];
} {
  const lowVolReturns: number[] = [];
  const highVolReturns: number[] = [];
  const mediumReturns: number[] = [];

  for (let index = 0; index < observationCount; index += 1) {
    const wave = Math.sin(index * 0.35);
    const wave2 = Math.cos(index * 0.24);
    lowVolReturns.push(0.0003 + wave * 0.002);
    highVolReturns.push(0.0008 + wave * 0.012 + wave2 * 0.008);
    mediumReturns.push(0.0005 + wave2 * 0.006);
  }

  const input: OptimizationRequest = {
    universe: 'LOW, MED, HIGH',
    startDate: toIsoDate(0),
    endDate: toIsoDate(observationCount),
    objective: 'max_sharpe',
  };

  return {
    input,
    priceRows: [
      ...createPriceSeries('LOW', lowVolReturns),
      ...createPriceSeries('MED', mediumReturns),
      ...createPriceSeries('HIGH', highVolReturns),
    ],
    factorRows: [],
  };
}

describe('portfolioOptimization', () => {
  it('returns min-variance, max-sharpe, and a frontier envelope', () => {
    const fixture = buildUniverseFixture();
    const response = buildPortfolioOptimizationResponseFromStoredRows(
      fixture.input,
      fixture.priceRows,
      fixture.factorRows,
    );

    expect(response.assets).toHaveLength(3);
    expect(response.frontier.length).toBeGreaterThan(5);
    expect(response.minVariance.volatility).toBeLessThanOrEqual(response.maxSharpe.volatility + 0.01);
    expect(response.maxSharpe.sharpe).toBeGreaterThanOrEqual(response.minVariance.sharpe - 0.0001);

    for (let index = 1; index < response.frontier.length; index += 1) {
      const previous = response.frontier[index - 1];
      const current = response.frontier[index];
      expect(current).toBeDefined();
      expect(previous).toBeDefined();

      if (current && previous) {
        expect(current.expectedReturn).toBeGreaterThanOrEqual(previous.expectedReturn - 0.0001);
      }
    }

    const totalWeight = response.selected.weights.reduce((total, asset) => total + asset.weight, 0);
    expect(totalWeight).toBeCloseTo(100, 0);
  });

  it('honors a target return constraint when possible', () => {
    const fixture = buildUniverseFixture();
    const target = 12;
    const response = buildPortfolioOptimizationResponseFromStoredRows(
      { ...fixture.input, objective: 'target_return', targetReturn: target },
      fixture.priceRows,
      fixture.factorRows,
    );

    expect(response.objective).toBe('target_return');
    expect(response.targetReturn).toBeCloseTo(target, 5);

    if (response.maxSharpe.expectedReturn >= target) {
      expect(response.selected.expectedReturn).toBeGreaterThanOrEqual(target - 0.01);
    }
  });

  it('throws a clear error when the universe is too small', () => {
    const fixture = buildUniverseFixture();
    const tooSmall: OptimizationRequest = { ...fixture.input, universe: 'LOW' };

    expect(() => buildPortfolioOptimizationResponseFromStoredRows(
      tooSmall,
      fixture.priceRows,
      fixture.factorRows,
    )).toThrowError(PortfolioOptimizationInputError);
  });

  it('throws when a symbol has no stored price data', () => {
    const fixture = buildUniverseFixture();
    const missing: OptimizationRequest = { ...fixture.input, universe: 'LOW, MED, MISSING' };

    expect(() => buildPortfolioOptimizationResponseFromStoredRows(
      missing,
      fixture.priceRows,
      fixture.factorRows,
    )).toThrowError(/Not enough stored market data/);
  });
});
