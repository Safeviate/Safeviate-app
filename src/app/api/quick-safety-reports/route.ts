import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureQuickSafetyReportsSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getSessionContext() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;

  await prisma.tenant.upsert({
    where: { id: 'safeviate' },
    update: { updatedAt: new Date() },
    create: { id: 'safeviate', name: 'Safeviate' },
  });

  const currentUser = await prisma.user.findUnique({
    where: { email },
    select: { tenantId: true },
  });

  const personnel = await prisma.personnel.findFirst({
    where: { email },
    select: { id: true, firstName: true, lastName: true },
  });

  return {
    tenantId: currentUser?.tenantId || 'safeviate',
    email,
    userId: personnel?.id || null,
    userName: personnel ? `${personnel.firstName} ${personnel.lastName}`.trim() : email,
  };
}

export async function GET() {
  try {
    const context = await getSessionContext();
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
    const context = await getSessionContext();
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureQuickSafetyReportsSchema();
    const body = await request.json().catch(() => null);
    const incoming = body?.report ?? {};
    const id = incoming.id || randomUUID();

    const data = {
      ...incoming,
      id,
      submittedByEmail: incoming.submittedByEmail || context.email,
      submittedById: incoming.submittedById || context.userId,
      submittedByName: incoming.submittedByName || context.userName,
      submittedAt: incoming.submittedAt || new Date().toISOString(),
      status: incoming.status || 'Open',
      workflowStatus: incoming.workflowStatus || 'Preliminary',
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
    const context = await getSessionContext();
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureQuickSafetyReportsSchema();
    const body = await request.json().catch(() => null);
    const incoming = body?.report ?? {};
    const id = incoming.id;
    if (!id) return NextResponse.json({ error: 'Missing report id.' }, { status: 400 });

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM quick_safety_reports WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      id,
      context.tenantId,
    );
    const existing = (rows[0]?.data as Record<string, unknown> | undefined) || {};
    const data = {
      ...existing,
      ...incoming,
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
