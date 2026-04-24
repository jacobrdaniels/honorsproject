import type { AssetAllocation, SavedPortfolio } from '../types';

export type PortfolioAssetRow = {
  label: string;
  symbol: string;
  weight: string;
};

export const PORTFOLIO_ASSET_ROW_COUNT = 10;
const TARGET_ALLOCATION_WEIGHT = 100;
const ALLOCATION_WEIGHT_TOLERANCE = 0.01;

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

function formatWeightInput(weight: number): string {
  const roundedWeight = round(weight);
  return Number.isInteger(roundedWeight) ? String(roundedWeight) : roundedWeight.toFixed(2);
}

export function createPortfolioAssetRows(count = PORTFOLIO_ASSET_ROW_COUNT): PortfolioAssetRow[] {
  return Array.from({ length: count }, (_, index) => ({
    label: `Asset ${index + 1}`,
    symbol: '',
    weight: '',
  }));
}

export function portfolioToAssetRows(
  portfolio: SavedPortfolio,
  count = PORTFOLIO_ASSET_ROW_COUNT,
): PortfolioAssetRow[] {
  const rows = createPortfolioAssetRows(count);

  portfolio.assets.slice(0, count).forEach((asset, index) => {
    rows[index] = {
      label: `Asset ${index + 1}`,
      symbol: asset.symbol,
      weight: formatWeightInput(asset.weight),
    };
  });

  return rows;
}

export function assetRowsToAllocationText(rows: PortfolioAssetRow[]): string {
  return rows
    .map((row) => {
      const symbol = row.symbol.trim().toUpperCase();
      const weight = row.weight.trim();
      return symbol && weight ? `${symbol}:${weight}` : '';
    })
    .filter(Boolean)
    .join(', ');
}

export function sumAssetRowWeights(rows: PortfolioAssetRow[]): number {
  return round(rows.reduce((total, row) => {
    const weight = Number(row.weight || 0);
    return total + (Number.isFinite(weight) ? weight : 0);
  }, 0));
}

export function sumAllocationWeights(assets: AssetAllocation[]): number {
  return round(assets.reduce((total, asset) => total + asset.weight, 0));
}

export function getAllocationValidationMessage(assets: AssetAllocation[]): string {
  if (assets.length === 0) {
    return 'Enter at least one asset ticker and weight.';
  }

  const invalidWeightSymbols = assets
    .filter((asset) => !Number.isFinite(asset.weight) || asset.weight <= 0)
    .map((asset) => asset.symbol);

  if (invalidWeightSymbols.length > 0) {
    return `Weights must be greater than 0%. Check: ${invalidWeightSymbols.join(', ')}.`;
  }

  const totalWeight = sumAllocationWeights(assets);

  if (Math.abs(totalWeight - TARGET_ALLOCATION_WEIGHT) > ALLOCATION_WEIGHT_TOLERANCE) {
    return `Weights must add to 100%. Current total is ${totalWeight.toFixed(2)}%.`;
  }

  return '';
}

export function isAllocationTextValid(input: string): boolean {
  return getAllocationValidationMessage(parseAllocationText(input)) === '';
}

export function getPortfolioTickers(portfolio: SavedPortfolio): string {
  return portfolio.assets.map((asset) => asset.symbol).join(', ');
}

export function createUniverseText(portfolio: SavedPortfolio): string {
  return portfolio.assets.map((asset) => asset.symbol).join(', ');
}

export function parseTickerText(input: string): string[] {
  return [...new Set(
    input
      .split(',')
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean),
  )];
}
