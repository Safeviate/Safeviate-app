import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { recordSimulationRouteMetric } from '@/lib/server/simulation-telemetry';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

const REPORTS_KEY = 'student-progress-reports';
const MILESTONES_KEY = 'student-milestones';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

async function readConfig(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
    tenantId
  );

  return (rows[0]?.data as Record<string, unknown> | null) || {};
}

async function writeConfig(tenantId: string, config: Record<string, unknown>) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(config)
  );
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ reports: [], milestones: null }, { status: 200 });
    }

    const config = await readConfig(tenantId);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'student-training.GET',
      reads: 1,
      writes: 0,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        reports: Array.isArray(config[REPORTS_KEY]) ? config[REPORTS_KEY] : [],
        milestones: config[MILESTONES_KEY] ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[student-training] fallback to empty payload:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'student-training.GET',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ reports: [], milestones: null }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  const startedAt = Date.now();
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const config = (await readConfig(tenantId)) as Record<string, unknown>;

  if (body?.report && typeof body.report === 'object') {
    const currentReports = Array.isArray(config[REPORTS_KEY]) ? config[REPORTS_KEY] : [];
    config[REPORTS_KEY] = [body.report, ...currentReports];
  }

  if (Array.isArray(body?.reports)) {
    config[REPORTS_KEY] = body.reports;
  }

  if (body?.milestones) {
    config[MILESTONES_KEY] = body.milestones;
  }

  await writeConfig(tenantId, config);
  await recordSimulationRouteMetric({
    tenantId,
    routeKey: 'student-training.PUT',
    reads: 1,
    writes: 1,
    durationMs: Date.now() - startedAt,
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}
