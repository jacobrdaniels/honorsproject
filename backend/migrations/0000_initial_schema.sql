PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS portfolios (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  benchmark TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id TEXT PRIMARY KEY NOT NULL,
  portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  weight REAL NOT NULL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_holdings_portfolio_sort_order_idx
  ON portfolio_holdings (portfolio_id, sort_order);

CREATE INDEX IF NOT EXISTS portfolio_holdings_portfolio_symbol_idx
  ON portfolio_holdings (portfolio_id, symbol);

CREATE TABLE IF NOT EXISTS stock_prices (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  trading_day TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  adjusted_close REAL,
  volume INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_prices_symbol_trading_day_idx
  ON stock_prices (symbol, trading_day);

CREATE TABLE IF NOT EXISTS factor_returns (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  factor_set TEXT NOT NULL,
  period TEXT NOT NULL,
  market_excess REAL NOT NULL,
  smb REAL,
  hml REAL,
  momentum REAL,
  rmw REAL,
  cma REAL,
  risk_free REAL NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS factor_returns_factor_set_period_idx
  ON factor_returns (factor_set, period);
