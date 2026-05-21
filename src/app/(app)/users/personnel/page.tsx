'use client';

import { useSearchParams } from 'next/navigation';
import { PersonnelDirectoryPage } from './personnel-directory-page';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

export type {
  Personnel,
  PilotProfile,
  UserAccessOverrides,
} from './personnel-directory-page';

export default function UsersPersonnelPage() {
  const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/users/personnel' });
  const searchParams = useSearchParams();
  const selectedDepartmentId = searchParams?.get('department') ?? null;
  const selectedRoleId = searchParams?.get('role') ?? null;

  if (!isLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return (
    <PersonnelDirectoryPage
      title="All Users"
      selectedDepartmentId={selectedDepartmentId}
      selectedRoleId={selectedRoleId}
    />
  );
}
