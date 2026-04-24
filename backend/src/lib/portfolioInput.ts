import type { AssetAllocation } from '../types';

const targetAllocationWeight = 100;
const allocationWeightTolerance = 0.01;

export class PortfolioInputError extends Error {}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseAllocationStringWithInvalidParts(input: string): {
  assets: AssetAllocation[];
  invalidParts: string[];
  nonPositiveWeightSymbols: string[];
} {
  const mergedAssets = new Map<string, number>();
  const invalidParts: string[] = [];
  const nonPositiveWeightSymbols: string[] = [];

  for (const rawPart of input.split(',')) {
    const part = rawPart.trim();

    if (!part) {
      continue;
    }

    const [rawSymbol, rawWeight] = part.split(':').map((piece) => piece.trim());
    const symbol = rawSymbol?.toUpperCase();
    const weight = Number(rawWeight ?? '');

    if (!symbol || !rawWeight || !Number.isFinite(weight)) {
      invalidParts.push(part);
      continue;
    }

    if (weight <= 0) {
      nonPositiveWeightSymbols.push(symbol);
    }

    mergedAssets.set(symbol, round((mergedAssets.get(symbol) ?? 0) + weight));
  }

  return {
    assets: [...mergedAssets.entries()].map(([symbol, weight]) => ({
      symbol,
      weight,
    })),
    invalidParts,
    nonPositiveWeightSymbols: [...new Set(nonPositiveWeightSymbols)],
  };
}

export function parseAllocationString(input: string): AssetAllocation[] {
  return parseAllocationStringWithInvalidParts(input).assets;
}

export function validateAllocationWeights(assets: AssetAllocation[]): void {
  if (assets.length === 0) {
    throw new PortfolioInputError('Enter at least one allocation in the format TICKER:WEIGHT.');
  }

  const invalidWeightSymbols = assets
    .filter((asset) => !Number.isFinite(asset.weight) || asset.weight <= 0)
    .map((asset) => asset.symbol);

  if (invalidWeightSymbols.length > 0) {
    throw new PortfolioInputError(
      `Allocation weights must be greater than 0%. Check: ${invalidWeightSymbols.join(', ')}.`,
    );
  }

  const totalWeight = sumAllocationWeights(assets);

  if (Math.abs(totalWeight - targetAllocationWeight) > allocationWeightTolerance) {
    throw new PortfolioInputError(
      `Allocation weights must add to 100%. Current total is ${totalWeight}%.`,
    );
  }
}

export function parseValidatedAllocationString(input: string): AssetAllocation[] {
  const { assets, invalidParts, nonPositiveWeightSymbols } = parseAllocationStringWithInvalidParts(input);

  if (invalidParts.length > 0) {
    throw new PortfolioInputError(
      `Invalid allocation entries: ${invalidParts.join(', ')}. Use TICKER:WEIGHT.`,
    );
  }

  if (nonPositiveWeightSymbols.length > 0) {
    throw new PortfolioInputError(
      `Allocation weights must be greater than 0%. Check: ${nonPositiveWeightSymbols.join(', ')}.`,
    );
  }

  validateAllocationWeights(assets);
  return assets;
}

export function formatAllocationString(assets: AssetAllocation[]): string {
  return assets.map((asset) => `${asset.symbol}:${round(asset.weight)}`).join(', ');
}

export function sumAllocationWeights(assets: AssetAllocation[]): number {
  return round(assets.reduce((total, asset) => total + asset.weight, 0));
}

export function normalizeAllocationWeights(assets: AssetAllocation[]): AssetAllocation[] {
  const totalWeight = sumAllocationWeights(assets);

  if (!totalWeight) {
    return assets;
  }

  return assets.map((asset) => ({
    symbol: asset.symbol,
    weight: round((asset.weight / totalWeight) * 100),
  }));
}

export function parseTickerList(input: string): string[] {
  return [...new Set(
    input
      .split(',')
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean),
  )];
}
