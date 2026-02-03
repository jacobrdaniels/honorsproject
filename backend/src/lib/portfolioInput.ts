import type { AssetAllocation } from '../types';

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseAllocationString(input: string): AssetAllocation[] {
  const mergedAssets = new Map<string, number>();

  for (const rawPart of input.split(',')) {
    const part = rawPart.trim();

    if (!part) {
      continue;
    }

    const [rawSymbol, rawWeight] = part.split(':').map((piece) => piece.trim());
    const symbol = rawSymbol?.toUpperCase();
    const weight = Number(rawWeight ?? '');

    if (!symbol || !rawWeight || !Number.isFinite(weight)) {
      continue;
    }

    mergedAssets.set(symbol, round((mergedAssets.get(symbol) ?? 0) + weight));
  }

  return [...mergedAssets.entries()].map(([symbol, weight]) => ({
    symbol,
    weight,
  }));
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
