'use client';

import { useEffect, useState, useCallback } from 'react';
import { RoleForm } from './role-form';
import { RoleActions } from './role-actions';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MainPageHeader } from "@/components/page-header";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserProfile } from '@/hooks/use-user-profile';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

export type Role = {
  id: string;
  name: string;
  permissions: string[];
  accessOverrides?: {
    hiddenMenus?: string[];
  };
  requiredDocuments?: string[];
};

export default function RolesPage() {
  const { hasPermission } = usePermissions();
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/admin/roles' });
  const { tenantId } = useUserProfile();
  const canManage = hasPermission('admin-roles-manage');
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  const loadRoles = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const response = await fetch('/api/roles', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ roles: [] }));
      const nextRoles = Array.isArray(payload.roles) ? payload.roles : [];
      if (!cancelled) {
        setRoles(nextRoles);
      }
    })()
      .catch((e) => {
        console.error('Failed to load roles', e);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = loadRoles();
    window.addEventListener('safeviate-roles-updated', loadRoles);
    return () => {
      cleanup?.();
      window.removeEventListener('safeviate-roles-updated', loadRoles);
    };
  }, [loadRoles]);

  const renderRoleCard = (role: Role) => (
    <Card key={role.id} className="group overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">{role.name}</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Role Definition
          </p>
        </div>
        <Badge variant="secondary" className="h-6 rounded-full px-2 text-[10px] font-black uppercase">
          {role.permissions?.length || 0} Perms
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4">
        <div className="rounded-2xl border bg-background px-3 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Permissions</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {role.permissions?.length || 0} assigned permissions
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <RoleActions tenantId={tenantId || ''} role={role} />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden px-1 pt-4">
      <Card className="flex flex-col flex-1 min-h-0 overflow-hidden shadow-none border">
        <MainPageHeader 
          title="Roles"
          actions={canManage && <RoleForm tenantId={tenantId || ''} />}
        />

        <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            <ResponsiveCardGrid
              items={roles}
              isLoading={isLoading}
              loadingCount={3}
              className="p-4"
              gridClassName="sm:grid-cols-2 xl:grid-cols-3"
              renderItem={(role) => renderRoleCard(role)}
              renderLoadingItem={(index) => <Skeleton key={index} className="h-44 w-full rounded-2xl" />}
              emptyState={(
                <div className="p-4">
                  <Card className="border-dashed shadow-none">
                    <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <p className="text-lg font-semibold text-foreground">No roles defined yet.</p>
                      <p className="text-sm text-foreground/80">Create a role to start assigning permissions.</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
