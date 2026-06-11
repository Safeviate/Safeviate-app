import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureSafetyReportsSchema } from '@/lib/server/bootstrap-db';
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
    if (!tenantId) return NextResponse.json({ reports: [] }, { status: 200 });
    await ensureSafetyReportsSchema();

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM safety_reports WHERE tenant_id = $1 ORDER BY created_at ASC`,
      tenantId
    );

    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'safety-reports.GET',
      reads: 1,
      writes: 0,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        reports: rows.map((row) => ({
          ...(row.data as Record<string, unknown>),
          tenantId,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[safety-reports] fallback to empty list:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'safety-reports.GET',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ reports: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureSafetyReportsSchema();

    const body = await request.json();
    const incoming = body?.report ?? {};
    const id = incoming.id || randomUUID();

    const data = { ...incoming, id };

    await prisma.$executeRawUnsafe(
      `INSERT INTO safety_reports (id, tenant_id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      tenantId,
      JSON.stringify(data)
    );

    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'safety-reports.POST',
      reads: 0,
      writes: 1,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ report: { ...data, tenantId } }, { status: 201 });
  } catch (error) {
    console.error('[safety-reports] write failed:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'safety-reports.POST',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ error: 'Failed to submit report.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureSafetyReportsSchema();

    const body = await request.json();
    const reportId = body?.reportId;
    if (!reportId) return NextResponse.json({ error: 'Missing report id.' }, { status: 400 });

    await prisma.$executeRawUnsafe(`DELETE FROM safety_reports WHERE id = $1 AND tenant_id = $2`, reportId, tenantId);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'safety-reports.DELETE',
      reads: 0,
      writes: 1,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[safety-reports] delete failed:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'safety-reports.DELETE',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ error: 'Failed to delete report.' }, { status: 500 });
  }
}
