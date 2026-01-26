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

The app calls the backend through `/api` routes and is set up so the placeholder views can be replaced with real charts, tables, and inputs as implementation continues.

## Backend Overview

The backend currently exposes:

- `GET /api/health`
- `GET /api/portfolios`
- `POST /api/portfolios`
- `POST /api/analysis/backtest`
- `POST /api/analysis/factors`
- `POST /api/analysis/efficient-frontier`
- `POST /api/analysis/optimize`

Saved portfolios are written to `backend/data/portfolios.json` so the project can run locally without a database.

## Getting Started

1. Install Node.js 20 or newer.
2. Run `npm install` from the repository root.
3. Run `npm run dev` to start both the frontend and backend.
4. Open `http://localhost:5173/` in a browser.

## Useful Scripts

- `npm run dev`: start frontend and backend together
- `npm run dev:frontend`: start only the Vue app
- `npm run dev:backend`: start only the API
- `npm run build`: build both workspaces

## Environment Files

- Copy `frontend/.env.example` to `frontend/.env.local` if you want to override the API base URL.
- Copy `backend/.env.example` to `backend/.env.local` if you want to change the API port or CORS origin.

## Current Limitations

- Analytics results are stubbed rather than calculated from real market data.
- Portfolio storage is local JSON, not a production database.
- There is no authentication yet.
