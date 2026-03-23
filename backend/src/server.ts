import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';

import './lib/env';
import analysisRouter from './routes/analysis';
import healthRouter from './routes/health';
import portfoliosRouter from './routes/portfolios';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

app.disable('x-powered-by');
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use((request, response, next) => {
  const startedAt = Date.now();

  response.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    console.log(`${request.method} ${request.originalUrl} -> ${response.statusCode} (${durationMs}ms)`);
  });

  next();
});

app.get('/', (_request, response) => {
  response.json({
    message: 'Portfolio analytics API is running.',
    docs: {
      health: '/api/health',
      portfolios: '/api/portfolios',
      analyses: [
        '/api/analysis/backtest',
        '/api/analysis/factors',
        '/api/analysis/optimize',
      ],
    },
  });
});

app.use('/api/health', healthRouter);
app.use('/api/portfolios', portfoliosRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api', (_request, response) => {
  response.status(404).json({ message: 'Route not found.' });
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  void _next;
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  response.status(500).json({ message });
});

app.listen(port, () => {
  console.log(`Portfolio API listening on http://localhost:${port}`);
});

