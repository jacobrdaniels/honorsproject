export type AssetAllocation = {
  symbol: string;
  weight: number;
};

export type FrontierAsset = {
  symbol: string;
  expectedReturn: number;
  volatility: number;
};

export type SavedPortfolio = {
  id: string;
  name: string;
  benchmark: string;
  notes: string;
  assets: AssetAllocation[];
};

export type ApiErrorResponse = {
  message: string;
};

export type HealthResponse = {
  status: string;
  service: string;
  database: {
    status: string;
    path: string;
  };
  checkedAt: string;
};

export type BacktestRebalanceMode = 'none' | 'monthly' | 'quarterly' | 'annual';

export type BacktestRequest = {
  allocations: string;
  benchmark: string;
  startDate: string;
  endDate: string;
  rebalanceMode: BacktestRebalanceMode;
};

export type BacktestSummary = {
  totalReturn: number;
  cagr: number;
  sharpe: number;
  volatility: number;
  maxDrawdown: number;
  endingValue: number;
  bestYear: number | null;
  worstYear: number | null;
};

export type BacktestSeriesPoint = {
  period: string;
  portfolio: number;
  benchmark: number | null;
};

export type BacktestDrawdownPoint = {
  period: string;
  portfolio: number;
  benchmark: number | null;
};

export type BacktestAnnualReturn = {
  year: string;
  portfolio: number;
  benchmark: number | null;
};

export type BacktestMonthlyReturnRow = {
  year: string;
  portfolio: Array<number | null>;
  benchmark: Array<number | null>;
  portfolioTotal: number | null;
  benchmarkTotal: number | null;
};

export type BacktestCoverage = {
  requestedStartDate: string;
  requestedEndDate: string;
  tradingDays: number;
  benchmarkTradingDays: number;
  benchmarkStatus: 'full' | 'partial' | 'missing';
  missingSymbols: string[];
};

export type BacktestBenchmarkRelativeMetrics = {
  excessReturn: number | null;
  trackingError: number | null;
  informationRatio: number | null;
  beta: number | null;
  alpha: number | null;
  upsideCapture: number | null;
  downsideCapture: number | null;
};

export type BacktestAssetBreakdown = {
  symbol: string;
  weight: number;
  totalReturn: number;
  cagr: number;
  volatility: number;
  maxDrawdown: number;
  endingValue: number;
};

export type BacktestResponse = {
  benchmark: string;
  startDate: string;
  endDate: string;
  rebalanceMode: BacktestRebalanceMode;
  portfolio: AssetAllocation[];
  summary: BacktestSummary;
  benchmarkSummary: BacktestSummary | null;
  benchmarkRelative: BacktestBenchmarkRelativeMetrics;
  assetBreakdown: BacktestAssetBreakdown[];
  equityCurve: BacktestSeriesPoint[];
  drawdownCurve: BacktestDrawdownPoint[];
  annualReturns: BacktestAnnualReturn[];
  monthlyReturns: BacktestMonthlyReturnRow[];
  coverage: BacktestCoverage;
  notes: string[];
};

export type FactorResponse = {
  regressionMethod: string;
  factorModel: string;
  analyzedTickers: string[];
  observations: number;
  factors: Array<{ name: string; exposure: number }>;
  alpha: number;
  rSquared: number;
  notes: string[];
};

export type EfficientFrontierResponse = {
  universe: FrontierAsset[];
  universeCount: number;
  frontier: Array<{ risk: number; return: number }>;
  modelPortfolio: AssetAllocation[];
  assumptions: string[];
};

export type OptimizationResponse = {
  objective: string;
  constraintSummary: string;
  targetReturn: number | null;
  expectedReturn: number;
  expectedVolatility: number;
  allocation: AssetAllocation[];
  notes: string[];
};
