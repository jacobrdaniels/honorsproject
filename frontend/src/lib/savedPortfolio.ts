import type { LocationQuery } from 'vue-router';

import { getJson } from './api';
import type { SavedPortfolio } from '../types';

export function getPortfolioIdFromQuery(query: LocationQuery): string | null {
  const rawId = query.portfolioId;

  if (typeof rawId === 'string' && rawId.trim()) {
    return rawId;
  }

  return null;
}

export function getSavedPortfolio(path: string): Promise<SavedPortfolio> {
  return getJson<SavedPortfolio>(path);
}
