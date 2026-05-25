'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MainPageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserProfile } from '@/hooks/use-user-profile';
import { ArrowRight, PlusCircle } from 'lucide-react';
import { RoleForm } from '../admin/roles/role-form';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Role } from '../admin/roles/page';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { PAGE_FORMAT_MOBILE_FULL_WIDTH_BUTTON_CLASS } from '@/lib/page-format-buttons';

export default function UsersPage() {
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/users' });
  const isMobile = useIsMobile();
  const { tenantId } = useUserProfile();
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/roles', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ roles: [] }));
        if (!cancelled) {
          setRoles(Array.isArray(payload.roles) ? payload.roles : []);
        }
      } catch {
        if (!cancelled) setRoles([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    window.addEventListener('safeviate-roles-updated', load);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-roles-updated', load);
    };
  }, []);

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden">
      <Card className="flex-1 flex flex-col overflow-hidden shadow-none border">
        <MainPageHeader
          title="Users by Role"
          description="Open a role to see the users assigned to it, or create a new role first."
          actions={
            <RoleForm
              tenantId={tenantId || 'safeviate'}
              trigger={
                <Button className={isMobile ? PAGE_FORMAT_MOBILE_FULL_WIDTH_BUTTON_CLASS : 'gap-2'}>
                  <span className="flex items-center gap-2">
                    <PlusCircle className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                    Add Role
                  </span>
                </Button>
              }
            />
          }
        />
        <CardContent className="flex-1 overflow-auto p-4 bg-background">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
            </div>
          ) : roles.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {roles.map((role) => (
                <Link key={role.id} href={`/users/role/${role.id}`} className="group">
                  <Card className="h-full border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                    <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black uppercase tracking-tight text-foreground">{role.name}</p>
                          </div>
                          <Badge variant="secondary" className="h-6 px-2 text-[10px] font-black uppercase">
                            {role.permissions?.length || 0} perms
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-tight text-primary">
                        <span>Open users</span>
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No roles found yet. Create one to start organizing users.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
