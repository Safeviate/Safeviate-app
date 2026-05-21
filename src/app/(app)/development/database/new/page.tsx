import { DatabaseForm } from '../database-form';

type PageProps = {
  searchParams?: Promise<{ tenantId?: string }>;
};

export default async function NewTenantPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const requestedTenantId = params?.tenantId || null;
  const initialTenantId = requestedTenantId && requestedTenantId !== 'safeviate' ? requestedTenantId : null;

  return <DatabaseForm initialTenantId={initialTenantId} returnHref="/development/database" />;
}
