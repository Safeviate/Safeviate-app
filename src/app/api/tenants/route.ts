import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { invalidateTenantScopedCaches } from '@/lib/server/route-cache';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { isMasterTenantEmail } from '@/lib/server/tenant-access';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

const MASTER_TENANT_ID = 'safeviate';
const MASTER_TENANT_NAME = 'Safeviate';
const FALLBACK_TENANTS = [{ id: MASTER_TENANT_ID, name: MASTER_TENANT_NAME }];

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

async function canManageTenants() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  const role = session?.user?.role?.trim().toLowerCase() || '';
  if (!email) return false;
  return role === 'dev' || role === 'developer' || isMasterTenantEmail(email);
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ tenants: process.env.NODE_ENV === 'development' ? FALLBACK_TENANTS : [] }, { status: 200 });
    }

    if (!(await canManageTenants())) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true },
      }).catch(() => null);
      return NextResponse.json({ tenants: tenant ? [tenant] : (process.env.NODE_ENV === 'development' ? FALLBACK_TENANTS : []) }, { status: 200 });
    }

    const tenants = await prisma.tenant.findMany({ orderBy: { name: 'asc' } }).catch(() => []);
    return NextResponse.json({ tenants: tenants.length > 0 ? tenants : (process.env.NODE_ENV === 'development' ? FALLBACK_TENANTS : []) }, { status: 200 });
  } catch (error) {
    console.error('[tenants] fallback to empty list:', error);
    return NextResponse.json({ tenants: process.env.NODE_ENV === 'development' ? FALLBACK_TENANTS : [] }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const tenant = body?.tenant;
  const isNewTenant = body?.isNewTenant === true;
  if (!tenant || !tenant.id || !tenant.name) {
    return NextResponse.json({ error: 'Invalid tenant payload.' }, { status: 400 });
  }

  const normalizedTenantId = String(tenant.id).trim().toLowerCase();
  const normalizedTenantName =
    normalizedTenantId === MASTER_TENANT_ID ? MASTER_TENANT_NAME : String(tenant.name).trim();

  if (!normalizedTenantId || !normalizedTenantName) {
    return NextResponse.json({ error: 'Invalid tenant payload.' }, { status: 400 });
  }

  if (isNewTenant) {
    const existingTenant = await prisma.tenant.findUnique({
      where: { id: normalizedTenantId },
      select: { id: true },
    });

    if (existingTenant) {
      return NextResponse.json({ error: 'Tenant already exists.' }, { status: 409 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.upsert({
      where: { id: normalizedTenantId },
      update: {
        name: normalizedTenantName,
        updatedAt: new Date(),
      },
      create: {
        id: normalizedTenantId,
        name: normalizedTenantName,
      },
    });

    await tx.tenantConfig.upsert({
      where: { tenantId: normalizedTenantId },
      create: {
        tenantId: normalizedTenantId,
        data: {
          id: normalizedTenantId,
          name: normalizedTenantName,
        },
      },
      update: {
        data: {
          id: normalizedTenantId,
          name: normalizedTenantName,
        },
        updatedAt: new Date(),
      },
    });
  });

  invalidateTenantScopedCaches(normalizedTenantId);

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: Request) {
  if (!(await canManageTenants())) {
    return NextResponse.json({ error: 'Unauthorized to delete tenants.' }, { status: 403 });
  }

  const tenantId = new URL(request.url).searchParams.get('tenantId')?.trim() || '';
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant id is required.' }, { status: 400 });
  }

  if (tenantId === 'safeviate') {
    return NextResponse.json({ error: 'The Safeviate baseline tenant cannot be deleted.' }, { status: 400 });
  }

  const existingTenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });

  if (!existingTenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.delete({
      where: { id: tenantId },
    });
  });

  invalidateTenantScopedCaches(tenantId);

  return NextResponse.json({ ok: true, deletedTenantId: tenantId }, { status: 200 });
}
