'use client';

import { Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MainPageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { permissionsConfig } from '@/lib/permissions-config';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { getPermissionDisplayLabel } from '@/lib/permission-display';
import { getPermissionSections } from '@/lib/permission-sections';

export default function PermissionsPage() {
  const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/admin/permissions' });
  const permissionSections = getPermissionSections(permissionsConfig);

  if (!isLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden px-1 pt-4">
      <Card className="flex flex-col h-full overflow-hidden shadow-none border">
        <MainPageHeader title="Permissions" />
        <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
          <div className="h-full overflow-y-auto custom-scrollbar p-4 lg:p-6 space-y-6" style={{ scrollbarWidth: 'thin' }}>
            {permissionSections.map((section) => (
              <section key={section.title} className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-1">
                  <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                    {section.title}
                  </h2>
                  <Badge variant="outline" className="h-5 rounded-full px-2 text-[8px] font-black uppercase">
                    {section.resources.length} modules
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {section.resources.map((resource) => (
                    <Card key={resource.id} className="overflow-hidden border shadow-none">
                      <CardHeader className="border-b bg-muted/20 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <CardTitle className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">
                              {resource.name}
                            </CardTitle>
                            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                              Permission group
                            </p>
                          </div>
                          <Badge variant="secondary" className="h-6 rounded-full px-2 text-[9px] font-black uppercase">
                            {resource.actions.length} actions
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3 px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {resource.actions.map((action) => {
                            const permissionId = `${resource.id}-${action}`;
                            return (
                              <Badge
                                key={permissionId}
                                variant="outline"
                                className="rounded-full border-slate-300 px-3 py-1 text-[10px] font-black uppercase"
                              >
                                {getPermissionDisplayLabel(action)}
                              </Badge>
                            );
                          })}
                        </div>

                        <div className="space-y-1 rounded-2xl border bg-muted/10 px-3 py-3">
                          {resource.actions.map((action) => {
                            const permissionId = `${resource.id}-${action}`;
                            return (
                              <div key={permissionId} className="flex items-center justify-between gap-3 text-[11px]">
                                <span className="font-semibold text-foreground">
                                  {getPermissionDisplayLabel(action)}
                                </span>
                                <span className="truncate font-mono text-[10px] text-muted-foreground">
                                  {permissionId}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}

            {permissionSections.length === 0 && (
              <Card className="border-dashed shadow-none">
                <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <p className="text-lg font-semibold text-foreground">No permissions configured.</p>
                  <p className="text-sm text-foreground/80">Add permission resources to populate this catalog.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
