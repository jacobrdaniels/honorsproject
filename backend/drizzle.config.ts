import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(configDirectory, '.env.local') });
dotenv.config({ path: path.join(configDirectory, '.env') });

export default defineConfig({
  out: './migrations',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? `file:${path.resolve(configDirectory, 'data/portfolio.db')}`,
  },
  strict: true,
  verbose: true,
});
