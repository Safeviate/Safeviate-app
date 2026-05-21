import { DatabaseForm } from '../database-form';

type PageProps = {
  searchParams?: Promise<{ tenantId?: string }>;
};

export default async function NewTenantPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  return <DatabaseForm initialTenantId={params?.tenantId || null} returnHref="/development/database" />;
}
