'use client';

import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { menuConfig } from '@/lib/menu-config';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';

export default function AssetsPage() {
  const { canAccessMenuItem } = usePermissions();
  const assetsMenu = menuConfig.find((item) => item.href === '/assets');

  if (!assetsMenu || !assetsMenu.subItems) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Assets section not configured.</p>
      </div>
    );
  }

  const visibleSubItems = assetsMenu.subItems.filter((item) => canAccessMenuItem(item, assetsMenu));

  if (visibleSubItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">You do not have access to any asset sections.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto w-full space-y-6 px-1 pt-4">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {visibleSubItems.map((item) => (
          <Link href={item.href} key={item.href}>
            <Card className="hover:bg-muted/50 transition-colors shadow-none border h-full">
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {canAccessMenuItem({ href: '/assets/inspections/templates', label: 'Inspection Templates', description: 'Build reusable inspection checklists for aircraft, vehicles, or any other asset.' } as never, assetsMenu) ? (
        <Link href="/assets/inspections/templates">
          <Card className="hover:bg-muted/50 transition-colors shadow-none border">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Inspection Templates</CardTitle>
                <CardDescription>Build reusable inspection checklists for aircraft, vehicles, or any other asset.</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="shrink-0 border-slate-300">
                Open
              </Button>
            </CardHeader>
          </Card>
        </Link>
      ) : null}
    </div>
  );
}
