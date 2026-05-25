export const TENANT_THEME_LOCAL_OVERRIDE_KEY = 'safeviate:tenant-config-local-override';

export const getTenantThemeLocalOverrideKey = (tenantId?: string | null) => {
  const resolvedTenantId = tenantId?.trim();
  return resolvedTenantId
    ? `${TENANT_THEME_LOCAL_OVERRIDE_KEY}:${resolvedTenantId}`
    : TENANT_THEME_LOCAL_OVERRIDE_KEY;
};
