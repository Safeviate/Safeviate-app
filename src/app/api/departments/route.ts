import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { invalidatePersonnelDirectoryCaches } from '@/lib/server/route-cache';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ departments: [] }, { status: 200 });
    }

    const departments = await prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ departments }, { status: 200 });
  } catch (error) {
    console.error('[departments] fallback to empty list:', error);
    return NextResponse.json({ departments: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const id = body.id || crypto.randomUUID();
  const name = String(body.name || '').trim();

  if (!name) {
    return NextResponse.json({ error: 'Department name is required.' }, { status: 400 });
  }

  const department = await prisma.department.upsert({
    where: { id },
    update: {
      tenantId,
      name,
      updatedAt: new Date(),
    },
    create: {
      id,
      tenantId,
      name,
    },
  });

  invalidatePersonnelDirectoryCaches(tenantId);

  return NextResponse.json({ department }, { status: 200 });
}
