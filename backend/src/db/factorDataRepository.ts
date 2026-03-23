import { sqlite } from './client';

export type StoredFactorRow = {
  factorSet: string;
  period: string;
  marketExcess: number;
  smb: number | null;
  hml: number | null;
  momentum: number | null;
  rmw: number | null;
  cma: number | null;
  riskFree: number;
};

type FactorQueryInput = {
  factorSet: string;
  startDate: string;
  endDate: string;
};

export async function upsertFactorReturns(rows: StoredFactorRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const insertStatement = sqlite.prepare(`
    INSERT INTO factor_returns (
      factor_set,
      period,
      market_excess,
      smb,
      hml,
      momentum,
      rmw,
      cma,
      risk_free
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(factor_set, period) DO UPDATE SET
      market_excess = excluded.market_excess,
      smb = excluded.smb,
      hml = excluded.hml,
      momentum = excluded.momentum,
      rmw = excluded.rmw,
      cma = excluded.cma,
      risk_free = excluded.risk_free
  `);

  const transaction = sqlite.transaction((factorRows: StoredFactorRow[]) => {
    for (const row of factorRows) {
      insertStatement.run(
        row.factorSet,
        row.period,
        row.marketExcess,
        row.smb,
        row.hml,
        row.momentum,
        row.rmw,
        row.cma,
        row.riskFree,
      );
    }
  });

  transaction(rows);
}

export async function getStoredFactorReturns(input: FactorQueryInput): Promise<StoredFactorRow[]> {
  return sqlite
    .prepare(`
      SELECT
        factor_set AS factorSet,
        period,
        market_excess AS marketExcess,
        smb,
        hml,
        momentum,
        rmw,
        cma,
        risk_free AS riskFree
      FROM factor_returns
      WHERE factor_set = ?
        AND period >= ?
        AND period <= ?
      ORDER BY period ASC
    `)
    .all(input.factorSet, input.startDate, input.endDate) as StoredFactorRow[];
}
