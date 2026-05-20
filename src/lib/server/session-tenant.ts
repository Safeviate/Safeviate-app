import { authOptions } from '@/auth';
import { MASTER_TENANT_ID, isMasterTenantEmail, resolveTenantOverride } from '@/lib/server/tenant-access';
import { getServerSession } from 'next-auth';

export async function getTenantIdFromSession(request: Request, fallbackTenantId = MASTER_TENANT_ID) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return null;
  }

  const baseTenantId = session?.user?.tenantId?.trim() || fallbackTenantId;

  if (isMasterTenantEmail(email)) {
    return resolveTenantOverride(request, email, baseTenantId);
  }

  return baseTenantId;
}

export async function getTenantIdForRoute(
  request: Request,
  options?: {
    allowDevelopmentFallback?: boolean;
    fallbackTenantId?: string;
  }
) {
  const fallbackTenantId = options?.fallbackTenantId || MASTER_TENANT_ID;
  const tenantId = await getTenantIdFromSession(request, fallbackTenantId);

  if (tenantId) {
    return tenantId;
  }

  if (options?.allowDevelopmentFallback && process.env.NODE_ENV === 'development') {
    return fallbackTenantId;
  }

  return null;
}
