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

export type BacktestResponse = {
  summary: {
    cagr: number;
    sharpe: number;
    volatility: number;
    maxDrawdown: number;
  };
  equityCurve: Array<{ period: string; value: number }>;
};

export type FactorResponse = {
  regressionMethod: string;
  factors: Array<{ name: string; exposure: number }>;
  alpha: number;
  rSquared: number;
};

export type EfficientFrontierResponse = {
  frontier: Array<{ risk: number; return: number }>;
  modelPortfolio: AssetAllocation[];
};

export type OptimizationResponse = {
  objective: string;
  expectedReturn: number;
  expectedVolatility: number;
  allocation: AssetAllocation[];
};
