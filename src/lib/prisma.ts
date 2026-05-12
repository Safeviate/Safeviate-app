import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertRequiredEnv } from '@/lib/server/env';
import { normalizePostgresConnectionString } from '@/lib/server/postgres-url';

const normalizedDatabaseUrl = normalizePostgresConnectionString(process.env.DATABASE_URL);
const normalizedUnpooledDatabaseUrl = normalizePostgresConnectionString(process.env.DATABASE_URL_UNPOOLED);

process.env.DATABASE_URL = normalizedDatabaseUrl || normalizedUnpooledDatabaseUrl;
process.env.DATABASE_URL_UNPOOLED = normalizedUnpooledDatabaseUrl || normalizedDatabaseUrl;

assertRequiredEnv(
  [['DATABASE_URL', 'DATABASE_URL_UNPOOLED']],
  'database client'
);

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

type DatabaseAvailabilityCache = {
  checkedAt: number;
  available: boolean;
};

const DATABASE_AVAILABILITY_TTL_MS = 15_000;
let databaseAvailabilityCache: DatabaseAvailabilityCache | null = null;

export const prisma =
  global.__prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export async function isDatabaseAvailable(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    databaseAvailabilityCache &&
    now - databaseAvailabilityCache.checkedAt < DATABASE_AVAILABILITY_TTL_MS
  ) {
    return databaseAvailabilityCache.available;
  }

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    databaseAvailabilityCache = { checkedAt: now, available: true };
    return true;
  } catch {
    databaseAvailabilityCache = { checkedAt: now, available: false };
    return false;
  }
}
