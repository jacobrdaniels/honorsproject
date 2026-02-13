import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import '../lib/env';
import * as schema from './schema';

const defaultDatabasePath = path.resolve(__dirname, '../../data/portfolio.db');

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? `file:${defaultDatabasePath}`;
}

export function getDatabaseFilePath(): string {
  const databaseUrl = getDatabaseUrl();
  return databaseUrl.startsWith('file:') ? databaseUrl.slice('file:'.length) : databaseUrl;
}

fs.mkdirSync(path.dirname(getDatabaseFilePath()), { recursive: true });

export const sqlite = new Database(getDatabaseFilePath());
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
