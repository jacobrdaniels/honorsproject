import { Router } from 'express';

import {
  createPortfolio,
  deletePortfolio,
  getPortfolioById,
  listPortfolios,
  updatePortfolio,
} from '../lib/portfolioStore';

const portfoliosRouter = Router();

portfoliosRouter.get('/', async (_request, response, next) => {
  try {
    const portfolios = await listPortfolios();
    response.json(portfolios);
  } catch (error) {
    next(error);
  }
});

portfoliosRouter.get('/:portfolioId', async (request, response, next) => {
  try {
    const portfolio = await getPortfolioById(request.params.portfolioId);

    if (!portfolio) {
      response.status(404).json({ message: 'Portfolio not found.' });
      return;
    }

    response.json(portfolio);
  } catch (error) {
    next(error);
  }
});

portfoliosRouter.post('/', async (request, response, next) => {
  const { name, benchmark, notes, allocations } = request.body ?? {};

  if (typeof name !== 'string' || !name.trim()) {
    response.status(400).json({ message: 'Portfolio name is required.' });
    return;
  }

  if (typeof allocations !== 'string' || !allocations.trim()) {
    response.status(400).json({ message: 'Allocations are required.' });
    return;
  }

  if (benchmark !== undefined && typeof benchmark !== 'string') {
    response.status(400).json({ message: 'Benchmark must be a string.' });
    return;
  }

  if (notes !== undefined && typeof notes !== 'string') {
    response.status(400).json({ message: 'Notes must be a string.' });
    return;
  }

  try {
    const portfolio = await createPortfolio({ name, benchmark, notes, allocations });
    response.status(201).json(portfolio);
  } catch (error) {
    next(error);
  }
});

portfoliosRouter.put('/:portfolioId', async (request, response, next) => {
  const { name, benchmark, notes, allocations } = request.body ?? {};

  if (typeof name !== 'string' || !name.trim()) {
    response.status(400).json({ message: 'Portfolio name is required.' });
    return;
  }

  if (typeof allocations !== 'string' || !allocations.trim()) {
    response.status(400).json({ message: 'Allocations are required.' });
    return;
  }

  if (benchmark !== undefined && typeof benchmark !== 'string') {
    response.status(400).json({ message: 'Benchmark must be a string.' });
    return;
  }

  if (notes !== undefined && typeof notes !== 'string') {
    response.status(400).json({ message: 'Notes must be a string.' });
    return;
  }

  try {
    const portfolio = await updatePortfolio(request.params.portfolioId, {
      name,
      benchmark,
      notes,
      allocations,
    });

    if (!portfolio) {
      response.status(404).json({ message: 'Portfolio not found.' });
      return;
    }

    response.json(portfolio);
  } catch (error) {
    next(error);
  }
});

portfoliosRouter.delete('/:portfolioId', async (request, response, next) => {
  try {
    const deleted = await deletePortfolio(request.params.portfolioId);

    if (!deleted) {
      response.status(404).json({ message: 'Portfolio not found.' });
      return;
    }

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default portfoliosRouter;
