import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertRequiredEnv } from '@/lib/server/env';
import { normalizePostgresConnectionString } from '@/lib/server/postgres-url';
import net from 'node:net';

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

const getDatabaseEndpoint = () => {
  const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    return null;
  }

  try {
    const url = new URL(connectionString);
    return {
      host: url.hostname,
      port: Number(url.port) || 5432,
    };
  } catch {
    return null;
  }
};

const probeDatabaseEndpoint = async (timeoutMs = 1500) => {
  const endpoint = getDatabaseEndpoint();
  if (!endpoint?.host) {
    return false;
  }

  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({
      host: endpoint.host,
      port: endpoint.port,
    });

    const finish = (available: boolean) => {
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve(available);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
};

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

  const reachable = await probeDatabaseEndpoint();
  if (!reachable) {
    databaseAvailabilityCache = { checkedAt: now, available: false };
    return false;
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
