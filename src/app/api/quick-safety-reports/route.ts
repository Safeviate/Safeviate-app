import { prisma } from '@/lib/prisma';
import { ensureQuickSafetyReportsSchema } from '@/lib/server/bootstrap-db';
import { resolveQuickReportContext } from '@/lib/server/quick-report-context';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

export async function GET(request: Request) {
  try {
    const context = await resolveQuickReportContext({ request, publicTenantId: null });
    if (!context) return NextResponse.json({ reports: [] }, { status: 200 });

    await ensureQuickSafetyReportsSchema();
    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM quick_safety_reports WHERE tenant_id = $1 ORDER BY created_at DESC`,
      context.tenantId,
    );

    return NextResponse.json({ reports: rows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[quick-safety-reports] read failed:', error);
    return NextResponse.json({ reports: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const incoming = body?.report ?? {};
    const context = await resolveQuickReportContext({
      request,
      publicTenantId: typeof incoming?.tenantId === 'string' ? incoming.tenantId : null,
    });
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureQuickSafetyReportsSchema();
    const { tenantId: _tenantId, submitAnonymous: _submitAnonymous, ...reportInput } = incoming as Record<string, unknown>;
    const id = (reportInput.id as string | undefined) || randomUUID();
    const isAnonymous = Boolean(incoming?.submitAnonymous);

    const data = {
      ...reportInput,
      id,
      submittedByEmail: isAnonymous ? null : (reportInput.submittedByEmail as string | null | undefined) || context.email,
      submittedById: isAnonymous ? null : (reportInput.submittedById as string | null | undefined) || context.userId,
      submittedByName: isAnonymous ? 'Anonymous Reporter' : (reportInput.submittedByName as string | undefined) || context.userName,
      submittedAt: (reportInput.submittedAt as string | undefined) || new Date().toISOString(),
      status: (reportInput.status as string | undefined) || 'Open',
      workflowStatus: (reportInput.workflowStatus as string | undefined) || 'Preliminary',
    };

    await prisma.$executeRawUnsafe(
      `INSERT INTO quick_safety_reports (id, tenant_id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      context.tenantId,
      JSON.stringify(data),
    );

    return NextResponse.json({ report: data }, { status: 201 });
  } catch (error) {
    console.error('[quick-safety-reports] write failed:', error);
    return NextResponse.json({ error: 'Failed to submit quick safety report.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const incoming = body?.report ?? {};
    const context = await resolveQuickReportContext({
      request,
      publicTenantId: typeof incoming?.tenantId === 'string' ? incoming.tenantId : null,
    });
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureQuickSafetyReportsSchema();
    const { tenantId: _tenantId, submitAnonymous: _submitAnonymous, ...reportInput } = incoming as Record<string, unknown>;
    const id = reportInput.id as string | undefined;
    if (!id) return NextResponse.json({ error: 'Missing report id.' }, { status: 400 });

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM quick_safety_reports WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
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
      `UPDATE quick_safety_reports SET data = $3::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      id,
      context.tenantId,
      JSON.stringify(data),
    );

    return NextResponse.json({ report: data }, { status: 200 });
  } catch (error) {
    console.error('[quick-safety-reports] update failed:', error);
    return NextResponse.json({ error: 'Failed to update quick safety report.' }, { status: 500 });
  }
}
