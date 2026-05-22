import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import type { SafetyReport } from '@/types/safety-report';

function toStableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function PUT(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await getServerSession(authOptions);
  const actorId = session?.user?.id?.trim() || null;

  const { reportId } = await context.params;
  const body = await request.json();
  const data = body?.report;

  if (!reportId || !data) {
    return NextResponse.json({ error: 'Missing report data.' }, { status: 400 });
  }

  const rows = await prisma.$queryRawUnsafe<{ data: unknown; tenant_id: string }[]>(
    `SELECT data, tenant_id FROM safety_reports WHERE id = $1 LIMIT 1`,
    reportId
  );
  const row = rows[0];
  if (!row || row.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  }

  const existingReport = row.data as SafetyReport;
  const incomingReport = data as SafetyReport;
  const existingSignatures = Array.isArray(existingReport?.signatures) ? existingReport.signatures : [];
  const incomingSignatures = Array.isArray(incomingReport?.signatures) ? incomingReport.signatures : [];
  const signaturesChanged = toStableJson(existingSignatures) !== toStableJson(incomingSignatures);

  if (signaturesChanged) {
    if (!actorId) {
      return NextResponse.json({ error: 'You must be signed in to sign this report.' }, { status: 401 });
    }

    if (incomingSignatures.length !== existingSignatures.length + 1) {
      return NextResponse.json({ error: 'Safety report signatures can only be added by the active signed-in user.' }, { status: 403 });
    }

    const appendedSignature = incomingSignatures[incomingSignatures.length - 1];
    if (!appendedSignature || appendedSignature.userId !== actorId) {
      return NextResponse.json({ error: 'Safety report signatures must belong to the current signed-in user.' }, { status: 403 });
    }
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
