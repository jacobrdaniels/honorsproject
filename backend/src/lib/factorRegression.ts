import { getStoredFactorReturns, type StoredFactorRow } from '../db/factorDataRepository';
import { getHistoricalPrices, type StoredPriceBar } from '../db/marketDataRepository';
import type {
  AssetAllocation,
  BacktestRebalanceMode,
  FactorCoefficientSignificance,
  FactorColumnKey,
  FactorFrequency,
  FactorRegressionCoefficient,
  FactorRegressionRollingPoint,
  FactorRequest,
  FactorResponse,
} from '../types';
import { normalizeAllocationWeights, parseAllocationString } from './portfolioInput';

type PricePoint = {
  period: string;
  value: number;
};

type ReturnPoint = {
  period: string;
  value: number;
};

type FactorModelDefinition = Array<{
  name: string;
  key: FactorColumnKey;
}>;

type FrequencyConfig = {
  factorSet: string;
  periodsPerYear: number;
  rollingWindowSize: number;
  minObservations: number;
  minDailyObservationsPerBucket: number;
  periodLabelSingular: string;
  periodLabelPlural: string;
  availableFactors: FactorColumnKey[];
};

type FactorValueMap = Record<FactorColumnKey, number | null>;

type AlignedObservation = {
  period: string;
  portfolioReturn: number;
  portfolioExcess: number;
  riskFree: number;
  factorValues: FactorValueMap;
  selectedFactorValues: number[];
};

type RegressionResult = {
  coefficients: number[];
  fitted: number[];
  residuals: number[];
  standardErrors: Array<number | null>;
  tStatistics: Array<number | null>;
  rSquared: number;
  adjustedRSquared: number;
};

const YEAR_IN_MS = 1000 * 60 * 60 * 24 * 365.25;

export const FACTOR_COLUMN_NAMES: Record<FactorColumnKey, string> = {
  marketExcess: 'MKT-RF',
  smb: 'SMB',
  hml: 'HML',
  momentum: 'MOM',
  rmw: 'RMW',
  cma: 'CMA',
};

const FACTOR_COLUMN_ORDER: FactorColumnKey[] = ['marketExcess', 'smb', 'hml', 'momentum', 'rmw', 'cma'];

export const FREQUENCY_CONFIG: Record<FactorFrequency, FrequencyConfig> = {
  daily: {
    factorSet: 'us_ff6_daily',
    periodsPerYear: 252,
    rollingWindowSize: 60,
    minObservations: 30,
    minDailyObservationsPerBucket: 1,
    periodLabelSingular: 'day',
    periodLabelPlural: 'daily observations',
    availableFactors: ['marketExcess', 'smb', 'hml', 'momentum', 'rmw', 'cma'],
  },
  weekly: {
    factorSet: 'us_ff3_weekly',
    periodsPerYear: 52,
    rollingWindowSize: 26,
    minObservations: 30,
    minDailyObservationsPerBucket: 3,
    periodLabelSingular: 'week',
    periodLabelPlural: 'weekly observations',
    availableFactors: ['marketExcess', 'smb', 'hml'],
  },
  monthly: {
    factorSet: 'us_ff4_monthly',
    periodsPerYear: 12,
    rollingWindowSize: 24,
    minObservations: 24,
    minDailyObservationsPerBucket: 10,
    periodLabelSingular: 'month',
    periodLabelPlural: 'monthly observations',
    availableFactors: ['marketExcess', 'smb', 'hml', 'momentum'],
  },
};

function resolveFrequencyConfig(frequency: FactorFrequency): FrequencyConfig {
  const config = FREQUENCY_CONFIG[frequency];
  if (!config) {
    throw new FactorRegressionInputError(`Unsupported factor frequency: ${String(frequency)}.`);
  }
  return config;
}

function buildFactorDefinition(factors: FactorColumnKey[]): FactorModelDefinition {
  const seen = new Set<FactorColumnKey>();
  const deduped: FactorColumnKey[] = [];
  for (const key of factors) {
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(key);
    }
  }

  deduped.sort((left, right) => FACTOR_COLUMN_ORDER.indexOf(left) - FACTOR_COLUMN_ORDER.indexOf(right));

  return deduped.map((key) => ({ key, name: FACTOR_COLUMN_NAMES[key] }));
}

