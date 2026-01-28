import { Router } from 'express';

import type {
  BacktestResponse,
  EfficientFrontierResponse,
  FactorResponse,
  OptimizationResponse,
} from '../types';

const analysisRouter = Router();

analysisRouter.post('/backtest', (request, response) => {
  const startDate = String(request.body?.startDate ?? '2018-01-01');
  const endDate = String(request.body?.endDate ?? '2026-01-28');

  const payload: BacktestResponse = {
    summary: {
      cagr: 9.4,
      sharpe: 0.81,
      volatility: 11.2,
      maxDrawdown: -17.6,
    },
    equityCurve: [
      { period: startDate, value: 10000 },
      { period: 'Checkpoint 1', value: 11840 },
      { period: 'Checkpoint 2', value: 14730 },
      { period: 'Checkpoint 3', value: 17125 },
      { period: endDate, value: 19680 },
    ],
  };

  response.json(payload);
});

analysisRouter.post('/factors', (request, response) => {
  const payload: FactorResponse = {
    regressionMethod: String(request.body?.method ?? 'OLS'),
    alpha: 1.2,
    rSquared: 0.88,
    factors: [
      { name: 'MKT-RF', exposure: 0.94 },
      { name: 'SMB', exposure: 0.12 },
      { name: 'HML', exposure: -0.08 },
      { name: 'MOM', exposure: 0.18 },
      { name: 'RMW', exposure: 0.09 },
    ],
  };

  response.json(payload);
});

analysisRouter.post('/efficient-frontier', (_request, response) => {
  const payload: EfficientFrontierResponse = {
    frontier: [
      { risk: 5.4, return: 4.1 },
      { risk: 7.2, return: 5.8 },
      { risk: 9.5, return: 7.1 },
      { risk: 12.1, return: 8.4 },
      { risk: 14.8, return: 9.2 },
    ],
    modelPortfolio: [
      { symbol: 'VTI', weight: 55 },
      { symbol: 'VXUS', weight: 20 },
      { symbol: 'BND', weight: 25 },
    ],
  };

  response.json(payload);
});

analysisRouter.post('/optimize', (request, response) => {
  const payload: OptimizationResponse = {
    objective: String(request.body?.objective ?? 'Max Sharpe'),
    expectedReturn: 8.9,
    expectedVolatility: 10.6,
    allocation: [
      { symbol: 'VTI', weight: 50 },
      { symbol: 'VXUS', weight: 20 },
      { symbol: 'AVUV', weight: 10 },
      { symbol: 'BND', weight: 20 },
    ],
  };

  response.json(payload);
});

export default analysisRouter;
