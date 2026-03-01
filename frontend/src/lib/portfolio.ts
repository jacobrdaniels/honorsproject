import type { AssetAllocation, FrontierAsset, SavedPortfolio } from '../types';

export type PortfolioAssetRow = {
  label: string;
  symbol: string;
  weight: string;
};

export const PORTFOLIO_ASSET_ROW_COUNT = 10;

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
  return round(rows.reduce((total, row) => total + Number(row.weight || 0), 0));
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
