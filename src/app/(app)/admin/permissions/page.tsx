'use client';

import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { MainPageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { permissionsConfig } from '@/lib/permissions-config';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

export default function PermissionsPage() {
  const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/admin/permissions' });

  if (!isLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden px-1 pt-4">
      <Card className="flex flex-col h-full overflow-hidden shadow-none border">
        <MainPageHeader title="Permissions" />
        <CardContent className="flex-1 p-0 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div className="p-0">
              <Table>
                  <TableHeader className="bg-muted/30">
                      <TableRow>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider px-6">Resource</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider">Action</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider">Permission ID</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {permissionsConfig.map(resource => (
                          resource.actions.map((action, index) => {
                              const permissionId = `${resource.id}-${action}`;
                              return (
                                  <TableRow key={permissionId} className="group hover:bg-muted/5 transition-colors">
                                      <TableCell className="py-4 px-6">
                                          {index === 0 && (
                                            <span className="text-xs font-black uppercase text-foreground tracking-tight">
                                              {resource.name}
                                            </span>
                                          )}
                                      </TableCell>
                                      <TableCell className="py-4">
                                        <Badge variant="outline" className="text-[10px] uppercase font-black py-0.5 px-3 border-slate-300">
                                          {action}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="font-mono text-[11px] font-bold text-muted-foreground py-4">
                                        {permissionId}
                                      </TableCell>
                                  </TableRow>
                              )
                          })
                      ))}
                      {permissionsConfig.length === 0 && (
                          <TableRow>
                              <TableCell colSpan={3} className="text-center h-48 text-[10px] font-bold uppercase tracking-widest text-muted-foreground italic bg-muted/5">
                                  No permissions configured.
                              </TableCell>
                          </TableRow>
                       )}
                  </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