function formatFactorList(keys: FactorColumnKey[]): string {
  return keys.map((key) => FACTOR_COLUMN_NAMES[key]).join(', ');
}

export class FactorRegressionInputError extends Error {}

function round(value: number, digits = 2): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
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

    if (shares === undefined || price === undefined) {
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

    if (price === undefined) {
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
    return year ?? tradingDay;
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
      value,
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

function buildDailyReturns(values: PricePoint[]): ReturnPoint[] {
  const returns: ReturnPoint[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];

    if (!previous || !current || previous.value === 0) {
      continue;
    }

    returns.push({
      period: current.period,
      value: current.value / previous.value - 1,
    });
  }

  return returns;
}

function calculateMean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function calculateVariance(values: number[], mean: number): number {
  return values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
}

function calculateAnnualizedVolatility(values: number[], periodsPerYear: number): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = calculateMean(values);
  const variance = calculateVariance(values, mean);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100;
}

function calculateCagrFromReturns(points: ReturnPoint[], periodsPerYear: number): number {
  if (points.length === 0) {
    return 0;
  }

  const cumulativeGrowth = points.reduce((total, point) => total * (1 + point.value), 1);
  const startTime = new Date(points[0]?.period ?? '').getTime();
  const endTime = new Date(points[points.length - 1]?.period ?? '').getTime();
  const elapsedYears = endTime > startTime
    ? (endTime - startTime) / YEAR_IN_MS
    : points.length / periodsPerYear;

  if (elapsedYears <= 0 || cumulativeGrowth <= 0) {
    return 0;
  }

  return ((cumulativeGrowth ** (1 / elapsedYears)) - 1) * 100;
}

function transposeMatrix(matrix: number[][]): number[][] {
  return matrix[0]?.map((_, columnIndex) => matrix.map((row) => row[columnIndex] ?? 0)) ?? [];
}

function multiplyMatrices(left: number[][], right: number[][]): number[][] {
  return left.map((row) => right[0]?.map((_, columnIndex) => (
    row.reduce((total, value, rowIndex) => total + value * (right[rowIndex]?.[columnIndex] ?? 0), 0)
  )) ?? []);
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((total, value, index) => total + value * (vector[index] ?? 0), 0));
}

function dotProduct(left: number[], right: number[]): number {
  return left.reduce((total, value, index) => total + value * (right[index] ?? 0), 0);
}

function invertMatrix(matrix: number[][]): number[][] | null {
  const size = matrix.length;

  if (size === 0 || matrix.some((row) => row.length !== size)) {
    return null;
  }

  const augmented = matrix.map((row, rowIndex) => [
    ...row.map((value) => value),
    ...Array.from({ length: size }, (_, columnIndex) => (rowIndex === columnIndex ? 1 : 0)),
  ]);

  for (let pivotIndex = 0; pivotIndex < size; pivotIndex += 1) {
    let bestRowIndex = pivotIndex;

    for (let rowIndex = pivotIndex + 1; rowIndex < size; rowIndex += 1) {
      if (Math.abs(augmented[rowIndex]?.[pivotIndex] ?? 0) > Math.abs(augmented[bestRowIndex]?.[pivotIndex] ?? 0)) {
        bestRowIndex = rowIndex;
      }
    }

    const pivot = augmented[bestRowIndex]?.[pivotIndex] ?? 0;

    if (Math.abs(pivot) < 1e-12) {
      return null;
    }

    if (bestRowIndex !== pivotIndex) {
      const swapRow = augmented[pivotIndex];
      augmented[pivotIndex] = augmented[bestRowIndex] ?? [];
      augmented[bestRowIndex] = swapRow ?? [];
    }

    const normalizedPivot = augmented[pivotIndex]?.[pivotIndex] ?? 1;
    augmented[pivotIndex] = (augmented[pivotIndex] ?? []).map((value) => value / normalizedPivot);

    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      if (rowIndex === pivotIndex) {
        continue;
      }

      const factor = augmented[rowIndex]?.[pivotIndex] ?? 0;

      augmented[rowIndex] = (augmented[rowIndex] ?? []).map((value, columnIndex) => (
        value - factor * ((augmented[pivotIndex]?.[columnIndex]) ?? 0)
      ));
    }
  }

  return augmented.map((row) => row.slice(size));
}

