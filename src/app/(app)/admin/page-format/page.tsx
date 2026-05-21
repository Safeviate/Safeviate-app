'use client';

import { Card } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';
import { MainPageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ColorThemeForm } from '../../settings/color-theme-form';
import { Badge } from '@/components/ui/badge';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';

export default function PageFormatPage() {
  const { hasPermission, isLoading: isPermissionsLoading } = usePermissions();
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/admin/page-format' });
  const canManage = hasPermission('admin-settings-manage');

  if (isPermissionsLoading) {
    return (
      <div className="lg:max-w-[1100px] mx-auto flex flex-1 min-h-0 w-full flex-col gap-6 overflow-hidden px-1 pb-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground bg-muted/20 px-4 py-2 border rounded-full">Access Restricted</p>
      </div>
    );
  }

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return (
    <div className="lg:max-w-[1100px] mx-auto flex flex-1 min-h-0 w-full flex-col gap-6 overflow-hidden px-1 pb-4">
      <Card className="flex flex-1 min-h-0 flex-col overflow-hidden border shadow-none">
        <MainPageHeader
          title="Tenant Directory"
          description="Manage tenant records and branding from one place."
          actions={
            <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
              Branding
            </Badge>
          }
        />
        <div className="flex-1 min-h-0 overflow-hidden bg-background">
          <ColorThemeForm showHeader={false} />
        </div>
      </Card>
    </div>
  );
}
