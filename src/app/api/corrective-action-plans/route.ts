import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { recordSimulationRouteMetric } from '@/lib/server/simulation-telemetry';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

async function getAllCaps(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM corrective_action_plans WHERE tenant_id = $1 ORDER BY created_at DESC`,
    tenantId
  );
  return rows.map((row) => row.data);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ caps: [] }, { status: 200 });
    const caps = await getAllCaps(tenantId);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'corrective-action-plans.GET',
      reads: 1,
      writes: 0,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ caps }, { status: 200 });
  } catch (error) {
    console.error('[corrective-action-plans] fallback to empty list:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'corrective-action-plans.GET',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ caps: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const cap = body?.cap;
  if (!cap || typeof cap !== 'object') return NextResponse.json({ error: 'Invalid CAP payload' }, { status: 400 });
  const id = cap.id || randomUUID();
  const data = { ...cap, id };
  await prisma.$executeRawUnsafe(
    `INSERT INTO corrective_action_plans (id, tenant_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    id,
    tenantId,
    JSON.stringify(data)
  );
  await recordSimulationRouteMetric({
    tenantId,
    routeKey: 'corrective-action-plans.POST',
    reads: 0,
    writes: 1,
    durationMs: Date.now() - startedAt,
  });
  return NextResponse.json({ cap: data }, { status: 200 });
}

