import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ vehicle: null }, { status: 200 });
    }

    const { id } = await params;
    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM vehicles WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      id,
      tenantId
    );

    return NextResponse.json({ vehicle: rows[0]?.data ?? null }, { status: 200 });
  } catch (error) {
    console.error('[vehicles/[id]] fallback to null:', error);
    return NextResponse.json({ vehicle: null }, { status: 200 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const incoming = body?.vehicle;

  if (!incoming || typeof incoming !== 'object') {
    return NextResponse.json({ error: 'Missing vehicle payload.' }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(
    `UPDATE vehicles SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
    id,
    JSON.stringify({ ...incoming, id }),
    tenantId
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await prisma.$executeRawUnsafe(`DELETE FROM vehicles WHERE id = $1 AND tenant_id = $2`, id, tenantId);

  return NextResponse.json({ ok: true }, { status: 200 });
}
