import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const portfolios = sqliteTable('portfolios', {
  rowId: integer('row_id').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  name: text('name').notNull(),
  benchmark: text('benchmark').notNull(),
  notes: text('notes').notNull().default(''),
});

export const portfolioHoldings = sqliteTable(
  'portfolio_holdings',
  {
    id: text('id').primaryKey(),
    portfolioId: text('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    weight: real('weight').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => ({
    portfolioSortOrderIdx: uniqueIndex('portfolio_holdings_portfolio_sort_order_idx').on(
      table.portfolioId,
      table.sortOrder,
    ),
    portfolioSymbolIdx: index('portfolio_holdings_portfolio_symbol_idx').on(table.portfolioId, table.symbol),
  }),
);

// These tables are not used by the API yet, but they reserve a clean place for
// historical market data and factor data once the analytics layer needs them.
export const stockPrices = sqliteTable(
  'stock_prices',
  {
    rowId: integer('row_id').primaryKey({ autoIncrement: true }),
    symbol: text('symbol').notNull(),
    tradingDay: text('trading_day').notNull(),
    open: real('open').notNull(),
    high: real('high').notNull(),
    low: real('low').notNull(),
    close: real('close').notNull(),
    adjustedClose: real('adjusted_close'),
    volume: integer('volume'),
  },
  (table) => ({
    stockPricesSymbolDayIdx: uniqueIndex('stock_prices_symbol_trading_day_idx').on(table.symbol, table.tradingDay),
  }),
);

export const factorReturns = sqliteTable(
  'factor_returns',
  {
    rowId: integer('row_id').primaryKey({ autoIncrement: true }),
    factorSet: text('factor_set').notNull(),
    period: text('period').notNull(),
    marketExcess: real('market_excess').notNull(),
    smb: real('smb'),
    hml: real('hml'),
    momentum: real('momentum'),
    rmw: real('rmw'),
    cma: real('cma'),
    riskFree: real('risk_free').notNull(),
  },
  (table) => ({
    factorReturnsSetPeriodIdx: uniqueIndex('factor_returns_factor_set_period_idx').on(table.factorSet, table.period),
  }),
);
