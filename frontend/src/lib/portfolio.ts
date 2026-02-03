import type { AssetAllocation, FrontierAsset, SavedPortfolio } from '../types';

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseAllocationText(input: string): AssetAllocation[] {
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

export function formatAllocationText(assets: AssetAllocation[]): string {
  return assets.map((asset) => `${asset.symbol}:${round(asset.weight)}`).join(', ');
}

export function sumAllocationWeights(assets: AssetAllocation[]): number {
  return round(assets.reduce((total, asset) => total + asset.weight, 0));
}

export function isAllocationTextValid(input: string): boolean {
  return parseAllocationText(input).length > 0;
}

export function getPortfolioTickers(portfolio: SavedPortfolio): string {
  return portfolio.assets.map((asset) => asset.symbol).join(', ');
}

export function createUniverseText(portfolio: SavedPortfolio): string {
  return portfolio.assets
    .map((asset, index) => {
      const expectedReturn = round(0.04 + asset.weight / 1000 + index * 0.01);
      const volatility = round(0.06 + asset.weight / 500 + index * 0.02);
      return `${asset.symbol}:${expectedReturn}:${volatility}`;
    })
    .join(', ');
}

export function parseTickerText(input: string): string[] {
  return [...new Set(
    input
      .split(',')
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean),
  )];
}

export function parseUniverseText(input: string): FrontierAsset[] {
  return input
    .split(',')
    .map((rawPart) => rawPart.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawSymbol, rawReturn, rawVolatility] = part.split(':').map((value) => value.trim());
      return {
        symbol: rawSymbol?.toUpperCase() ?? '',
        expectedReturn: Number(rawReturn ?? ''),
        volatility: Number(rawVolatility ?? ''),
      };
    })
    .filter((asset) => asset.symbol && Number.isFinite(asset.expectedReturn) && Number.isFinite(asset.volatility));
}
