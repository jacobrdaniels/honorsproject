import type { AssetAllocation, SavedPortfolio } from '../types';
import {
  createPortfolioRecord,
  deletePortfolioRecord,
  getPortfolioRecordById,
  listPortfolioRecords,
  updatePortfolioRecord,
} from '../db/portfolioRepository';
import { parseValidatedAllocationString } from './portfolioInput';

type PortfolioMutationInput = {
  name: string;
  benchmark?: string;
  notes?: string;
  allocations: string;
};

function normalizePortfolioInput(input: PortfolioMutationInput): {
  name: string;
  benchmark: string;
  notes: string;
  assets: AssetAllocation[];
} {
  const assets = parseValidatedAllocationString(input.allocations);

  return {
    name: input.name.trim(),
    benchmark: (input.benchmark ?? 'SPY').trim().toUpperCase() || 'SPY',
    notes: (input.notes ?? '').trim(),
    assets,
  };
}

export async function listPortfolios(): Promise<SavedPortfolio[]> {
  return listPortfolioRecords();
}

export async function getPortfolioById(id: string): Promise<SavedPortfolio | null> {
  return getPortfolioRecordById(id);
}

export async function createPortfolio(input: PortfolioMutationInput): Promise<SavedPortfolio> {
  return createPortfolioRecord(normalizePortfolioInput(input));
}

export async function updatePortfolio(id: string, input: PortfolioMutationInput): Promise<SavedPortfolio | null> {
  return updatePortfolioRecord(id, normalizePortfolioInput(input));
}

export async function deletePortfolio(id: string): Promise<boolean> {
  return deletePortfolioRecord(id);
}
