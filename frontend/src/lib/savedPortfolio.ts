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

export function listSavedPortfolios(): Promise<SavedPortfolio[]> {
  return getJson<SavedPortfolio[]>('/api/portfolios');
}

export function resolveSelectedPortfolioId(
  portfolios: SavedPortfolio[],
  query: LocationQuery,
  currentId = '',
): string {
  const preferredId = getPortfolioIdFromQuery(query);

  if (preferredId && portfolios.some((portfolio) => portfolio.id === preferredId)) {
    return preferredId;
  }

  if (currentId && portfolios.some((portfolio) => portfolio.id === currentId)) {
    return currentId;
  }

  return portfolios[0]?.id ?? '';
}
