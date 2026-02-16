import { describe, expect, it } from 'vitest';

import { buildBacktestResponseFromStoredRows } from './marketDataBacktest';

describe('marketDataBacktest', () => {
  it('builds a backtest response from stored price rows', () => {
    const response = buildBacktestResponseFromStoredRows(
      {
        allocations: 'VTI:60, BND:40',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2024-01-05',
      },
      [
        { symbol: 'VTI', tradingDay: '2024-01-02', open: 100, high: 101, low: 99, close: 100, adjustedClose: 100, volume: 1000 },
        { symbol: 'VTI', tradingDay: '2024-01-03', open: 101, high: 102, low: 100, close: 101, adjustedClose: 101, volume: 1000 },
        { symbol: 'VTI', tradingDay: '2024-01-04', open: 103, high: 104, low: 102, close: 103, adjustedClose: 103, volume: 1000 },
        { symbol: 'BND', tradingDay: '2024-01-02', open: 80, high: 81, low: 79, close: 80, adjustedClose: 80, volume: 1000 },
        { symbol: 'BND', tradingDay: '2024-01-03', open: 80.5, high: 81, low: 80, close: 80.5, adjustedClose: 80.5, volume: 1000 },
        { symbol: 'BND', tradingDay: '2024-01-04', open: 81, high: 81.2, low: 80.8, close: 81, adjustedClose: 81, volume: 1000 },
        { symbol: 'SPY', tradingDay: '2024-01-02', open: 90, high: 91, low: 89, close: 90, adjustedClose: 90, volume: 1000 },
        { symbol: 'SPY', tradingDay: '2024-01-03', open: 91, high: 92, low: 90, close: 91, adjustedClose: 91, volume: 1000 },
        { symbol: 'SPY', tradingDay: '2024-01-04', open: 92, high: 93, low: 91, close: 92, adjustedClose: 92, volume: 1000 },
      ],
    );

    expect(response).not.toBeNull();
    expect(response?.portfolio).toHaveLength(2);
    expect(response?.summary.endingValue).toBeGreaterThan(10000);
    expect(response?.equityCurve.length).toBeGreaterThanOrEqual(2);
    expect(response?.notes[0]).toContain('Yahoo Finance');
  });

  it('returns null when not enough shared history exists', () => {
    const response = buildBacktestResponseFromStoredRows(
      {
        allocations: 'VTI:100',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2024-01-05',
      },
      [
        { symbol: 'VTI', tradingDay: '2024-01-02', open: 100, high: 101, low: 99, close: 100, adjustedClose: 100, volume: 1000 },
      ],
    );

    expect(response).toBeNull();
  });
});
