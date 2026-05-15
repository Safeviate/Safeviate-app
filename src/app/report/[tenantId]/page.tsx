import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { FileWarning, ShieldAlert, CheckCircle2 } from 'lucide-react';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MainPageHeader } from '@/components/page-header';
import { PrintButton } from './print-button';

const qrPrintSizes = [
  {
    id: 'qr-print-small',
    label: 'Desk',
    description: 'Small mount or placard',
    qrClassName: 'h-[128px] w-[128px]',
    defaultChecked: false,
  },
  {
    id: 'qr-print-medium',
    label: 'Dash',
    description: 'Aircraft or vehicle dashboard',
    qrClassName: 'h-[152px] w-[152px]',
    defaultChecked: true,
  },
  {
    id: 'qr-print-large',
    label: 'Wall',
    description: 'Small wall mount',
    qrClassName: 'h-[184px] w-[184px]',
    defaultChecked: false,
  },
] as const;

type PublicReportLandingProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function PublicQuickReportsLanding({ params }: PublicReportLandingProps) {
  const { tenantId } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });

  if (!tenant) {
    notFound();
  }

  const headerList = await headers();
  const proto = headerList.get('x-forwarded-proto') || 'https';
  const host = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const shareUrl = host ? `${proto}://${host}/report/${encodeURIComponent(tenant.id)}` : `/report/${encodeURIComponent(tenant.id)}`;
  const qrSvg = await QRCode.toString(shareUrl, {
    type: 'svg',
    margin: 1,
    width: 240,
    color: {
      dark: '#171514',
      light: '#ffffff',
    },
  });

  const reportCards = [
    {
      href: `/report/${encodeURIComponent(tenant.id)}/technical-report`,
      title: 'Technical Report',
      description:
        'Capture a preliminary technical report so engineering and management can review, analyze, and assign follow-up actions.',
      icon: FileWarning,
      footerNote: 'Immediate action is logged with the report.',
    },
    {
      href: `/report/${encodeURIComponent(tenant.id)}/safety-report`,
      title: 'Safety Report',
      description:
        'File a preliminary safety report so management can assess the event and route it into the appropriate safety workflow.',
      icon: ShieldAlert,
      footerNote: 'Immediate action is captured before classification.',
    },
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col gap-6 p-4">
      <Card className="flex flex-1 flex-col overflow-hidden border shadow-none">
        <MainPageHeader
          title={`${tenant.name} Quick Reports`}
          description="Use this public portal to submit a quick report without signing in."
        />
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {reportCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.href} className="border shadow-none">
                  <CardHeader className="border-b bg-muted/5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-background">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base font-black uppercase tracking-tight">{card.title}</CardTitle>
                        <CardDescription className="mt-1 text-sm">{card.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Badge variant="outline" className="h-5 px-2 text-[9px] font-black uppercase tracking-widest">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Public Submission Ready
                      </Badge>
                    </div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {card.footerNote}
                    </p>
                    <Button asChild className="w-full">
                      <Link href={card.href}>Open {card.title}</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="overflow-hidden border shadow-none">
            <CardHeader className="border-b bg-muted/5">
              <CardTitle className="text-base font-black uppercase tracking-tight">Share Portal</CardTitle>
              <CardDescription className="mt-1 text-sm">
                Choose a print size, then print or paste this link so people outside the app can scan and submit reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Select a size, then print the QR block
                </p>
                <PrintButton />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">{tenant.name}</p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Quick Reports for small mounts
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {qrPrintSizes.map((size) => (
                  <div key={size.id} className="space-y-3">
                    <input
                      type="radio"
                      id={size.id}
                      name="qr-print-size"
                      defaultChecked={size.defaultChecked}
                      className="peer sr-only"
                    />
                    <label
                      htmlFor={size.id}
                      className="flex cursor-pointer flex-col rounded-xl border bg-background p-3 text-left transition hover:border-primary/60 peer-checked:border-primary peer-checked:bg-primary/5 print:hidden"
                    >
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-foreground">
                        {size.label}
                      </span>
                      <span className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {size.description}
                      </span>
                    </label>
                    <div className="hidden rounded-2xl border bg-white p-4 peer-checked:block">
                      <div className="flex justify-center">
                        <div
                          className={size.qrClassName}
                          aria-label={`${tenant.name} quick reports QR code`}
                          dangerouslySetInnerHTML={{ __html: qrSvg }}
                        />
                      </div>
                      <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                        Print-ready QR preview
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 print:hidden">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Public Link</p>
                <div className="rounded-lg border bg-muted/20 p-3 text-sm font-medium break-all">
                  {shareUrl}
                </div>
              </div>
              <div className="rounded-xl border border-dashed bg-amber-50/60 p-3 print:hidden">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-900">Anonymous Safety Option</p>
                <p className="mt-1 text-sm text-amber-950/90">
                  Safety reports include a submit anonymously choice so external reporters can leave their name and email out if they prefer.
                </p>
              </div>
              <p className="text-xs text-muted-foreground print:hidden">
                Anyone with this link can submit a quick report for {tenant.name} without logging in.
              </p>
              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Powered by Safeviate
              </p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
