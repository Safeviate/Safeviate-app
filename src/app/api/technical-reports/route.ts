import { prisma } from '@/lib/prisma';
import { ensureTechnicalReportsSchema } from '@/lib/server/bootstrap-db';
import { invalidateTenantScopedCaches } from '@/lib/server/route-cache';
import { resolveQuickReportContext } from '@/lib/server/quick-report-context';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const incoming = body?.report ?? {};
    const context = await resolveQuickReportContext({
      publicTenantId: typeof incoming?.tenantId === 'string' ? incoming.tenantId : null,
    });
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureTechnicalReportsSchema();
    const { tenantId: _tenantId, ...reportInput } = incoming as Record<string, unknown>;
    const id = (reportInput.id as string | undefined) || randomUUID();

    const data = {
      ...reportInput,
      id,
      submittedByEmail: (reportInput.submittedByEmail as string | null | undefined) || context.email,
      submittedById: (reportInput.submittedById as string | null | undefined) || context.userId,
      submittedByName: (reportInput.submittedByName as string | undefined) || context.userName,
      submittedAt: (reportInput.submittedAt as string | undefined) || new Date().toISOString(),
      status: (reportInput.status as string | undefined) || 'Open',
      workflowStatus: (reportInput.workflowStatus as string | undefined) || 'Preliminary',
    };

    await prisma.$executeRawUnsafe(
      `INSERT INTO technical_reports (id, tenant_id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      context.tenantId,
      JSON.stringify(data),
    );
    invalidateTenantScopedCaches(context.tenantId);

    return NextResponse.json({ report: data }, { status: 201 });
  } catch (error) {
    console.error('[technical-reports] write failed:', error);
    return NextResponse.json({ error: 'Failed to submit technical report.' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const context = await resolveQuickReportContext({ publicTenantId: null });
    if (!context) return NextResponse.json({ reports: [] }, { status: 200 });

    await ensureTechnicalReportsSchema();

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM technical_reports WHERE tenant_id = $1 ORDER BY created_at DESC`,
      context.tenantId,
    );

    return NextResponse.json({ reports: rows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[technical-reports] read failed:', error);
    return NextResponse.json({ reports: [] }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const incoming = body?.report ?? {};
    const context = await resolveQuickReportContext({
      publicTenantId: typeof incoming?.tenantId === 'string' ? incoming.tenantId : null,
    });
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureTechnicalReportsSchema();

    const { tenantId: _tenantId, ...reportInput } = incoming as Record<string, unknown>;
    const id = reportInput.id as string | undefined;
    if (!id) return NextResponse.json({ error: 'Missing report id.' }, { status: 400 });

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM technical_reports WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      id,
      context.tenantId,
    );
    const existing = (rows[0]?.data as Record<string, unknown> | undefined) || {};
    const data = {
      ...existing,
      ...reportInput,
      id,
    };

    await prisma.$executeRawUnsafe(
      `UPDATE technical_reports SET data = $3::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      id,
      context.tenantId,
      JSON.stringify(data),
    );
    invalidateTenantScopedCaches(context.tenantId);

    return NextResponse.json({ report: data }, { status: 200 });
  } catch (error) {
    console.error('[technical-reports] update failed:', error);
    return NextResponse.json({ error: 'Failed to update technical report.' }, { status: 500 });
  }
}
