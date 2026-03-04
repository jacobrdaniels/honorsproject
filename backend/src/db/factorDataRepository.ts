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
