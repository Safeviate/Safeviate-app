'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { PilotProfile } from '../personnel/page';
import { StudentsTable } from './students-table';
import { PersonnelForm } from '../personnel/personnel-form';
import type { Role } from '../../admin/roles/page';
import type { Department } from '../../admin/department/page';
import { usePermissions } from '@/hooks/use-permissions';
import { MainPageHeader } from '@/components/page-header';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { ChevronDown, PlusCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PAGE_FORMAT_MOBILE_INPUT_BUTTON_CLASS,
  PAGE_FORMAT_USER_ACTION_BUTTON_CLASS,
} from '@/lib/page-format-buttons';

export default function StudentsPage() {
  const isMobile = useIsMobile();
  const { hasPermission } = usePermissions();
  const { tenantId, isLoading: isProfileLoading } = useUserProfile();
  const canCreateUsers = hasPermission('users-create');

  const [students, setStudents] = useState<PilotProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingData(true);
      try {
        const [summaryRes, rolesRes, departmentsRes] = await Promise.all([
          fetch('/api/dashboard-summary', { cache: 'no-store' }),
          fetch('/api/roles', { cache: 'no-store' }),
          fetch('/api/departments', { cache: 'no-store' }),
        ]);

        const summary = await summaryRes.json().catch(() => ({}));
        const rolesPayload = await rolesRes.json().catch(() => ({}));
        const departmentsPayload = await departmentsRes.json().catch(() => ({}));

        if (!cancelled) {
          setStudents(Array.isArray(summary.students) ? summary.students : []);
          setRoles(Array.isArray(rolesPayload.roles) ? rolesPayload.roles : []);
          setDepartments(Array.isArray(departmentsPayload.departments) ? departmentsPayload.departments : []);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Failed to load students.'));
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    };

    void load();
    const handleUpdate = () => { void load(); };
    window.addEventListener('safeviate-personnel-updated', handleUpdate);
    window.addEventListener('safeviate-roles-updated', handleUpdate);
    window.addEventListener('safeviate-departments-updated', handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-personnel-updated', handleUpdate);
      window.removeEventListener('safeviate-roles-updated', handleUpdate);
      window.removeEventListener('safeviate-departments-updated', handleUpdate);
    };
  }, []);

  const isLoading = isProfileLoading || isLoadingData;

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden">
      <Card className="flex-1 flex flex-col overflow-hidden shadow-none border">
        <MainPageHeader
          title="Students"
          description="Manage all students in your organization."
          actions={
            canCreateUsers && (
              <PersonnelForm
                tenantId={tenantId || ''}
                roles={roles || []}
                departments={departments || []}
                defaultUserType="Student"
                trigger={
                  <Button
                    disabled={!canCreateUsers || isProfileLoading}
                    variant={isMobile ? 'outline' : 'default'}
                    size={isMobile ? 'sm' : 'default'}
                    className={isMobile ? PAGE_FORMAT_MOBILE_INPUT_BUTTON_CLASS : PAGE_FORMAT_USER_ACTION_BUTTON_CLASS}
                  >
                    <span className="flex items-center gap-2">
                      <PlusCircle className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                      Add User
                    </span>
                    {isMobile ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                  </Button>
                }
              />
            )
          }
        />
        <CardContent className="flex-1 p-0 overflow-hidden bg-background">
          {isLoading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div className="text-center p-8 text-destructive font-semibold">Error: {error.message}</div>
          ) : (
            <StudentsTable data={students} tenantId={tenantId || ''} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