function getFactorValueMap(row: StoredFactorRow): FactorValueMap {
  return {
    marketExcess: row.marketExcess / 100,
    smb: row.smb === null ? null : row.smb / 100,
    hml: row.hml === null ? null : row.hml / 100,
    momentum: row.momentum === null ? null : row.momentum / 100,
    rmw: row.rmw === null ? null : row.rmw / 100,
    cma: row.cma === null ? null : row.cma / 100,
  };
}

function getWeekEndingFriday(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  const dayOfWeek = parsed.getUTCDay();
  const daysUntilFriday = dayOfWeek >= 1 && dayOfWeek <= 5
    ? 5 - dayOfWeek
    : (5 - dayOfWeek + 7) % 7;
  const friday = new Date(parsed);
  friday.setUTCDate(parsed.getUTCDate() + daysUntilFriday);
  return friday.toISOString().slice(0, 10);
}

function getBucketKey(isoDate: string, frequency: FactorFrequency): string {
  if (frequency === 'daily') {
    return isoDate;
  }

  if (frequency === 'monthly') {
    return `${isoDate.slice(0, 7)}-01`;
  }

  return getWeekEndingFriday(isoDate);
}

function aggregateReturnsToFrequency(
  dailyReturns: ReturnPoint[],
  frequency: FactorFrequency,
  availableFactorPeriods: Set<string>,
  minObservationsPerBucket: number,
): ReturnPoint[] {
  if (frequency === 'daily') {
    return dailyReturns.filter((point) => availableFactorPeriods.has(point.period));
  }

  const buckets = new Map<string, number[]>();

  for (const point of dailyReturns) {
    const key = getBucketKey(point.period, frequency);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(point.value);
    } else {
      buckets.set(key, [point.value]);
    }
  }

  const aggregated: ReturnPoint[] = [];

  for (const [period, values] of buckets) {
    if (!availableFactorPeriods.has(period)) {
      continue;
    }

    if (values.length < minObservationsPerBucket) {
      continue;
    }

    const compounded = values.reduce((product, value) => product * (1 + value), 1) - 1;
    aggregated.push({ period, value: compounded });
  }

  aggregated.sort((left, right) => left.period.localeCompare(right.period));
  return aggregated;
}

function buildAlignedObservations(
  returns: ReturnPoint[],
  factorRows: StoredFactorRow[],
  factorDefinition: FactorModelDefinition,
): AlignedObservation[] {
  const factorRowsByPeriod = new Map(factorRows.map((row) => [row.period, row]));
  const observations: AlignedObservation[] = [];

  for (const point of returns) {
    const factorRow = factorRowsByPeriod.get(point.period);

    if (!factorRow) {
      continue;
    }

    const factorValues = getFactorValueMap(factorRow);
    const selectedFactorValues = factorDefinition.map(({ key }) => factorValues[key]);

    if (selectedFactorValues.some((value) => value === null)) {
      continue;
    }

    const riskFree = factorRow.riskFree / 100;

    observations.push({
      period: point.period,
      portfolioReturn: point.value,
      portfolioExcess: point.value - riskFree,
      riskFree,
      factorValues,
      selectedFactorValues: selectedFactorValues as number[],
    });
  }

  return observations;
}

