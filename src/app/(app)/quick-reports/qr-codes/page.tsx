import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import QRCode from 'qrcode';
import { type LucideIcon, Building2, ShieldAlert, FileWarning, CheckCircle2 } from 'lucide-react';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isMasterTenantEmail, resolveTenantOverride } from '@/lib/server/tenant-access';
import { isTechnicalReportingEnabled } from '@/lib/server/tenant-features';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MainPageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';
import { QrCodePrintMenu } from './qr-code-print-menu';

type QrTarget = {
  title: string;
  placement: string;
  description: string;
  href: string;
  note: string;
  icon: LucideIcon;
  type: 'safety' | 'technical' | 'facility';
};

type QrView = 'overview' | QrTarget['type'];

const QR_VIEW_OPTIONS: Array<{ value: QrView; label: string; description: string; icon: LucideIcon }> = [
  { value: 'overview', label: 'Choose a QR code', description: 'Select the reporting route you want to display or print.', icon: CheckCircle2 },
  { value: 'safety', label: 'Safety reporting', description: 'Public incident and safety reporting.', icon: ShieldAlert },
  { value: 'technical', label: 'Technical reporting', description: 'Aircraft, vehicle, and technical defect reporting.', icon: FileWarning },
  { value: 'facility', label: 'Facility reporting', description: 'Location-locked infrastructure and maintenance reporting.', icon: Building2 },
];

const resolveQrView = (value: string | undefined): QrView =>
  value === 'safety' || value === 'technical' || value === 'facility' ? value : 'overview';

