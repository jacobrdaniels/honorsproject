import { getStoredFactorReturns, type StoredFactorRow } from '../db/factorDataRepository';
import { getHistoricalPrices, type StoredPriceBar } from '../db/marketDataRepository';
import type {
  AssetAllocation,
  OptimizationAssetStats,
  OptimizationCoverage,
  OptimizationPoint,
  OptimizationRequest,
  OptimizationResponse,
} from '../types';

export class PortfolioOptimizationInputError extends Error {}

const TRADING_DAYS_PER_YEAR = 252;
const SAMPLE_COUNT = 8000;
const CLOUD_SAMPLE_CAP = 600;
const FRONTIER_BINS = 40;
const MIN_PRICE_OBSERVATIONS = 30;

type ReturnMatrix = {
  tradingDays: string[];
  symbols: string[];
  returns: number[][];
};

type Statistics = {
  means: number[];
  covariance: number[][];
};

function parseSymbols(input: string): string[] {
  return [...new Set(
    input
      .split(',')
      .map((piece) => piece.trim().toUpperCase())
      .filter(Boolean),
  )];
}

function groupPricesBySymbol(rows: StoredPriceBar[]): Map<string, StoredPriceBar[]> {
  const grouped = new Map<string, StoredPriceBar[]>();

  for (const row of rows) {
    const list = grouped.get(row.symbol) ?? [];
    list.push(row);
    grouped.set(row.symbol, list);
  }

  for (const list of grouped.values()) {
    list.sort((left, right) => left.tradingDay.localeCompare(right.tradingDay));
  }

  return grouped;
}

function getCommonTradingDays(symbols: string[], grouped: Map<string, StoredPriceBar[]>): string[] {
  let common: Set<string> | null = null;

  for (const symbol of symbols) {
    const rows = grouped.get(symbol) ?? [];

    if (rows.length < 2) {
      return [];
    }

    const days = new Set(rows.map((row) => row.tradingDay));

    if (common === null) {
      common = days;
      continue;
    }

    const next = new Set<string>();
    for (const day of common) {
      if (days.has(day)) {
        next.add(day);
      }
    }
    common = next;
  }

  return [...(common ?? new Set<string>())].sort((left, right) => left.localeCompare(right));
}

function buildReturnMatrix(symbols: string[], grouped: Map<string, StoredPriceBar[]>): ReturnMatrix {
  const tradingDays = getCommonTradingDays(symbols, grouped);

  if (tradingDays.length < MIN_PRICE_OBSERVATIONS) {
    return { tradingDays, symbols, returns: [] };
  }

  const priceLookup = new Map<string, Map<string, number>>(
    symbols.map((symbol) => [
      symbol,
      new Map((grouped.get(symbol) ?? []).map((row) => [row.tradingDay, row.adjustedClose])),
    ]),
  );

  const returns: number[][] = [];

  for (let dayIndex = 1; dayIndex < tradingDays.length; dayIndex += 1) {
    const previousDay = tradingDays[dayIndex - 1] ?? '';
    const currentDay = tradingDays[dayIndex] ?? '';
    const row: number[] = [];

    for (const symbol of symbols) {
      const previous = priceLookup.get(symbol)?.get(previousDay);
      const current = priceLookup.get(symbol)?.get(currentDay);

      if (previous === undefined || current === undefined || previous === 0) {
        row.push(0);
        continue;
      }

      row.push(current / previous - 1);
    }

    returns.push(row);
  }

  return { tradingDays, symbols, returns };
}

