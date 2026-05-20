import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { normalizeUploadUrl } from '@/lib/server/azure-blob';
import { ensureAircraftSchema } from '@/lib/server/bootstrap-db';
import { getOrSetRouteCache, invalidateRouteCache } from '@/lib/server/route-cache';
import { recordSimulationRouteMetric } from '@/lib/server/simulation-telemetry';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

const SUPER_USERS = ['deanebolton@gmail.com', 'barry@safeviate.com'];

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request, { allowDevelopmentFallback: true });
}

function normalizeAircraftDocumentUrls(aircraft: unknown) {
  if (!aircraft || typeof aircraft !== 'object') return aircraft;

  const record = aircraft as Record<string, unknown>;
  const documents = Array.isArray(record.documents)
    ? record.documents.map((document) => {
        if (!document || typeof document !== 'object') return document;
        const docRecord = document as Record<string, unknown>;
        return {
          ...docRecord,
          url: typeof docRecord.url === 'string' ? normalizeUploadUrl(docRecord.url) : docRecord.url,
        };
      })
    : record.documents;

  return { ...record, documents };
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    await ensureAircraftSchema();
    tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ aircraft: [] }, { status: 200 });
    const resolvedTenantId = tenantId;

    const aircraft = await getOrSetRouteCache(
      `aircraft:${resolvedTenantId}`,
      60_000,
      () => prisma.aircraftRecord.findMany({
        where: { tenantId: resolvedTenantId },
        orderBy: { createdAt: 'asc' },
      })
    );

    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'aircraft.GET',
      reads: 1,
      writes: 0,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ aircraft: aircraft.map((row) => normalizeAircraftDocumentUrls(row.data)) }, { status: 200 });
  } catch (error) {
    console.error('[aircraft] fallback to empty list:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'aircraft.GET',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ aircraft: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    await ensureAircraftSchema();
    tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const incoming = body?.aircraft ?? {};
    const id = incoming.id || randomUUID();
    const data = {
      ...incoming,
      id,
      organizationId: incoming.organizationId || tenantId,
      components: Array.isArray(incoming.components) ? incoming.components : [],
      documents: Array.isArray(incoming.documents)
        ? incoming.documents.map((document: unknown) => {
            if (!document || typeof document !== 'object') return document;
            const docRecord = document as Record<string, unknown>;
            return {
              ...docRecord,
              url: typeof docRecord.url === 'string' ? normalizeUploadUrl(docRecord.url) : docRecord.url,
            };
          })
        : [],
    };

    await prisma.aircraftRecord.upsert({
      where: { id },
      update: {
        tenantId,
        data,
        updatedAt: new Date(),
      },
      create: {
        id,
        tenantId,
        data,
      },
    });

    invalidateRouteCache(`aircraft:${tenantId}`);
    invalidateRouteCache(`dashboard-summary:${tenantId}`);
    invalidateRouteCache(`schedule-data:${tenantId}`);

    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'aircraft.POST',
      reads: 0,
      writes: 1,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ aircraft: data }, { status: 200 });
  } catch (error) {
    console.error('[aircraft] failed to save aircraft:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'aircraft.POST',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ error: 'Failed to save aircraft.' }, { status: 500 });
  }
}
