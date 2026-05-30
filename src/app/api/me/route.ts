import { authOptions } from '@/auth';
import { isDatabaseAvailable, prisma } from '@/lib/prisma';
import { resolveTenantOverride, isMasterTenantEmail, MASTER_TENANT_ID } from '@/lib/server/tenant-access';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

const buildSuperUserProfile = (
  sessionUser: { id?: string | null; email?: string | null; name?: string | null },
  tenantId: string
) => ({
  id: sessionUser.id || sessionUser.email || 'safeviate-super-user',
  tenantId,
  email: sessionUser.email?.trim().toLowerCase() || '',
  firstName: sessionUser.name?.split(' ')[0] ?? 'User',
  lastName: sessionUser.name?.split(' ').slice(1).join(' ') || '',
  role: 'developer',
  permissions: ['*'],
  accessOverrides: {},
});

const buildTenantScopedMasterProfile = (
  sessionUser: { id?: string | null; email?: string | null; name?: string | null },
  tenantId: string,
  personnelProfile?: {
    role?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    permissions?: unknown;
    accessOverrides?: unknown;
  } | null
) => ({
  id: sessionUser.id || sessionUser.email || 'safeviate-super-user',
  tenantId,
  email: sessionUser.email?.trim().toLowerCase() || '',
  firstName: personnelProfile?.firstName?.trim() || sessionUser.name?.split(' ')[0] || 'User',
  lastName: personnelProfile?.lastName?.trim() || sessionUser.name?.split(' ').slice(1).join(' ') || '',
  // Master/developer users keep super-user capability while viewing another tenant.
  // Tenant menus/layout still control visible pages, but switching should not silently
  // downgrade the operator into an observer role and hide permission-gated screens.
  role: 'developer',
  permissions: ['*'],
  accessOverrides:
    personnelProfile?.accessOverrides && typeof personnelProfile.accessOverrides === 'object'
      ? personnelProfile.accessOverrides
      : {},
});

const buildFallbackUserIdCandidates = (email: string, authUserId?: string | null) => {
  const normalizedEmailSlug = email.replace(/[^a-z0-9]+/g, '_');
  const candidates = [
    authUserId?.trim(),
    `user_${normalizedEmailSlug}`,
    `user_${normalizedEmailSlug}_${randomUUID().slice(0, 8)}`,
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
};

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.trim().toLowerCase();
    const authUserId = session?.user?.id?.trim();

    if (!email) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    if (isMasterTenantEmail(email)) {
      const selectedTenantId = await resolveTenantOverride(request, email, MASTER_TENANT_ID);

      if (selectedTenantId !== MASTER_TENANT_ID) {
        const selectedTenant = await prisma.tenant.findUnique({
          where: { id: selectedTenantId },
          select: { id: true, name: true },
        }).catch(() => null);
        const personnelProfile = await prisma.personnel.findFirst({
          where: {
            tenantId: selectedTenantId,
            email,
          },
          select: {
            role: true,
            firstName: true,
            lastName: true,
            permissions: true,
            accessOverrides: true,
          },
        }).catch(() => null);
        const role = personnelProfile?.role?.trim()
          ? await prisma.role.findFirst({
              where: {
                tenantId: selectedTenantId,
                OR: [
                  { id: personnelProfile.role.trim() },
                  { name: personnelProfile.role.trim() },
                ],
              },
            }).catch(() => null)
          : null;
        const roleData = role as unknown as { permissions?: unknown; accessOverrides?: { hiddenMenus?: unknown } } | null;

        return NextResponse.json(
          {
            profile: buildTenantScopedMasterProfile(
              {
                id: session?.user?.id,
                email,
                name: session?.user?.name,
              },
              selectedTenantId,
              personnelProfile
            ),
            tenant: {
              id: selectedTenantId,
              name: selectedTenant?.name || selectedTenantId,
            },
            rolePermissions: ['*'],
            roleHiddenMenus: Array.isArray(roleData?.accessOverrides?.hiddenMenus)
              ? (roleData.accessOverrides?.hiddenMenus as string[])
              : [],
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          profile: buildSuperUserProfile({
            id: session?.user?.id,
            email,
            name: session?.user?.name,
          }, selectedTenantId),
          tenant: {
            id: selectedTenantId,
            name: selectedTenantId === MASTER_TENANT_ID ? 'Safeviate' : selectedTenantId,
          },
          rolePermissions: ['*'],
        },
        { status: 200 }
      );
    }

    if (!(await isDatabaseAvailable())) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    let profile = email ? await prisma.user.findUnique({ where: { email } }) : null;

    const sessionRole = session?.user?.role?.trim().toLowerCase() || '';
    const canBootstrapMasterProfile = sessionRole === 'dev' || sessionRole === 'developer';

    if (!profile && email && canBootstrapMasterProfile) {
      if (!(await isDatabaseAvailable())) {
        return NextResponse.json({ profile: null }, { status: 200 });
      }

      const firstName = session?.user?.name?.split(' ')[0] ?? 'User';
      const lastName = session?.user?.name?.split(' ').slice(1).join(' ') || '';

      for (const candidateId of buildFallbackUserIdCandidates(email, authUserId)) {
        const existingById = await prisma.user.findUnique({
          where: { id: candidateId },
          select: { email: true },
        });

        if (existingById && existingById.email !== email) {
          continue;
        }

        profile = await prisma.user.upsert({
          where: { email },
          update: {
            tenantId: 'safeviate',
            firstName,
            lastName,
            role: 'developer',
            updatedAt: new Date(),
          },
          create: {
            id: candidateId,
            tenantId: 'safeviate',
            email,
            firstName,
            lastName,
            role: 'developer',
          },
        });
        break;
      }
    }

    if (!profile) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    if (profile.suspendedAt) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    const selectedTenantId = await resolveTenantOverride(request, email, profile.tenantId);
    const tenant = await prisma.tenant.findUnique({ where: { id: selectedTenantId } }).catch(() => null);
    const personnelProfile = await prisma.personnel.findFirst({
      where: {
        tenantId: selectedTenantId,
        email,
      },
      select: {
        permissions: true,
        accessOverrides: true,
      },
    }).catch(() => null);
    const role = await prisma.role.findFirst({
      where: {
        tenantId: selectedTenantId,
        OR: [
          { id: profile.role },
          { name: profile.role },
        ],
      },
    }).catch(() => null);
    const roleData = role as unknown as { permissions?: unknown; accessOverrides?: { hiddenMenus?: unknown } } | null;

    return NextResponse.json(
      {
        profile: {
          ...profile,
          permissions: Array.isArray(personnelProfile?.permissions) ? (personnelProfile.permissions as string[]) : [],
          accessOverrides: personnelProfile?.accessOverrides ?? {},
        },
        tenant: tenant ?? null,
        rolePermissions: Array.isArray(roleData?.permissions) ? (roleData.permissions as string[]) : [],
        roleHiddenMenus: Array.isArray(roleData?.accessOverrides?.hiddenMenus)
          ? (roleData.accessOverrides?.hiddenMenus as string[])
          : [],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[me] fallback to empty profile:', error);
    return NextResponse.json({ profile: null }, { status: 200 });
  }
}
