import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function PUT(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { reportId } = await context.params;
  const body = await request.json();
  const data = body?.report;

  if (!reportId || !data) {
    return NextResponse.json({ error: 'Missing report data.' }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(
    `UPDATE safety_reports SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
    reportId,
    JSON.stringify(data),
    tenantId
  );

  return NextResponse.json({ report: data }, { status: 200 });
}

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ report: null }, { status: 200 });

    const { reportId } = await context.params;
    if (!reportId) return NextResponse.json({ report: null }, { status: 400 });

    const rows = await prisma.$queryRawUnsafe<{ data: unknown; tenant_id: string }[]>(
      `SELECT data, tenant_id FROM safety_reports WHERE id = $1 LIMIT 1`,
      reportId
    );
    const row = rows[0];

    if (!row || row.tenant_id !== tenantId) {
      return NextResponse.json({ report: null }, { status: 404 });
    }

    return NextResponse.json({ report: row.data }, { status: 200 });
  } catch (error) {
    console.error('[safety-reports/[reportId]] fallback to null:', error);
    return NextResponse.json({ report: null }, { status: 200 });
  }
}
