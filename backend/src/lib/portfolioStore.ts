import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import type { AssetAllocation, SavedPortfolio } from '../types';

const dataFilePath = path.resolve(__dirname, '../../data/portfolios.json');

function parseAllocations(input: string): AssetAllocation[] {
  return input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [symbol, rawWeight] = part.split(':').map((piece) => piece.trim());
      return {
        symbol,
        weight: Number(rawWeight ?? 0),
      };
    })
    .filter((asset) => asset.symbol && Number.isFinite(asset.weight));
}

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(path.dirname(dataFilePath), { recursive: true });

  try {
    await fs.access(dataFilePath);
  } catch {
    await fs.writeFile(dataFilePath, '[]\n', 'utf8');
  }
}

async function readPortfolios(): Promise<SavedPortfolio[]> {
  await ensureDataFile();
  const raw = await fs.readFile(dataFilePath, 'utf8');

  if (!raw.trim()) {
    return [];
  }

  return JSON.parse(raw) as SavedPortfolio[];
}

async function writePortfolios(portfolios: SavedPortfolio[]): Promise<void> {
  await fs.writeFile(dataFilePath, `${JSON.stringify(portfolios, null, 2)}\n`, 'utf8');
}

export async function listPortfolios(): Promise<SavedPortfolio[]> {
  return readPortfolios();
}

export async function createPortfolio(input: {
  name: string;
  benchmark?: string;
  notes?: string;
  allocations: string;
}): Promise<SavedPortfolio> {
  const portfolio: SavedPortfolio = {
    id: randomUUID(),
    name: input.name.trim(),
    benchmark: (input.benchmark ?? 'SPY').trim() || 'SPY',
    notes: (input.notes ?? '').trim(),
    assets: parseAllocations(input.allocations),
  };

  const portfolios = await readPortfolios();
  portfolios.unshift(portfolio);
  await writePortfolios(portfolios);

  return portfolio;
}