function runRegression(observations: AlignedObservation[], factorDefinition: FactorModelDefinition): RegressionResult {
  const y = observations.map((observation) => observation.portfolioExcess);
  const designMatrix = observations.map((observation) => [1, ...observation.selectedFactorValues]);
  const transposed = transposeMatrix(designMatrix);
  const xtx = multiplyMatrices(transposed, designMatrix);
  const inverse = invertMatrix(xtx);

  if (!inverse) {
    throw new FactorRegressionInputError(
      'The regression matrix became singular for the selected date range. Try a longer window or a simpler factor model.',
    );
  }

  const xty = multiplyMatrixVector(transposed, y);
  const coefficients = multiplyMatrixVector(inverse, xty);
  const fitted = designMatrix.map((row) => dotProduct(row, coefficients));
  const residuals = y.map((value, index) => value - (fitted[index] ?? 0));
  const yMean = calculateMean(y);
  const totalSumSquares = y.reduce((total, value) => total + (value - yMean) ** 2, 0);
  const residualSumSquares = residuals.reduce((total, value) => total + value ** 2, 0);
  const rSquared = totalSumSquares === 0 ? 1 : 1 - (residualSumSquares / totalSumSquares);
  const parameterCount = factorDefinition.length + 1;

  if (observations.length <= parameterCount) {
    throw new FactorRegressionInputError(
      'There were not enough aligned observations to estimate that regression. Try a longer date range.',
    );
  }

  const adjustedRSquared = 1 - ((1 - rSquared) * (observations.length - 1) / (observations.length - parameterCount));
  const residualVariance = residualSumSquares / (observations.length - parameterCount);
  const standardErrors = inverse.map((row, index) => {
    const diagonal = row[index] ?? 0;
    return diagonal <= 0 ? null : Math.sqrt(residualVariance * diagonal);
  });
  const tStatistics = coefficients.map((coefficient, index) => {
    const standardError = standardErrors[index];

    if (standardError === null || standardError === 0) {
      return null;
    }

    return coefficient / standardError;
  });

  return {
    coefficients,
    fitted,
    residuals,
    standardErrors,
    tStatistics,
    rSquared,
    adjustedRSquared,
  };
}

function getSignificance(tStatistic: number | null): FactorCoefficientSignificance {
  if (tStatistic === null) {
    return 'insufficient';
  }

  const absoluteTStatistic = Math.abs(tStatistic);

  if (absoluteTStatistic >= 2.58) {
    return 'high';
  }

  if (absoluteTStatistic >= 1.96) {
    return 'moderate';
  }

  if (absoluteTStatistic >= 1.64) {
    return 'limited';
  }

  return 'insufficient';
}

function annualizeMeanReturn(value: number, periodsPerYear: number): number {
  return value * periodsPerYear * 100;
}

function buildCoefficientRows(
  observations: AlignedObservation[],
  factorDefinition: FactorModelDefinition,
  regression: RegressionResult,
  periodsPerYear: number,
): FactorRegressionCoefficient[] {
  const rows: FactorRegressionCoefficient[] = [
    {
      name: 'Alpha',
      exposure: round(regression.coefficients[0] ?? 0, 6),
      standardError: regression.standardErrors[0] === null ? null : round(regression.standardErrors[0], 6),
      tStatistic: regression.tStatistics[0] === null ? null : round(regression.tStatistics[0], 4),
      significance: getSignificance(regression.tStatistics[0] ?? null),
      annualizedContribution: round(annualizeMeanReturn(regression.coefficients[0] ?? 0, periodsPerYear), 2),
      averageFactorReturn: null,
    },
  ];

  for (let index = 0; index < factorDefinition.length; index += 1) {
    const factor = factorDefinition[index];
    const coefficient = regression.coefficients[index + 1] ?? 0;
    const factorSeries = observations
      .map((observation) => observation.factorValues[factor.key])
      .filter((value): value is number => value !== null);
    const averageFactorReturn = factorSeries.length > 0 ? annualizeMeanReturn(calculateMean(factorSeries), periodsPerYear) : null;

    rows.push({
      name: factor.name,
      exposure: round(coefficient, 4),
      standardError: regression.standardErrors[index + 1] === null ? null : round(regression.standardErrors[index + 1] ?? 0, 4),
      tStatistic: regression.tStatistics[index + 1] === null ? null : round(regression.tStatistics[index + 1] ?? 0, 4),
      significance: getSignificance(regression.tStatistics[index + 1] ?? null),
      annualizedContribution: averageFactorReturn === null ? null : round(coefficient * averageFactorReturn, 2),
      averageFactorReturn: averageFactorReturn === null ? null : round(averageFactorReturn, 2),
    });
  }

  return rows;
}

