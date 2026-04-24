export type AssetAllocation = {
  symbol: string;
  weight: number;
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
  benchmarkStatus: 'full';
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
  benchmarkSummary: BacktestSummary;
  benchmarkRelative: BacktestBenchmarkRelativeMetrics;
  assetBreakdown: BacktestAssetBreakdown[];
  equityCurve: BacktestSeriesPoint[];
  drawdownCurve: BacktestDrawdownPoint[];
  annualReturns: BacktestAnnualReturn[];
  monthlyReturns: BacktestMonthlyReturnRow[];
  coverage: BacktestCoverage;
  notes: string[];
};

export type FactorRegressionMethod = 'OLS';

export type FactorFrequency = 'daily' | 'weekly' | 'monthly';

export type FactorColumnKey = 'marketExcess' | 'smb' | 'hml' | 'momentum' | 'rmw' | 'cma';

export type FactorCoefficientSignificance = 'high' | 'moderate' | 'limited' | 'insufficient';

export type FactorRequest = {
  allocations: string;
  startDate: string;
  endDate: string;
  rebalanceMode: BacktestRebalanceMode;
  method: FactorRegressionMethod;
  frequency: FactorFrequency;
  factors: FactorColumnKey[];
};

export type FactorRegressionSummary = {
  annualizedAlpha: number;
  annualizedExcessReturn: number;
  portfolioCagr: number;
  portfolioVolatility: number;
  residualVolatility: number;
  rSquared: number;
  adjustedRSquared: number;
  observations: number;
};

export type FactorRegressionCoefficient = {
  name: string;
  exposure: number;
  standardError: number | null;
  tStatistic: number | null;
  significance: FactorCoefficientSignificance;
  annualizedContribution: number | null;
  averageFactorReturn: number | null;
};

export type FactorRegressionCoverage = {
  requestedStartDate: string;
  requestedEndDate: string;
  priceStartDate: string;
  priceEndDate: string;
  factorStartDate: string | null;
  factorEndDate: string | null;
  overlapStartDate: string;
  overlapEndDate: string;
  priceTradingDays: number;
  factorTradingDays: number;
  regressionObservations: number;
  factorStatus: 'full' | 'partial' | 'missing';
  missingSymbols: string[];
};

export type FactorRegressionSeriesPoint = {
  period: string;
  portfolioReturn: number;
  fittedReturn: number;
  portfolioExcess: number;
  fittedExcess: number;
  residual: number;
  cumulativePortfolioReturn: number;
  cumulativeFittedReturn: number;
};

export type FactorRegressionRollingPoint = {
  period: string;
  marketBeta: number | null;
  annualizedAlpha: number | null;
  rSquared: number | null;
};

export type FactorAttributionTerm = {
  name: string;
  cumulativeReturn: number | null;
  returnContribution: number | null;
  riskContribution: number | null;
};

export type FactorRiskReturnAttribution = {
  name: string;
  startDate: string;
  endDate: string;
  cumulativeReturn: number;
  annualizedReturn: number;
  annualizedStandardDeviation: number;
  terms: FactorAttributionTerm[];
};

export type FactorResponse = {
  regressionMethod: FactorRegressionMethod;
  frequency: FactorFrequency;
  selectedFactors: FactorColumnKey[];
  rebalanceMode: BacktestRebalanceMode;
  analyzedTickers: string[];
  portfolio: AssetAllocation[];
  startDate: string;
  endDate: string;
  summary: FactorRegressionSummary;
  coefficients: FactorRegressionCoefficient[];
  factors: Array<{
    name: string;
    exposure: number;
    annualizedContribution: number | null;
    averageFactorReturn: number | null;
  }>;
  series: FactorRegressionSeriesPoint[];
  rolling: FactorRegressionRollingPoint[];
  riskReturnAttribution: FactorRiskReturnAttribution;
  coverage: FactorRegressionCoverage;
  notes: string[];
};

export type OptimizationObjective = 'max_sharpe' | 'min_variance' | 'target_return';

export type OptimizationRequest = {
  universe: string;
  startDate: string;
  endDate: string;
  objective: OptimizationObjective;
  targetReturn?: number;
  riskFreeRate?: number;
};

export type OptimizationAssetStats = {
  symbol: string;
  expectedReturn: number;
  volatility: number;
};

export type OptimizationPoint = {
  expectedReturn: number;
  volatility: number;
  sharpe: number;
  weights: AssetAllocation[];
};

export type OptimizationCoverage = {
  requestedStartDate: string;
  requestedEndDate: string;
  startDate: string;
  endDate: string;
  tradingDays: number;
  availableSymbols: string[];
  missingSymbols: string[];
  riskFreeSource: 'factor_returns' | 'override' | 'default';
};

export type OptimizationResponse = {
  objective: OptimizationObjective;
  targetReturn: number | null;
  startDate: string;
  endDate: string;
  riskFreeRate: number;
  assets: OptimizationAssetStats[];
  samplePoints: Array<{ volatility: number; expectedReturn: number }>;
  frontier: OptimizationPoint[];
  minVariance: OptimizationPoint;
  maxSharpe: OptimizationPoint;
  selected: OptimizationPoint;
  coverage: OptimizationCoverage;
  notes: string[];
};
