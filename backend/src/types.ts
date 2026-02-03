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

export type BacktestResponse = {
  benchmark: string;
  startDate: string;
  endDate: string;
  portfolio: AssetAllocation[];
  summary: {
    cagr: number;
    sharpe: number;
    volatility: number;
    maxDrawdown: number;
    endingValue: number;
  };
  equityCurve: Array<{ period: string; value: number }>;
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
