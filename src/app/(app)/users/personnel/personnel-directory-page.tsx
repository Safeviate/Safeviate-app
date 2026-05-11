'use client';

import { useEffect, useMemo, useState } from 'react';
import { PersonnelForm } from './personnel-form';
import { Card, CardContent } from '@/components/ui/card';
import type { Role } from '../../admin/roles/page';
import type { Department } from '../../admin/department/page';
import { PersonnelTable } from './personnel-table';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { ChevronDown, PlusCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { HEADER_ACTION_BUTTON_CLASS, HEADER_MOBILE_ACTION_BUTTON_CLASS, MainPageHeader } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserProfile } from '@/hooks/use-user-profile';
import type { ExternalOrganization } from '@/types/quality';

export type UserAccessOverrides = {
  hiddenMenus?: string[];
  hiddenTabs?: string[];
};

export type InstructorAssignmentRecord = {
  instructorId: string | null;
  changedAt: string;
  effectiveDate?: string | null;
  changedByEmail?: string | null;
};

export type PilotProfile = {
  id: string;
  userType: 'Student' | 'Private Pilot' | 'Instructor';
  canBeInstructor?: boolean;
  canBeStudent?: boolean;
  canBePIC?: boolean;
  primaryInstructorId?: string | null;
  instructorAssignmentHistory?: InstructorAssignmentRecord[];
  userNumber?: string;
  firstName: string;
  lastName: string;
  email: string;
  suspendedAt?: string | null;
  role: string;
  department?: string;
  organizationId?: string | null;
  permissions?: string[];
  accessOverrides?: UserAccessOverrides;
  contactNumber?: string;
  dateOfBirth?: string;
  logbookTemplateId?: string;
  isErpIncerfaContact?: boolean;
  isErpAlerfaContact?: boolean;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
  documents?: {
    name: string;
    url: string;
    uploadDate: string;
    expirationDate?: string | null;
  }[];
  pilotLicense?: {
    licenseNumber?: string;
    issueDate?: string;
    expirationDate?: string;
    ratings?: string[];
    endorsements?: string[];
  };
};

export type Personnel = {
  id: string;
  userType: 'Personnel' | 'External';
  canBeInstructor?: boolean;
  canBeStudent?: boolean;
  canBePIC?: boolean;
  primaryInstructorId?: string | null;
  instructorAssignmentHistory?: InstructorAssignmentRecord[];
  userNumber?: string;
  firstName: string;
  lastName: string;
  email: string;
  suspendedAt?: string | null;
  contactNumber?: string;
  organizationId?: string | null;
  department?: string;
  role: string;
  permissions: string[];
  accessOverrides?: UserAccessOverrides;
  dateOfBirth?: string;
  isErpIncerfaContact?: boolean;
  isErpAlerfaContact?: boolean;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
  documents?: {
    name: string;
    url: string;
    uploadDate: string;
    expirationDate?: string | null;
  }[];
};

type PersonnelDirectoryPageProps = {
  selectedDepartmentId?: string | null;
  selectedRoleId?: string | null;
  selectedUserType?: string | null;
  externalOnly?: boolean;
  title?: string;
  description?: string;
  defaultDepartmentId?: string | null;
  defaultRoleId?: string | null;
};

