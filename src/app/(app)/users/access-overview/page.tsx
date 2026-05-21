'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, X, Shield, LayoutGrid } from 'lucide-react';
import { isHrefEnabledForIndustry } from '@/lib/industry-access';
import { menuConfig } from '@/lib/menu-config';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { Skeleton } from '@/components/ui/skeleton';
import type { Role } from '../../admin/roles/page';
import Link from 'next/link';
import { MainPageHeader } from '@/components/page-header';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

export default function AccessOverviewPage() {
  const { tenant, isLoading: isLoadingTenant } = useTenantConfig();
  const { isAllowed } = useTenantRouteAccess({ href: '/users/access-overview' });
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadRoles = async () => {
      try {
        const response = await fetch('/api/roles', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled) {
          setRoles(Array.isArray(payload.roles) ? payload.roles : []);
        }
      } catch {
        if (!cancelled) setRoles([]);
      } finally {
        if (!cancelled) setIsLoadingRoles(false);
      }
    };

    void loadRoles();
    window.addEventListener('safeviate-roles-updated', loadRoles);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-roles-updated', loadRoles);
    };
  }, []);

  const isLoading = isLoadingTenant || isLoadingRoles;

  const coreModules = useMemo(() => {
    return menuConfig.filter(
      (m) =>
        m.label !== 'Admin' &&
        m.label !== 'Development' &&
        isHrefEnabledForIndustry(m.href, tenant?.industry)
    );
  }, [tenant?.industry]);

  if (!isLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  if (isLoading) {
    return (
      <div className="space-y-6 lg:max-w-[1100px] mx-auto w-full px-1">
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 h-[500px]">
          <Skeleton className="h-full w-full" />
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden px-1">
      <Card className="flex flex-col h-full overflow-hidden shadow-none border">
        <MainPageHeader title="Access Overview" />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 flex-1 min-h-0 p-4 lg:p-6 overflow-hidden">
          <Card className="flex flex-col h-full overflow-hidden shadow-none border">
            <CardHeader className="shrink-0 border-b bg-muted/5 p-6">
              <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Role Access Matrix
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase text-muted-foreground italic">Permissions required to see core modules.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <div className="overflow-x-auto w-full h-full custom-scrollbar" style={{ scrollbarWidth: 'thin' }}>
                <Table className="min-w-[800px]">
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-48 text-[10px] uppercase font-black bg-muted/30 tracking-wider">Module</TableHead>
                      {(roles || []).map(role => (
                        <TableHead key={role.id} className="text-center text-[10px] uppercase font-black bg-muted/30 tracking-wider">
                          {role.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coreModules.map(module => {
                      const isEnabled = !tenant?.enabledMenus || tenant.enabledMenus.includes(module.href);

                      return (
                        <TableRow key={module.href} className={!isEnabled ? 'opacity-40 grayscale' : ''}>
                          <TableCell className="font-bold text-sm text-foreground flex items-center gap-2 py-4 px-6">
                            <module.icon className="h-4 w-4 text-primary" />
                            {module.label}
                            {!isEnabled && <Badge variant="outline" className="text-[8px] h-4 py-0 ml-1 font-black uppercase">Disabled</Badge>}
                          </TableCell>
                          {(roles || []).map(role => {
                            const permissionId = module.permissionId;
                            const hasAccess = role.permissions?.includes(permissionId || '');

                            return (
                              <TableCell key={role.id} className="text-center">
                                {isEnabled && hasAccess ? (
                                  <Check className="h-4 w-4 text-primary mx-auto" />
                                ) : (
                                  <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6 overflow-y-auto no-scrollbar pb-4">
            <Card className="shadow-none border overflow-hidden">
              <CardHeader className="bg-muted/5 border-b p-4">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                  <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                  Active Modules
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-4 space-y-2 bg-background">
                {coreModules.map(m => {
                  const isEnabled = !tenant?.enabledMenus || tenant.enabledMenus.includes(m.href);
                  return (
                    <div key={m.href} className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-foreground">{m.label}</span>
                      <Badge variant={isEnabled ? 'default' : 'outline'} className="h-4 text-[8px] font-black uppercase">
                        {isEnabled ? 'ENABLED' : 'HIDDEN'}
                      </Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20 shadow-none">
              <CardHeader className="p-4">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Visibility Logic</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 text-[10px] text-muted-foreground font-medium leading-relaxed">
                For a user to see a module, two conditions must be met:
                <ol className="list-decimal pl-4 mt-2 space-y-1">
                  <li>The module must be enabled globally in <Link href="/admin/page-format" className="text-primary hover:underline">Page Format</Link>.</li>
                  <li>The user&apos;s Role must have the corresponding &quot;view&quot; permission.</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </Card>
    </div>
  );
}
