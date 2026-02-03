import type {
  AssetAllocation,
  BacktestResponse,
  EfficientFrontierResponse,
  FactorResponse,
  FrontierAsset,
  OptimizationResponse,
} from '../types';
import {
  normalizeAllocationWeights,
  parseAllocationString,
  parseTickerList,
} from './portfolioInput';

type BacktestInput = {
  allocations: string;
  benchmark: string;
  startDate: string;
  endDate: string;
};

type FactorInput = {
  method: string;
  model: string;
  tickers: string;
};

type EfficientFrontierInput = {
  universe: string;
};

type OptimizationInput = {
  objective: string;
  constraints: string;
  targetReturn?: number;
  allocations?: string;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseFrontierUniverse(input: string): FrontierAsset[] {
  const assets: FrontierAsset[] = [];

  for (const rawPart of input.split(',')) {
    const [rawSymbol, rawReturn, rawVolatility] = rawPart.split(':').map((part) => part.trim());
    const symbol = rawSymbol?.toUpperCase();
    const expectedReturn = Number(rawReturn ?? '');
    const volatility = Number(rawVolatility ?? '');

    if (!symbol || !Number.isFinite(expectedReturn) || !Number.isFinite(volatility) || volatility <= 0) {
      continue;
    }

    assets.push({
      symbol,
      expectedReturn: round(expectedReturn),
      volatility: round(volatility),
    });
  }

  return assets;
}

function fallbackPortfolio(): AssetAllocation[] {
  return [
    { symbol: 'VTI', weight: 60 },
    { symbol: 'VXUS', weight: 20 },
    { symbol: 'BND', weight: 20 },
  ];
}

function fallbackUniverse(): FrontierAsset[] {
  return [
    { symbol: 'VTI', expectedReturn: 0.08, volatility: 0.16 },
    { symbol: 'VXUS', expectedReturn: 0.07, volatility: 0.18 },
    { symbol: 'BND', expectedReturn: 0.04, volatility: 0.06 },
  ];
}

function normalizePortfolioInput(input: string): AssetAllocation[] {
  const parsedAssets = normalizeAllocationWeights(parseAllocationString(input));
  return parsedAssets.length > 0 ? parsedAssets : fallbackPortfolio();
}

function buildFivePointCurve(endingValue: number, startDate: string, endDate: string): BacktestResponse['equityCurve'] {
  const checkpoints = [0, 0.22, 0.51, 0.79, 1];
  const labels = [startDate, 'Quarter 1', 'Quarter 2', 'Quarter 3', endDate];

  return checkpoints.map((checkpoint, index) => ({
    period: labels[index],
    value: round(10000 + (endingValue - 10000) * checkpoint),
  }));
}

function buildFactorList(model: string, tickerCount: number): FactorResponse['factors'] {
  const factorsByModel: Record<string, string[]> = {
    CAPM: ['MKT-RF'],
    'Three-Factor Model': ['MKT-RF', 'SMB', 'HML'],
    'Four-Factor Model': ['MKT-RF', 'SMB', 'HML', 'MOM'],
    'Five-Factor Model': ['MKT-RF', 'SMB', 'HML', 'RMW', 'CMA'],
  };

  const factorNames = factorsByModel[model] ?? factorsByModel['Five-Factor Model'];

  return factorNames.map((name, index) => ({
    name,
    exposure: round(clamp(0.15 + tickerCount * 0.08 - index * 0.11, -0.25, 1.1)),
  }));
}

function buildFrontierPoints(universe: FrontierAsset[]): EfficientFrontierResponse['frontier'] {
  const averageReturn = universe.reduce((total, asset) => total + asset.expectedReturn, 0) / universe.length;
  const averageVolatility = universe.reduce((total, asset) => total + asset.volatility, 0) / universe.length;

  return [0.72, 0.88, 1, 1.14, 1.3].map((multiplier) => ({
    risk: round(averageVolatility * multiplier * 100),
    return: round(averageReturn * (0.78 + multiplier * 0.24) * 100),
  }));
}

function buildInverseVolatilityPortfolio(universe: FrontierAsset[]): AssetAllocation[] {
  const totalInverseVolatility = universe.reduce((total, asset) => total + 1 / asset.volatility, 0);

  return universe.map((asset) => ({
    symbol: asset.symbol,
    weight: round(((1 / asset.volatility) / totalInverseVolatility) * 100),
  }));
}

export function buildBacktestResponse(input: BacktestInput): BacktestResponse {
  const portfolio = normalizePortfolioInput(input.allocations);
  const benchmark = input.benchmark.trim().toUpperCase() || 'SPY';
  const startDate = input.startDate || '2018-01-01';
  const endDate = input.endDate || '2026-01-28';
  const benchmarkLift = benchmark === 'SPY' ? 0.5 : 0.2;
  const diversificationLift = portfolio.length * 0.4;
  const bondWeight = portfolio
    .filter((asset) => ['BND', 'AGG', 'TLT', 'VGIT'].includes(asset.symbol))
    .reduce((total, asset) => total + asset.weight, 0);
  const cagr = round(6.2 + benchmarkLift + diversificationLift - bondWeight * 0.01);
  const volatility = round(clamp(14 - bondWeight * 0.08 + portfolio.length * 0.7, 5.5, 18.5));
  const sharpe = round(clamp(cagr / volatility, 0.4, 1.4));
  const maxDrawdown = round(-clamp(volatility * 1.35, 8, 27));
  const endingValue = round(10000 * (1 + cagr / 100) ** 4);

  return {
    benchmark,
    startDate,
    endDate,
    portfolio,
    summary: {
      cagr,
      sharpe,
      volatility,
      maxDrawdown,
      endingValue,
    },
    equityCurve: buildFivePointCurve(endingValue, startDate, endDate),
    notes: [
      `Stub scenario built from ${portfolio.length} portfolio holdings.`,
      `Benchmark anchor: ${benchmark}.`,
    ],
  };
}

export function buildFactorResponse(input: FactorInput): FactorResponse {
  const tickers = parseTickerList(input.tickers);
  const analyzedTickers = tickers.length > 0 ? tickers : fallbackPortfolio().map((asset) => asset.symbol);
  const factorModel = input.model || 'Five-Factor Model';
  const regressionMethod = input.method || 'OLS';
  const observations = 36 + analyzedTickers.length * 6;
  const factors = buildFactorList(factorModel, analyzedTickers.length);
  const alpha = round(0.45 + analyzedTickers.length * 0.18);
  const rSquared = round(clamp(0.62 + analyzedTickers.length * 0.05, 0.62, 0.96));

  return {
    regressionMethod,
    factorModel,
    analyzedTickers,
    observations,
    alpha,
    rSquared,
    factors,
    notes: [
      `Placeholder regression over ${observations} monthly observations.`,
      `Universe inferred from ${analyzedTickers.join(', ')}.`,
    ],
  };
}

export function buildEfficientFrontierResponse(input: EfficientFrontierInput): EfficientFrontierResponse {
  const universe = parseFrontierUniverse(input.universe);
  const normalizedUniverse = universe.length >= 2 ? universe : fallbackUniverse();

  return {
    universe: normalizedUniverse,
    universeCount: normalizedUniverse.length,
    frontier: buildFrontierPoints(normalizedUniverse),
    modelPortfolio: buildInverseVolatilityPortfolio(normalizedUniverse),
    assumptions: [
      'Expected returns and volatility values are placeholder inputs.',
      'Model portfolio uses inverse-volatility weighting as a demo-friendly stand-in.',
    ],
  };
}

export function buildOptimizationResponse(input: OptimizationInput): OptimizationResponse {
  const objective = input.objective || 'Max Sharpe';
  const constraintSummary = input.constraints.trim() || 'No custom constraints provided.';
  const seedPortfolio = normalizePortfolioInput(input.allocations ?? '');
  const targetReturn = objective === 'Target Return' && Number.isFinite(input.targetReturn)
    ? round(Number(input.targetReturn))
    : null;

  let allocation = seedPortfolio;

  if (objective === 'Min Variance') {
    allocation = normalizeAllocationWeights([
      ...seedPortfolio.map((asset) => ({
        symbol: asset.symbol,
        weight: asset.symbol === 'BND' ? asset.weight + 15 : asset.weight,
      })),
    ]);
  } else if (objective === 'Target Return' && targetReturn !== null) {
    allocation = normalizeAllocationWeights([
      ...seedPortfolio.map((asset) => ({
        symbol: asset.symbol,
        weight: asset.symbol === 'VTI' ? asset.weight + targetReturn * 0.4 : asset.weight,
      })),
    ]);
  }

  const expectedReturn = round(5.2 + allocation.length * 0.7 + (targetReturn ?? 0) * 0.15);
  const expectedVolatility = round(
    objective === 'Min Variance'
      ? 8.1
      : objective === 'Target Return'
        ? 11.4
        : 10.2,
  );

  return {
    objective,
    constraintSummary,
    targetReturn,
    expectedReturn,
    expectedVolatility,
    allocation,
    notes: [
      `Optimization objective: ${objective}.`,
      targetReturn === null
        ? `Constraint summary: ${constraintSummary}`
        : `Target return set to ${targetReturn.toFixed(2)}%.`,
    ],
  };
}
