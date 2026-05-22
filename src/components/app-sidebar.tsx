'use client';
import {
  Sidebar,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
  SidebarCollapsible,
  SidebarCollapsibleTrigger,
  SidebarCollapsibleContent,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMobile,
  SidebarMobileContent,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { ChevronDown } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  menuConfig,
  type SubMenuItem,
} from '@/lib/menu-config';
import type { Role } from '@/app/(app)/admin/roles/page';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { useTheme } from '@/components/theme-provider';
import { getOrSetClientApiCache, invalidateClientApiCache } from '@/lib/client/api-cache';

const USERS_STATIC_SUB_ITEMS: SubMenuItem[] = [
  { href: '/users/personnel', label: 'All Users', permissionId: 'users-view' },
  { href: '/users/attendance', label: 'Attendance', permissionId: 'users-view' },
];
const ROLES_SUBMENU_CACHE_TTL_MS = 5 * 60_000;

let lastSubmenuByParentMemory: Record<string, string> = {};

const getLastSubmenuByParent = (): Record<string, string> => {
    return lastSubmenuByParentMemory;
};

const buildInitialOpenParents = (pathname: string) =>
  menuConfig.reduce<Record<string, boolean>>((acc, item) => {
    if (!item.subItems?.length) return acc;
    acc[item.href] = pathname.startsWith(item.href) && pathname !== item.href;
    return acc;
  }, {});

const setLastSubmenuByParent = (parentHref: string, subHref: string) => {
    lastSubmenuByParentMemory = { ...lastSubmenuByParentMemory, [parentHref]: subHref };
};

const clearLastSubmenuByParent = (parentHref: string) => {
    if (!(parentHref in lastSubmenuByParentMemory)) return;
    const { [parentHref]: _removed, ...rest } = lastSubmenuByParentMemory;
    lastSubmenuByParentMemory = rest;
};

const findSubItemByHref = (items: SubMenuItem[] | undefined, href: string): SubMenuItem | null => {
    if (!items?.length) return null;

    for (const item of items) {
      if (item.href === href) return item;
      const nested = findSubItemByHref(item.subItems, href);
      if (nested) return nested;
    }

    return null;
};

const hasActiveDescendant = (items: SubMenuItem[] | undefined, currentPathname: string, normalizePath: (path: string) => string): boolean => {
    if (!items?.length) return false;

    return items.some((item) =>
      normalizePath(currentPathname) === normalizePath(item.href) ||
      hasActiveDescendant(item.subItems, currentPathname, normalizePath)
    );
};

