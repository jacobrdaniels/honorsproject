import { getHistoricalPrices, type StoredPriceBar } from '../db/marketDataRepository';
import type {
  AssetAllocation,
  BacktestAnnualReturn,
  BacktestAssetBreakdown,
  BacktestBenchmarkRelativeMetrics,
  BacktestDrawdownPoint,
  BacktestMonthlyReturnRow,
  BacktestRequest,
  BacktestResponse,
  BacktestRebalanceMode,
  BacktestSeriesPoint,
  BacktestSummary,
} from '../types';
import { parseValidatedAllocationString } from './portfolioInput';

type PricePoint = {
  period: string;
  value: number;
};

type NullablePricePoint = {
  period: string;
  value: number | null;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function getNormalizedPortfolio(allocations: string): AssetAllocation[] {
  return parseValidatedAllocationString(allocations);
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

function getCommonTradingDays(symbols: string[], rowsBySymbol: Map<string, StoredPriceBar[]>): string[] {
  let commonDays: Set<string> | null = null;

  for (const symbol of symbols) {
    const rows = rowsBySymbol.get(symbol) ?? [];

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

function calculatePortfolioValue(
  holdings: Map<string, number>,
  portfolio: AssetAllocation[],
  tradingDay: string,
  priceLookup: Map<string, Map<string, number>>,
): number | null {
  let total = 0;

  for (const asset of portfolio) {
    const shares = holdings.get(asset.symbol);
    const price = priceLookup.get(asset.symbol)?.get(tradingDay);

    if (!shares || !price) {
      return null;
    }

    total += shares * price;
  }

  return total;
}

function buildTargetHoldings(
  portfolio: AssetAllocation[],
  tradingDay: string,
  priceLookup: Map<string, Map<string, number>>,
  portfolioValue: number,
): Map<string, number> | null {
  const holdings = new Map<string, number>();

  for (const asset of portfolio) {
    const price = priceLookup.get(asset.symbol)?.get(tradingDay);

    if (!price) {
      return null;
    }

    holdings.set(asset.symbol, (portfolioValue * (asset.weight / 100)) / price);
  }

  return holdings;
}

function getRebalanceBucket(tradingDay: string, rebalanceMode: BacktestRebalanceMode): string {
  if (rebalanceMode === 'none') {
    return tradingDay;
  }

  const [year, month] = tradingDay.split('-');

  if (rebalanceMode === 'annual') {
    return `${year}`;
  }

  if (rebalanceMode === 'quarterly') {
    const quarter = Math.floor((Number(month) - 1) / 3) + 1;
    return `${year}-Q${quarter}`;
  }

  return `${year}-${month}`;
}

function shouldRebalance(
  previousTradingDay: string | undefined,
  currentTradingDay: string,
  rebalanceMode: BacktestRebalanceMode,
): boolean {
  if (!previousTradingDay || rebalanceMode === 'none') {
    return false;
  }

  return getRebalanceBucket(previousTradingDay, rebalanceMode) !== getRebalanceBucket(currentTradingDay, rebalanceMode);
}

function buildPortfolioCurve(
  portfolio: AssetAllocation[],
  tradingDays: string[],
  priceLookup: Map<string, Map<string, number>>,
  rebalanceMode: BacktestRebalanceMode,
): PricePoint[] {
  let holdings = buildTargetHoldings(portfolio, tradingDays[0] ?? '', priceLookup, 10000);

  if (!holdings) {
    return [];
  }

  const curve: PricePoint[] = [];

  for (let index = 0; index < tradingDays.length; index += 1) {
    const tradingDay = tradingDays[index] ?? '';
    const value = calculatePortfolioValue(holdings, portfolio, tradingDay, priceLookup);

    if (value === null) {
      return [];
    }

    curve.push({
      period: tradingDay,
      value: round(value),
    });

    if (shouldRebalance(tradingDays[index - 1], tradingDay, rebalanceMode)) {
      holdings = buildTargetHoldings(portfolio, tradingDay, priceLookup, value);

      if (!holdings) {
        return [];
      }
    }
  }

  return curve;
}

function buildBenchmarkCurve(
  benchmark: string,
  tradingDays: string[],
  priceLookup: Map<string, Map<string, number>>,
): NullablePricePoint[] {
  const prices = priceLookup.get(benchmark);
  let basePrice: number | null = null;

  return tradingDays.map((tradingDay) => {
    const price = prices?.get(tradingDay) ?? null;

    if (price === null) {
      return {
        period: tradingDay,
        value: null,
      };
    }

    if (basePrice === null) {
      basePrice = price;
    }

    return {
      period: tradingDay,
      value: round((price / basePrice) * 10000),
    };
  });
}

function buildStandaloneAssetCurve(
  symbol: string,
  tradingDays: string[],
  priceLookup: Map<string, Map<string, number>>,
): PricePoint[] {
  const prices = priceLookup.get(symbol);
  const basePrice = prices?.get(tradingDays[0] ?? '');

  if (!prices || !basePrice) {
    return [];
  }

  const curve = tradingDays.map((tradingDay) => {
    const price = prices.get(tradingDay);

    if (!price) {
      return null;
    }

    return {
      period: tradingDay,
      value: round((price / basePrice) * 10000),
    };
  });

  return curve.every((point) => point !== null) ? curve : [];
}

function getDailyReturns(values: PricePoint[]): number[] {
  const returns: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];

    if (!previous || !current || previous.value === 0) {
      continue;
    }

    returns.push(current.value / previous.value - 1);
  }

  return returns;
}

function getPairedDailyReturns(
  portfolioCurve: PricePoint[],
  benchmarkCurve: NullablePricePoint[],
): Array<{ portfolio: number; benchmark: number }> {
  const pairedReturns: Array<{ portfolio: number; benchmark: number }> = [];

  for (let index = 1; index < portfolioCurve.length; index += 1) {
    const previousPortfolio = portfolioCurve[index - 1];
    const currentPortfolio = portfolioCurve[index];
    const previousBenchmark = benchmarkCurve[index - 1];
    const currentBenchmark = benchmarkCurve[index];

    if (
      !previousPortfolio
      || !currentPortfolio
      || !previousBenchmark
      || !currentBenchmark
      || previousBenchmark.value === null
      || currentBenchmark.value === null
      || previousPortfolio.value === 0
      || previousBenchmark.value === 0
    ) {
      continue;
    }

    pairedReturns.push({
      portfolio: currentPortfolio.value / previousPortfolio.value - 1,
      benchmark: currentBenchmark.value / previousBenchmark.value - 1,
    });
  }

  return pairedReturns;
}

function calculateMean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function calculateVariance(values: number[], mean: number): number {
  return values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
}

function calculateAnnualizedVolatility(values: PricePoint[]): number {
  const dailyReturns = getDailyReturns(values);

  if (dailyReturns.length === 0) {
    return 0;
  }

  const mean = calculateMean(dailyReturns);
  const variance = calculateVariance(dailyReturns, mean);

  return round(Math.sqrt(variance) * Math.sqrt(252) * 100);
}

function calculateSharpe(values: PricePoint[]): number {
  const dailyReturns = getDailyReturns(values);

  if (dailyReturns.length === 0) {
    return 0;
  }

  const mean = calculateMean(dailyReturns);
  const variance = calculateVariance(dailyReturns, mean);
  const standardDeviation = Math.sqrt(variance);

  if (standardDeviation === 0) {
    return 0;
  }

  return round((mean / standardDeviation) * Math.sqrt(252));
}

function buildBenchmarkRelativeMetrics(
  portfolioSummary: BacktestSummary,
  benchmarkSummary: BacktestSummary,
  portfolioCurve: PricePoint[],
  benchmarkCurve: NullablePricePoint[],
): BacktestBenchmarkRelativeMetrics {
  const pairedReturns = getPairedDailyReturns(portfolioCurve, benchmarkCurve);

  if (pairedReturns.length < 2) {
    return {
      excessReturn: round(portfolioSummary.totalReturn - benchmarkSummary.totalReturn),
      trackingError: null,
      informationRatio: null,
      beta: null,
      alpha: null,
      upsideCapture: null,
      downsideCapture: null,
    };
  }

  const activeReturns = pairedReturns.map((pair) => pair.portfolio - pair.benchmark);
  const activeMean = calculateMean(activeReturns);
  const trackingErrorVariance = calculateVariance(activeReturns, activeMean);
  const trackingError = Math.sqrt(trackingErrorVariance) * Math.sqrt(252);
  const benchmarkReturns = pairedReturns.map((pair) => pair.benchmark);
  const portfolioReturns = pairedReturns.map((pair) => pair.portfolio);
  const benchmarkMean = calculateMean(benchmarkReturns);
  const portfolioMean = calculateMean(portfolioReturns);
  const benchmarkVariance = calculateVariance(benchmarkReturns, benchmarkMean);
  const covariance = pairedReturns.reduce(
    (total, pair) => total + ((pair.portfolio - portfolioMean) * (pair.benchmark - benchmarkMean)),
    0,
  ) / pairedReturns.length;
  const beta = benchmarkVariance === 0 ? null : covariance / benchmarkVariance;
  const upsidePairs = pairedReturns.filter((pair) => pair.benchmark > 0);
  const downsidePairs = pairedReturns.filter((pair) => pair.benchmark < 0);

  return {
    excessReturn: round(portfolioSummary.totalReturn - benchmarkSummary.totalReturn),
    trackingError: round(trackingError * 100),
    informationRatio: trackingError === 0 ? null : round((activeMean / Math.sqrt(trackingErrorVariance)) * Math.sqrt(252)),
    beta: beta === null ? null : round(beta),
    alpha: beta === null ? null : round((portfolioMean - beta * benchmarkMean) * 252 * 100),
    upsideCapture: upsidePairs.length === 0
      ? null
      : round((calculateMean(upsidePairs.map((pair) => pair.portfolio)) / calculateMean(upsidePairs.map((pair) => pair.benchmark))) * 100),
    downsideCapture: downsidePairs.length === 0
      ? null
      : round((calculateMean(downsidePairs.map((pair) => pair.portfolio)) / calculateMean(downsidePairs.map((pair) => pair.benchmark))) * 100),
  };
}

function calculateDrawdowns(values: PricePoint[]): Array<{ period: string; value: number }> {
  let peak = values[0]?.value ?? 0;

  return values.map((point) => {
    peak = Math.max(peak, point.value);

    return {
      period: point.period,
      value: peak === 0 ? 0 : round(((point.value - peak) / peak) * 100),
    };
  });
}

function calculateNullableDrawdowns(values: NullablePricePoint[]): Array<{ period: string; value: number | null }> {
  let peak = 0;

  return values.map((point) => {
    if (point.value === null) {
      return {
        period: point.period,
        value: null,
      };
    }

    peak = Math.max(peak, point.value);

    return {
      period: point.period,
      value: peak === 0 ? 0 : round(((point.value - peak) / peak) * 100),
    };
  });
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

function buildPeriodReturnMap(points: PricePoint[], keySelector: (period: string) => string): Map<string, number> {
  const buckets: Array<{
    key: string;
    startPoint: PricePoint;
    endPoint: PricePoint;
    previousPoint: PricePoint | null;
  }> = [];

  let previousPoint: PricePoint | null = null;
  for (const point of points) {
    const key = keySelector(point.period);
    const lastBucket = buckets[buckets.length - 1];

    if (!lastBucket || lastBucket.key !== key) {
      buckets.push({
        key,
        startPoint: point,
        endPoint: point,
        previousPoint,
      });
    } else {
      lastBucket.endPoint = point;
    }

    previousPoint = point;
  }

  const returns = new Map<string, number>();

  for (const bucket of buckets) {
    const basePoint = bucket.previousPoint ?? bucket.startPoint;
    const { endPoint } = bucket;

    if (basePoint.value <= 0 || endPoint.value <= 0 || basePoint.period === endPoint.period) {
      continue;
    }

    returns.set(bucket.key, round(((endPoint.value / basePoint.value) - 1) * 100));
  }

  return returns;
}

function buildAnnualReturnMap(points: PricePoint[]): Map<string, number> {
  return buildPeriodReturnMap(points, (period) => period.slice(0, 4));
}

function buildMonthlyReturnMap(points: PricePoint[]): Map<string, number> {
  return buildPeriodReturnMap(points, (period) => period.slice(0, 7));
}

function toNonNullPoints(points: NullablePricePoint[]): PricePoint[] {
  return points.flatMap((point) => point.value === null ? [] : [{ period: point.period, value: point.value }]);
}

function buildSummary(values: PricePoint[], annualReturnMap: Map<string, number>): BacktestSummary {
  const endingValue = round(values[values.length - 1]?.value ?? 10000);
  const drawdowns = calculateDrawdowns(values);
  const annualReturns = [...annualReturnMap.values()];

  return {
    totalReturn: round(((endingValue / 10000) - 1) * 100),
    cagr: calculateCagr(values),
    sharpe: calculateSharpe(values),
    volatility: calculateAnnualizedVolatility(values),
    maxDrawdown: Math.min(...drawdowns.map((point) => point.value), 0),
    endingValue,
    bestYear: annualReturns.length ? Math.max(...annualReturns) : null,
    worstYear: annualReturns.length ? Math.min(...annualReturns) : null,
  };
}

function buildAssetBreakdown(
  portfolio: AssetAllocation[],
  tradingDays: string[],
  priceLookup: Map<string, Map<string, number>>,
): BacktestAssetBreakdown[] {
  return portfolio.map((asset) => {
    const curve = buildStandaloneAssetCurve(asset.symbol, tradingDays, priceLookup);
    const annualReturns = buildAnnualReturnMap(curve);
    const summary = buildSummary(curve, annualReturns);

    return {
      symbol: asset.symbol,
      weight: asset.weight,
      totalReturn: summary.totalReturn,
      cagr: summary.cagr,
      volatility: summary.volatility,
      maxDrawdown: summary.maxDrawdown,
      endingValue: summary.endingValue,
    };
  });
}

function buildAnnualReturns(
  portfolioAnnualReturns: Map<string, number>,
  benchmarkAnnualReturns: Map<string, number>,
): BacktestAnnualReturn[] {
  const years = [...new Set([...portfolioAnnualReturns.keys(), ...benchmarkAnnualReturns.keys()])]
    .sort((left, right) => left.localeCompare(right));

  return years.map((year) => ({
    year,
    portfolio: portfolioAnnualReturns.get(year) ?? 0,
    benchmark: benchmarkAnnualReturns.get(year) ?? null,
  }));
}

function buildMonthlyReturns(
  portfolioMonthlyReturns: Map<string, number>,
  benchmarkMonthlyReturns: Map<string, number>,
  portfolioAnnualReturns: Map<string, number>,
  benchmarkAnnualReturns: Map<string, number>,
): BacktestMonthlyReturnRow[] {
  const years = [...new Set([
    ...[...portfolioMonthlyReturns.keys()].map((key) => key.slice(0, 4)),
    ...[...benchmarkMonthlyReturns.keys()].map((key) => key.slice(0, 4)),
  ])].sort((left, right) => left.localeCompare(right));

  return years.map((year) => ({
    year,
    portfolio: Array.from({ length: 12 }, (_, index) => portfolioMonthlyReturns.get(`${year}-${String(index + 1).padStart(2, '0')}`) ?? null),
    benchmark: Array.from({ length: 12 }, (_, index) => benchmarkMonthlyReturns.get(`${year}-${String(index + 1).padStart(2, '0')}`) ?? null),
    portfolioTotal: portfolioAnnualReturns.get(year) ?? null,
    benchmarkTotal: benchmarkAnnualReturns.get(year) ?? null,
  }));
}

function buildEquityCurve(
  portfolioCurve: PricePoint[],
  benchmarkCurve: NullablePricePoint[],
): BacktestSeriesPoint[] {
  return portfolioCurve.map((point, index) => ({
    period: point.period,
    portfolio: point.value,
    benchmark: benchmarkCurve[index]?.value ?? null,
  }));
}

function buildDrawdownCurve(
  portfolioCurve: PricePoint[],
  benchmarkCurve: NullablePricePoint[],
): BacktestDrawdownPoint[] {
  const portfolioDrawdowns = calculateDrawdowns(portfolioCurve);
  const benchmarkDrawdowns = calculateNullableDrawdowns(benchmarkCurve);

  return portfolioDrawdowns.map((point, index) => ({
    period: point.period,
    portfolio: point.value,
    benchmark: benchmarkDrawdowns[index]?.value ?? null,
  }));
}

export function buildBacktestResponseFromStoredRows(input: BacktestRequest, rows: StoredPriceBar[]): BacktestResponse | null {
  const portfolio = getNormalizedPortfolio(input.allocations);

  if (portfolio.length === 0) {
    return null;
  }

  const benchmark = input.benchmark.trim().toUpperCase() || 'SPY';
  const rowsBySymbol = groupRowsBySymbol(rows);
  const requiredSymbols = [...new Set([...portfolio.map((asset) => asset.symbol), benchmark])];
  const missingSymbols = requiredSymbols.filter((symbol) => (rowsBySymbol.get(symbol) ?? []).length < 2);

  if (missingSymbols.length > 0) {
    return null;
  }

  const tradingDays = getCommonTradingDays(requiredSymbols, rowsBySymbol);

  if (tradingDays.length < 2) {
    return null;
  }

  const priceLookup = buildPriceLookup(rowsBySymbol);
  const portfolioCurve = buildPortfolioCurve(portfolio, tradingDays, priceLookup, input.rebalanceMode);

  if (portfolioCurve.length < 2) {
    return null;
  }

  const benchmarkCurve = buildBenchmarkCurve(benchmark, tradingDays, priceLookup);
  const benchmarkNonNullCurve = toNonNullPoints(benchmarkCurve);
  const portfolioAnnualReturns = buildAnnualReturnMap(portfolioCurve);
  const benchmarkAnnualReturns = buildAnnualReturnMap(benchmarkNonNullCurve);
  const portfolioMonthlyReturns = buildMonthlyReturnMap(portfolioCurve);
  const benchmarkMonthlyReturns = buildMonthlyReturnMap(benchmarkNonNullCurve);
  const summary = buildSummary(portfolioCurve, portfolioAnnualReturns);
  const benchmarkSummary = buildSummary(benchmarkNonNullCurve, benchmarkAnnualReturns);
  const benchmarkTradingDays = benchmarkNonNullCurve.length;
  const notes = [
    'Backtest built from stored Yahoo Finance adjusted close data.',
    `Using ${tradingDays.length} aligned trading days across ${portfolio.length} holdings and benchmark ${benchmark}.`,
    input.startDate !== (tradingDays[0] ?? input.startDate) || input.endDate !== (tradingDays[tradingDays.length - 1] ?? input.endDate)
      ? `Shared holdings and benchmark history reduced the window from ${input.startDate} - ${input.endDate} to ${tradingDays[0]} - ${tradingDays[tradingDays.length - 1]}.`
      : 'Requested window matched the shared history across holdings and benchmark.',
    input.rebalanceMode === 'none'
      ? 'Portfolio runs as a buy-and-hold allocation after the initial weights are set.'
      : `Portfolio rebalances to target weights on a ${input.rebalanceMode} schedule.`,
    `${benchmark} is required and has full benchmark coverage over the effective backtest window.`,
  ];

  return {
    benchmark,
    startDate: tradingDays[0] ?? input.startDate,
    endDate: tradingDays[tradingDays.length - 1] ?? input.endDate,
    rebalanceMode: input.rebalanceMode,
    portfolio,
    summary,
    benchmarkSummary,
    benchmarkRelative: buildBenchmarkRelativeMetrics(summary, benchmarkSummary, portfolioCurve, benchmarkCurve),
    assetBreakdown: buildAssetBreakdown(portfolio, tradingDays, priceLookup),
    equityCurve: buildEquityCurve(portfolioCurve, benchmarkCurve),
    drawdownCurve: buildDrawdownCurve(portfolioCurve, benchmarkCurve),
    annualReturns: buildAnnualReturns(portfolioAnnualReturns, benchmarkAnnualReturns),
    monthlyReturns: buildMonthlyReturns(
      portfolioMonthlyReturns,
      benchmarkMonthlyReturns,
      portfolioAnnualReturns,
      benchmarkAnnualReturns,
    ),
    coverage: {
      requestedStartDate: input.startDate,
      requestedEndDate: input.endDate,
      tradingDays: tradingDays.length,
      benchmarkTradingDays,
      benchmarkStatus: 'full',
      missingSymbols,
    },
    notes,
  };
}

export async function buildBacktestResponseFromMarketData(input: BacktestRequest): Promise<BacktestResponse | null> {
  const portfolio = parseValidatedAllocationString(input.allocations);

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
