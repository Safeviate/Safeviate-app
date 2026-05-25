'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { isHrefEnabledForIndustry } from '@/lib/industry-access';
import { menuConfig } from '@/lib/menu-config';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { Skeleton } from '@/components/ui/skeleton';
import { LayoutGrid } from 'lucide-react';
import { PAGE_FORMAT_PRIMARY_BUTTON_CLASS } from '@/lib/page-format-buttons';

export function VisibilityManager() {
  const { toast } = useToast();
  const { tenant, isLoading: isLoadingTenant } = useTenantConfig();
  const [enabledHrefs, setEnabledHrefs] = useState<Set<string>>(new Set());

  const toIdSuffix = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');

  useEffect(() => {
    if (tenant?.enabledMenus) {
      setEnabledHrefs(new Set(tenant.enabledMenus));
    }
  }, [tenant]);

  const toggleMenu = (href: string, subHrefs?: string[]) => {
    const newEnabled = new Set(enabledHrefs);
    if (newEnabled.has(href)) {
      newEnabled.delete(href);
      subHrefs?.forEach(sh => newEnabled.delete(sh));
    } else {
      newEnabled.add(href);
      subHrefs?.forEach(sh => newEnabled.add(sh));
    }
    setEnabledHrefs(newEnabled);
  };

  const toggleSubMenu = (parentHref: string, href: string) => {
    const newEnabled = new Set(enabledHrefs);
    if (newEnabled.has(href)) {
      newEnabled.delete(href);
    } else {
      newEnabled.add(href);
      newEnabled.add(parentHref);
    }
    setEnabledHrefs(newEnabled);
  };

  const handleSaveModules = async () => {
    try {
        const response = await fetch('/api/tenant-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: { enabledMenus: Array.from(enabledHrefs) } }),
        });
        if (!response.ok) {
          throw new Error('Failed to save module settings.');
        }
        
        toast({ title: 'Module Access Updated', description: 'Sidebar navigation settings have been saved.' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to save module settings.' });
    }
  };

  if (isLoadingTenant) {
    return <div className="space-y-6"><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-10">
      <section className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2 text-foreground">
              <LayoutGrid className="h-4 w-4 text-primary" />
              Module Access Control
            </h3>
            <p className="text-xs text-muted-foreground italic">Select functional modules enabled for the organization sidebar.</p>
          </div>
          <Button onClick={handleSaveModules} className={PAGE_FORMAT_PRIMARY_BUTTON_CLASS}>Apply Changes</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuConfig.map((menu) => {
            const subHrefs = menu.subItems?.map(s => s.href) || [];
            const isEnabled = enabledHrefs.has(menu.href);
            const isIndustryDefault = isHrefEnabledForIndustry(menu.href, tenant?.industry);
            
            return (
              <Card key={menu.href} className="overflow-hidden border shadow-none">
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">{menu.label}</p>
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {menu.subItems?.length || 0} linked pages
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isIndustryDefault && (
                      <span className="rounded-full border bg-background px-2 py-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        Optional
                      </span>
                    )}
                    <Checkbox 
                      id={`mod-${toIdSuffix(menu.href)}`} 
                      checked={isEnabled}
                      onCheckedChange={() => toggleMenu(menu.href, subHrefs)}
                      className="h-5 w-5"
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 px-4 py-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <menu.icon className="h-4 w-4 text-primary opacity-70" />
                    <span>Module enabled in the sidebar</span>
                  </div>
                  {menu.subItems && (
                    <div className="space-y-2 rounded-lg border bg-muted/10 p-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sub Pages</p>
                      <div className="space-y-2 pt-2">
                        {menu.subItems.map((sub) => {
                          const isSubEnabled = enabledHrefs.has(sub.href);
                          const isSubIndustryDefault = isHrefEnabledForIndustry(sub.href, tenant?.industry);
                          return (
                            <div key={sub.href} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                              <div className="min-w-0">
                                <Label htmlFor={`submod-${toIdSuffix(sub.href)}`} className="cursor-pointer text-[11px] font-bold uppercase text-foreground">
                                  {sub.label}
                                </Label>
                                {!isSubIndustryDefault && (
                                  <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                    Optional
                                  </p>
                                )}
                              </div>
                              <Checkbox 
                                id={`submod-${toIdSuffix(sub.href)}`} 
                                checked={isSubEnabled}
                                onCheckedChange={() => toggleSubMenu(menu.href, sub.href)}
                                className="h-4 w-4 shrink-0"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
