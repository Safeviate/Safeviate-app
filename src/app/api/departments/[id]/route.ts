import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { invalidatePersonnelDirectoryCaches } from '@/lib/server/route-cache';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await prisma.department.deleteMany({
    where: { id, tenantId },
  });

  invalidatePersonnelDirectoryCaches(tenantId);

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const name = String(body.name || '').trim();

  if (!name) {
    return NextResponse.json({ error: 'Department name is required.' }, { status: 400 });
  }

  const department = await prisma.department.updateMany({
    where: { id, tenantId },
    data: {
      name,
      updatedAt: new Date(),
    },
  });

  invalidatePersonnelDirectoryCaches(tenantId);

  return NextResponse.json({ ok: true, department }, { status: 200 });
}
