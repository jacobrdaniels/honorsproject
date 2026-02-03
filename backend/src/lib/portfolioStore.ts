import { randomUUID } from 'crypto';
import { promises as fsPromises } from 'fs';
import path from 'path';

import type { AssetAllocation, SavedPortfolio } from '../types';
import { parseAllocationString } from './portfolioInput';

type PortfolioMutationInput = {
  name: string;
  benchmark?: string;
  notes?: string;
  allocations: string;
};

const dataFilePath = path.resolve(__dirname, '../../data/portfolios.json');

function normalizePortfolioInput(input: PortfolioMutationInput): {
  name: string;
  benchmark: string;
  notes: string;
  assets: AssetAllocation[];
} {
  const assets = parseAllocationString(input.allocations);

  if (assets.length === 0) {
    throw new Error('Enter at least one allocation in the format TICKER:WEIGHT.');
  }

  return {
    name: input.name.trim(),
    benchmark: (input.benchmark ?? 'SPY').trim().toUpperCase() || 'SPY',
    notes: (input.notes ?? '').trim(),
    assets,
  };
}

async function ensureDataFile(): Promise<void> {
  await fsPromises.mkdir(path.dirname(dataFilePath), { recursive: true });

  try {
    await fsPromises.access(dataFilePath);
  } catch {
    await fsPromises.writeFile(dataFilePath, '[]\n', 'utf8');
  }
}

async function readPortfolios(): Promise<SavedPortfolio[]> {
  await ensureDataFile();
  const raw = await fsPromises.readFile(dataFilePath, 'utf8');
  return raw.trim() ? JSON.parse(raw) as SavedPortfolio[] : [];
}

async function writePortfolios(portfolios: SavedPortfolio[]): Promise<void> {
  await fsPromises.writeFile(dataFilePath, JSON.stringify(portfolios, null, 2) + '\n', 'utf8');
}

export async function listPortfolios(): Promise<SavedPortfolio[]> {
  return readPortfolios();
}

export async function getPortfolioById(id: string): Promise<SavedPortfolio | null> {
  const portfolios = await readPortfolios();
  return portfolios.find((portfolio) => portfolio.id === id) ?? null;
}

export async function createPortfolio(input: PortfolioMutationInput): Promise<SavedPortfolio> {
  const portfolio: SavedPortfolio = {
    id: randomUUID(),
    ...normalizePortfolioInput(input),
  };

  const portfolios = await readPortfolios();
  portfolios.unshift(portfolio);
  await writePortfolios(portfolios);

  return portfolio;
}

export async function updatePortfolio(id: string, input: PortfolioMutationInput): Promise<SavedPortfolio | null> {
  const portfolios = await readPortfolios();
  const index = portfolios.findIndex((portfolio) => portfolio.id === id);

  if (index === -1) {
    return null;
  }

  const updated: SavedPortfolio = {
    ...portfolios[index],
    ...normalizePortfolioInput(input),
  };

  portfolios[index] = updated;
  await writePortfolios(portfolios);

  return updated;
}

export async function deletePortfolio(id: string): Promise<boolean> {
  const portfolios = await readPortfolios();
  const filtered = portfolios.filter((portfolio) => portfolio.id !== id);

  if (filtered.length === portfolios.length) {
    return false;
  }

  await writePortfolios(filtered);
  return true;
}