function buildSeries(observations: AlignedObservation[], regression: RegressionResult): FactorResponse['series'] {
  let cumulativePortfolio = 1;
  let cumulativeFitted = 1;

  return observations.map((observation, index) => {
    const fittedExcess = regression.fitted[index] ?? 0;
    const fittedReturn = fittedExcess + observation.riskFree;

    cumulativePortfolio *= 1 + observation.portfolioReturn;
    cumulativeFitted *= 1 + fittedReturn;

    return {
      period: observation.period,
      portfolioReturn: round(observation.portfolioReturn * 100, 4),
      fittedReturn: round(fittedReturn * 100, 4),
      portfolioExcess: round(observation.portfolioExcess * 100, 4),
      fittedExcess: round(fittedExcess * 100, 4),
      residual: round((regression.residuals[index] ?? 0) * 100, 4),
      cumulativePortfolioReturn: round((cumulativePortfolio - 1) * 100, 2),
      cumulativeFittedReturn: round((cumulativeFitted - 1) * 100, 2),
    };
  });
}

function buildRollingSeries(
  observations: AlignedObservation[],
  factorDefinition: FactorModelDefinition,
  config: FrequencyConfig,
): FactorRegressionRollingPoint[] {
  if (observations.length < config.rollingWindowSize) {
    return [];
  }

  const marketBetaIndex = factorDefinition.findIndex((factor) => factor.key === 'marketExcess');
  const rolling: FactorRegressionRollingPoint[] = [];

  for (let endIndex = config.rollingWindowSize; endIndex <= observations.length; endIndex += 1) {
    const window = observations.slice(endIndex - config.rollingWindowSize, endIndex);

    try {
      const regression = runRegression(window, factorDefinition);
      rolling.push({
        period: window[window.length - 1]?.period ?? '',
        marketBeta: marketBetaIndex >= 0 ? round(regression.coefficients[marketBetaIndex + 1] ?? 0, 4) : null,
        annualizedAlpha: round(annualizeMeanReturn(regression.coefficients[0] ?? 0, config.periodsPerYear), 2),
        rSquared: round(regression.rSquared, 4),
      });
    } catch {
      rolling.push({
        period: window[window.length - 1]?.period ?? '',
        marketBeta: null,
        annualizedAlpha: null,
        rSquared: null,
      });
    }
  }

  return rolling;
}

function buildNotes(
  input: FactorRequest,
  portfolio: AssetAllocation[],
  priceTradingDays: string[],
  factorRows: StoredFactorRow[],
  observations: AlignedObservation[],
  rollingPoints: FactorRegressionRollingPoint[],
  factorDefinition: FactorModelDefinition,
  config: FrequencyConfig,
): string[] {
  const effectiveStart = observations[0]?.period ?? input.startDate;
  const effectiveEnd = observations[observations.length - 1]?.period ?? input.endDate;
  const priceStart = priceTradingDays[0] ?? input.startDate;
  const priceEnd = priceTradingDays[priceTradingDays.length - 1] ?? input.endDate;
  const windowWasTrimmed = input.startDate !== effectiveStart || input.endDate !== effectiveEnd;

  const rebalanceNote = input.rebalanceMode === 'none'
    ? 'Portfolio return series is computed from a buy-and-hold allocation after the initial weights are set.'
    : `Portfolio return series rebalances to target weights on a ${input.rebalanceMode} schedule.`;

  const windowNote = windowWasTrimmed
    ? `Shared price and factor history reduced the usable window from ${input.startDate} - ${input.endDate} to ${effectiveStart} - ${effectiveEnd}.`
    : 'Requested window matched the aligned price and factor history.';

  const rollingNote = rollingPoints.length === 0
    ? `Rolling diagnostics are hidden until at least ${config.rollingWindowSize} aligned ${config.periodLabelPlural} are available.`
    : `Rolling diagnostics use a trailing ${config.rollingWindowSize}-${config.periodLabelSingular} regression window.`;

  const factorListNote = `Regressed factors: ${factorDefinition.map((factor) => factor.name).join(', ')}.`;

  const aggregationNote = input.frequency === 'daily'
    ? 'Daily portfolio returns are aligned directly with daily Ken French factor returns.'
    : `Daily portfolio returns are compounded into ${config.periodLabelPlural} to align with Ken French ${config.periodLabelSingular}ly factor returns.`;

  return [
    `Regression built from stored Yahoo Finance adjusted close data and imported Ken French ${config.periodLabelSingular}ly factor returns.`,
    `Using ${observations.length} aligned ${config.periodLabelPlural} across ${portfolio.length} holdings.`,
    factorListNote,
    aggregationNote,
    rebalanceNote,
    windowNote,
    `Loaded ${factorRows.length} factor rows inside the shared price window of ${priceStart} - ${priceEnd}.`,
    `Alpha and annualized factor contributions are scaled from average ${config.periodLabelSingular}ly rates by ${config.periodsPerYear} periods per year; significance labels are based on t-stat thresholds.`,
    rollingNote,
  ];
}

