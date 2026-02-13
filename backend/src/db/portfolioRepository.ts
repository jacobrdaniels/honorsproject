import { randomUUID } from 'node:crypto';

import { asc, desc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { AssetAllocation, SavedPortfolio } from '../types';
import { db } from './client';
import * as schema from './schema';
import { portfolioHoldings, portfolios } from './schema';

type CreatePortfolioRecordInput = {
  name: string;
  benchmark: string;
  notes: string;
  assets: AssetAllocation[];
};

type PortfolioRow = {
  portfolioId: string;
  portfolioName: string;
  portfolioBenchmark: string;
  portfolioNotes: string;
  holdingId: string | null;
  holdingSymbol: string | null;
  holdingWeight: number | null;
};

type Transaction = BetterSQLite3Database<typeof schema>;

async function readPortfolioRows(portfolioId?: string): Promise<PortfolioRow[]> {
  const baseQuery = db
    .select({
      portfolioId: portfolios.id,
      portfolioName: portfolios.name,
      portfolioBenchmark: portfolios.benchmark,
      portfolioNotes: portfolios.notes,
      holdingId: portfolioHoldings.id,
      holdingSymbol: portfolioHoldings.symbol,
      holdingWeight: portfolioHoldings.weight,
    })
    .from(portfolios)
    .leftJoin(portfolioHoldings, eq(portfolios.id, portfolioHoldings.portfolioId));

  if (portfolioId) {
    return baseQuery
      .where(eq(portfolios.id, portfolioId))
      .orderBy(desc(portfolios.rowId), asc(portfolioHoldings.sortOrder));
  }

  return baseQuery.orderBy(desc(portfolios.rowId), asc(portfolioHoldings.sortOrder));
}

function mapRowsToPortfolios(rows: PortfolioRow[]): SavedPortfolio[] {
  const portfoliosById = new Map<string, SavedPortfolio>();
  const orderedPortfolios: SavedPortfolio[] = [];

  for (const row of rows) {
    let portfolio = portfoliosById.get(row.portfolioId);

    if (!portfolio) {
      portfolio = {
        id: row.portfolioId,
        name: row.portfolioName,
        benchmark: row.portfolioBenchmark,
        notes: row.portfolioNotes,
        assets: [],
      };

      portfoliosById.set(row.portfolioId, portfolio);
      orderedPortfolios.push(portfolio);
    }

    if (row.holdingId && row.holdingSymbol !== null && row.holdingWeight !== null) {
      portfolio.assets.push({
        symbol: row.holdingSymbol,
        weight: row.holdingWeight,
      });
    }
  }

  return orderedPortfolios;
}

function insertHoldings(tx: Transaction, portfolioId: string, assets: AssetAllocation[]): void {
  if (assets.length === 0) {
    return;
  }

  tx.insert(portfolioHoldings).values(
    assets.map((asset, index) => ({
      id: randomUUID(),
      portfolioId,
      symbol: asset.symbol,
      weight: asset.weight,
      sortOrder: index,
    })),
  ).run();
}

export async function listPortfolioRecords(): Promise<SavedPortfolio[]> {
  return mapRowsToPortfolios(await readPortfolioRows());
}

export async function getPortfolioRecordById(portfolioId: string): Promise<SavedPortfolio | null> {
  return mapRowsToPortfolios(await readPortfolioRows(portfolioId))[0] ?? null;
}

export async function createPortfolioRecord(input: CreatePortfolioRecordInput): Promise<SavedPortfolio> {
  const portfolioId = randomUUID();
  const normalizedPortfolio: SavedPortfolio = {
    id: portfolioId,
    name: input.name,
    benchmark: input.benchmark,
    notes: input.notes,
    assets: input.assets,
  };

  db.transaction((tx) => {
    tx.insert(portfolios).values({
      id: normalizedPortfolio.id,
      name: normalizedPortfolio.name,
      benchmark: normalizedPortfolio.benchmark,
      notes: normalizedPortfolio.notes,
    }).run();
    insertHoldings(tx, normalizedPortfolio.id, normalizedPortfolio.assets);
  });

  return normalizedPortfolio;
}

export async function updatePortfolioRecord(
  portfolioId: string,
  input: CreatePortfolioRecordInput,
): Promise<SavedPortfolio | null> {
  const existingPortfolio = await getPortfolioRecordById(portfolioId);

  if (!existingPortfolio) {
    return null;
  }

  const normalizedPortfolio: SavedPortfolio = {
    id: portfolioId,
    name: input.name,
    benchmark: input.benchmark,
    notes: input.notes,
    assets: input.assets,
  };

  db.transaction((tx) => {
    tx.update(portfolios)
      .set({
        name: normalizedPortfolio.name,
        benchmark: normalizedPortfolio.benchmark,
        notes: normalizedPortfolio.notes,
      })
      .where(eq(portfolios.id, portfolioId))
      .run();

    tx.delete(portfolioHoldings)
      .where(eq(portfolioHoldings.portfolioId, portfolioId))
      .run();

    insertHoldings(tx, portfolioId, normalizedPortfolio.assets);
  });

  return normalizedPortfolio;
}

export async function deletePortfolioRecord(portfolioId: string): Promise<boolean> {
  const result = db.delete(portfolios).where(eq(portfolios.id, portfolioId)).run();
  return result.changes > 0;
}
