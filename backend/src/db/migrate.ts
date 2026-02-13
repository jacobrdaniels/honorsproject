import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getDatabaseFilePath, sqlite } from './client';

const migrationsDir = path.resolve(__dirname, '../../migrations');
const migrationsTable = '__app_migrations';

async function ensureDatabaseDirectory(): Promise<void> {
  await fs.mkdir(path.dirname(getDatabaseFilePath()), { recursive: true });
}

async function ensureMigrationTable(): Promise<void> {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ${migrationsTable} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);
}

async function readAppliedMigrations(): Promise<Set<string>> {
  const rows = sqlite.prepare(`SELECT name FROM ${migrationsTable}`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

async function applyMigration(name: string, sqlContents: string): Promise<void> {
  sqlite.exec(sqlContents);
  sqlite.prepare(`INSERT INTO ${migrationsTable} (name) VALUES (?)`).run(name);
}

async function main(): Promise<void> {
  await ensureDatabaseDirectory();
  await ensureMigrationTable();

  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const migrationFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();

  const appliedMigrations = await readAppliedMigrations();

  for (const migrationFile of migrationFiles) {
    if (appliedMigrations.has(migrationFile)) {
      continue;
    }

    const filePath = path.join(migrationsDir, migrationFile);
    const sqlContents = await fs.readFile(filePath, 'utf8');

    await applyMigration(migrationFile, sqlContents);
    console.log(`Applied migration: ${migrationFile}`);
  }
}

main()
  .catch((error) => {
    console.error('Database migration failed.');
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    sqlite.close();
  });