function computeStatistics(returnMatrix: ReturnMatrix): Statistics {
  const { returns, symbols } = returnMatrix;
  const observationCount = returns.length;
  const assetCount = symbols.length;
  const means = new Array<number>(assetCount).fill(0);

  for (const row of returns) {
    for (let index = 0; index < assetCount; index += 1) {
      means[index] += row[index] ?? 0;
    }
  }

  for (let index = 0; index < assetCount; index += 1) {
    means[index] = (means[index] ?? 0) / observationCount;
  }

  const covariance: number[][] = Array.from({ length: assetCount }, () => new Array<number>(assetCount).fill(0));
  const divisor = Math.max(observationCount - 1, 1);

  for (const row of returns) {
    for (let i = 0; i < assetCount; i += 1) {
      const di = (row[i] ?? 0) - (means[i] ?? 0);
      for (let j = i; j < assetCount; j += 1) {
        const dj = (row[j] ?? 0) - (means[j] ?? 0);
        const covarianceRow = covariance[i] ?? [];
        covarianceRow[j] = (covarianceRow[j] ?? 0) + di * dj;
        covariance[i] = covarianceRow;
      }
    }
  }

  for (let i = 0; i < assetCount; i += 1) {
    for (let j = i; j < assetCount; j += 1) {
      const value = ((covariance[i]?.[j]) ?? 0) / divisor;
      const rowI = covariance[i] ?? [];
      const rowJ = covariance[j] ?? [];
      rowI[j] = value;
      rowJ[i] = value;
      covariance[i] = rowI;
      covariance[j] = rowJ;
    }
  }

  return { means, covariance };
}

function annualizeMeanVector(means: number[]): number[] {
  return means.map((value) => value * TRADING_DAYS_PER_YEAR);
}

function annualizeCovariance(covariance: number[][]): number[][] {
  return covariance.map((row) => row.map((value) => value * TRADING_DAYS_PER_YEAR));
}

function portfolioReturn(weights: number[], means: number[]): number {
  let total = 0;
  for (let index = 0; index < weights.length; index += 1) {
    total += (weights[index] ?? 0) * (means[index] ?? 0);
  }
  return total;
}

function portfolioVariance(weights: number[], covariance: number[][]): number {
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) {
      total += (weights[i] ?? 0) * (weights[j] ?? 0) * ((covariance[i]?.[j]) ?? 0);
    }
  }
  return Math.max(total, 0);
}

function sampleExponential(random: () => number): number {
  const uniform = Math.max(random(), Number.EPSILON);
  return -Math.log(uniform);
}

function sampleDirichlet(size: number, random: () => number): number[] {
  const draws = new Array<number>(size);
  let sum = 0;

  for (let index = 0; index < size; index += 1) {
    const value = sampleExponential(random);
    draws[index] = value;
    sum += value;
  }

  const normalizer = sum === 0 ? 1 : sum;
  return draws.map((value) => value / normalizer);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let temp = state;
    temp = Math.imul(temp ^ (temp >>> 15), temp | 1);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), temp | 61);
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}

type SamplePoint = {
  weights: number[];
  expectedReturn: number;
  volatility: number;
  sharpe: number;
};

function buildSamples(
  meansAnnual: number[],
  covarianceAnnual: number[][],
  riskFreeAnnual: number,
  sampleCount: number,
): SamplePoint[] {
  const samples = new Array<SamplePoint>(sampleCount);
  const random = createSeededRandom(0x5f3759df);
  const assetCount = meansAnnual.length;

  for (let index = 0; index < sampleCount; index += 1) {
    const weights = sampleDirichlet(assetCount, random);
    const expectedReturn = portfolioReturn(weights, meansAnnual);
    const volatility = Math.sqrt(portfolioVariance(weights, covarianceAnnual));
    const sharpe = volatility === 0 ? 0 : (expectedReturn - riskFreeAnnual) / volatility;
    samples[index] = { weights, expectedReturn, volatility, sharpe };
  }

  return samples;
}

function findMinVarianceSample(samples: SamplePoint[]): SamplePoint {
  let best = samples[0];

  for (const sample of samples) {
    if (!best || sample.volatility < best.volatility) {
      best = sample;
    }
  }

  if (!best) {
    throw new PortfolioOptimizationInputError('No candidate portfolios were generated.');
  }

  return best;
}

