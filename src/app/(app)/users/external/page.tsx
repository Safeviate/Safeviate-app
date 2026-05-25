'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { PilotProfile, Personnel } from '../personnel/page';
import { ExternalUsersTable } from './external-users-table';
import { PersonnelForm } from '../personnel/personnel-form';
import type { Role } from '../../admin/roles/page';
import type { Department } from '../../admin/department/page';
import type { ExternalOrganization } from '@/types/quality';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { MainPageHeader } from '@/components/page-header';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { ChevronDown, PlusCircle } from 'lucide-react';
import {
  PAGE_FORMAT_MOBILE_INPUT_BUTTON_CLASS,
  PAGE_FORMAT_USER_ACTION_BUTTON_CLASS,
} from '@/lib/page-format-buttons';

export default function ExternalUsersPage() {
  const isMobile = useIsMobile();
  const { hasPermission } = usePermissions();
  const { tenantId, isLoading: isProfileLoading } = useUserProfile();
  const canCreateUsers = hasPermission('users-create');

  const [users, setUsers] = useState<Array<Personnel | PilotProfile>>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingData(true);
      try {
        const response = await fetch('/api/personnel', { cache: 'no-store' });
        const payload = await response.json();
        if (cancelled) return;

        const allUsers = (payload.personnel ?? []) as Array<Personnel | PilotProfile>;
        setUsers(allUsers);
        setRoles(payload.roles ?? []);
        setDepartments(payload.departments ?? []);
        setOrganizations([]);
      } catch {
        if (!cancelled) {
          setUsers([]);
          setRoles([]);
          setDepartments([]);
          setOrganizations([]);
        }
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const isLoading = isProfileLoading || isLoadingData;

  const externalUsers = useMemo(() => {
    return users.filter(u => u.organizationId && u.organizationId !== 'internal');
  }, [users]);

  const orgMap = useMemo(() => {
    if (!organizations) return new Map();
    return new Map(organizations.map(o => [o.id, o.name]));
  }, [organizations]);

  const rolesMap = useMemo(() => {
    if (!roles) return new Map();
    return new Map(roles.map(r => [r.id, r.name]));
  }, [roles]);

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden">
      <Card className="flex-1 flex flex-col overflow-hidden shadow-none border">
        <MainPageHeader 
          title="External Users"
          actions={
            canCreateUsers && (
              <PersonnelForm 
                tenantId={tenantId || ''} 
                roles={roles || []} 
                departments={departments || []} 
                defaultUserType="External"
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
          ) : (
            <ExternalUsersTable 
              data={externalUsers} 
              orgMap={orgMap} 
              rolesMap={rolesMap}
              tenantId={tenantId || ''} 
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
