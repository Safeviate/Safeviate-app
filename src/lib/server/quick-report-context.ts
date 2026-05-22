import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
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

async function resolveAuthenticatedQuickReportContext(request: Request): Promise<QuickReportContext | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return null;
  }
  const tenantId = await getTenantIdFromSession(request);
  if (!tenantId) {
    return null;
  }

  const personnel = await prisma.personnel.findFirst({
    where: { tenantId, email },
    select: { id: true, firstName: true, lastName: true },
  });

  return {
    tenantId,
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
  request?: Request | null;
  publicTenantId?: string | null;
}) {
  if (options.request) {
    const authenticatedContext = await resolveAuthenticatedQuickReportContext(options.request);
    if (authenticatedContext) {
      return authenticatedContext;
    }
  }

  return resolvePublicQuickReportContext(options.publicTenantId ?? null);
}
