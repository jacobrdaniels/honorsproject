import { Router } from 'express';

import { getDatabaseFilePath, sqlite } from '../db/client';
import type { HealthResponse } from '../types';

const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  sqlite.prepare('SELECT 1').get();

  const payload: HealthResponse = {
    status: 'ok',
    service: 'portfolio-backend',
    database: {
      status: 'ready',
      path: getDatabaseFilePath(),
    },
    checkedAt: new Date().toISOString(),
  };

  response.json(payload);
});

export default healthRouter;