export function PersonnelDirectoryPage({
  selectedDepartmentId = null,
  selectedRoleId = null,
  selectedUserType = null,
  externalOnly = false,
  title = 'Users Directory',
  description,
  defaultDepartmentId = null,
  defaultRoleId = null,
}: PersonnelDirectoryPageProps) {
  const isMobile = useIsMobile();
  const { hasPermission } = usePermissions();
  const { tenantId, isLoading: isProfileLoading } = useUserProfile();
  const canCreateUsers = hasPermission('users-create');
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingData(true);
      try {
        const [usersResponse, rolesResponse, departmentsResponse] = await Promise.all([
          fetch('/api/users', { cache: 'no-store' }),
          fetch('/api/roles', { cache: 'no-store' }),
          fetch('/api/departments', { cache: 'no-store' }),
        ]);
        const [usersPayload, rolesPayload, departmentsPayload] = await Promise.all([
          usersResponse.json().catch(() => ({})),
          rolesResponse.json().catch(() => ({})),
          departmentsResponse.json().catch(() => ({})),
        ]);
        if (!cancelled) {
          setPersonnel(usersPayload.users ?? usersPayload.personnel ?? []);
          const apiRoles = Array.isArray(rolesPayload.roles) ? rolesPayload.roles : [];
          const apiDepartments = Array.isArray(departmentsPayload.departments) ? departmentsPayload.departments : [];
          setRoles(apiRoles);
          setDepartments(apiDepartments);
          setExternalOrgs([]);
          setDataError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setDataError(error instanceof Error ? error : new Error('Failed to load user data.'));
        }
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    };

    void load();
    const handlePersonnelUpdated = () => {
      void load();
    };
    window.addEventListener('safeviate-personnel-updated', handlePersonnelUpdated);
    window.addEventListener('safeviate-users-updated', handlePersonnelUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-personnel-updated', handlePersonnelUpdated);
      window.removeEventListener('safeviate-users-updated', handlePersonnelUpdated);
    };
  }, [tenantId]);

  const rolesMap = useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles]);
  const departmentsMap = useMemo(() => new Map(departments.map((dept) => [dept.id, dept.name])), [departments]);
  const isLoading = isProfileLoading || isLoadingData;
  const error = dataError;
  const normalizedSelectedRole = (selectedRoleId || '').trim().toLowerCase();
  const normalizedSelectedDepartment = (selectedDepartmentId || '').trim().toLowerCase();
  const isAdminAlias = normalizedSelectedRole === 'admin' || normalizedSelectedRole === 'administrator';
  const isTrainingAlias = normalizedSelectedDepartment === 'training';

  const filteredPersonnel = useMemo(() => {
    let result = [...personnel];

    if (externalOnly) {
      result = result.filter(u => u.organizationId && u.organizationId !== 'internal');
    }

    if (selectedUserType) {
      result = result.filter(u => u.userType === selectedUserType);
    }

    if (selectedDepartmentId) {
      const departmentMatch = departments.find(
        (department) =>
          department.id === selectedDepartmentId ||
          department.name.toLowerCase() === normalizedSelectedDepartment ||
          (isTrainingAlias && department.name.toLowerCase().includes('training'))
      );
      if (departmentMatch) {
         result = result.filter(
            (person) =>
              person.department === departmentMatch.id ||
              person.department?.toLowerCase() === departmentMatch.name.toLowerCase() ||
              (isTrainingAlias && (person.department || '').toLowerCase().includes('training'))
          );
      }
    }

    if (selectedRoleId) {
      const roleMatch = roles.find(
        (role) =>
          role.id === selectedRoleId ||
          role.name.toLowerCase() === normalizedSelectedRole ||
          (isAdminAlias && role.name.toLowerCase().includes('admin'))
      );
      if (roleMatch) {
        result = result.filter(
          (person) =>
            person.role === roleMatch.id ||
            person.role.toLowerCase() === roleMatch.name.toLowerCase() ||
            (isAdminAlias && person.role.toLowerCase().includes('admin'))
        );
      }
    }

    return result;
  }, [
    personnel,
    departments,
    roles,
    selectedRoleId,
    selectedDepartmentId,
    selectedUserType,
    externalOnly,
    normalizedSelectedRole,
    normalizedSelectedDepartment,
    isAdminAlias,
    isTrainingAlias,
  ]);

  const selectedRoleName = selectedRoleId
    ? rolesMap.get(selectedRoleId) ||
      roles.find(
        (role) =>
          role.name.toLowerCase() === normalizedSelectedRole ||
          (isAdminAlias && role.name.toLowerCase().includes('admin'))
      )?.name ||
      selectedRoleId
    : null;

  const selectedDepartmentName = selectedDepartmentId
    ? departmentsMap.get(selectedDepartmentId) ||
      departments.find(
        (department) =>
          department.name.toLowerCase() === normalizedSelectedDepartment ||
          (isTrainingAlias && department.name.toLowerCase().includes('training'))
      )?.name ||
      selectedDepartmentId
    : null;

  const pageDescription =
    description ||
    (selectedDepartmentName
      ? `Showing users assigned to department: ${selectedDepartmentName}`
      : selectedRoleName
        ? `Showing users assigned to role: ${selectedRoleName}`
        : 'Manage all users in your organization.');

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden">
      <Card className="flex-1 flex flex-col overflow-hidden shadow-none border">
        <MainPageHeader
          title={title}
          description={pageDescription}
          actions={
            <PersonnelForm
              tenantId={tenantId || ''}
              roles={roles || []}
              departments={departments || []}
              externalOrganizations={externalOrgs || []}
              defaultDepartmentId={defaultDepartmentId}
              defaultRoleId={defaultRoleId}
              trigger={
                <Button
                  disabled={!canCreateUsers || isProfileLoading}
                  variant={isMobile ? 'outline' : 'default'}
                  size={isMobile ? 'sm' : 'default'}
                  className={isMobile ? HEADER_MOBILE_ACTION_BUTTON_CLASS : `w-full sm:w-auto ${HEADER_ACTION_BUTTON_CLASS}`}
                >
                  <span className="flex items-center gap-2">
                    <PlusCircle className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                    Add User
                  </span>
                  {isMobile ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                </Button>
              }
            />
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
            <PersonnelTable
              data={filteredPersonnel}
              rolesMap={rolesMap}
              departmentsMap={departmentsMap}
              tenantId={tenantId || ''}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
