import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
import { normalizePostgresConnectionString } from './src/lib/server/postgres-url';

const normalizedDatabaseUrl = normalizePostgresConnectionString(process.env.DATABASE_URL);
const normalizedUnpooledDatabaseUrl = normalizePostgresConnectionString(process.env.DATABASE_URL_UNPOOLED);

process.env.DATABASE_URL = normalizedDatabaseUrl || normalizedUnpooledDatabaseUrl;
process.env.DATABASE_URL_UNPOOLED = normalizedUnpooledDatabaseUrl || normalizedDatabaseUrl;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL_UNPOOLED'),
  },
});
