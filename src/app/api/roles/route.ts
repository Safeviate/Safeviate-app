import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureRolesSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { invalidatePersonnelDirectoryCaches } from '@/lib/server/route-cache';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    await ensureRolesSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ roles: [] }, { status: 200 });
    }

    const roles = await prisma.role.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    const rolesWithOverrides = roles.map((role) => ({
      ...role,
      accessOverrides: Array.isArray(((role as unknown as { accessOverrides?: { hiddenMenus?: unknown } | null }).accessOverrides)?.hiddenMenus)
        ? {
            hiddenMenus: ((role as unknown as { accessOverrides?: { hiddenMenus?: string[] } | null }).accessOverrides?.hiddenMenus || []),
          }
        : { hiddenMenus: [] as string[] },
    }));

    return NextResponse.json({ roles: rolesWithOverrides }, { status: 200 });
  } catch (error) {
    console.error('[roles] fallback to empty list:', error);
    return NextResponse.json({ roles: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  await ensureRolesSchema();
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid role payload.' }, { status: 400 });
  }
  const id = body.id || crypto.randomUUID();
  const name = String(body.name || '').trim();
  const permissions = Array.isArray(body.permissions) ? body.permissions.filter((permission: unknown) => typeof permission === 'string') : [];
  const requiredDocuments = Array.isArray(body.requiredDocuments) ? body.requiredDocuments.filter((document: unknown) => typeof document === 'string') : [];

  if (!name) {
    return NextResponse.json({ error: 'Role name is required.' }, { status: 400 });
  }

  const role = await prisma.role.upsert({
    where: { id },
    update: {
      tenantId,
      name,
      permissions,
      requiredDocuments,
      updatedAt: new Date(),
    },
    create: {
      id,
      tenantId,
      name,
      permissions,
      requiredDocuments,
    },
  });

  await prisma.$executeRawUnsafe(
    `UPDATE roles
     SET access_overrides = $4::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    id,
    tenantId,
    name,
    JSON.stringify({ hiddenMenus: Array.isArray(body.accessOverrides?.hiddenMenus) ? body.accessOverrides.hiddenMenus.filter((value: unknown) => typeof value === 'string') : [] }),
  ).catch(() => null);

  invalidatePersonnelDirectoryCaches(tenantId);

  return NextResponse.json({ role: { ...role, accessOverrides: { hiddenMenus: Array.isArray(body.accessOverrides?.hiddenMenus) ? body.accessOverrides.hiddenMenus.filter((value: unknown) => typeof value === 'string') : [] } } }, { status: 200 });
}
