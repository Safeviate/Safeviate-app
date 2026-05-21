'use client';

import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { menuConfig } from '@/lib/menu-config';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { isTenantHrefEnabledByLayout } from '@/lib/tenant-layout-access';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

export default function AdminPage() {
  const { tenant } = useTenantConfig();
  const { canAccessMenuItem } = usePermissions();
  const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/admin' });
  const adminMenu = menuConfig.find(item => item.href === '/admin');

  if (!isLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  if (!adminMenu) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Admin section not configured.</p>
      </div>
    );
  }
  
  const visibleSubItems = (adminMenu.subItems || []).filter(
    item => canAccessMenuItem(item, adminMenu) && isTenantHrefEnabledByLayout(tenant, item.href)
  );

  if (visibleSubItems.length === 0) {
    return (
        <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">You do not have access to any admin sections.</p>
        </div>
    )
  }

  return (
    <div className="max-w-[1100px] mx-auto w-full grid gap-6 px-1 pt-4 md:grid-cols-2 lg:grid-cols-3">
      {visibleSubItems.map((item) => (
        <Link href={item.href} key={item.href}>
          <Card className="hover:bg-muted/50 transition-colors shadow-none border">
            <CardHeader>
              <CardTitle>{item.label}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