export function buildFactorRegressionResponseFromStoredRows(
  input: FactorRequest,
  priceRows: StoredPriceBar[],
  factorRows: StoredFactorRow[],
): FactorResponse {
  const portfolio = getNormalizedPortfolio(input.allocations);

  if (portfolio.length === 0) {
    throw new FactorRegressionInputError('Select at least one holding before running factor regression.');
  }

  const config = resolveFrequencyConfig(input.frequency);

  if (!Array.isArray(input.factors) || input.factors.length === 0) {
    throw new FactorRegressionInputError('Select at least one factor (for example MKT-RF) to regress against.');
  }

  const unsupportedFactors = input.factors.filter((key) => !config.availableFactors.includes(key));

  if (unsupportedFactors.length > 0) {
    throw new FactorRegressionInputError(
      `The ${input.frequency} factor dataset does not provide ${formatFactorList(unsupportedFactors)}. Available factors at this frequency: ${formatFactorList(config.availableFactors)}.`,
    );
  }

  const factorDefinition = buildFactorDefinition(input.factors);
  const selectedFactorKeys = factorDefinition.map((factor) => factor.key);
  const rowsBySymbol = groupRowsBySymbol(priceRows);
  const requiredSymbols = portfolio.map((asset) => asset.symbol);
  const missingSymbols = requiredSymbols.filter((symbol) => (rowsBySymbol.get(symbol) ?? []).length < 2);

  if (missingSymbols.length > 0) {
    throw new FactorRegressionInputError(
      `Not enough stored market data is available for: ${missingSymbols.join(', ')}.`,
    );
  }

  const priceTradingDays = getCommonTradingDays(requiredSymbols, rowsBySymbol);

  if (priceTradingDays.length < 2) {
    throw new FactorRegressionInputError(
      'Not enough shared price history is available across the selected holdings for the chosen date range.',
    );
  }

  const priceLookup = buildPriceLookup(rowsBySymbol);
  const portfolioCurve = buildPortfolioCurve(portfolio, priceTradingDays, priceLookup, input.rebalanceMode);

  if (portfolioCurve.length < 2) {
    throw new FactorRegressionInputError(
      'Unable to construct a portfolio return series from the stored market data.',
    );
  }

  const dailyPortfolioReturns = buildDailyReturns(portfolioCurve);
  const factorRowsWithinPriceWindow = factorRows.filter((row) => (
    row.period >= (priceTradingDays[0] ?? input.startDate)
    && row.period <= (priceTradingDays[priceTradingDays.length - 1] ?? input.endDate)
  ));

  if (factorRowsWithinPriceWindow.length === 0) {
    throw new FactorRegressionInputError(
      `No imported ${input.frequency} factor data is available inside the selected price window. Run "npm run factor:import --workspace backend" and widen the date range.`,
    );
  }

  const missingFactorColumns = factorDefinition.filter(({ key }) => (
    factorRowsWithinPriceWindow.every((row) => row[key] === null || row[key] === undefined)
  ));

  if (missingFactorColumns.length > 0) {
    const missingFactorNames = missingFactorColumns.map((column) => column.name).join(', ');
    throw new FactorRegressionInputError(
      `The selected regression needs ${missingFactorNames}, but no values are available in the ${input.frequency} factor data for this window. Import the matching Ken French CSV (for example via "npm run factor:import --workspace backend") or unselect those factors.`,
    );
  }

  const availableFactorPeriods = new Set(factorRowsWithinPriceWindow.map((row) => row.period));
  const aggregatedReturns = aggregateReturnsToFrequency(
    dailyPortfolioReturns,
    input.frequency,
    availableFactorPeriods,
    config.minDailyObservationsPerBucket,
  );

  const observations = buildAlignedObservations(aggregatedReturns, factorRowsWithinPriceWindow, factorDefinition);

  if (observations.length < config.minObservations) {
    throw new FactorRegressionInputError(
      `Only ${observations.length} aligned ${config.periodLabelPlural} were available; at least ${config.minObservations} are required. Try a longer date range, a different frequency, or import more data.`,
    );
  }

  const regression = runRegression(observations, factorDefinition);
  const coefficientRows = buildCoefficientRows(observations, factorDefinition, regression, config.periodsPerYear);
  const rolling = buildRollingSeries(observations, factorDefinition, config);
  const factorStatus = observations.length === aggregatedReturns.length
    ? 'full'
    : observations.length === 0
      ? 'missing'
      : 'partial';
  const portfolioTotalReturns = observations.map((observation) => observation.portfolioReturn);
  const residuals = regression.residuals;

  return {
    regressionMethod: input.method,
    frequency: input.frequency,
    selectedFactors: selectedFactorKeys,
    rebalanceMode: input.rebalanceMode,
    analyzedTickers: portfolio.map((asset) => asset.symbol),
    portfolio,
    startDate: observations[0]?.period ?? input.startDate,
    endDate: observations[observations.length - 1]?.period ?? input.endDate,
    summary: {
      annualizedAlpha: round(annualizeMeanReturn(regression.coefficients[0] ?? 0, config.periodsPerYear), 2),
      annualizedExcessReturn: round(annualizeMeanReturn(calculateMean(observations.map((observation) => observation.portfolioExcess)), config.periodsPerYear), 2),
      portfolioCagr: round(calculateCagrFromReturns(observations.map((observation) => ({
        period: observation.period,
        value: observation.portfolioReturn,
      })), config.periodsPerYear), 2),
      portfolioVolatility: round(calculateAnnualizedVolatility(portfolioTotalReturns, config.periodsPerYear), 2),
      residualVolatility: round(calculateAnnualizedVolatility(residuals, config.periodsPerYear), 2),
      rSquared: round(regression.rSquared, 4),
      adjustedRSquared: round(regression.adjustedRSquared, 4),
      observations: observations.length,
    },
    coefficients: coefficientRows,
    factors: coefficientRows
      .filter((row) => row.name !== 'Alpha')
      .map((row) => ({
        name: row.name,
        exposure: row.exposure,
        annualizedContribution: row.annualizedContribution,
        averageFactorReturn: row.averageFactorReturn,
      })),
    series: buildSeries(observations, regression),
    rolling,
    coverage: {
      requestedStartDate: input.startDate,
      requestedEndDate: input.endDate,
      priceStartDate: priceTradingDays[0] ?? input.startDate,
      priceEndDate: priceTradingDays[priceTradingDays.length - 1] ?? input.endDate,
      factorStartDate: factorRowsWithinPriceWindow[0]?.period ?? null,
      factorEndDate: factorRowsWithinPriceWindow[factorRowsWithinPriceWindow.length - 1]?.period ?? null,
      overlapStartDate: observations[0]?.period ?? input.startDate,
      overlapEndDate: observations[observations.length - 1]?.period ?? input.endDate,
      priceTradingDays: priceTradingDays.length,
      factorTradingDays: factorRowsWithinPriceWindow.length,
      regressionObservations: observations.length,
      factorStatus,
      missingSymbols,
    },
    notes: buildNotes(input, portfolio, priceTradingDays, factorRowsWithinPriceWindow, observations, rolling, factorDefinition, config),
  };
}

export async function buildFactorRegressionResponseFromMarketData(input: FactorRequest): Promise<FactorResponse> {
  const portfolio = getNormalizedPortfolio(input.allocations);

  if (portfolio.length === 0) {
    throw new FactorRegressionInputError('Select at least one holding before running factor regression.');
  }

  const config = resolveFrequencyConfig(input.frequency);

  const priceRows = await getHistoricalPrices({
    symbols: portfolio.map((asset) => asset.symbol),
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const factorRows = await getStoredFactorReturns({
    factorSet: config.factorSet,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  return buildFactorRegressionResponseFromStoredRows(input, priceRows, factorRows);
}
