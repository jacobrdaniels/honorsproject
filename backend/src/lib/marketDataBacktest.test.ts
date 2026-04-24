import { describe, expect, it } from 'vitest';

import { buildBacktestResponseFromStoredRows } from './marketDataBacktest';
import { PortfolioInputError } from './portfolioInput';
import type { StoredPriceBar } from '../db/marketDataRepository';

function createRow(symbol: string, tradingDay: string, adjustedClose: number): StoredPriceBar {
  return {
    symbol,
    tradingDay,
    open: adjustedClose,
    high: adjustedClose,
    low: adjustedClose,
    close: adjustedClose,
    adjustedClose,
    volume: 1000,
  };
}

function createSeries(symbol: string, points: Array<[string, number]>): StoredPriceBar[] {
  return points.map(([tradingDay, adjustedClose]) => createRow(symbol, tradingDay, adjustedClose));
}

describe('marketDataBacktest', () => {
  it('reduces the window to shared history and aggregates annual and monthly returns', () => {
    const response = buildBacktestResponseFromStoredRows(
      {
        allocations: 'AAA:60, BBB:40',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2025-01-31',
        rebalanceMode: 'none',
      },
      [
        ...createSeries('AAA', [
          ['2024-01-02', 100],
          ['2024-01-31', 102],
          ['2024-02-01', 103],
          ['2024-02-29', 105],
          ['2024-12-02', 110],
          ['2024-12-31', 118],
          ['2025-01-02', 119],
          ['2025-01-31', 121],
        ]),
        ...createSeries('BBB', [
          ['2024-01-31', 100],
          ['2024-02-01', 100.5],
          ['2024-02-29', 101],
          ['2024-12-02', 109],
          ['2024-12-31', 111],
          ['2025-01-02', 112],
          ['2025-01-31', 110],
        ]),
        ...createSeries('SPY', [
          ['2024-02-01', 100],
          ['2024-02-29', 102],
          ['2024-12-02', 109],
          ['2024-12-31', 114],
          ['2025-01-02', 115],
          ['2025-01-31', 117],
        ]),
      ],
    );

    expect(response).not.toBeNull();
    expect(response?.startDate).toBe('2024-02-01');
    expect(response?.endDate).toBe('2025-01-31');
    expect(response?.coverage.tradingDays).toBe(6);
    expect(response?.coverage.benchmarkStatus).toBe('full');
    expect(response?.benchmarkSummary).not.toBeNull();
    expect(response?.equityCurve).toHaveLength(6);
    expect(response?.equityCurve.every((point) => point.benchmark !== null)).toBe(true);
    expect(response?.annualReturns.map((row) => row.year)).toEqual(['2024', '2025']);
    expect(response?.monthlyReturns.map((row) => row.year)).toEqual(['2024', '2025']);
    expect(response?.monthlyReturns[0]?.portfolio[1]).not.toBeNull();
    expect(response?.assetBreakdown).toHaveLength(2);
    expect(response?.benchmarkRelative.excessReturn).not.toBeNull();
    expect(response?.notes.some((note) => note.includes('reduced the window'))).toBe(true);
  });

  it('includes the prior trading day when calculating monthly and annual period returns', () => {
    const response = buildBacktestResponseFromStoredRows(
      {
        allocations: 'AAA:100',
        benchmark: 'SPY',
        startDate: '2023-12-29',
        endDate: '2024-02-29',
        rebalanceMode: 'none',
      },
      [
        ...createSeries('AAA', [
          ['2023-12-29', 100],
          ['2024-01-02', 110],
          ['2024-01-31', 121],
          ['2024-02-01', 133.1],
          ['2024-02-29', 146.41],
        ]),
        ...createSeries('SPY', [
          ['2023-12-29', 100],
          ['2024-01-02', 110],
          ['2024-01-31', 121],
          ['2024-02-01', 133.1],
          ['2024-02-29', 146.41],
        ]),
      ],
    );

    expect(response).not.toBeNull();
    expect(response?.monthlyReturns).toEqual([
      {
        year: '2024',
        portfolio: [21, 21, null, null, null, null, null, null, null, null, null, null],
        benchmark: [21, 21, null, null, null, null, null, null, null, null, null, null],
        portfolioTotal: 46.41,
        benchmarkTotal: 46.41,
      },
    ]);
    expect(response?.annualReturns).toEqual([
      {
        year: '2024',
        portfolio: 46.41,
        benchmark: 46.41,
      },
    ]);
  });

  it('changes the ending value when annual rebalancing is enabled', () => {
    const rows = [
      ...createSeries('AAA', [
        ['2024-01-02', 100],
        ['2024-12-31', 200],
        ['2025-01-02', 210],
        ['2025-12-31', 420],
      ]),
      ...createSeries('BBB', [
        ['2024-01-02', 100],
        ['2024-12-31', 50],
        ['2025-01-02', 50],
        ['2025-12-31', 50],
      ]),
      ...createSeries('SPY', [
        ['2024-01-02', 100],
        ['2024-12-31', 101],
        ['2025-01-02', 102],
        ['2025-12-31', 103],
      ]),
    ];

    const buyAndHold = buildBacktestResponseFromStoredRows(
      {
        allocations: 'AAA:50, BBB:50',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2025-12-31',
        rebalanceMode: 'none',
      },
      rows,
    );
    const annualRebalance = buildBacktestResponseFromStoredRows(
      {
        allocations: 'AAA:50, BBB:50',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2025-12-31',
        rebalanceMode: 'annual',
      },
      rows,
    );

    expect(buyAndHold).not.toBeNull();
    expect(annualRebalance).not.toBeNull();
    expect(buyAndHold?.summary.endingValue).toBeGreaterThan(annualRebalance?.summary.endingValue ?? 0);
    expect(annualRebalance?.notes.some((note) => note.includes('annual'))).toBe(true);
  });

  it('calculates drawdown statistics from the aligned value series', () => {
    const response = buildBacktestResponseFromStoredRows(
      {
        allocations: 'AAA:100',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2024-01-04',
        rebalanceMode: 'none',
      },
      [
        ...createSeries('AAA', [
          ['2024-01-02', 100],
          ['2024-01-03', 120],
          ['2024-01-04', 90],
        ]),
        ...createSeries('SPY', [
          ['2024-01-02', 100],
          ['2024-01-03', 105],
          ['2024-01-04', 95],
        ]),
      ],
    );

    expect(response).not.toBeNull();
    expect(response?.summary.maxDrawdown).toBe(-25);
    expect(response?.drawdownCurve[2]?.portfolio).toBe(-25);
  });

  it('computes benchmark-relative metrics when portfolio and benchmark move together', () => {
    const response = buildBacktestResponseFromStoredRows(
      {
        allocations: 'AAA:100',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2024-01-05',
        rebalanceMode: 'none',
      },
      [
        ...createSeries('AAA', [
          ['2024-01-02', 100],
          ['2024-01-03', 105],
          ['2024-01-04', 103],
          ['2024-01-05', 108],
        ]),
        ...createSeries('SPY', [
          ['2024-01-02', 100],
          ['2024-01-03', 105],
          ['2024-01-04', 103],
          ['2024-01-05', 108],
        ]),
      ],
    );

    expect(response).not.toBeNull();
    expect(response?.benchmarkRelative.excessReturn).toBe(0);
    expect(response?.benchmarkRelative.trackingError).toBe(0);
    expect(response?.benchmarkRelative.informationRatio).toBeNull();
    expect(response?.benchmarkRelative.beta).toBe(1);
    expect(response?.benchmarkRelative.alpha).toBe(0);
    expect(response?.benchmarkRelative.upsideCapture).toBe(100);
    expect(response?.benchmarkRelative.downsideCapture).toBe(100);
  });

  it('returns null when not enough shared history exists', () => {
    const response = buildBacktestResponseFromStoredRows(
      {
        allocations: 'AAA:100',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2024-01-05',
        rebalanceMode: 'none',
      },
      [
        createRow('AAA', '2024-01-02', 100),
      ],
    );

    expect(response).toBeNull();
  });

  it('requires stored benchmark history for the backtest window', () => {
    const response = buildBacktestResponseFromStoredRows(
      {
        allocations: 'AAA:100',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2024-01-05',
        rebalanceMode: 'none',
      },
      createSeries('AAA', [
        ['2024-01-02', 100],
        ['2024-01-03', 101],
        ['2024-01-04', 102],
      ]),
    );

    expect(response).toBeNull();
  });

  it('rejects allocations that are negative or do not add to one hundred percent', () => {
    const rows = [
      ...createSeries('AAA', [
        ['2024-01-02', 100],
        ['2024-01-03', 101],
      ]),
      ...createSeries('SPY', [
        ['2024-01-02', 100],
        ['2024-01-03', 101],
      ]),
    ];

    expect(() => buildBacktestResponseFromStoredRows(
      {
        allocations: 'AAA:80',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2024-01-03',
        rebalanceMode: 'none',
      },
      rows,
    )).toThrowError(/add to 100/);

    expect(() => buildBacktestResponseFromStoredRows(
      {
        allocations: 'AAA:120, BBB:-20',
        benchmark: 'SPY',
        startDate: '2024-01-02',
        endDate: '2024-01-03',
        rebalanceMode: 'none',
      },
      rows,
    )).toThrowError(PortfolioInputError);
  });
});
