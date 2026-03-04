# Honors Project

This repository contains the base scaffold for a portfolio analysis application inspired by Portfolio Visualizer. It is meant to be easy to understand for a first-time reviewer: the frontend already mirrors the planned product areas, and the backend exposes placeholder endpoints with the same feature boundaries the real app will need later.

## What This Project Is

The current version is a working full-stack starter for these planned workflows:

- Portfolio backtesting
- Factor regression
- Efficient frontier analysis
- Portfolio optimization
- Saving portfolio scenarios for quick iteration

The analytics responses are still placeholder data. The goal of this stage is to establish project structure, routing, API boundaries, and a simple persistence flow before adding real market data and portfolio math.

## Project Layout

- `frontend/`: Vue 3 + Vite + TypeScript client
- `backend/`: Express + TypeScript API
- `context/`: proposal notes and reference material used to shape the product scope

## Frontend Overview

The frontend includes a router and starter pages for:

- `Dashboard`
- `Backtest`
- `Factor Regression`
- `Efficient Frontier`
- `Portfolio Optimization`
- `Saved Portfolios`

Saved portfolios can now be reused across the analysis pages so a scenario stored in the library can prefill the backtest, factor, frontier, and optimization workflows.

The app calls the backend through `/api` routes and is set up so the placeholder views can be replaced with real charts, tables, and inputs as implementation continues.

## Backend Overview

The backend currently exposes:

- `GET /api/health`
- `GET /api/portfolios`
- `GET /api/portfolios/:portfolioId`
- `POST /api/portfolios`
- `PUT /api/portfolios/:portfolioId`
- `DELETE /api/portfolios/:portfolioId`
- `POST /api/analysis/backtest`
- `POST /api/analysis/factors`
- `POST /api/analysis/efficient-frontier`
- `POST /api/analysis/optimize`

Saved portfolios are stored in a local SQLite database through Drizzle. The database file lives under `backend/data/`, and the schema already leaves room for future stock-price and factor-return tables.

## Getting Started

1. Install Node.js 20 or newer.
2. Run `npm install` from the repository root.
3. Run `npm run dev` to start both the frontend and backend.
4. Open `http://localhost:5173/` in a browser.

## Quickstart

After cloning the repository, run:

```bash
npm install
npm run db:migrate --workspace backend
npm run dev
```

Optional one-off data imports for a fuller demo:

```bash
npm run market:import --workspace backend -- SPY VTI VXUS BND
npm run factor:import --workspace backend
```

Then open `http://localhost:5173/`.

## Useful Scripts

- `npm run dev`: start frontend and backend together
- `npm run dev:frontend`: start only the Vue app
- `npm run dev:backend`: start only the API
- `npm run build`: build both workspaces
- `npm run lint`: run the shared ESLint checks
- `npm run test`: run backend unit tests
- `npm run db:migrate --workspace backend`: apply backend SQLite migrations manually
- `npm run db:generate --workspace backend`: generate future Drizzle migration files from the schema
- `npm run factor:import --workspace backend`: import the Ken French factor CSVs listed in `factordata/expected-files.txt` into `factor_returns`
- `npm run market:import --workspace backend -- SPY VTI VXUS BND`: fetch Yahoo Finance daily history, cache it under `backend/marketdata/`, and upsert it into `stock_prices`

## Environment Files

- Copy `frontend/.env.example` to `frontend/.env.local` if you want to override the API base URL.
- Copy `backend/.env.example` to `backend/.env.local` if you want to change the API port, CORS origin, or SQLite database location.
- The backend now loads `backend/.env.local` automatically for local development.
- `MARKETDATA_TICKERS` and `MARKETDATA_START_DATE` let you control the default Yahoo Finance import universe for one-off data loads.
- Put the Ken French CSV files you want to import in `factordata/` and keep the expected filenames in `factordata/expected-files.txt`.

## Demo Workflow

1. Save a portfolio on the `Saved Portfolios` page.
2. Use one of the `Use in ...` buttons to open an analysis page with that saved portfolio preloaded.
3. Run `npm run market:import --workspace backend -- SPY VTI VXUS BND` once to preload historical daily prices for your demo universe.
4. Run the backtest page again to use stored Yahoo Finance price history when those symbols are available.

## Deployment Notes

- In development, Vite proxies `/api` requests to `http://localhost:3001`.
- For a deployed frontend/backend split, set `VITE_API_BASE_URL` in `frontend/.env.local` or the hosting platform environment.
- The health endpoint now reports API and SQLite readiness so it can be used for a simple smoke test after deployment.

## Current Limitations

- Analytics results are stubbed rather than calculated from real market data.
- Portfolio storage is local SQLite, which is fine for project scope but not yet set up for multi-user production use.
- There is no authentication yet.
