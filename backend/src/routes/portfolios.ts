import { Router } from 'express';

import { createPortfolio, listPortfolios } from '../lib/portfolioStore';

const portfoliosRouter = Router();

portfoliosRouter.get('/', async (_request, response, next) => {
  try {
    const portfolios = await listPortfolios();
    response.json(portfolios);
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

  try {
    const portfolio = await createPortfolio({ name, benchmark, notes, allocations });
    response.status(201).json(portfolio);
  } catch (error) {
    next(error);
  }
});

export default portfoliosRouter;