export default async function QuickReportQrCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const requestedView = resolveQrView((await searchParams).view);
  const session = await getServerSession(authOptions);
  const baseTenantId = session?.user?.tenantId?.trim();

  if (!session?.user || !baseTenantId) {
    redirect('/login');
  }

  const headerList = await headers();
  const cookieHeader = headerList.get('cookie') || '';
  const email = session.user.email?.trim().toLowerCase() || '';
  const tenantId = isMasterTenantEmail(email)
    ? await resolveTenantOverride(new Request('https://safeviate.local', { headers: { cookie: cookieHeader } }), email, baseTenantId)
    : baseTenantId;

  const [tenant, configRows] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } }),
    prisma.$queryRawUnsafe<{ data: Record<string, unknown> }[]>('SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1', tenantId),
  ]);

  if (!tenant) {
    notFound();
  }

  const host = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const proto = headerList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const baseUrl = host ? `${proto}://${host}` : '';
  const facilities = Array.isArray(configRows[0]?.data?.facilities) ? configRows[0].data.facilities as Record<string, unknown>[] : [];
  const technicalReportingEnabled = isTechnicalReportingEnabled(configRows[0]?.data);
  const view = !technicalReportingEnabled && requestedView === 'technical' ? 'overview' : requestedView;
  const viewOptions = QR_VIEW_OPTIONS.filter((option) => technicalReportingEnabled || option.value !== 'technical');

  const qrTargets: QrTarget[] = [
    {
      title: 'Safety Report',
      placement: 'Aircraft Dashboard',
      description: 'Direct link to the public safety quick report form.',
      href: `/report/${encodeURIComponent(tenant.id)}/safety-report`,
      note: 'Use on desk mounts, dashboards, or wall placards.',
      icon: ShieldAlert,
      type: 'safety',
    },
    ...(technicalReportingEnabled ? [{
      title: 'Technical Report',
      placement: 'Maintenance Wall Mount',
      description: 'Direct link to the public technical quick report form.',
      href: `/report/${encodeURIComponent(tenant.id)}/technical-report`,
      note: 'Use on maintenance desks, hangars, or vehicle cards.',
      icon: FileWarning,
      type: 'technical',
    } satisfies QrTarget] : []),
    ...facilities.filter((facility) => typeof facility.id === 'string' && typeof facility.name === 'string').map((facility) => ({
      title: `${facility.name} Facility Report`,
      placement: 'Facility, apron, workshop, or equipment area',
      description: 'Direct link to the public facility maintenance report form, locked to this location.',
      href: `/report/${encodeURIComponent(tenant.id)}/facility/${encodeURIComponent(facility.id as string)}`,
      note: 'Use at the facility where people need to report infrastructure defects.',
      icon: Building2,
      type: 'facility' as const,
    })),
  ];

  const qrCards = await Promise.all(
    qrTargets.map(async (target) => ({
      ...target,
      shareUrl: baseUrl ? `${baseUrl}${target.href}` : target.href,
      qrSvg: await QRCode.toString(baseUrl ? `${baseUrl}${target.href}` : target.href, {
        type: 'svg',
        margin: 1,
        width: 200,
        color: {
          dark: '#171514',
          light: '#ffffff',
        },
      }),
    }))
  );
  const visibleCards = view === 'overview' ? [] : qrCards.filter((card) => card.type === view);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4 overflow-hidden p-4 print:max-w-none print:overflow-visible print:p-0 print:pb-0">
      <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border shadow-none print:border-0 print:shadow-none">
        <MainPageHeader
          title={`${tenant.name} QR Codes`}
          description="Choose a reporting route, then display or print only the QR codes relevant to that purpose."
          actions={view === 'overview' ? null : <QrCodePrintMenu technicalReportingEnabled={technicalReportingEnabled} />}
        />

        <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 print:space-y-3 print:overflow-visible">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
            {viewOptions.map((option) => {
              const Icon = option.icon;
              const isActive = option.value === view;
              return (
                <Link
                  key={option.value}
                  href={option.value === 'overview' ? '/quick-reports/qr-codes' : `/quick-reports/qr-codes?view=${option.value}`}
                  className={cn(
                    'rounded-xl border p-3 transition-colors hover:bg-muted/50',
                    isActive ? 'border-primary bg-primary/5' : 'bg-background',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{option.label}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{option.description}</p>
                </Link>
              );
            })}
          </div>

          <style>{`@media print {
            html[data-qr-print-target="safety"] [data-qr-type="technical"],
            html[data-qr-print-target="technical"] [data-qr-type="safety"],
            html[data-qr-print-target="safety"] [data-qr-type="facility"],
            html[data-qr-print-target="technical"] [data-qr-type="facility"] {
              display: none !important;
            }

            html[data-qr-print-target="facility"] [data-qr-type="safety"],
            html[data-qr-print-target="facility"] [data-qr-type="technical"] {
              display: none !important;
            }

            html[data-qr-print-target="safety"] .qr-code-print-grid,
            html[data-qr-print-target="technical"] .qr-code-print-grid {
              grid-template-columns: minmax(0, 420px) !important;
              justify-content: center;
            }

            html[data-qr-print-target="safety"] .qr-code-print-card,
            html[data-qr-print-target="technical"] .qr-code-print-card {
              width: 420px;
            }

            html[data-qr-print-target="safety"] .qr-code-image,
            html[data-qr-print-target="technical"] .qr-code-image {
              height: 200px !important;
              width: 200px !important;
            }

            .qr-code-share-url,
            .qr-code-placement-note {
              display: block !important;
            }
          }`}</style>
          {view === 'overview' ? (
            <div className="rounded-xl border border-dashed bg-muted/5 px-6 py-14 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
              <h2 className="mt-4 text-sm font-black uppercase tracking-widest">Select a reporting route</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                Safety, technical, and facility reports have different operational destinations. Display one category at a time to avoid placing the wrong code at a reporting point.
              </p>
            </div>
          ) : visibleCards.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/5 px-6 py-14 text-center">
              <Building2 className="mx-auto h-8 w-8 text-primary" />
              <h2 className="mt-4 text-sm font-black uppercase tracking-widest">No facilities yet</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                Add an airport, heliport, base, or workshop in Facilities to generate its location-locked facility maintenance QR code.
              </p>
            </div>
          ) : (
          <div className="qr-code-print-grid grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-3">
          {qrCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.href}
                data-qr-type={card.type}
                className={cn(
                  'qr-code-print-card overflow-hidden border shadow-none print:break-inside-avoid print:border',
                  card.type === view ? '' : 'hidden print:block',
                )}
              >
                <CardHeader className="border-b bg-muted/5 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-background">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        {card.placement}
                      </p>
                      <CardTitle className="text-base font-black uppercase tracking-tight">{card.title}</CardTitle>
                      <CardDescription className="mt-1 text-sm">{card.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-4 text-center print:p-3">
                  <div className="mx-auto flex w-fit flex-col items-center rounded-2xl border bg-white p-4 print:p-2.5">
                    <div
                      className="qr-code-image h-[200px] w-[200px] print:h-[160px] print:w-[160px]"
                      aria-label={`${tenant.name} ${card.title} QR code`}
                      dangerouslySetInnerHTML={{ __html: card.qrSvg }}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">
                      {tenant.name}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Powered by Safeviate
                    </p>
                  </div>
                  <div className="qr-code-share-url hidden rounded-lg border bg-muted/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] break-all md:block print:hidden">
                    {card.shareUrl}
                  </div>
                  <p className="qr-code-placement-note hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:block print:hidden">
                    {card.note}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
