'use client';

import { usePathname, useRouter } from 'next/navigation';
import { menuConfig } from '@/lib/menu-config';
import type { MenuItem, SubMenuItem } from '@/lib/menu-config';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Bell, Search, ChevronDown, LogOut, ArrowRightLeft, Check, AlertTriangle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUserProfile } from '@/hooks/use-user-profile';
import React, { useState, useEffect, useMemo } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { MASTER_TENANT_EMAILS, MASTER_TENANT_ID, TENANT_OVERRIDE_COOKIE } from '@/lib/tenant-constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { Tenant } from '@/types/quality';
import type { TechnicalQuickReport } from '@/types/quick-reports';
import Link from 'next/link';

const findCurrentItem = (
  items: (MenuItem | SubMenuItem)[],
  pathname: string
): MenuItem | SubMenuItem | undefined => {
  for (const item of items) {
    if (pathname.startsWith(item.href)) {
      if ('subItems' in item && item.subItems) {
        const subItem = findCurrentItem(item.subItems, pathname);
        if (subItem) return subItem;
      }
      if (item.href !== '/' && pathname.includes(item.href)) {
         return item;
      }
    }
  }
  return undefined;
};

const getTitle = (pathname: string): string => {
  const allMenuItems = menuConfig;
  const currentItem = findCurrentItem(allMenuItems, pathname);

  if (currentItem && !('subItems' in currentItem && currentItem.subItems)) {
    return currentItem.label;
  }
  
  if (currentItem && 'subItems' in currentItem && currentItem.subItems) {
     const subItem = findCurrentItem(currentItem.subItems, pathname);
     if (subItem) {
       return subItem.label
     }
  }

  const topLevelItem = allMenuItems.find(item => item.href === pathname);
  if (topLevelItem) {
    return topLevelItem.label;
  }

  return '';
};

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, tenant, tenantId } = useUserProfile();
  const { data: session } = useSession();
  const currentPathname = pathname ?? '';
  const title = getTitle(currentPathname);
  const [headerOpacity, setHeaderOpacity] = useState(0.8);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [capNotifications, setCapNotifications] = useState<Array<{
    id: string;
    title: string;
    detail: string;
    dueDate: string;
    severity: 'overdue' | 'due-soon';
  }>>([]);
  const [technicalReportNotifications, setTechnicalReportNotifications] = useState<Array<{
    id: string;
    title: string;
    detail: string;
    reportDate: string;
    aircraftId: string;
    aircraftLabel: string;
    severity: 'open' | 'closed';
  }>>([]);
  type CapNotification = {
    id: string;
    title: string;
    detail: string;
    dueDate: string;
    severity: 'overdue' | 'due-soon';
  };
  const userDisplayName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'User';
  const userFallback = userDisplayName.charAt(0).toUpperCase();
  const tenantLabel = tenant?.name?.trim() || tenantId || 'Safeviate';
  const betaNotice = 'Beta: features and workflows may change.';
  const canSwitchTenants = MASTER_TENANT_EMAILS.includes((userProfile?.email || '').trim().toLowerCase());
  const isViewingOverrideTenant = canSwitchTenants && tenantId !== MASTER_TENANT_ID;

  useEffect(() => {
    const handleOpacityUpdate = () => {
      const saved = localStorage.getItem('safeviate-header-opacity');
      if (saved) setHeaderOpacity(parseFloat(saved));
    };

    window.addEventListener('safeviate-header-opacity-updated', handleOpacityUpdate);
    window.addEventListener('storage', handleOpacityUpdate);
    
    // Initial load
    handleOpacityUpdate();

    return () => {
      window.removeEventListener('safeviate-header-opacity-updated', handleOpacityUpdate);
      window.removeEventListener('storage', handleOpacityUpdate);
    };
  }, []);

  useEffect(() => {
    if (!canSwitchTenants) return;

    let cancelled = false;
    const loadTenants = async () => {
      try {
        const response = await fetch('/api/tenants', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ tenants: [] }));
        if (!cancelled) {
          const rows = Array.isArray(payload?.tenants) ? (payload.tenants as Tenant[]) : [];
          const sorted = [...rows].sort((a: Tenant, b: Tenant) => {
            if (a.id === MASTER_TENANT_ID) return -1;
            if (b.id === MASTER_TENANT_ID) return 1;
            return a.name.localeCompare(b.name);
          });
          setTenants(sorted);
        }
      } catch {
        if (!cancelled) {
          setTenants([]);
        }
      }
    };

    void loadTenants();
    window.addEventListener('safeviate-tenants-updated', loadTenants);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-tenants-updated', loadTenants);
    };
  }, [canSwitchTenants]);

  useEffect(() => {
    let cancelled = false;

    const loadNotifications = async () => {
      try {
        const response = await fetch('/api/dashboard-summary', { cache: 'no-store' });
        const payload = response.ok ? await response.json().catch(() => ({})) : {};
        const now = new Date();
        const dueSoonCutoff = new Date(now);
        dueSoonCutoff.setDate(now.getDate() + 30);
        const caps = Array.isArray(payload?.caps) ? payload.caps : [];
        const technicalReports = Array.isArray(payload?.technicalReports)
          ? (payload.technicalReports as TechnicalQuickReport[])
          : [];

        const notifications = caps.flatMap((cap: any) => {
          const activeActions = Array.isArray(cap?.actions)
            ? cap.actions.filter((action: any) => action?.status !== 'Closed' && action?.status !== 'Cancelled')
            : [];

          return activeActions.flatMap((action: any) => {
            const dueDate = new Date(action?.deadline || cap?.updatedAt || cap?.createdAt || now.toISOString());
            if (Number.isNaN(dueDate.getTime())) return [];
            const severity = dueDate < now ? 'overdue' : dueDate <= dueSoonCutoff ? 'due-soon' : null;
            if (!severity) return [];

            return [{
              id: `${cap?.id || 'cap'}:${action?.id || 'action'}`,
              title: action?.description || cap?.rootCauseAnalysis || 'Corrective action',
              detail: dueDate < now ? 'Overdue CAP action' : 'Due soon CAP action',
              dueDate: dueDate.toISOString(),
              severity,
            }];
          });
        });

        const reportNotifications = technicalReports
          .filter((report) => (report.status || 'Open') !== 'Closed')
          .sort((left, right) => `${right.eventDate}T${right.eventTime}`.localeCompare(`${left.eventDate}T${left.eventTime}`))
          .slice(0, 5)
          .map((report) => ({
            id: report.id,
            title: report.title || report.summary,
            detail: report.location || 'Unknown location',
            reportDate: `${report.eventDate}T${report.eventTime}`,
            aircraftId: report.aircraftId || '',
            aircraftLabel: report.aircraftLabel || 'Aircraft not set',
            severity: 'open' as const,
          }));

        if (!cancelled) {
          setCapNotifications(
            notifications
              .sort((a: CapNotification, b: CapNotification) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
              .slice(0, 5)
          );
          setTechnicalReportNotifications(reportNotifications);
        }
      } catch {
        if (!cancelled) {
          setCapNotifications([]);
          setTechnicalReportNotifications([]);
        }
      }
    };

    void loadNotifications();
    window.addEventListener('safeviate-quality-updated', loadNotifications);
    window.addEventListener('safeviate-technical-reports-updated', loadNotifications);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'safeviate-technical-reports-updated') {
        void loadNotifications();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-quality-updated', loadNotifications);
      window.removeEventListener('safeviate-technical-reports-updated', loadNotifications);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const capAlertCount = useMemo(() => capNotifications.length, [capNotifications]);
  const technicalReportAlertCount = useMemo(
    () => technicalReportNotifications.length,
    [technicalReportNotifications]
  );
  const notificationCount = capAlertCount + technicalReportAlertCount;

  const handleSignOut = () => {
    void signOut({ callbackUrl: '/login' });
  };
  const handleReturnToSafeviate = () => {
    if (typeof window === 'undefined') return;

    window.localStorage.removeItem('safeviate:selected-tenant');
    window.document.cookie = `${TENANT_OVERRIDE_COOKIE}=${MASTER_TENANT_ID}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.dispatchEvent(new CustomEvent('safeviate-tenant-switch', {
      detail: {
        tenantId: MASTER_TENANT_ID,
        tenantName: 'Safeviate',
      },
    }));
    router.refresh();
  };

  const handleSwitchTenant = (nextTenant: Tenant) => {
    if (typeof window === 'undefined') return;
    if (nextTenant.id === MASTER_TENANT_ID) {
      handleReturnToSafeviate();
      return;
    }

    window.localStorage.setItem('safeviate:selected-tenant', nextTenant.id);
    window.document.cookie = `${TENANT_OVERRIDE_COOKIE}=${encodeURIComponent(nextTenant.id)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.dispatchEvent(new CustomEvent('safeviate-tenant-switch', {
      detail: {
        tenantId: nextTenant.id,
        tenantName: nextTenant.name,
      },
    }));
    router.refresh();
  };

  return (
    <header 
      style={{ '--header-opacity': headerOpacity } as React.CSSProperties}
      className="app-topbar fixed inset-x-0 top-0 z-50 flex h-[36px] min-w-0 items-center justify-between gap-2 border-b border-white/5 bg-header pr-3 text-header-foreground shadow-[inset_0_-1px_0_rgba(255,255,255,0.03)] sm:pr-4"
    >
      <div className="flex min-w-0 items-center h-full">
        <div className="flex h-full w-auto shrink-0 items-center gap-2 px-4 sm:w-[--sidebar-width] md:px-4">
           <SidebarTrigger className="-ml-1 h-7 w-7 sm:hidden text-header-foreground" />
           <span className="app-sidebar-brand-label truncate font-headline text-[15px] font-semibold tracking-[-0.01em]">{tenantLabel}</span>
        </div>
        <div className="hidden h-full w-px bg-white/10 sm:block"></div>
        <div className="flex min-w-0 items-center gap-2 px-3">
        {title && (
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] uppercase opacity-90 sm:text-[16px]">{title}</h1>
        )}
        <Badge
          variant="secondary"
          className="inline-flex max-w-[18rem] shrink-0 border border-amber-500/20 bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-100 shadow-none"
          title={betaNotice}
        >
          <span className="lg:hidden">Beta</span>
          <span className="hidden lg:inline">{betaNotice}</span>
        </Badge>
      </div>
    </div>

      <div className="app-topbar-actions flex items-center gap-1">
        <Button variant="ghost" size="icon" className="app-topbar-icon hidden h-8 w-8 md:inline-flex">
          <Search className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="app-topbar-icon relative h-8 w-8">
              <Bell className="h-4 w-4" />
              {notificationCount > 0 ? (
                <Badge className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full border-0 bg-amber-500 px-1 text-[8px] font-black text-white">
                  {notificationCount}
                </Badge>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="end"
            className="w-80 rounded-2xl border border-sidebar-border/70 bg-sidebar shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
          >
            <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/70">
              Notifications
            </DropdownMenuLabel>
            <DropdownMenuLabel className="text-[10px] font-semibold text-sidebar-foreground/80">
              {notificationCount > 0
                ? `${notificationCount} item${notificationCount === 1 ? '' : 's'} need attention`
                : 'No overdue actions or open preliminary technical reports'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {capNotifications.length > 0 ? (
              capNotifications.map((item) => (
                <DropdownMenuItem key={item.id} asChild>
                  <Link href="/quality/task-tracker" className="flex items-start gap-3">
                    <AlertTriangle className={item.severity === 'overdue' ? 'mt-0.5 h-4 w-4 text-red-500' : 'mt-0.5 h-4 w-4 text-amber-500'} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-sidebar-foreground">{item.title}</span>
                      <span className="block text-[10px] uppercase tracking-widest text-sidebar-foreground/55">
                        {item.detail} · {new Date(item.dueDate).toLocaleDateString()}
                      </span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-3 py-4 text-sm text-sidebar-foreground/60">Nothing urgent right now.</div>
            )}
            {technicalReportNotifications.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/70">
                  Preliminary Technical Reports
                </DropdownMenuLabel>
                {technicalReportNotifications.map((item) => (
                  <DropdownMenuItem key={item.id} asChild>
                    <Link
                      href={item.aircraftId ? `/assets/aircraft/${item.aircraftId}#technical-report-notifications` : '/dashboard'}
                      className="flex items-start gap-3"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-sky-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-sidebar-foreground">{item.aircraftLabel}</span>
                        <span className="block truncate text-[10px] uppercase tracking-widest text-sidebar-foreground/75">
                          {item.title}
                        </span>
                        <span className="block text-[10px] uppercase tracking-widest text-sidebar-foreground/55">
                          {item.detail} · {new Date(item.reportDate).toLocaleDateString()}
                        </span>
                        <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-sky-500">
                          Open preliminary technical report
                        </span>
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/quality/task-tracker">Open Task Tracker</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="app-topbar-profile flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-white/[0.1]"
            >
              <Avatar className="h-6 w-6 ring-1 ring-white/10">
                <AvatarImage
                  src={`https://picsum.photos/seed/${userDisplayName}/64/64`}
                  alt={`${userDisplayName} profile avatar`}
                />
                <AvatarFallback>{userFallback}</AvatarFallback>
              </Avatar>
              <div className="hidden max-w-[9rem] flex-col items-start leading-none md:flex">
                <span className="truncate text-[11px] font-semibold text-header-foreground/95">
                  {userDisplayName}
                </span>
                <span className="truncate text-[9px] text-header-foreground/65">
                  {session?.user?.email ?? 'Signed in'}
                </span>
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 opacity-60 md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="end"
            className="w-56 rounded-2xl border border-sidebar-border/70 bg-sidebar shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
          >
            <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/70">
              My Account
            </DropdownMenuLabel>
            <DropdownMenuLabel className="text-[10px] font-semibold text-sidebar-foreground/80">
              Active Company: {tenantLabel}
            </DropdownMenuLabel>
            {canSwitchTenants ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/70">
                  Switch Tenant
                </DropdownMenuLabel>
                {tenants.map((tenantOption) => {
                  const isActiveTenant = (tenantOption.id || '').trim() === (tenantId || MASTER_TENANT_ID).trim();
                  return (
                    <DropdownMenuItem
                      key={tenantOption.id}
                      onClick={() => handleSwitchTenant(tenantOption)}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate">{tenantOption.name}</div>
                        <div className="truncate text-[9px] uppercase tracking-widest text-sidebar-foreground/45">
                          {tenantOption.id}
                        </div>
                      </div>
                      {isActiveTenant ? <Check className="h-4 w-4 shrink-0" /> : null}
                    </DropdownMenuItem>
                  );
                })}
              </>
            ) : null}
            {isViewingOverrideTenant ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleReturnToSafeviate}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  <span>Return to Safeviate</span>
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[9px] font-mono uppercase tracking-tighter text-sidebar-foreground/45">
              Project: Vercel
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
