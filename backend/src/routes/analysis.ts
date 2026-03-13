import { Router } from 'express';

import type { BacktestRequest, BacktestResponse } from '../types';
import { buildBacktestResponseFromMarketData } from '../lib/marketDataBacktest';

const analysisRouter = Router();

analysisRouter.post('/backtest', async (request, response, next) => {
  const rebalanceMode = String(request.body?.rebalanceMode ?? 'none');
  const backtestInput: BacktestRequest = {
    benchmark: String(request.body?.benchmark ?? 'SPY'),
    allocations: String(request.body?.allocations ?? ''),
    startDate: String(request.body?.startDate ?? '2018-01-01'),
    endDate: String(request.body?.endDate ?? '2026-01-28'),
    rebalanceMode: rebalanceMode === 'monthly'
      || rebalanceMode === 'quarterly'
      || rebalanceMode === 'annual'
      ? rebalanceMode
      : 'none',
  };

  try {
    const payload: BacktestResponse | null = await buildBacktestResponseFromMarketData(backtestInput);

    if (!payload) {
      response.status(400).json({
        message: 'Not enough stored market data is available for that portfolio, benchmark, and date range.',
      });
      return;
    }

    response.json(payload);
  } catch (error) {
    next(error);
  }
});

analysisRouter.post('/factors', (_request, response) => {
  response.status(501).json({ message: 'Factor regression is being rebuilt against imported factor data.' });
});

analysisRouter.post('/efficient-frontier', (_request, response) => {
  response.status(501).json({ message: 'Efficient frontier analysis is being folded into optimization.' });
});

analysisRouter.post('/optimize', (_request, response) => {
  response.status(501).json({ message: 'Optimization is not wired to market data yet.' });
});

export default analysisRouter;
