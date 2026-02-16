import { Router } from 'express';

import type {
  BacktestResponse,
  EfficientFrontierResponse,
  FactorResponse,
  OptimizationResponse,
} from '../types';
import {
  buildBacktestResponse,
  buildEfficientFrontierResponse,
  buildFactorResponse,
  buildOptimizationResponse,
} from '../lib/analysisScenarios';
import { buildBacktestResponseFromMarketData } from '../lib/marketDataBacktest';

const analysisRouter = Router();

analysisRouter.post('/backtest', async (request, response, next) => {
  const backtestInput = {
    benchmark: String(request.body?.benchmark ?? 'SPY'),
    allocations: String(request.body?.allocations ?? ''),
    startDate: String(request.body?.startDate ?? '2018-01-01'),
    endDate: String(request.body?.endDate ?? '2026-01-28'),
  };

  try {
    const payload: BacktestResponse = await buildBacktestResponseFromMarketData(backtestInput)
      ?? buildBacktestResponse(backtestInput);

    response.json(payload);
  } catch (error) {
    next(error);
  }
});

analysisRouter.post('/factors', (request, response) => {
  const payload: FactorResponse = buildFactorResponse({
    method: String(request.body?.method ?? 'OLS'),
    model: String(request.body?.model ?? 'Five-Factor Model'),
    tickers: String(request.body?.tickers ?? ''),
  });

  response.json(payload);
});

analysisRouter.post('/efficient-frontier', (request, response) => {
  const payload: EfficientFrontierResponse = buildEfficientFrontierResponse({
    universe: String(request.body?.universe ?? ''),
  });

  response.json(payload);
});

analysisRouter.post('/optimize', (request, response) => {
  const payload: OptimizationResponse = buildOptimizationResponse({
    objective: String(request.body?.objective ?? 'Max Sharpe'),
    constraints: String(request.body?.constraints ?? ''),
    targetReturn: Number(request.body?.targetReturn),
    allocations: typeof request.body?.allocations === 'string' ? request.body.allocations : '',
  });

  response.json(payload);
});

export default analysisRouter;
