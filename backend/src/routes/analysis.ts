import { Router } from 'express';

import type {
  BacktestRequest,
  BacktestResponse,
  FactorColumnKey,
  FactorFrequency,
  FactorRequest,
  FactorResponse,
  OptimizationObjective,
  OptimizationRequest,
  OptimizationResponse,
} from '../types';
import {
  buildFactorRegressionResponseFromMarketData,
  FactorRegressionInputError,
  FREQUENCY_CONFIG,
} from '../lib/factorRegression';
import {
  buildPortfolioOptimizationResponseFromMarketData,
  PortfolioOptimizationInputError,
} from '../lib/portfolioOptimization';
import { buildBacktestResponseFromMarketData } from '../lib/marketDataBacktest';
import { PortfolioInputError } from '../lib/portfolioInput';

const analysisRouter = Router();
const factorFrequencies: FactorFrequency[] = ['daily', 'weekly', 'monthly'];
const allFactorColumnKeys: FactorColumnKey[] = ['marketExcess', 'smb', 'hml', 'momentum', 'rmw', 'cma'];
const optimizationObjectives: OptimizationObjective[] = ['max_sharpe', 'min_variance', 'target_return'];

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
        message: 'Not enough stored market data is available for every holding, the required benchmark, and that date range.',
      });
      return;
    }

    response.json(payload);
  } catch (error) {
    if (error instanceof PortfolioInputError) {
      response.status(400).json({
        message: error.message,
      });
      return;
    }

    next(error);
  }
});

analysisRouter.post('/factors', async (request, response, next) => {
  const rawMethod = String(request.body?.method ?? 'OLS').toUpperCase();
  const rawFrequency = String(request.body?.frequency ?? 'daily');
  const rawFactors = Array.isArray(request.body?.factors) ? request.body.factors : [];
  const rebalanceMode = String(request.body?.rebalanceMode ?? 'none');
  const startDate = String(request.body?.startDate ?? '2018-01-01');
  const endDate = String(request.body?.endDate ?? '2026-01-28');

  try {
    if (rawMethod !== 'OLS') {
      response.status(400).json({
        message: 'Only OLS is currently supported for factor regression.',
      });
      return;
    }

    if (!factorFrequencies.includes(rawFrequency as FactorFrequency)) {
      response.status(400).json({
        message: `Unsupported factor frequency: ${rawFrequency}. Use one of: ${factorFrequencies.join(', ')}.`,
      });
      return;
    }

    const frequency = rawFrequency as FactorFrequency;
    const availableFactors = FREQUENCY_CONFIG[frequency].availableFactors;

    const normalizedFactors: FactorColumnKey[] = [];
    for (const raw of rawFactors) {
      if (typeof raw !== 'string') {
        response.status(400).json({ message: 'Each factor must be a string identifier.' });
        return;
      }

      if (!allFactorColumnKeys.includes(raw as FactorColumnKey)) {
        response.status(400).json({ message: `Unknown factor: ${raw}.` });
        return;
      }

      normalizedFactors.push(raw as FactorColumnKey);
    }

    if (normalizedFactors.length === 0) {
      response.status(400).json({
        message: 'Select at least one factor to regress against.',
      });
      return;
    }

    const unsupportedForFrequency = normalizedFactors.filter((key) => !availableFactors.includes(key));
    if (unsupportedForFrequency.length > 0) {
      response.status(400).json({
        message: `Factors ${unsupportedForFrequency.join(', ')} are not available at ${frequency} frequency. Available: ${availableFactors.join(', ')}.`,
      });
      return;
    }

    if (startDate > endDate) {
      response.status(400).json({
        message: 'Start date must be before the end date.',
      });
      return;
    }

    const factorInput: FactorRequest = {
      allocations: String(request.body?.allocations ?? ''),
      startDate,
      endDate,
      rebalanceMode: rebalanceMode === 'monthly'
        || rebalanceMode === 'quarterly'
        || rebalanceMode === 'annual'
        ? rebalanceMode
        : 'none',
      method: 'OLS',
      frequency,
      factors: normalizedFactors,
    };
    const payload: FactorResponse = await buildFactorRegressionResponseFromMarketData(factorInput);
    response.json(payload);
  } catch (error) {
    if (error instanceof FactorRegressionInputError || error instanceof PortfolioInputError) {
      response.status(400).json({
        message: error.message,
      });
      return;
    }

    next(error);
  }
});

analysisRouter.post('/optimize', async (request, response, next) => {
  const rawObjective = String(request.body?.objective ?? 'max_sharpe');
  const startDate = String(request.body?.startDate ?? '2018-01-01');
  const endDate = String(request.body?.endDate ?? '2026-01-28');
  const rawTargetReturn = request.body?.targetReturn;
  const rawRiskFreeRate = request.body?.riskFreeRate;

  try {
    if (!optimizationObjectives.includes(rawObjective as OptimizationObjective)) {
      response.status(400).json({
        message: `Unsupported optimization objective: ${rawObjective}.`,
      });
      return;
    }

    if (startDate > endDate) {
      response.status(400).json({
        message: 'Start date must be before the end date.',
      });
      return;
    }

    const optimizationInput: OptimizationRequest = {
      universe: String(request.body?.universe ?? ''),
      startDate,
      endDate,
      objective: rawObjective as OptimizationObjective,
      targetReturn: Number.isFinite(Number(rawTargetReturn)) ? Number(rawTargetReturn) : undefined,
      riskFreeRate: Number.isFinite(Number(rawRiskFreeRate)) ? Number(rawRiskFreeRate) : undefined,
    };

    const payload: OptimizationResponse = await buildPortfolioOptimizationResponseFromMarketData(optimizationInput);
    response.json(payload);
  } catch (error) {
    if (error instanceof PortfolioOptimizationInputError) {
      response.status(400).json({
        message: error.message,
      });
      return;
    }

    next(error);
  }
});

export default analysisRouter;
