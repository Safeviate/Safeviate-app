'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import type { PilotProfile, Personnel } from '@/app/(app)/users/personnel/page';
import { parseJsonResponse } from '@/lib/safe-json';
import { MASTER_TENANT_ID } from '@/lib/tenant-constants';
import type { TabVisibilitySettings } from '@/types/quality';
import { getOrSetClientApiCache, invalidateClientApiCache } from '@/lib/client/api-cache';

type UserProfile = PilotProfile | Personnel;
type DbUserProfile = {
    id: string;
    tenantId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions?: string[];
    accessOverrides?: {
        hiddenMenus?: string[];
        hiddenTabs?: string[];
    };
};
type TenantSummary = {
    id: string;
    name?: string | null;
    industry?: string | null;
    enabledMenus?: string[] | null;
    tabVisibilitySettings?: TabVisibilitySettings | null;
} | null;
type MePayload = {
    profile: DbUserProfile | null;
    tenant?: TenantSummary;
    rolePermissions?: string[];
    roleHiddenMenus?: string[];
};
const TENANT_OVERRIDE_STORAGE_KEY = 'safeviate:selected-tenant';
const TENANT_OVERRIDE_COOKIE_KEY = 'safeviate:selected-tenant';
const USER_PROFILE_CACHE_TTL_MS = 5 * 60_000;

interface UserProfileContextType {
    userProfile: UserProfile | null;
    tenantId: string | null;
    tenant: TenantSummary;
    rolePermissions: string[];
    roleHiddenMenus: string[];
    isLoading: boolean;
    error: Error | null;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

export const useUserProfile = () => {
    const context = useContext(UserProfileContext);
    if (!context) {
        throw new Error('useUserProfile must be used within a UserProfileProvider');
    }
    return context;
};

const getTenantOverride = () => {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(TENANT_OVERRIDE_STORAGE_KEY);
    } catch {
        return null;
    }
};