function findMaxSharpeSample(samples: SamplePoint[]): SamplePoint {
  let best = samples[0];

  for (const sample of samples) {
    if (!best || sample.sharpe > best.sharpe) {
      best = sample;
    }
  }

  if (!best) {
    throw new PortfolioOptimizationInputError('No candidate portfolios were generated.');
  }

  return best;
}

function findTargetReturnSample(samples: SamplePoint[], targetReturnAnnual: number): SamplePoint {
  let best: SamplePoint | null = null;

  for (const sample of samples) {
    if (sample.expectedReturn < targetReturnAnnual) {
      continue;
    }

    if (!best || sample.volatility < best.volatility) {
      best = sample;
    }
  }

  if (best) {
    return best;
  }

  let closest = samples[0];
  let closestGap = Number.POSITIVE_INFINITY;

  for (const sample of samples) {
    const gap = Math.abs(sample.expectedReturn - targetReturnAnnual);

    if (!closest || gap < closestGap) {
      closest = sample;
      closestGap = gap;
    }
  }

  if (!closest) {
    throw new PortfolioOptimizationInputError('No candidate portfolios were generated.');
  }

  return closest;
}

function buildFrontierEnvelope(samples: SamplePoint[]): SamplePoint[] {
  if (samples.length === 0) {
    return [];
  }

  let minReturn = Number.POSITIVE_INFINITY;
  let maxReturn = Number.NEGATIVE_INFINITY;

  for (const sample of samples) {
    if (sample.expectedReturn < minReturn) {
      minReturn = sample.expectedReturn;
    }

    if (sample.expectedReturn > maxReturn) {
      maxReturn = sample.expectedReturn;
    }
  }

  const firstSample = samples[0];

  if (!Number.isFinite(minReturn) || !Number.isFinite(maxReturn) || minReturn === maxReturn) {
    return firstSample ? [firstSample] : [];
  }

  const binSize = (maxReturn - minReturn) / FRONTIER_BINS;
  const bins: Array<SamplePoint | null> = new Array(FRONTIER_BINS).fill(null);

  for (const sample of samples) {
    const rawIndex = Math.floor((sample.expectedReturn - minReturn) / binSize);
    const binIndex = Math.min(Math.max(rawIndex, 0), FRONTIER_BINS - 1);
    const current = bins[binIndex];

    if (!current || sample.volatility < current.volatility) {
      bins[binIndex] = sample;
    }
  }

  const ordered = bins
    .filter((sample): sample is SamplePoint => sample !== null)
    .sort((left, right) => left.expectedReturn - right.expectedReturn);

  if (ordered.length === 0) {
    return [];
  }

  let minVarianceIndex = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index];
    const best = ordered[minVarianceIndex];
    if (current && best && current.volatility < best.volatility) {
      minVarianceIndex = index;
    }
  }

  return ordered.slice(minVarianceIndex);
}

