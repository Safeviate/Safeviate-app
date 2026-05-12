import type { Config } from 'drizzle-kit';
import { normalizePostgresConnectionString } from './src/lib/server/postgres-url';

const databaseUrl =
  normalizePostgresConnectionString(process.env.NEON2_DATABASE_URL) ||
  normalizePostgresConnectionString(process.env.DATABASE_URL);

if (!databaseUrl) {
  throw new Error('DATABASE_URL is missing.');
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;
