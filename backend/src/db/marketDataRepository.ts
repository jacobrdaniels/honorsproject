import { sqlite } from './client';

export type StoredPriceBar = {
  symbol: string;
  tradingDay: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number;
  volume: number | null;
};

type PriceQueryInput = {
  symbols: string[];
  startDate: string;
  endDate: string;
};

export async function upsertStockPrices(rows: StoredPriceBar[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const insertStatement = sqlite.prepare(`
    INSERT INTO stock_prices (
      symbol,
      trading_day,
      open,
      high,
      low,
      close,
      adjusted_close,
      volume
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, trading_day) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      adjusted_close = excluded.adjusted_close,
      volume = excluded.volume
  `);

  const transaction = sqlite.transaction((bars: StoredPriceBar[]) => {
    for (const row of bars) {
      insertStatement.run(
        row.symbol,
        row.tradingDay,
        row.open,
        row.high,
        row.low,
        row.close,
        row.adjustedClose,
        row.volume,
      );
    }
  });

  transaction(rows);
}

export async function getHistoricalPrices(input: PriceQueryInput): Promise<StoredPriceBar[]> {
  const normalizedSymbols = [...new Set(input.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];

  if (normalizedSymbols.length === 0) {
    return [];
  }

  return sqlite
    .prepare(`
      SELECT
        symbol,
        trading_day AS tradingDay,
        open,
        high,
        low,
        close,
        adjusted_close AS adjustedClose,
        volume
      FROM stock_prices
      WHERE symbol IN (${normalizedSymbols.map(() => '?').join(', ')})
        AND trading_day >= ?
        AND trading_day <= ?
      ORDER BY trading_day ASC
    `)
    .all(...normalizedSymbols, input.startDate, input.endDate) as StoredPriceBar[];
}

export async function listAvailableMarketSymbols(): Promise<string[]> {
  const rows = sqlite
    .prepare(`
      SELECT DISTINCT symbol
      FROM stock_prices
      ORDER BY symbol ASC
    `)
    .all() as Array<{ symbol: string }>;

  return rows.map((row) => row.symbol);
}

export async function countStoredPriceRows(): Promise<number> {
  const row = sqlite
    .prepare(`
      SELECT COUNT(*) AS total
      FROM stock_prices
    `)
    .get() as { total: number };

  return row.total;
}
