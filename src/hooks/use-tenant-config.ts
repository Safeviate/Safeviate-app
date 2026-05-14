'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUserProfile } from './use-user-profile';
import type { Tenant, IndustryType } from '@/types/quality';
import { getOrSetClientApiCache, invalidateClientApiCache } from '@/lib/client/api-cache';

const INDUSTRY_OVERRIDE_KEY = 'safeviate:industry-override';
const LOCAL_TENANT_CONFIG_KEY = 'safeviate:tenant-config-local-override';
const FALLBACK_TENANT_ID = 'safeviate';
const FALLBACK_TENANT_NAME = 'Safeviate';
const TENANT_CONFIG_CACHE_TTL_MS = 5 * 60_000;

declare global {
  interface Window {
    __SAFEVIATE_THEME_BOOTSTRAP__?: {
      theme?: Record<string, unknown> | null;
      tenant?: Record<string, unknown> | null;
    };
  }
}

const safeJsonParse = <T,>(text: string): T | null => {
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const mergeTenantConfig = (
  serverConfig: Record<string, unknown> | null,
  localConfig: Record<string, unknown> | null
) => {
  if (!serverConfig && !localConfig) return null;
  if (!serverConfig) return localConfig;
  if (!localConfig) return serverConfig;

  const serverTheme =
    serverConfig.theme && typeof serverConfig.theme === 'object'
      ? (serverConfig.theme as Record<string, unknown>)
      : null;
  const localTheme =
    localConfig.theme && typeof localConfig.theme === 'object'
      ? (localConfig.theme as Record<string, unknown>)
      : null;

  return {
    ...localConfig,
    ...serverConfig,
    theme: serverTheme || localTheme
      ? {
          ...(localTheme || {}),
          ...(serverTheme || {}),
          sidebarLogoImage:
            typeof localTheme?.sidebarLogoImage === 'string' && localTheme.sidebarLogoImage.trim()
              ? localTheme.sidebarLogoImage
              : (typeof serverTheme?.sidebarLogoImage === 'string' ? serverTheme.sidebarLogoImage : ''),
        }
      : undefined,
  };
};

const stripIndustryFromConfig = (config: Record<string, unknown> | null) => {
  if (!config) return null;
  const { industry: _industry, ...rest } = config;
  return rest;
};

const normalizeIndustry = (value: unknown): IndustryType | null => {
  return value === 'Aviation: Flight Training (ATO)' ||
    value === 'Aviation: Charter / Ops (AOC)' ||
    value === 'Aviation: Maintenance (AMO)' ||
    value === 'General: Occupational Health & Safety (OHS)'
    ? value
    : null;
};

const DEFAULT_SAFEVIATE_INDUSTRY: IndustryType = 'Aviation: Flight Training (ATO)';

const normalizeTenantSummary = (
  tenant: {
    id?: string | null;
    name?: string | null;
    [key: string]: unknown;
  } | null | undefined,
  fallback?: Tenant | null
): Tenant | null => {
  if (!tenant?.id) return null;

  return {
    ...(fallback || {}),
    ...tenant,
    id: tenant.id,
    name: tenant.name || fallback?.name || FALLBACK_TENANT_NAME,
  } as Tenant;
};

/**
 * A custom hook to fetch the configuration for the current tenant.
 * Supports a developer override for testing industry-specific layouts.
 */
export const useTenantConfig = () => {
  const bootstrapTenant = typeof window !== 'undefined'
    ? (window.__SAFEVIATE_THEME_BOOTSTRAP__?.tenant as Tenant | null | undefined) ?? null
    : null;
  const readInitialIndustryOverride = () => {
    if (typeof window === 'undefined') return null;
    try {
      return normalizeIndustry(window.localStorage.getItem(INDUSTRY_OVERRIDE_KEY));
    } catch {
      return DEFAULT_SAFEVIATE_INDUSTRY;
    }
  };
  const readInitialLocalOverride = () => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = window.localStorage.getItem(LOCAL_TENANT_CONFIG_KEY);
      return stored ? safeJsonParse<Record<string, unknown>>(stored) : null;
    } catch {
      return null;
    }
  };
  const { tenantId, tenant: profileTenant, userProfile, isLoading: isProfileLoading } = useUserProfile();
  const [tenantData, setTenantData] = useState<Tenant | null>(bootstrapTenant);
  const [isLoading, setIsLoading] = useState(!bootstrapTenant);
  const [error, setError] = useState<Error | null>(null);
  const [industryOverride, setIndustryOverride] = useState<IndustryType | null>(readInitialIndustryOverride);
  const [localOverride, setLocalOverride] = useState<Record<string, unknown> | null>(readInitialLocalOverride);
  const resolvedTenantId = tenantId || FALLBACK_TENANT_ID;

  const buildLocalTenant = (override: Record<string, unknown> | null): Tenant => ({
    id: FALLBACK_TENANT_ID,
    name: FALLBACK_TENANT_NAME,
    ...(override || {}),
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncOverride = () => {
      try {
        const stored = window.localStorage.getItem(INDUSTRY_OVERRIDE_KEY);
        setIndustryOverride(normalizeIndustry(stored));
        const tenantConfigStored = window.localStorage.getItem(LOCAL_TENANT_CONFIG_KEY);
        setLocalOverride(tenantConfigStored ? safeJsonParse<Record<string, unknown>>(tenantConfigStored) : null);
      } catch {
        setIndustryOverride(DEFAULT_SAFEVIATE_INDUSTRY);
        setLocalOverride(null);
      }
    };

    syncOverride();
    window.addEventListener('safeviate-industry-switch', syncOverride);
    window.addEventListener('storage', syncOverride);

    return () => {
      window.removeEventListener('safeviate-industry-switch', syncOverride);
      window.removeEventListener('storage', syncOverride);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
      const load = async () => {
      if (isProfileLoading) {
        return;
      }

      if (!userProfile) {
        if (!bootstrapTenant) {
          setTenantData(null);
        }
        setIsLoading(false);
        return;
      }

      if (!tenantId) {
        if (!bootstrapTenant) {
          setTenantData(null);
        }
        setIsLoading(false);
        return;
      }

      try {
        const configPayload = await getOrSetClientApiCache(
          `tenant-config:${resolvedTenantId}`,
          TENANT_CONFIG_CACHE_TTL_MS,
          async () => {
            const response = await fetch(`/api/tenant-config?tenantId=${encodeURIComponent(resolvedTenantId)}`, { cache: 'no-store' });
            return response.ok ? await response.json().catch(() => ({})) : {};
          }
        );
        const tenantConfig = configPayload?.config ?? null;
        const mergedConfig = mergeTenantConfig(
          tenantConfig && typeof tenantConfig === 'object'
            ? (tenantConfig as Record<string, unknown>)
            : null,
          localOverride
        );
        const tenantConfigWithoutIndustry = stripIndustryFromConfig(mergedConfig);

        if (!cancelled) {
          if (profileTenant) {
            setTenantData((current) => {
              const normalizedProfileTenant = normalizeTenantSummary(profileTenant, current ?? bootstrapTenant);
              return normalizedProfileTenant
                ? {
                    ...(current || bootstrapTenant || {}),
                    ...normalizedProfileTenant,
                    ...(tenantConfigWithoutIndustry || {}),
                  }
                : (current || bootstrapTenant || null);
            });
          } else if (localOverride) {
            setTenantData(buildLocalTenant(localOverride));
          } else if (bootstrapTenant) {
            setTenantData(bootstrapTenant);
          } else {
            setTenantData((current) => current);
          }
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load tenant configuration.'));
          if (!bootstrapTenant && !localOverride) {
            setTenantData((current) => current);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    
      const handleUpdate = async () => {
        try {
          invalidateClientApiCache(`tenant-config:${resolvedTenantId}`);
          const payload = await getOrSetClientApiCache(
            `tenant-config:${resolvedTenantId}`,
            TENANT_CONFIG_CACHE_TTL_MS,
            async () => {
              const response = await fetch(`/api/tenant-config?tenantId=${encodeURIComponent(resolvedTenantId)}`, { cache: 'no-store' });
              return response.ok ? await response.json().catch(() => ({})) : {};
            }
          );
          if (!cancelled) {
            const nextConfig = mergeTenantConfig(
              payload?.config && typeof payload.config === 'object'
                ? (payload.config as Record<string, unknown>)
                : null,
              localOverride
            );
            const nextConfigWithoutIndustry = stripIndustryFromConfig(nextConfig);
            if (nextConfigWithoutIndustry && Object.keys(nextConfigWithoutIndustry).length > 0) {
              setTenantData((current) =>
                current
                  ? { ...current, ...nextConfigWithoutIndustry }
                  : buildLocalTenant(nextConfigWithoutIndustry)
              );
            }
          }
        } catch {
        // ignore transient refresh failures
      }
    };

    window.addEventListener('safeviate-tenant-config-updated', handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-tenant-config-updated', handleUpdate);
    };
  }, [tenantId, profileTenant, localOverride, userProfile?.id, isProfileLoading]);

  const isDeveloper =
    userProfile?.role?.toLowerCase() === 'dev' || userProfile?.role?.toLowerCase() === 'developer' || userProfile?.id === 'DEVELOPER_MODE';

  const modifiedTenant = useMemo(() => {
    if (!tenantData) return null;
    if (isDeveloper) {
      const nextIndustry =
        tenantData.id === FALLBACK_TENANT_ID
          ? industryOverride && industryOverride !== 'General: Occupational Health & Safety (OHS)'
            ? industryOverride
            : DEFAULT_SAFEVIATE_INDUSTRY
          : industryOverride || tenantData.industry || DEFAULT_SAFEVIATE_INDUSTRY;

      return { ...tenantData, industry: nextIndustry };
    }
    return tenantData;
  }, [tenantData, isDeveloper, industryOverride]);

  return {
    tenant: modifiedTenant,
    tenantId,
    isLoading,
    error,
  };
};
