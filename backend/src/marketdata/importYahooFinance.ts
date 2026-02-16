import { promises as fs } from 'node:fs';
import path from 'node:path';

import YahooFinance from 'yahoo-finance2';

import '../lib/env';
import { upsertStockPrices, type StoredPriceBar } from '../db/marketDataRepository';

const defaultTickers = [
  'SPY',
  'VTI',
  'VXUS',
  'BND',
  'QQQ',
  'VNQ',
  'GLD',
  'TLT',
];

const yahooFinance = new YahooFinance();

type YahooHistoricalRow = {
  date?: Date;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  adjClose?: number | null;
  volume?: number | null;
};

type YahooChartResult = {
  quotes?: YahooHistoricalRow[];
};

function resolveTickerList(): string[] {
  const argumentTickers = process.argv.slice(2);

  if (argumentTickers.length > 0) {
    return argumentTickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean);
  }

  const envTickers = process.env.MARKETDATA_TICKERS?.split(',').map((ticker) => ticker.trim().toUpperCase()).filter(Boolean);
  return envTickers && envTickers.length > 0 ? envTickers : defaultTickers;
}

function getStartDate(): string {
  return process.env.MARKETDATA_START_DATE ?? '2010-01-01';
}

function getMarketdataDirectory(): string {
  return path.resolve(__dirname, '../../marketdata/yahoo');
}

function toStoredBar(symbol: string, row: YahooHistoricalRow): StoredPriceBar | null {
  const tradingDay = row.date?.toISOString().slice(0, 10);
  const open = Number(row.open);
  const high = Number(row.high);
  const low = Number(row.low);
  const close = Number(row.close);
  const adjustedClose = Number(row.adjClose ?? row.close);
  const volume = row.volume === undefined || row.volume === null ? null : Number(row.volume);

  if (!tradingDay || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) || !Number.isFinite(adjustedClose)) {
    return null;
  }

  return {
    symbol,
    tradingDay,
    open,
    high,
    low,
    close,
    adjustedClose,
    volume: volume !== null && Number.isFinite(volume) ? volume : null,
  };
}

async function fetchSymbolHistory(symbol: string, period1: string): Promise<StoredPriceBar[]> {
  const result = await yahooFinance.chart(symbol, {
    period1: new Date(period1),
    period2: new Date(),
    interval: '1d',
  }) as YahooChartResult;

  const rows = result.quotes ?? [];

  return rows
    .map((row) => toStoredBar(symbol, row))
    .filter((row): row is StoredPriceBar => row !== null);
}

async function writeRawCache(symbol: string, rows: StoredPriceBar[]): Promise<void> {
  const marketdataDirectory = getMarketdataDirectory();
  await fs.mkdir(marketdataDirectory, { recursive: true });

  const filePath = path.join(marketdataDirectory, `${symbol}.json`);
  const payload = {
    symbol,
    importedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows,
  };

  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const tickers = resolveTickerList();
  const period1 = getStartDate();

  console.log(`Importing Yahoo Finance history for ${tickers.join(', ')} starting ${period1}.`);

  for (const symbol of tickers) {
    console.log(`Fetching ${symbol}...`);

    const rows = await fetchSymbolHistory(symbol, period1);

    if (rows.length === 0) {
      console.log(`No rows returned for ${symbol}.`);
      continue;
    }

    await writeRawCache(symbol, rows);
    await upsertStockPrices(rows);
    console.log(`Stored ${rows.length} rows for ${symbol}.`);
  }
}

main()
  .catch((error) => {
    console.error('Yahoo Finance import failed.');
    console.error(error);
    process.exit(1);
  });