export const UserProfileProvider = ({ children }: { children: ReactNode }) => {
    const { data: session, status } = useSession();
    const [dbProfile, setDbProfile] = useState<DbUserProfile | null>(null);
    const [tenant, setTenant] = useState<TenantSummary>(null);
    const [rolePermissions, setRolePermissions] = useState<string[]>([]);
    const [roleHiddenMenus, setRoleHiddenMenus] = useState<string[]>([]);
    const [dbError, setDbError] = useState<Error | null>(null);
    const [dbLoading, setDbLoading] = useState(false);
    const [profileRefreshToken, setProfileRefreshToken] = useState(0);
    const [tenantOverride, setTenantOverride] = useState<string | null>(() => getTenantOverride());
    const authUser = session?.user ?? null;
    const isAuthLoading = status === 'loading';
    const profileCacheKey = useMemo(() => {
        if (!authUser) return 'user-profile:anonymous';
        return `user-profile:${authUser.id || authUser.email || 'session'}`;
    }, [authUser?.email, authUser?.id]);

    useEffect(() => {
        if (isAuthLoading) return;

        let cancelled = false;
        const loadProfile = async () => {
            setDbLoading(true);
            try {
                const payload = await getOrSetClientApiCache<MePayload>(
                    profileCacheKey,
                    USER_PROFILE_CACHE_TTL_MS,
                    async () => {
                        const response = await fetch('/api/me', { cache: 'no-store' });
                        return (await parseJsonResponse<MePayload>(response)) ?? { profile: null };
                    }
                );
                if (!cancelled) {
                    const selectedTenantId = payload?.tenant?.id?.trim() || null;
                    const activeOverride = getTenantOverride()?.trim() || null;
                    if (typeof window !== 'undefined' && activeOverride && selectedTenantId && activeOverride !== selectedTenantId) {
                        if (selectedTenantId === MASTER_TENANT_ID) {
                            window.localStorage.removeItem(TENANT_OVERRIDE_STORAGE_KEY);
                            window.document.cookie = `${TENANT_OVERRIDE_COOKIE_KEY}=${MASTER_TENANT_ID}; path=/; max-age=${60 * 60 * 24 * 365}`;
                            setTenantOverride(null);
                        } else {
                            window.localStorage.setItem(TENANT_OVERRIDE_STORAGE_KEY, selectedTenantId);
                            window.document.cookie = `${TENANT_OVERRIDE_COOKIE_KEY}=${encodeURIComponent(selectedTenantId)}; path=/; max-age=${60 * 60 * 24 * 365}`;
                            setTenantOverride(selectedTenantId);
                        }
                    }
                    setDbProfile(payload?.profile ?? null);
                    setTenant(payload?.tenant ?? null);
                    setRolePermissions(Array.isArray(payload?.rolePermissions) ? payload.rolePermissions : []);
                    setRoleHiddenMenus(Array.isArray(payload?.roleHiddenMenus) ? payload.roleHiddenMenus : []);
                    setDbError(null);
                }
            } catch (error) {
                if (!cancelled) {
                    setDbError(error instanceof Error ? error : new Error('Failed to load profile.'));
                    setDbProfile(null);
                    setTenant(null);
                    setRolePermissions([]);
                    setRoleHiddenMenus([]);
                }
            } finally {
                if (!cancelled) setDbLoading(false);
            }
        };

        void loadProfile();

        return () => {
            cancelled = true;
        };
    }, [authUser?.email, authUser?.id, isAuthLoading, profileCacheKey, profileRefreshToken]);

    const isLoading = isAuthLoading || dbLoading;
    const error = dbError;

    const tenantId = useMemo(() => {
        if (!dbProfile) return null;
        const profileTenantId = dbProfile.tenantId || MASTER_TENANT_ID;
        
        // Developer role bypass for tenant switching
        const isDeveloper =
            dbProfile.role?.toLowerCase() === 'dev' ||
            dbProfile.role?.toLowerCase() === 'developer' ||
            profileTenantId === MASTER_TENANT_ID;
        const overrideTenantId = isDeveloper ? tenantOverride : null;
        
        return overrideTenantId || profileTenantId;
    }, [dbProfile, tenantOverride]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleProfileUpdate = () => {
            invalidateClientApiCache(profileCacheKey);
            setProfileRefreshToken((current) => current + 1);
        };
        const syncTenantOverride = () => setTenantOverride(getTenantOverride());
        const handleTenantSwitch = (event: Event) => {
            const nextTenantId = getTenantOverride() || MASTER_TENANT_ID;
            const tenantSwitchEvent = event as CustomEvent<{ tenantId?: string | null; tenantName?: string | null }>;
            const nextTenantName = tenantSwitchEvent.detail?.tenantName?.trim() || null;

            setTenantOverride(nextTenantId);
            setTenant((current) => ({
                ...(current || {}),
                id: nextTenantId,
                name: nextTenantName || (nextTenantId === MASTER_TENANT_ID ? 'Safeviate' : current?.name || nextTenantId),
            }));

            invalidateClientApiCache(profileCacheKey);
            setProfileRefreshToken((current) => current + 1);
        };

        syncTenantOverride();
        window.addEventListener('safeviate-profile-updated', handleProfileUpdate);
        window.addEventListener('storage', syncTenantOverride);
        window.addEventListener('safeviate-tenant-switch', handleTenantSwitch);

        return () => {
            window.removeEventListener('safeviate-profile-updated', handleProfileUpdate);
            window.removeEventListener('storage', syncTenantOverride);
            window.removeEventListener('safeviate-tenant-switch', handleTenantSwitch);
        };
    }, [profileCacheKey]);

    const value = useMemo(() => ({
        userProfile: dbProfile ? ({
            id: dbProfile.id,
            firstName: dbProfile.firstName,
            lastName: dbProfile.lastName,
            email: dbProfile.email,
            role: dbProfile.role,
            permissions: dbProfile.permissions,
            accessOverrides: dbProfile.accessOverrides,
        } as UserProfile) : (authUser ? ({
            id: authUser.id ?? authUser.email ?? 'vercel-user',
            firstName: authUser.name?.split(' ')[0] ?? 'User',
            lastName: authUser.name?.split(' ').slice(1).join(' ') || '',
            email: authUser.email ?? '',
            role: 'developer',
            permissions: ['*'],
            accessOverrides: {},
        } as UserProfile) : null),
        tenantId: tenantId || MASTER_TENANT_ID,
        tenant,
        rolePermissions,
        roleHiddenMenus,
        isLoading,
        error,
    }), [dbProfile, authUser, tenantId, tenant, rolePermissions, roleHiddenMenus, isLoading, error]);

    return (
        <UserProfileContext.Provider value={value}>
            {children}
        </UserProfileContext.Provider>
    );
};
