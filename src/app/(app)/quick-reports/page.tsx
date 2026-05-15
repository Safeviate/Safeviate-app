'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MainPageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { FileWarning, ShieldAlert, CheckCircle2, QrCode } from 'lucide-react';

const reportCards = [
  {
    href: '/quick-reports/qr-codes',
    title: 'QR Codes',
    description: 'Print the public safety and technical QR codes for desk mounts, dashboards, and wall mounts.',
    icon: QrCode,
    footerNote: 'Built for small print formats.',
  },
  {
    href: '/quick-reports/technical-report',
    title: 'Technical Report',
    description:
      'Capture a preliminary technical report so engineering and management can review, analyze, and assign follow-up actions.',
    icon: FileWarning,
    footerNote: 'Immediate action is logged with the report.',
  },
  {
    href: '/quick-reports/safety-report',
    title: 'Safety Report',
    description:
      'File a preliminary safety report so management can assess the event and route it into the appropriate safety workflow.',
    icon: ShieldAlert,
    footerNote: 'Immediate action is captured before classification.',
  },
];

export default function QuickReportsPage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col gap-6 p-4">
      <Card className="flex flex-1 flex-col overflow-hidden border shadow-none">
        <MainPageHeader
          title="Quick Reports"
          description="Create a preliminary report quickly, then let management review, analyze, and assign the next steps."
          actions={
            <Button asChild variant="outline">
              <Link href="/quick-reports/qr-codes">Print QR Codes</Link>
            </Button>
          }
        />
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
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
                      Immediate Action Ready
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
        </CardContent>
      </Card>
    </div>
  );
}
