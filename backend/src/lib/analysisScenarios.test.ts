import { describe, expect, it } from 'vitest';

import {
  buildBacktestResponse,
  buildEfficientFrontierResponse,
  buildFactorResponse,
  buildOptimizationResponse,
} from './analysisScenarios';

describe('analysisScenarios', () => {
  it('builds a backtest response from supplied inputs', () => {
    const response = buildBacktestResponse({
      benchmark: 'qqq',
      allocations: 'VTI:60, VXUS:20, BND:20',
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    });

    expect(response.benchmark).toBe('QQQ');
    expect(response.startDate).toBe('2020-01-01');
    expect(response.endDate).toBe('2024-01-01');
    expect(response.portfolio).toHaveLength(3);
    expect(response.summary.endingValue).toBeGreaterThan(10000);
    expect(response.notes.length).toBeGreaterThan(0);
  });

  it('builds a factor response using the provided tickers and model', () => {
    const response = buildFactorResponse({
      method: 'OLS',
      model: 'Four-Factor Model',
      tickers: 'VTI, VXUS, BND',
    });

    expect(response.regressionMethod).toBe('OLS');
    expect(response.factorModel).toBe('Four-Factor Model');
    expect(response.analyzedTickers).toEqual(['VTI', 'VXUS', 'BND']);
    expect(response.factors).toHaveLength(4);
  });

  it('falls back to a default frontier universe when input is incomplete', () => {
    const response = buildEfficientFrontierResponse({
      universe: 'VTI:0.08:0.16',
    });

    expect(response.universeCount).toBeGreaterThanOrEqual(3);
    expect(response.frontier).toHaveLength(5);
    expect(response.modelPortfolio.length).toBe(response.universeCount);
  });

  it('includes target return details in optimization results', () => {
    const response = buildOptimizationResponse({
      objective: 'Target Return',
      constraints: 'Stocks max 80%',
      targetReturn: 9,
      allocations: 'VTI:50, VXUS:25, BND:25',
    });

    expect(response.objective).toBe('Target Return');
    expect(response.targetReturn).toBe(9);
    expect(response.allocation).toHaveLength(3);
  });
});
