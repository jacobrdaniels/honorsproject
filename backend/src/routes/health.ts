import { Router } from 'express';

import { getDatabaseFilePath, sqlite } from '../db/client';
import type { HealthResponse } from '../types';

const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  let databaseStatus = 'ready';
  let overallStatus = 'ok';

  try {
    sqlite.prepare('SELECT 1').get();
  } catch (error) {
    databaseStatus = error instanceof Error ? `error: ${error.message}` : 'error';
    overallStatus = 'degraded';
  }

  const payload: HealthResponse = {
    status: overallStatus,
    service: 'portfolio-backend',
    database: {
      status: databaseStatus,
      path: getDatabaseFilePath(),
    },
    checkedAt: new Date().toISOString(),
  };

  response.status(overallStatus === 'ok' ? 200 : 503).json(payload);
});

export default healthRouter;
