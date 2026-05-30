import { authOptions } from '@/auth';
import { isDatabaseAvailable, prisma } from '@/lib/prisma';
import { ensurePersonnelSchema, ensureRolesSchema } from '@/lib/server/bootstrap-db';
import { getOrSetRouteCache } from '@/lib/server/route-cache';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ roles: [], departments: [], personnel: [] }, { status: 200 });
    }

    if (!(await isDatabaseAvailable())) {
      return NextResponse.json({ roles: [], departments: [], personnel: [] }, { status: 200 });
    }

    const tenantId = await getTenantIdForRoute(request);
    if (!tenantId) {
      return NextResponse.json({ roles: [], departments: [], personnel: [] }, { status: 200 });
    }

    await Promise.all([ensurePersonnelSchema(), ensureRolesSchema()]);
    const [roleRows, departmentRows, personnelRows] = await Promise.all([
      getOrSetRouteCache(`personnel:roles:${tenantId}`, 60_000, () => prisma.role.findMany({ where: { tenantId } })),
      getOrSetRouteCache(`personnel:departments:${tenantId}`, 60_000, () => prisma.department.findMany({ where: { tenantId } })),
      getOrSetRouteCache(`personnel:list:${tenantId}`, 60_000, () => prisma.personnel.findMany({ where: { tenantId } })),
    ]);

    return NextResponse.json(
      {
        roles: roleRows,
        departments: departmentRows,
        personnel: personnelRows,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[personnel] fallback to empty payload:', error);
    return NextResponse.json({ roles: [], departments: [], personnel: [] }, { status: 200 });
  }
}
