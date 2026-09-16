import { notFound } from 'next/navigation';
import { isTechnicalReportingEnabledForTenant } from '@/lib/server/tenant-features';
import QuickTechnicalReportPage from '../../../(app)/quick-reports/technical-report/page';

export default async function PublicTechnicalReportPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!(await isTechnicalReportingEnabledForTenant(tenantId))) notFound();
  return <QuickTechnicalReportPage />;
}
