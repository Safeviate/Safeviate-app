import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureRisksSchema } from '@/lib/server/bootstrap-db';
import { recordSimulationRouteMetric } from '@/lib/server/simulation-telemetry';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ risks: [] }, { status: 200 });
    await ensureRisksSchema();
    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(`SELECT data FROM risks WHERE tenant_id = $1 ORDER BY created_at ASC`, tenantId);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'risk-register.GET',
      reads: 1,
      writes: 0,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ risks: rows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[risk-register] fallback to empty list:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'risk-register.GET',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ risks: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureRisksSchema();
  const body = await request.json();
  const incoming = body?.risk ?? {};
  const id = incoming.id || randomUUID();
  const data = { ...incoming, id };
  await prisma.$executeRawUnsafe(
    `INSERT INTO risks (id, tenant_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    id, tenantId, JSON.stringify(data)
  );
  await recordSimulationRouteMetric({
    tenantId,
    routeKey: 'risk-register.POST',
    reads: 0,
    writes: 1,
    durationMs: Date.now() - startedAt,
  });
  return NextResponse.json({ risk: data }, { status: 200 });
}
