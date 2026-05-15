import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import QRCode from 'qrcode';
import { type LucideIcon, ShieldAlert, FileWarning, CheckCircle2 } from 'lucide-react';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MainPageHeader } from '@/components/page-header';
import { PrintButton } from '@/components/print-button';

type QrTarget = {
  title: string;
  placement: string;
  description: string;
  href: string;
  note: string;
  icon: LucideIcon;
};

export default async function QuickReportQrCodesPage() {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId?.trim();

  if (!session?.user || !tenantId) {
    redirect('/login');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });

  if (!tenant) {
    notFound();
  }

  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const proto = headerList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const baseUrl = host ? `${proto}://${host}` : '';

  const qrTargets: QrTarget[] = [
    {
      title: 'Safety Report',
      placement: 'Aircraft Dashboard',
      description: 'Direct link to the public safety quick report form.',
      href: `/report/${encodeURIComponent(tenant.id)}/safety-report`,
      note: 'Use on desk mounts, dashboards, or wall placards.',
      icon: ShieldAlert,
    },
    {
      title: 'Technical Report',
      placement: 'Maintenance Wall Mount',
      description: 'Direct link to the public technical quick report form.',
      href: `/report/${encodeURIComponent(tenant.id)}/technical-report`,
      note: 'Use on maintenance desks, hangars, or vehicle cards.',
      icon: FileWarning,
    },
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

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4 overflow-hidden p-4 print:max-w-none print:overflow-visible print:p-0 print:pb-0">
      <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border shadow-none print:border-0 print:shadow-none">
        <MainPageHeader
          title={`${tenant.name} QR Codes`}
          description="Print the two public quick-report QR codes for this organization. Use the print dialog to scale for desk mounts, dashboards, or wall mounts."
          actions={<PrintButton label="Print QR Codes" className="print:hidden" />}
        />

        <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 print:space-y-3 print:overflow-visible">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/5 p-3 print:hidden">
            <Badge variant="outline" className="h-5 px-2 text-[9px] font-black uppercase tracking-widest">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Print first
            </Badge>
            <p className="text-xs font-medium text-muted-foreground">
              The QR blocks below are the primary content. Keep the scale near 100% when printing for desk mounts, dashboards, or wall mounts.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-3">
          {qrCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="overflow-hidden border shadow-none print:break-inside-avoid print:border">
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
                      className="h-[200px] w-[200px] print:h-[160px] print:w-[160px]"
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
                  <div className="hidden rounded-lg border bg-muted/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] break-all md:block print:hidden">
                    {card.shareUrl}
                  </div>
                  <p className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:block print:hidden">
                    {card.note}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
