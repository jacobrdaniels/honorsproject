import { getHistoricalPrices, type StoredPriceBar } from '../db/marketDataRepository';
import type { AssetAllocation, BacktestResponse } from '../types';
import { normalizeAllocationWeights, parseAllocationString } from './portfolioInput';

type BacktestRequest = {
  allocations: string;
  benchmark: string;
  startDate: string;
  endDate: string;
};

type PricePoint = {
  period: string;
  value: number;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function getNormalizedPortfolio(allocations: string): AssetAllocation[] {
  return normalizeAllocationWeights(parseAllocationString(allocations));
}

function groupRowsBySymbol(rows: StoredPriceBar[]): Map<string, StoredPriceBar[]> {
  const rowsBySymbol = new Map<string, StoredPriceBar[]>();

  for (const row of rows) {
    const existingRows = rowsBySymbol.get(row.symbol) ?? [];
    existingRows.push(row);
    rowsBySymbol.set(row.symbol, existingRows);
  }

  for (const rowsForSymbol of rowsBySymbol.values()) {
    rowsForSymbol.sort((left, right) => left.tradingDay.localeCompare(right.tradingDay));
  }

  return rowsBySymbol;
}

function getCommonTradingDays(portfolio: AssetAllocation[], rowsBySymbol: Map<string, StoredPriceBar[]>): string[] {
  let commonDays: Set<string> | null = null;

  for (const asset of portfolio) {
    const rows = rowsBySymbol.get(asset.symbol) ?? [];

    if (rows.length < 2) {
      return [];
    }

    const tradingDays = new Set(rows.map((row) => row.tradingDay));

    if (commonDays === null) {
      commonDays = tradingDays;
      continue;
    }

    const nextCommonDays = new Set<string>();

    for (const day of commonDays) {
      if (tradingDays.has(day)) {
        nextCommonDays.add(day);
      }
    }

    commonDays = nextCommonDays;
  }

  return [...(commonDays ?? new Set<string>())].sort((left, right) => left.localeCompare(right));
}

function buildPriceLookup(rowsBySymbol: Map<string, StoredPriceBar[]>): Map<string, Map<string, number>> {
  const lookup = new Map<string, Map<string, number>>();

  for (const [symbol, rows] of rowsBySymbol.entries()) {
    lookup.set(symbol, new Map(rows.map((row) => [row.tradingDay, row.adjustedClose])));
  }

  return lookup;
}

function buildPortfolioCurve(
  portfolio: AssetAllocation[],
  tradingDays: string[],
  priceLookup: Map<string, Map<string, number>>,
): PricePoint[] {
  const startingValue = 10000;
  const basePrices = new Map<string, number>();

  for (const asset of portfolio) {
    const firstPrice = priceLookup.get(asset.symbol)?.get(tradingDays[0] ?? '');

    if (!firstPrice) {
      return [];
    }

    basePrices.set(asset.symbol, firstPrice);
  }

  return tradingDays.map((tradingDay) => {
    const value = portfolio.reduce((total, asset) => {
      const currentPrice = priceLookup.get(asset.symbol)?.get(tradingDay);
      const basePrice = basePrices.get(asset.symbol);

      if (!currentPrice || !basePrice) {
        return total;
      }

      return total + (asset.weight / 100) * (currentPrice / basePrice);
    }, 0);

    return {
      period: tradingDay,
      value: round(startingValue * value),
    };
  });
}

function sampleCurve(curve: PricePoint[], maxPoints = 12): PricePoint[] {
  if (curve.length <= maxPoints) {
    return curve;
  }

  const sampled = new Map<string, PricePoint>();

  for (let index = 0; index < maxPoints; index += 1) {
    const curveIndex = Math.round((index / (maxPoints - 1)) * (curve.length - 1));
    const point = curve[curveIndex];

    if (point) {
      sampled.set(point.period, point);
    }
  }

  return [...sampled.values()].sort((left, right) => left.period.localeCompare(right.period));
}

function calculateAnnualizedVolatility(values: PricePoint[]): number {
  const dailyReturns: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];

    if (!previous || !current || previous.value === 0) {
      continue;
    }

    dailyReturns.push(current.value / previous.value - 1);
  }

  if (dailyReturns.length === 0) {
    return 0;
  }

  const mean = dailyReturns.reduce((total, value) => total + value, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((total, value) => total + (value - mean) ** 2, 0) / dailyReturns.length;

  return round(Math.sqrt(variance) * Math.sqrt(252) * 100);
}