function subsampleCloud(samples: SamplePoint[]): Array<{ volatility: number; expectedReturn: number }> {
  if (samples.length <= CLOUD_SAMPLE_CAP) {
    return samples.map((sample) => ({
      volatility: roundPercent(sample.volatility * 100),
      expectedReturn: roundPercent(sample.expectedReturn * 100),
    }));
  }

  const stride = Math.ceil(samples.length / CLOUD_SAMPLE_CAP);
  const result: Array<{ volatility: number; expectedReturn: number }> = [];

  for (let index = 0; index < samples.length; index += stride) {
    const sample = samples[index];
    if (!sample) {
      continue;
    }
    result.push({
      volatility: roundPercent(sample.volatility * 100),
      expectedReturn: roundPercent(sample.expectedReturn * 100),
    });
  }

  return result;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function round(value: number, digits = 2): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function buildWeights(symbols: string[], weights: number[]): AssetAllocation[] {
  return symbols.map((symbol, index) => ({
    symbol,
    weight: roundPercent((weights[index] ?? 0) * 100),
  }));
}

function toPoint(sample: SamplePoint, symbols: string[]): OptimizationPoint {
  return {
    expectedReturn: roundPercent(sample.expectedReturn * 100),
    volatility: roundPercent(sample.volatility * 100),
    sharpe: round(sample.sharpe, 3),
    weights: buildWeights(symbols, sample.weights),
  };
}

function averageFactorRiskFree(rows: StoredFactorRow[]): number | null {
  if (rows.length === 0) {
    return null;
  }

  let total = 0;

  for (const row of rows) {
    total += row.riskFree;
  }

  return (total / rows.length) / 100;
}

type RiskFreeResolution = {
  riskFreeAnnualFraction: number;
  source: OptimizationCoverage['riskFreeSource'];
};

function resolveRiskFreeRate(input: OptimizationRequest, factorRows: StoredFactorRow[]): RiskFreeResolution {
  if (Number.isFinite(input.riskFreeRate) && input.riskFreeRate !== undefined) {
    return {
      riskFreeAnnualFraction: input.riskFreeRate / 100,
      source: 'override',
    };
  }

  const dailyFactorRiskFree = averageFactorRiskFree(factorRows);

  if (dailyFactorRiskFree !== null) {
    return {
      riskFreeAnnualFraction: dailyFactorRiskFree * TRADING_DAYS_PER_YEAR,
      source: 'factor_returns',
    };
  }

  return {
    riskFreeAnnualFraction: 0,
    source: 'default',
  };
}

function buildAssetStats(symbols: string[], means: number[], covariance: number[][]): OptimizationAssetStats[] {
  return symbols.map((symbol, index) => ({
    symbol,
    expectedReturn: roundPercent((means[index] ?? 0) * 100),
    volatility: roundPercent(Math.sqrt(((covariance[index]?.[index]) ?? 0)) * 100),
  }));
}

function buildNotes(
  input: OptimizationRequest,
  symbols: string[],
  tradingDays: string[],
  riskFreeResolution: RiskFreeResolution,
  sampleCount: number,
): string[] {
  const notes = [
    `Estimated means and covariance from ${tradingDays.length} common trading days across ${symbols.length} holdings.`,
    'Returns are annualized by multiplying the daily average by 252, and the daily covariance by 252.',
    `Explored ${sampleCount} long-only, fully-invested portfolios drawn from a Dirichlet distribution on the simplex.`,
    'The efficient frontier is the upper-left envelope of the sampled portfolios.',
  ];

  if (riskFreeResolution.source === 'factor_returns') {
    notes.push('Risk-free rate is the average Ken French daily risk-free rate inside the window (annualized).');
  } else if (riskFreeResolution.source === 'override') {
    notes.push('Risk-free rate was supplied by the request.');
  } else {
    notes.push('No factor data inside the window, so the risk-free rate defaulted to 0%.');
  }

  if (input.objective === 'target_return') {
    notes.push('Target-return selection picks the lowest-variance sample with expected return at or above the target; if none exists, it picks the closest one.');
  }

  return notes;
}

export function buildPortfolioOptimizationResponseFromStoredRows(
  input: OptimizationRequest,
  priceRows: StoredPriceBar[],
  factorRows: StoredFactorRow[],
): OptimizationResponse {
  const requestedSymbols = parseSymbols(input.universe);

  if (requestedSymbols.length < 2) {
    throw new PortfolioOptimizationInputError('Provide at least two unique tickers for the universe.');
  }

  const grouped = groupPricesBySymbol(priceRows);
  const missingSymbols = requestedSymbols.filter((symbol) => (grouped.get(symbol) ?? []).length < 2);

  if (missingSymbols.length > 0) {
    throw new PortfolioOptimizationInputError(
      `Not enough stored market data is available for: ${missingSymbols.join(', ')}.`,
    );
  }

  const returnMatrix = buildReturnMatrix(requestedSymbols, grouped);

  if (returnMatrix.returns.length < MIN_PRICE_OBSERVATIONS) {
    throw new PortfolioOptimizationInputError(
      `Only ${returnMatrix.returns.length} common daily observations were found. Try a longer window or a smaller universe.`,
    );
  }

  const dailyStatistics = computeStatistics(returnMatrix);
  const meansAnnual = annualizeMeanVector(dailyStatistics.means);
  const covarianceAnnual = annualizeCovariance(dailyStatistics.covariance);

  const riskFreeResolution = resolveRiskFreeRate(input, factorRows);
  const samples = buildSamples(meansAnnual, covarianceAnnual, riskFreeResolution.riskFreeAnnualFraction, SAMPLE_COUNT);

  const minVarianceSample = findMinVarianceSample(samples);
  const maxSharpeSample = findMaxSharpeSample(samples);
  const frontierSamples = buildFrontierEnvelope(samples);

  const targetReturnAnnualFraction = input.targetReturn !== undefined && Number.isFinite(input.targetReturn)
    ? input.targetReturn / 100
    : null;

  let selectedSample: SamplePoint;

  if (input.objective === 'min_variance') {
    selectedSample = minVarianceSample;
  } else if (input.objective === 'target_return') {
    if (targetReturnAnnualFraction === null) {
      throw new PortfolioOptimizationInputError('Provide a target return for the Target Return objective.');
    }
    selectedSample = findTargetReturnSample(samples, targetReturnAnnualFraction);
  } else {
    selectedSample = maxSharpeSample;
  }

  const firstTradingDay = returnMatrix.tradingDays[0] ?? input.startDate;
  const lastTradingDay = returnMatrix.tradingDays[returnMatrix.tradingDays.length - 1] ?? input.endDate;

  const coverage: OptimizationCoverage = {
    requestedStartDate: input.startDate,
    requestedEndDate: input.endDate,
    startDate: firstTradingDay,
    endDate: lastTradingDay,
    tradingDays: returnMatrix.tradingDays.length,
    availableSymbols: requestedSymbols,
    missingSymbols: [],
    riskFreeSource: riskFreeResolution.source,
  };

  return {
    objective: input.objective,
    targetReturn: targetReturnAnnualFraction !== null ? roundPercent(targetReturnAnnualFraction * 100) : null,
    startDate: firstTradingDay,
    endDate: lastTradingDay,
    riskFreeRate: roundPercent(riskFreeResolution.riskFreeAnnualFraction * 100),
    assets: buildAssetStats(requestedSymbols, meansAnnual, covarianceAnnual),
    samplePoints: subsampleCloud(samples),
    frontier: frontierSamples.map((sample) => toPoint(sample, requestedSymbols)),
    minVariance: toPoint(minVarianceSample, requestedSymbols),
    maxSharpe: toPoint(maxSharpeSample, requestedSymbols),
    selected: toPoint(selectedSample, requestedSymbols),
    coverage,
    notes: buildNotes(input, requestedSymbols, returnMatrix.tradingDays, riskFreeResolution, SAMPLE_COUNT),
  };
}

export async function buildPortfolioOptimizationResponseFromMarketData(
  input: OptimizationRequest,
): Promise<OptimizationResponse> {
  const requestedSymbols = parseSymbols(input.universe);

  if (requestedSymbols.length < 2) {
    throw new PortfolioOptimizationInputError('Provide at least two unique tickers for the universe.');
  }

  const priceRows = await getHistoricalPrices({
    symbols: requestedSymbols,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const factorRows = await getStoredFactorReturns({
    factorSet: 'us_ff6_daily',
    startDate: input.startDate,
    endDate: input.endDate,
  });

  return buildPortfolioOptimizationResponseFromStoredRows(input, priceRows, factorRows);
}
