'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, X, Shield, LayoutGrid } from 'lucide-react';
import { isHrefEnabledForIndustry } from '@/lib/industry-access';
import { menuConfig, type MenuItem, type SubMenuItem } from '@/lib/menu-config';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { Skeleton } from '@/components/ui/skeleton';
import type { Role } from '../../admin/roles/page';
import Link from 'next/link';
import { MainPageHeader } from '@/components/page-header';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { hasHierarchicalPermission } from '@/lib/permission-model';

type AccessRow = {
  href: string;
  label: string;
  description?: string;
  permissionId?: string;
  depth: number;
};

type AccessGroup = {
  href: string;
  label: string;
  icon: MenuItem['icon'];
  description?: string;
  permissionId?: string;
  rows: AccessRow[];
};

const flattenAccessRows = (item: MenuItem | SubMenuItem, depth = 0): AccessRow[] => {
  const rows: AccessRow[] = [
    {
      href: item.href,
      label: item.label,
      description: 'description' in item ? item.description : undefined,
      permissionId: item.permissionId,
      depth,
    },
  ];

  if (item.subItems?.length) {
    item.subItems.forEach((subItem) => {
      rows.push(...flattenAccessRows(subItem, depth + 1));
    });
  }

  return rows;
};

const buildAccessGroups = (items: MenuItem[], industry?: string): AccessGroup[] => {
  return items
    .filter((item) => isHrefEnabledForIndustry(item.href, industry))
    .map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.icon,
      description: item.subItems?.length ? undefined : item.permissionId ? undefined : 'Menu-only item',
      permissionId: item.permissionId,
      rows: flattenAccessRows(item),
    }));
};

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

  const menuGroups = useMemo(() => buildAccessGroups(menuConfig, tenant?.industry), [tenant?.industry]);

  const isModuleEnabled = (href: string) =>
    isHrefEnabledForIndustry(href, tenant?.industry) && (!tenant?.enabledMenus || tenant.enabledMenus.includes(href));

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
              <CardDescription className="text-[10px] font-bold uppercase text-muted-foreground italic">
                Grouped by menu and submenu so access lines up with the sidebar.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-4 lg:p-6 overflow-hidden">
              <div className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar space-y-4 pr-1" style={{ scrollbarWidth: 'thin' }}>
                {menuGroups.map((group) => {
                  const groupIsEnabled = isModuleEnabled(group.href);

                  return (
                    <Card
                      key={group.href}
                      className={`overflow-hidden border shadow-none ${groupIsEnabled ? '' : 'opacity-50 grayscale'}`}
                    >
                      <CardHeader className="border-b bg-muted/5 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-[-0.01em]">
                              <group.icon className="h-4 w-4 text-primary" />
                              <span className="truncate">{group.label}</span>
                            </CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase text-muted-foreground italic">
                              {group.description || 'Menu group with nested access rows.'}
                            </CardDescription>
                          </div>
                          <Badge
                            variant={groupIsEnabled ? 'default' : 'outline'}
                            className="h-5 rounded-full px-2 text-[8px] font-black uppercase"
                          >
                            {groupIsEnabled ? 'ENABLED' : 'HIDDEN'}
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="p-0">
                        <div className="overflow-x-auto w-full custom-scrollbar" style={{ scrollbarWidth: 'thin' }}>
                          <Table className="min-w-[860px]">
                            <TableHeader className="bg-muted/30">
                              <TableRow>
                                <TableHead className="w-64 text-[10px] uppercase font-black bg-muted/30 tracking-wider">
                                  Menu Item
                                </TableHead>
                                {(roles || []).map((role) => (
                                  <TableHead
                                    key={role.id}
                                    className="text-center text-[10px] uppercase font-black bg-muted/30 tracking-wider"
                                  >
                                    {role.name}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.rows.map((row) => {
                                const rowEnabled = isModuleEnabled(row.href);
                                const hasPermission = Boolean(row.permissionId);

                                return (
                                  <TableRow key={row.href} className={!rowEnabled ? 'opacity-40' : ''}>
                                    <TableCell className="py-4 px-4 align-top">
                                      <div className={`flex items-start gap-3 ${row.depth > 0 ? 'pl-6' : ''}`}>
                                        <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 p-1.5 text-primary">
                                          {row.depth === 0 ? (
                                            <group.icon className="h-3.5 w-3.5" />
                                          ) : (
                                            <div className="h-2 w-2 rounded-full bg-primary/70" />
                                          )}
                                        </div>
                                        <div className="min-w-0 space-y-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span
                                              className={`font-bold text-foreground ${row.depth > 0 ? 'text-[13px]' : 'text-sm'}`}
                                            >
                                              {row.label}
                                            </span>
                                            {hasPermission ? (
                                              <Badge variant="outline" className="h-5 px-1.5 text-[8px] font-black uppercase">
                                                Permission
                                              </Badge>
                                            ) : (
                                              <Badge variant="secondary" className="h-5 px-1.5 text-[8px] font-black uppercase">
                                                Public
                                              </Badge>
                                            )}
                                            {!rowEnabled && (
                                              <Badge variant="outline" className="h-5 px-1.5 text-[8px] font-black uppercase">
                                                Hidden
                                              </Badge>
                                            )}
                                          </div>
                                          {row.description ? (
                                            <p className="text-[10px] font-medium text-muted-foreground">{row.description}</p>
                                          ) : null}
                                        </div>
                                      </div>
                                    </TableCell>

                                    {(roles || []).map((role) => {
                                      const hasAccess = hasPermission
                                        ? hasHierarchicalPermission(role.permissions || [], row.permissionId || '')
                                        : false;

                                      return (
                                        <TableCell key={role.id} className="text-center align-middle">
                                          {hasPermission ? (
                                            rowEnabled && hasAccess ? (
                                              <Check className="mx-auto h-4 w-4 text-primary" />
                                            ) : (
                                              <X className="mx-auto h-4 w-4 text-muted-foreground/30" />
                                            )
                                          ) : (
                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                                              —
                                            </span>
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
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6 overflow-y-auto no-scrollbar pb-4">
            <Card className="shadow-none border overflow-hidden">
              <CardHeader className="bg-muted/5 border-b p-4">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                  <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                  Menu Visibility
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-4 space-y-2 bg-background">
                {menuGroups.map((group) => {
                  const isEnabled = isModuleEnabled(group.href);
                  return (
                    <div key={group.href} className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-foreground">{group.label}</span>
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
                For a user to see a menu item or submenu, two conditions must be met:
                <ol className="list-decimal pl-4 mt-2 space-y-1">
                  <li>The module must be enabled globally in <Link href="/admin/page-format" className="text-primary hover:underline">Page Format</Link>.</li>
                  <li>The user&apos;s Role must have the corresponding permission tier for that menu row.</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </Card>
    </div>
  );
}
