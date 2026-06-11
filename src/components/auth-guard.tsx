'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from './ui/skeleton';
import { useSession } from 'next-auth/react';
import { useUserProfile } from '@/hooks/use-user-profile';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: session, status } = useSession();
  const { isLoading: isProfileLoading, userProfile, tenantId } = useUserProfile();
  const router = useRouter();
  const pathname = usePathname();

  const isLoading = status === 'loading' || isProfileLoading;
  const authUser = session?.user ?? null;
  const bootstrapActive = !authUser && !!userProfile && userProfile.role?.toLowerCase() === 'developer';

  useEffect(() => {
    if (!isLoading && !authUser && !bootstrapActive && pathname !== '/login') {
      router.push('/login');
    }

    if (!isLoading && (authUser || bootstrapActive) && pathname === '/login') {
      router.push('/dashboard');
    }
  }, [authUser, bootstrapActive, isLoading, router, pathname]);

  useEffect(() => {
    if (isLoading || !authUser?.email || !tenantId) return;

    let cancelled = false;
    const enforceNdaGate = async () => {
      try {
        const query = new URLSearchParams({
          email: authUser.email || '',
          tenantId,
        });
        const response = await fetch(`/api/auth/nda-status?${query.toString()}`, {
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (cancelled || payload?.enabled === false || payload?.accepted !== false) return;

        const targetTenantId = String(payload?.tenantId || tenantId);
        router.replace(
          `/beta-nda?email=${encodeURIComponent(authUser.email || '')}&tenantId=${encodeURIComponent(targetTenantId)}`
        );
      } catch (error) {
        console.error('[AuthGuard] NDA status check failed:', error);
      }
    };

    void enforceNdaGate();

    return () => {
      cancelled = true;
    };
  }, [authUser?.email, isLoading, router, tenantId]);

  if (isLoading && pathname !== '/login') {
    return (
      <div className="flex flex-col flex-1 h-screen overflow-hidden">
        <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b bg-header px-3 text-header-foreground sm:h-13 sm:px-4">
          <Skeleton className="h-6 w-6 md:hidden" />
          <Skeleton className="h-5 w-28" />
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-3 lg:p-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-1/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
