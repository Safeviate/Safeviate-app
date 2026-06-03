import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { QrCode, ScanSearch } from 'lucide-react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { normalizeAircraftRecord } from '@/lib/server/aircraft-normalize';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MainPageHeader } from '@/components/page-header';
import { BackNavButton } from '@/components/back-nav-button';
import { PrintButton } from '@/components/print-button';

type AircraftQrPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AircraftQrPage({ params }: AircraftQrPageProps) {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId?.trim();

  if (!session?.user || !tenantId) {
    redirect('/login');
  }

  const { id } = await params;
  const aircraftRow = await prisma.aircraftRecord.findFirst({
    where: { id, tenantId },
    select: { data: true },
  });

  const aircraft = normalizeAircraftRecord(aircraftRow?.data ?? null);
  if (!aircraft?.id) {
    notFound();
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
  const reportPath = `/report/${encodeURIComponent(tenant.id)}/technical-report?aircraftId=${encodeURIComponent(aircraft.id)}`;
  const shareUrl = host ? `${proto}://${host}${reportPath}` : reportPath;
  const qrSvg = await QRCode.toString(shareUrl, {
    type: 'svg',
    margin: 1,
    width: 240,
    color: {
      dark: '#171514',
      light: '#ffffff',
    },
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col gap-6 p-4 print:max-w-none print:p-0">
      <Card className="overflow-hidden border shadow-none print:border-0 print:shadow-none">
        <MainPageHeader
          title={`${aircraft.tailNumber} QR Code`}
          description="Print this code for the aircraft so preliminary technical reports open with the correct aircraft already selected."
          actions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <BackNavButton href={`/assets/aircraft/${aircraft.id}`} text="Back to Aircraft" />
              <PrintButton label="Print QR Code" />
            </div>
          }
        />

        <CardContent className="grid gap-4 p-4 md:grid-cols-[0.95fr_1.05fr] print:grid-cols-[0.95fr_1.05fr] print:p-3">
          <Card className="overflow-hidden border shadow-none print:break-inside-avoid">
            <CardHeader className="border-b bg-muted/5 text-center">
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-background">
                  <QrCode className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Aircraft-specific QR</p>
                  <CardTitle className="text-base font-black uppercase tracking-tight">Preliminary Technical Report</CardTitle>
                  <CardDescription className="text-sm">
                    Use this code on the aircraft, in the hangar, or on the dispatch card to file preliminary technical reports against the correct airframe.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-center print:p-3">
              <div className="rounded-xl border bg-muted/20 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Aircraft Registration</p>
                <p className="mt-1 text-2xl font-black uppercase tracking-[0.18em] text-foreground">{aircraft.tailNumber}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {aircraft.make} {aircraft.model}
                </p>
              </div>
              <div className="mx-auto flex w-fit flex-col items-center rounded-2xl border bg-white p-4 print:p-2.5">
                <div
                  className="h-[240px] w-[240px] print:h-[180px] print:w-[180px]"
                  aria-label={`${aircraft.tailNumber} technical report QR code`}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="overflow-hidden border shadow-none print:break-inside-avoid">
              <CardHeader className="border-b bg-muted/5">
                <CardTitle className="text-base font-black uppercase tracking-tight">How It Works</CardTitle>
                <CardDescription className="text-sm">
                  Scanning the code opens the public preliminary technical report form with this aircraft already filled in.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                <Badge variant="outline" className="h-5 px-2 text-[9px] font-black uppercase tracking-widest">
                  <ScanSearch className="mr-1 h-3 w-3" />
                  Preselected aircraft
                </Badge>
                <p className="text-sm text-muted-foreground">
                  The QR targets the public preliminary technical report route for {tenant.name}, with the aircraft ID embedded so the reporting form cannot drift onto a different airframe.
                </p>
                <div className="rounded-lg border bg-muted/20 p-3 text-sm font-medium break-all">
                  {shareUrl}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border border-dashed shadow-none print:break-inside-avoid">
              <CardContent className="space-y-2 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-foreground">Recommended placement</p>
                <p className="text-sm text-muted-foreground">
                  Put this on the airframe, tech log, dispatch card, or hangar wall so pilots and engineers file preliminary technical reports against the exact aircraft.
                </p>
                <Button asChild variant="outline" className="w-full print:hidden">
                  <Link href={reportPath}>Open Preliminary Technical Report Link</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
