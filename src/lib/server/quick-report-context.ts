import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

type QuickReportContext = {
  tenantId: string;
  email: string | null;
  userId: string | null;
  userName: string;
};

const normalizeTenantId = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

async function resolveAuthenticatedQuickReportContext(): Promise<QuickReportContext | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return null;
  }

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

async function resolvePublicQuickReportContext(tenantId: string | null): Promise<QuickReportContext | null> {
  const normalizedTenantId = normalizeTenantId(tenantId);
  if (!normalizedTenantId) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: normalizedTenantId },
    select: { id: true },
  });

  if (!tenant) return null;

  return {
    tenantId: tenant.id,
    email: null,
    userId: null,
    userName: 'External Reporter',
  };
}

export async function resolveQuickReportContext(options: {
  publicTenantId?: string | null;
}) {
  const authenticatedContext = await resolveAuthenticatedQuickReportContext();
  if (authenticatedContext) {
    return authenticatedContext;
  }

  return resolvePublicQuickReportContext(options.publicTenantId ?? null);
}
