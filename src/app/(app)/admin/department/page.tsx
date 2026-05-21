'use client';

import { useEffect, useState, useCallback } from 'react';
import { DepartmentForm } from './department-form';
import { DepartmentActions } from './department-actions';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MainPageHeader } from "@/components/page-header";
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserProfile } from '@/hooks/use-user-profile';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

export type Department = {
  id: string;
  name: string;
};

export default function DepartmentPage() {
  const { hasPermission } = usePermissions();
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/admin/department' });
  const { tenantId } = useUserProfile();
  const canManage = hasPermission('admin-departments-manage');
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  const loadDepartments = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const response = await fetch('/api/departments', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ departments: [] }));
      if (!cancelled) {
        setDepartments(Array.isArray(payload.departments) ? payload.departments : []);
        setError(null);
      }
    })()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load departments.'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = loadDepartments();
    window.addEventListener('safeviate-departments-updated', loadDepartments);
    return () => {
      cleanup?.();
      window.removeEventListener('safeviate-departments-updated', loadDepartments);
    };
  }, [loadDepartments]);

  const renderDepartmentCard = (dept: Department) => (
    <Card key={dept.id} className="group overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">{dept.name}</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Department Record
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-background text-[10px] font-black uppercase text-muted-foreground">
          Dept
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4">
        <div className="rounded-2xl border bg-background px-3 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Name</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{dept.name}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <DepartmentActions tenantId={tenantId || ''} department={dept} />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden px-1 pt-4">
      <Card className="flex flex-col flex-1 min-h-0 overflow-hidden shadow-none border">
        <MainPageHeader 
          title="Departments"
          actions={canManage && <DepartmentForm tenantId={tenantId || ''} />}
        />

        <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            {error ? (
              <div className="p-4">
                <Card className="border-destructive/20 shadow-none">
                  <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <p className="text-lg font-semibold text-destructive">Unable to load departments.</p>
                    <p className="text-sm text-foreground/80">{error.message}</p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <ResponsiveCardGrid
                items={departments}
                isLoading={isLoading}
                loadingCount={3}
                className="p-4"
                gridClassName="sm:grid-cols-2 xl:grid-cols-3"
                renderItem={(dept) => renderDepartmentCard(dept)}
                renderLoadingItem={(index) => <Skeleton key={index} className="h-44 w-full rounded-2xl" />}
                emptyState={(
                  <div className="p-4">
                    <Card className="border-dashed shadow-none">
                      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <p className="text-lg font-semibold text-foreground">No departments found.</p>
                        <p className="text-sm text-foreground/80">Add a department to organize your operations structure.</p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              />
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