const renderNestedSubItems = (
    items: SubMenuItem[],
    currentPathname: string,
    normalizePath: (path: string) => string,
    onSelect: (href: string) => void,
    selectedSubHref?: string
) => (
  <SidebarMenuSub className="mx-3 mb-1 mt-1 w-auto translate-x-0 gap-0.5 border-t-0 border-sidebar-border/25 px-2 py-0.5">
    {items.map((subItem) => {
      const nestedChildren = subItem.subItems?.filter(Boolean) || [];
      const isActive =
        normalizePath(currentPathname) === normalizePath(subItem.href) ||
        selectedSubHref === subItem.href ||
        hasActiveDescendant(subItem.subItems, currentPathname, normalizePath);

      return (
        <SidebarMenuSubItem key={subItem.href} className="border-b-0">
          <div className="space-y-0.5">
            <SidebarMenuSubButton
              asChild
              isActive={isActive}
              className="h-9 w-full translate-x-0 rounded-md bg-transparent px-3.5 py-0 text-sm leading-none font-medium tracking-[-0.01em] text-sidebar-foreground/76 transition-[background-color,color] hover:bg-sidebar-accent/20 hover:text-sidebar-foreground focus-visible:bg-sidebar-accent/20 focus-visible:text-sidebar-foreground data-[active=true]:bg-sidebar-accent/20 data-[active=true]:font-semibold data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-none data-[active=true]:hover:bg-sidebar-accent/20"
            >
              <Link
                href={subItem.href}
                prefetch={false}
                onClick={() => onSelect(subItem.href)}
              >
                <span>{subItem.label}</span>
              </Link>
            </SidebarMenuSubButton>
            {nestedChildren.length > 0 ? (
              <SidebarMenuSub className="ml-4 gap-0.5 border-l border-sidebar-border/20 pl-2">
                {nestedChildren.map((child) => (
                  <SidebarMenuSubItem key={child.href} className="border-b-0">
                    <SidebarMenuSubButton
                      asChild
                      isActive={normalizePath(currentPathname) === normalizePath(child.href) || selectedSubHref === child.href}
                      className="h-8 w-full translate-x-0 rounded-md bg-transparent px-3 text-[11px] leading-none font-medium tracking-[-0.01em] text-sidebar-foreground/68 transition-[background-color,color] hover:bg-sidebar-accent/15 hover:text-sidebar-foreground focus-visible:bg-sidebar-accent/15 focus-visible:text-sidebar-foreground data-[active=true]:bg-sidebar-accent/15 data-[active=true]:font-semibold data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-none data-[active=true]:hover:bg-sidebar-accent/15"
                    >
                      <Link
                        href={child.href}
                        prefetch={false}
                        onClick={() => onSelect(child.href)}
                      >
                        <span>{child.label}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            ) : null}
          </div>
        </SidebarMenuSubItem>
      );
    })}
  </SidebarMenuSub>
);

const SidebarItems = () => {
    const pathname = usePathname();
    const { setOpenMobile } = useSidebar();
    const { canAccessMenuItem } = usePermissions();
    const currentPathname = pathname ?? '';
    const lastSubmenuByParent = useMemo(() => getLastSubmenuByParent(), [pathname]);
    const [openParents, setOpenParents] = useState<Record<string, boolean>>(() => buildInitialOpenParents(currentPathname));
    const [dismissedParents, setDismissedParents] = useState<Record<string, boolean>>({});
    const [roleBasedUserSubItems, setRoleBasedUserSubItems] = useState<SubMenuItem[]>(USERS_STATIC_SUB_ITEMS);
    const normalizePath = (path: string) => path.replace(/\/+$/, '');

    useEffect(() => {
      let cancelled = false;
      const loadRoleSubmenu = async () => {
        try {
          const payload = await getOrSetClientApiCache(
            'roles:submenu',
            ROLES_SUBMENU_CACHE_TTL_MS,
            async () => {
              const response = await fetch('/api/roles', { cache: 'no-store' });
              return await response.json().catch(() => ({}));
            }
          );
          const apiRoles = (Array.isArray(payload?.roles) ? payload.roles : []) as Role[];

          const dynamicItems: SubMenuItem[] = [
            ...USERS_STATIC_SUB_ITEMS,
            ...apiRoles
              .filter((role) => role?.id && role?.name)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((role: Role) => ({
                href: `/users/role/${encodeURIComponent(role.id)}`,
                label: role.name,
                permissionId: 'users-view',
              })),
          ];

          if (!cancelled) setRoleBasedUserSubItems(dynamicItems);
        } catch {
          if (!cancelled) {
            setRoleBasedUserSubItems(USERS_STATIC_SUB_ITEMS);
          }
        }
      };

      void loadRoleSubmenu();
      const reloadRoleSubmenu = () => {
        invalidateClientApiCache('roles:submenu');
        void loadRoleSubmenu();
      };
      window.addEventListener('safeviate-roles-updated', reloadRoleSubmenu);
      return () => {
        cancelled = true;
        window.removeEventListener('safeviate-roles-updated', reloadRoleSubmenu);
      };
    }, []);

    useEffect(() => {
        setOpenParents((current) => {
            const next = buildInitialOpenParents(currentPathname);
            const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
            const isSame = [...keys].every((key) => Boolean(current[key]) === Boolean(next[key]));
            return isSame ? current : next;
        });
    }, [pathname]);
  
    const filteredItems = useMemo(() => {
      return menuConfig.filter((item) => item.href === '/dashboard' || canAccessMenuItem(item));
    }, [canAccessMenuItem]);

    return (
        <SidebarMenu>
            {filteredItems.map((item, index) => {
                const Icon = item.icon;
                const configuredSubItems =
                  item.href === '/users'
                    ? (roleBasedUserSubItems.length > 0 ? roleBasedUserSubItems : item.subItems || [])
                    : item.subItems || [];
                const subItems = configuredSubItems.filter((sub) => canAccessMenuItem(sub, item));
                const activeSubItem = findSubItemByHref(subItems, currentPathname);
                const rememberedSubHref = lastSubmenuByParent[item.href];
                const rememberedSubItem = findSubItemByHref(subItems, rememberedSubHref || '');
                const isOpen = openParents[item.href] ?? false;
                const isDismissed = dismissedParents[item.href] ?? false;
                const selectedSubItem = isDismissed ? null : (activeSubItem || (isOpen ? rememberedSubItem : null) || null);
                const isParentActive = (isOpen || !!activeSubItem) && !isDismissed;

                let content;
                if (subItems.length > 0) {
                    content = (
                        <SidebarCollapsible open={isOpen}>
                            <SidebarCollapsibleTrigger asChild>
                                <SidebarMenuButton
                                    isActive={isParentActive}
                                    tooltip={item.label}
                                    className="justify-between"
                                    onClick={() => {
                                      setOpenParents((current) => {
                                        const nextOpen = !current[item.href];
                                        if (!nextOpen) {
                                          clearLastSubmenuByParent(item.href);
                                          setDismissedParents((dismissed) => ({ ...dismissed, [item.href]: true }));
                                        }
                                        if (nextOpen) {
                                          setDismissedParents((dismissed) => ({ ...dismissed, [item.href]: false }));
                                        }
                                        return { ...current, [item.href]: nextOpen };
                                      });
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon className="h-5 w-5" />
                                        <span>{item.label}</span>
                                    </div>
                                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 ease-in-out group-data-[state=open]:-rotate-180" />
                                </SidebarMenuButton>
                            </SidebarCollapsibleTrigger>
                            <SidebarCollapsibleContent>
                                {renderNestedSubItems(
                                  subItems,
                                  currentPathname,
                                  normalizePath,
                                  (href) => {
                                    setOpenMobile(false);
                                    setLastSubmenuByParent(item.href, href);
                                    setDismissedParents((dismissed) => ({ ...dismissed, [item.href]: false }));
                                    setOpenParents((current) => ({ ...current, [item.href]: true }));
                                  },
                                  selectedSubItem?.href
                                )}
                            </SidebarCollapsibleContent>
                        </SidebarCollapsible>
                    );
                } else {
                    content = (
                        <SidebarMenuButton
                            asChild
                            isActive={normalizePath(currentPathname) === normalizePath(item.href)}
                            tooltip={item.label}
                            className="justify-start pl-2.5 pr-3"
                        >
                            <Link href={item.href} prefetch={false} onClick={() => setOpenMobile(false)}>
                                <Icon className="h-5 w-5" />
                                <span className="-ml-1">{item.label}</span>
                            </Link>
                        </SidebarMenuButton>
                    );
                }

                return (
                    <React.Fragment key={item.href}>
                        <SidebarMenuItem>{content}</SidebarMenuItem>
                    </React.Fragment>
                );
            })}
        </SidebarMenu>
    )
}

const SidebarBrandLogoFooter = () => {
  const { sidebarLogoImage, sidebarLogoBackgroundColor } = useTheme();

  return (
    <SidebarFooter className="border-t border-sidebar-border/25 p-3 pt-4 group-data-[collapsible=icon]:hidden">
      <div className="space-y-2">
        <div
          className="relative mx-auto aspect-[204.1/112.8] w-full max-w-[204.1px] overflow-hidden rounded-2xl border border-sidebar-border/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{ backgroundColor: sidebarLogoBackgroundColor || 'transparent' }}
        >
          {sidebarLogoImage ? (
            <img
              src={sidebarLogoImage}
              alt="Company logo"
              className="absolute inset-0 h-full w-full object-contain p-2"
            />
          ) : (
            <div aria-hidden="true" className="h-full w-full" />
          )}
        </div>
      </div>
    </SidebarFooter>
  );
};

export function AppSidebarMobile() {
    const { openMobile, setOpenMobile } = useSidebar();
    const isMobile = useIsMobile();
    const { tenant, tenantId } = useUserProfile();
  
    if (!isMobile) return null;

    const tenantLabel = tenant?.name?.trim() || tenantId || 'Safeviate';
  
    return (
      <SidebarMobile open={openMobile} onOpenChange={setOpenMobile}>
        <SidebarMobileContent
          className={cn('!p-0 !gap-0 overflow-hidden no-scrollbar')}
          aria-label="Main Menu"
        >
          <SidebarHeader className="flex h-[44px] flex-row items-center gap-3 shrink-0 bg-header px-4">
            <SidebarTrigger className="h-8 w-8 text-header-foreground opacity-80" />
            <span className="truncate font-headline text-lg font-bold tracking-tight text-header-foreground">
              {tenantLabel}
            </span>
          </SidebarHeader>

          <SidebarContent className="pt-0 no-scrollbar">
            <SidebarItems />
          </SidebarContent>
          <SidebarBrandLogoFooter />
        </SidebarMobileContent>
      </SidebarMobile>
    );
}

export function AppSidebar() {
  return (
    <Sidebar className={cn('top-0 h-svh')}>
      <SidebarContent className="pt-[36px] no-scrollbar">
        <SidebarItems />
      </SidebarContent>
      <SidebarBrandLogoFooter />
    </Sidebar>
  );
}
