import { prisma } from '@/lib/prisma';

type FeatureSettings = {
  enableTechnicalReports?: unknown;
};

export function isTechnicalReportingEnabled(config: unknown): boolean {
  if (!config || typeof config !== 'object') return true;
  const settings = (config as Record<string, unknown>)['feature-settings'];
  if (!settings || typeof settings !== 'object') return true;
  return (settings as FeatureSettings).enableTechnicalReports !== false;
}

export async function isTechnicalReportingEnabledForTenant(tenantId: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    'SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1',
    tenantId,
  );
  return isTechnicalReportingEnabled(rows[0]?.data);
}
