'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MainPageHeader } from '@/components/page-header';
import { FileWarning, ShieldAlert } from 'lucide-react';

const reportCards = [
  {
    href: '/quick-reports/technical-report',
    title: 'Technical Report',
    description:
      'Capture a preliminary technical report so engineering and management can review, analyze, and assign follow-up actions.',
    icon: FileWarning,
  },
  {
    href: '/quick-reports/safety-report',
    title: 'Safety Report',
    description:
      'File a preliminary safety report so management can assess the event and route it into the appropriate safety workflow.',
    icon: ShieldAlert,
  },
];

export default function QuickReportsPage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col gap-6 p-4">
      <Card className="flex flex-1 flex-col overflow-hidden border shadow-none">
        <MainPageHeader
          title="Quick Reports"
          description="Create a preliminary report quickly, then let management review, analyze, and assign the next steps."
        />
        <CardContent className="grid gap-4 p-4 md:grid-cols-2">
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
