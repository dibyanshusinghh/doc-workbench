import express, { type Express } from 'express';
import type { LlmProvider } from './analysis/provider.js';
import { createAnalysesRouter } from './api/routes/analyses.js';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler.js';
import type { AnalysisRepository } from './db/repository.js';

/** Builds the Express app. Dependencies are passed in so tests can use an in-memory DB and any provider. */
export function createApp(repository: AnalysisRepository, provider: LlmProvider): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/analyses', createAnalysesRouter(repository, provider));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