function calculateSharpe(values: PricePoint[]): number {
  const dailyReturns: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];

    if (!previous || !current || previous.value === 0) {
      continue;
    }

    dailyReturns.push(current.value / previous.value - 1);
  }

  if (dailyReturns.length === 0) {
    return 0;
  }

  const mean = dailyReturns.reduce((total, value) => total + value, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((total, value) => total + (value - mean) ** 2, 0) / dailyReturns.length;
  const standardDeviation = Math.sqrt(variance);

  if (standardDeviation === 0) {
    return 0;
  }

  return round((mean / standardDeviation) * Math.sqrt(252));
}

function calculateMaxDrawdown(values: PricePoint[]): number {
  let peak = values[0]?.value ?? 0;
  let maxDrawdown = 0;

  for (const point of values) {
    peak = Math.max(peak, point.value);

    if (peak === 0) {
      continue;
    }

    const drawdown = (point.value - peak) / peak;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
  }

  return round(maxDrawdown * 100);
}

function calculateCagr(values: PricePoint[]): number {
  const firstPoint = values[0];
  const lastPoint = values[values.length - 1];

  if (!firstPoint || !lastPoint || firstPoint.value <= 0 || lastPoint.value <= 0) {
    return 0;
  }

  const startTime = new Date(firstPoint.period).getTime();
  const endTime = new Date(lastPoint.period).getTime();
  const elapsedYears = (endTime - startTime) / (1000 * 60 * 60 * 24 * 365.25);

  if (elapsedYears <= 0) {
    return 0;
  }

  return round(((lastPoint.value / firstPoint.value) ** (1 / elapsedYears) - 1) * 100);
}

function calculateBenchmarkReturn(rowsBySymbol: Map<string, StoredPriceBar[]>, benchmark: string): string | null {
  const benchmarkRows = rowsBySymbol.get(benchmark);

  if (!benchmarkRows || benchmarkRows.length < 2) {
    return null;
  }

  const first = benchmarkRows[0];
  const last = benchmarkRows[benchmarkRows.length - 1];

  if (!first || !last || !first.adjustedClose) {
    return null;
  }

  const totalReturn = ((last.adjustedClose / first.adjustedClose) - 1) * 100;
  return `${benchmark} total return over the same window: ${round(totalReturn).toFixed(2)}%.`;
}

export function buildBacktestResponseFromStoredRows(input: BacktestRequest, rows: StoredPriceBar[]): BacktestResponse | null {
  const portfolio = getNormalizedPortfolio(input.allocations);

  if (portfolio.length === 0) {
    return null;
  }

  const rowsBySymbol = groupRowsBySymbol(rows);
  const tradingDays = getCommonTradingDays(portfolio, rowsBySymbol);

  if (tradingDays.length < 2) {
    return null;
  }

  const priceLookup = buildPriceLookup(rowsBySymbol);
  const fullCurve = buildPortfolioCurve(portfolio, tradingDays, priceLookup);

  if (fullCurve.length < 2) {
    return null;
  }

  const endingValue = round(fullCurve[fullCurve.length - 1]?.value ?? 10000);
  const benchmark = input.benchmark.trim().toUpperCase() || 'SPY';
  const benchmarkNote = calculateBenchmarkReturn(rowsBySymbol, benchmark);

  return {
    benchmark,
    startDate: tradingDays[0] ?? input.startDate,
    endDate: tradingDays[tradingDays.length - 1] ?? input.endDate,
    portfolio,
    summary: {
      cagr: calculateCagr(fullCurve),
      sharpe: calculateSharpe(fullCurve),
      volatility: calculateAnnualizedVolatility(fullCurve),
      maxDrawdown: calculateMaxDrawdown(fullCurve),
      endingValue,
    },
    equityCurve: sampleCurve(fullCurve),
    notes: [
      'Backtest built from stored Yahoo Finance adjusted close data.',
      `Using ${tradingDays.length} aligned trading days across ${portfolio.length} holdings.`,
      ...(benchmarkNote ? [benchmarkNote] : [`No stored benchmark series found for ${benchmark}.`]),
    ],
  };
}

export async function buildBacktestResponseFromMarketData(input: BacktestRequest): Promise<BacktestResponse | null> {
  const portfolio = getNormalizedPortfolio(input.allocations);

  if (portfolio.length === 0) {
    return null;
  }

  const benchmark = input.benchmark.trim().toUpperCase() || 'SPY';
  const rows = await getHistoricalPrices({
    symbols: [...portfolio.map((asset) => asset.symbol), benchmark],
    startDate: input.startDate,
    endDate: input.endDate,
  });

  return buildBacktestResponseFromStoredRows(input, rows);
}
