'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MainPageHeader } from '@/components/page-header';
import { usePermissions } from '@/hooks/use-permissions';
import { menuConfig } from '@/lib/menu-config';
import { cn } from '@/lib/utils';
import { LayoutDashboard, ShieldAlert } from 'lucide-react';

type FocusCard = {
  group: string;
  href: string;
  label: string;
  description: string | undefined;
};

const FOCUS_MODULES = [
  {
    title: 'Dashboards',
    items: ['/dashboard', '/my-dashboard'],
  },
  {
    title: 'Safety',
    items: ['/safety', '/safety/risk-register', '/safety/safety-reports'],
  },
  {
    title: 'Quality',
    items: ['/quality', '/quality/audits', '/quality/coherence-matrix', '/quality/task-tracker'],
  },
  {
    title: 'Support',
    items: ['/users', '/admin', '/operations/alerts', '/operations/company-documents', '/operations/emergency-response', '/development/database'],
  },
];

export default function SafetyQualityPage() {
  const { canAccessMenuItem } = usePermissions();
  const focusMenu = menuConfig.find((item) => item.href === '/safety-quality');

  const cards = FOCUS_MODULES.reduce<FocusCard[]>((acc, group) => {
    group.items.forEach((href) => {
      const menuItem = menuConfig.find((item) => item.href === href) || focusMenu?.subItems?.find((sub) => sub.href === href);
      if (!menuItem) return;
      if (!canAccessMenuItem(menuItem, focusMenu)) return;
      acc.push({
        group: group.title,
        href,
        label: menuItem.label,
        description: 'description' in menuItem ? menuItem.description : undefined,
      });
    });
    return acc;
  }, []);

  const groupedCards = FOCUS_MODULES.map((group) => ({
    ...group,
    cards: cards.filter((card) => card.group === group.title),
  }));

  return (
    <div className="mx-auto w-full max-w-[1200px] flex flex-col gap-6 px-1 pt-4">
      <MainPageHeader
        title="Safety & Quality"
        description="Focused entry point for the dashboards, safety, quality, users, admin, and the support modules that keep them moving."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border shadow-none lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-muted/10 px-4 py-3">
            <div className="space-y-1">
              <CardTitle className="text-sm font-black uppercase tracking-tight">Module Focus</CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                This landing page keeps the tenant centered on safety, quality, and the support paths those teams depend on.
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
              <ShieldAlert className="mr-2 h-3.5 w-3.5" />
              Focused
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {groupedCards.map((group) => (
              <div key={group.title} className="space-y-3 rounded-2xl border bg-background p-4">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-primary" />
                  <p className="text-xs font-black uppercase tracking-widest text-foreground">{group.title}</p>
                </div>
                <div className="space-y-2">
                  {group.cards.map((card) => (
                    <Link key={card.href} href={card.href}>
                      <div className={cn('rounded-xl border px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/5')}>
                        <p className="text-[10px] font-black uppercase tracking-tight text-foreground">{card.label}</p>
                        {card.description ? (
                          <p className="mt-1 text-[10px] font-medium leading-5 text-muted-foreground">{card.description}</p>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
