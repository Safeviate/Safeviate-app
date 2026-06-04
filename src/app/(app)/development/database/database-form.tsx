'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronRight, PlusCircle, Save, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HEADER_COMPACT_CONTROL_CLASS, HEADER_SECONDARY_BUTTON_CLASS, MainPageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import { menuConfig, type MenuItem } from '@/lib/menu-config';
import { TENANT_OVERRIDE_COOKIE } from '@/lib/tenant-constants';
import { cn } from '@/lib/utils';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import type { IndustryType, Tenant, PageLayoutSettings } from '@/types/quality';
import { buildDefaultPageLayoutSettings } from '@/lib/tenant-setup-presets';
import { PAGE_FORMAT_PRIMARY_BUTTON_CLASS } from '@/lib/page-format-buttons';

const TENANT_PAGE_BUTTON_CLASS = PAGE_FORMAT_PRIMARY_BUTTON_CLASS;
const TENANT_OVERRIDE_STORAGE_KEY = 'safeviate:selected-tenant';
const LOCAL_TENANT_CONFIG_KEY = 'safeviate:tenant-config-local-override';
const MASTER_TENANT_ID = 'safeviate';
const MASTER_TENANT_NAME = 'Safeviate';

const INDUSTRY_TYPES: IndustryType[] = [
  'Aviation: Flight Training (ATO)',
  'Aviation: Charter / Ops (AOC)',
  'Aviation: Maintenance (AMO)',
  'General: Occupational Health & Safety (OHS)',
];

type TenantFormProps = {
  initialTenantId?: string | null;
  lockTenantSelection?: boolean;
  detailBasePath?: string;
  returnHref?: string;
};

type TenantConfigPayload = {
  id: string;
  name: string;
  industry?: IndustryType;
  logoUrl?: string;
  enabledMenus?: string[];
  pageLayoutSettings?: PageLayoutSettings | null;
  tabVisibilitySettings?: { id: string; visibilities: Record<string, boolean> } | null;
};

type TenantSummary = Tenant;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });

const buildDefaultEnabledHrefs = () =>
  new Set(
    menuConfig.flatMap((menu) => [
      menu.href,
      ...(menu.subItems?.map((subItem) => subItem.href) || []),
    ])
  );

const isTenantMenuHref = (_href: string) => true;

const normalizeTenantConfig = (value: unknown): TenantConfigPayload | null => {
  if (!value || typeof value !== 'object') return null;
  return value as TenantConfigPayload;
};

const getTenantMenuState = (tenant: TenantSummary | null, config: TenantConfigPayload | null) => {
  const tenantMenus = Array.isArray(config?.enabledMenus) ? config.enabledMenus : tenant?.enabledMenus || [];
  return new Set(tenantMenus.length > 0 ? tenantMenus : Array.from(buildDefaultEnabledHrefs()));
};

const getDefaultTenantMenuState = () => new Set(buildDefaultEnabledHrefs());

const getTenantPageLayoutSettings = (config: TenantConfigPayload | null) =>
  config?.pageLayoutSettings && typeof config.pageLayoutSettings === 'object'
    ? config.pageLayoutSettings
    : buildDefaultPageLayoutSettings();

const buildTenantIdFromName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function DatabaseForm({
  initialTenantId = null,
  lockTenantSelection = false,
  detailBasePath,
  returnHref,
}: TenantFormProps = {}) {
  const router = useRouter();
  const { toast } = useToast();
  const { tenantId: activeTenantId, userProfile } = useUserProfile();
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/admin/page-format' });

  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [isLoadingTenants, setIsLoadingTenants] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState('');
  const [industry, setIndustry] = useState<IndustryType>('Aviation: Flight Training (ATO)');
  const [logoPreview, setLogoPreview] = useState('');
  const [enabledHrefs, setEnabledHrefs] = useState<Set<string>>(() => buildDefaultEnabledHrefs());
  const [pageLayoutSettings, setPageLayoutSettings] = useState<PageLayoutSettings>(() => buildDefaultPageLayoutSettings());
  const [menuFilter, setMenuFilter] = useState('');
  const isEditingExistingTenant = Boolean(selectedTenantId);
  const isCreatingNewTenant = !selectedTenantId;
  const headerDescription = isEditingExistingTenant
    ? 'You are editing an existing client tenant. Saving will update that tenant record and its tenant configuration.'
    : 'You are creating a new client tenant. Saving will create a separate tenant record, tenant config, and tenant id.';
  const modeBadgeLabel = isEditingExistingTenant ? 'Editing Existing Tenant' : 'Creating New Tenant';
  const saveButtonLabel = isCreatingNewTenant ? 'Save Tenant' : 'Update Tenant';

  const sortedTenants = useMemo(() => {
    return [...tenants].sort((a, b) => {
      if (a.id === MASTER_TENANT_ID) return -1;
      if (b.id === MASTER_TENANT_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [tenants]);
  const clientTenants = useMemo(() => sortedTenants.filter((tenant) => tenant.id !== 'safeviate'), [sortedTenants]);

  const menuRows = useMemo(() => menuConfig, []);
  const tenantMenuRows = useMemo(
    () =>
      menuConfig.filter((menu) => isTenantMenuHref(menu.href)),
    []
  );
  const totalMenuCount = useMemo(
    () =>
      tenantMenuRows.reduce(
        (count, item) => count + 1 + (item.subItems?.filter((subItem) => isTenantMenuHref(subItem.href)).length || 0),
        0
      ),
    [tenantMenuRows]
  );
  const selectedMenuCount = useMemo(
    () =>
      tenantMenuRows.reduce((count, item) => {
        const subItems = item.subItems?.filter((subItem) => isTenantMenuHref(subItem.href)) || [];
        const itemSelected = enabledHrefs.has(item.href) ? 1 : 0;
        const subSelected = subItems.reduce((subCount, subItem) => subCount + (enabledHrefs.has(subItem.href) ? 1 : 0), 0);
        return count + itemSelected + subSelected;
      }, 0),
    [enabledHrefs, tenantMenuRows]
  );

  const loadTenants = async () => {
    setIsLoadingTenants(true);
    try {
      const response = await fetch('/api/tenants', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ tenants: [] }));
      const rows = Array.isArray(payload?.tenants) ? (payload.tenants as TenantSummary[]) : [];
      setTenants(
        rows.length > 0
          ? rows
          : [{ id: MASTER_TENANT_ID, name: MASTER_TENANT_NAME, industry: 'Aviation: Flight Training (ATO)' } as TenantSummary]
      );
    } catch {
      setTenants([{ id: MASTER_TENANT_ID, name: MASTER_TENANT_NAME, industry: 'Aviation: Flight Training (ATO)' } as TenantSummary]);
    } finally {
      setIsLoadingTenants(false);
    }
  };

  const loadTenant = async (tenantId: string) => {
    const tenant = tenants.find((row) => row.id === tenantId);
    if (!tenant) return;

    setSelectedTenantId(tenant.id);
    setTenantName(tenant.name);
    setIndustry(tenant.industry || 'Aviation: Flight Training (ATO)');
    setLogoPreview(tenant.logoUrl || '');

    try {
      const response = await fetch(`/api/tenant-config?tenantId=${encodeURIComponent(tenant.id)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      const config = normalizeTenantConfig(payload?.config);
      const nextEnabledHrefs = getTenantMenuState(tenant, config);
      setEnabledHrefs(nextEnabledHrefs.size > 0 ? nextEnabledHrefs : getDefaultTenantMenuState());
      setPageLayoutSettings(getTenantPageLayoutSettings(config));
    } catch {
      setEnabledHrefs(getDefaultTenantMenuState());
      setPageLayoutSettings(buildDefaultPageLayoutSettings());
    }

    toast({
      title: 'Tenant Loaded',
      description: `Configuration for "${tenant.name}" is ready.`,
    });
  };

  useEffect(() => {
    void loadTenants();
  }, []);

  useEffect(() => {
    if (!initialTenantId || isLoadingTenants) return;
    if (selectedTenantId === initialTenantId) return;
    if (tenants.some((tenant) => tenant.id === initialTenantId)) {
      void loadTenant(initialTenantId);
    }
  }, [initialTenantId, isLoadingTenants, selectedTenantId, tenants]);

  useEffect(() => {
    const handleUpdate = () => void loadTenants();
    window.addEventListener('safeviate-tenants-updated', handleUpdate);
    return () => window.removeEventListener('safeviate-tenants-updated', handleUpdate);
  }, []);

  const clearForm = () => {
    setSelectedTenantId(null);
    setTenantName('');
    setIndustry('Aviation: Flight Training (ATO)');
    setLogoPreview('');
    setEnabledHrefs(getDefaultTenantMenuState());
    setPageLayoutSettings(buildDefaultPageLayoutSettings());
    setMenuFilter('');
  };

  const handleCreateNewTenant = () => {
    clearForm();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TENANT_OVERRIDE_STORAGE_KEY);
      window.document.cookie = `${TENANT_OVERRIDE_COOKIE}=${MASTER_TENANT_ID}; path=/; max-age=${60 * 60 * 24 * 365}`;
      window.dispatchEvent(new CustomEvent('safeviate-tenant-switch', { detail: { tenantId: MASTER_TENANT_ID, tenantName: MASTER_TENANT_NAME } }));
      window.dispatchEvent(new Event('safeviate-tenant-config-updated'));
    }
    if (returnHref) {
      router.push('/development/database/new');
    }
    toast({
      title: 'New Tenant Ready',
      description: 'The form has been reset to clean defaults.',
    });
  };

  const handleTenantSelect = async (tenantId: string) => {
    await loadTenant(tenantId);
  };

  const toggleMenu = (href: string, subHrefs: string[] = []) => {
    setEnabledHrefs((current) => {
      const next = new Set(current);
      const shouldEnable = !next.has(href);
      if (shouldEnable) {
        next.add(href);
        subHrefs.forEach((subHref) => next.add(subHref));
      } else {
        next.delete(href);
        subHrefs.forEach((subHref) => next.delete(subHref));
      }
      return next;
    });
  };

  const toggleSubMenu = (parentHref: string, subHref: string, siblings: string[]) => {
    setEnabledHrefs((current) => {
      const next = new Set(current);
      const shouldEnable = !next.has(subHref);
      if (shouldEnable) {
        next.add(subHref);
        next.add(parentHref);
      } else {
        next.delete(subHref);
      }

      const anySiblingSelected = siblings.some((href) => href === subHref ? shouldEnable : next.has(href));
      if (!anySiblingSelected) {
        next.delete(parentHref);
      }

      return next;
    });
  };

  const isParentMixed = (parentHref: string, subHrefs: string[]) => {
    const selectedChildren = subHrefs.filter((href) => enabledHrefs.has(href)).length;
    return selectedChildren > 0 && selectedChildren < subHrefs.length;
  };

  const handleLogoUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid logo', description: 'Please upload an image file.' });
      return;
    }

    try {
      setLogoPreview(await readFileAsDataUrl(file));
      toast({ title: 'Logo Updated', description: 'The preview has been updated.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Logo Upload Failed',
        description: error instanceof Error ? error.message : 'Could not load the tenant logo.',
      });
    }
  };

  const handleSaveTenant = async () => {
    if (!tenantName.trim()) {
      toast({ variant: 'destructive', title: 'Invalid Operation', description: 'Tenant name is required.' });
      return;
    }

    const normalizedTenantName = tenantName.trim();
    const nextTenantId = buildTenantIdFromName(normalizedTenantName);
    const tenantId = selectedTenantId || nextTenantId;
    const isNewTenant = !selectedTenantId;

    if (!tenantId) {
      toast({
        variant: 'destructive',
        title: 'Invalid Operation',
        description: 'Tenant name must include letters or numbers.',
      });
      return;
    }

    if (isNewTenant && tenants.some((entry) => entry.id === tenantId)) {
      toast({
        variant: 'destructive',
        title: 'Tenant Already Exists',
        description: `A tenant with id "${tenantId}" already exists. Use a different tenant name.`,
      });
      return;
    }

    const effectiveEnabledHrefs = Array.from(enabledHrefs);
    const tenantData: Tenant = {
      id: tenantId,
      name: normalizedTenantName,
      industry,
      logoUrl: logoPreview || '',
      enabledMenus: effectiveEnabledHrefs,
      pageLayoutSettings,
      tabVisibilitySettings: {
        id: 'tab-visibility',
        visibilities: Object.fromEntries(
          Object.entries(pageLayoutSettings.pages).map(([pageKey, layout]) => [pageKey, layout.enabled])
        ),
      },
    };

    try {
      const tenantResponse = await fetch('/api/tenants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: tenantData, isNewTenant }),
      });
      if (!tenantResponse.ok) {
        const payload = await tenantResponse.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to save tenant record.');
      }

      const tenantConfigResponse = await fetch(`/api/tenant-config?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            id: tenantId,
            name: tenantData.name,
            industry,
            logoUrl: logoPreview || '',
            enabledMenus: effectiveEnabledHrefs,
            pageLayoutSettings,
            tabVisibilitySettings: tenantData.tabVisibilitySettings,
          },
        }),
      });
      if (!tenantConfigResponse.ok) {
        const payload = await tenantConfigResponse.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to save tenant configuration.');
      }

      setTenants((current) => {
        const next = [...current];
        const index = next.findIndex((entry) => entry.id === tenantId);
        if (index >= 0) {
          next[index] = tenantData;
        } else {
          next.push(tenantData);
        }
        return next;
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('safeviate-tenants-updated'));
        window.dispatchEvent(new Event('safeviate-tenant-config-updated'));
      }

      toast({
        title: selectedTenantId ? 'Tenant Updated' : 'Tenant Created',
        description: `"${tenantData.name}" has been saved.`,
      });

      if (!selectedTenantId) {
        if (detailBasePath) {
          router.push(`${detailBasePath}/${encodeURIComponent(tenantId)}`);
          return;
        }
        clearForm();
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Commit Failure',
        description: error instanceof Error ? error.message : 'System fault during persistence.',
      });
    }
  };

  const handleDeleteTenant = async () => {
    if (!selectedTenantId) {
      toast({ variant: 'destructive', title: 'Invalid Operation', description: 'Select a tenant first.' });
      return;
    }

    if (selectedTenantId === MASTER_TENANT_ID) {
      toast({
        variant: 'destructive',
        title: 'Delete blocked',
        description: 'The Safeviate baseline tenant cannot be deleted.',
      });
      return;
    }

    if (!window.confirm(`Delete "${tenantName || selectedTenantId}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/tenants?tenantId=${encodeURIComponent(selectedTenantId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete tenant.');
      }

      setTenants((current) => current.filter((entry) => entry.id !== selectedTenantId));
      clearForm();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('safeviate-tenants-updated'));
      }

      toast({
        title: 'Tenant Deleted',
        description: `"${payload?.deletedTenantId || selectedTenantId}" has been removed.`,
      });

      if (detailBasePath) {
        router.push(detailBasePath);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'System fault during deletion.',
      });
    }
  };

  if (isAccessLoading) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-6 overflow-hidden px-1 pb-4 lg:max-w-[1100px] mx-auto">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[640px] w-full" />
      </div>
    );
  }

  if (!isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full flex-col gap-6 overflow-hidden px-1 pb-4 lg:max-w-[1100px]">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border bg-background shadow-none">
        <MainPageHeader
          title="Tenant Setup"
          description={headerDescription}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
                {modeBadgeLabel}
              </Badge>
              {selectedTenantId && selectedTenantId !== MASTER_TENANT_ID ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleDeleteTenant()}
                  className={cn(HEADER_COMPACT_CONTROL_CLASS, 'px-4')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Tenant
                </Button>
              ) : null}
              <Button
                onClick={() => void handleSaveTenant()}
                className={cn(
                  HEADER_COMPACT_CONTROL_CLASS,
                  'border-[hsl(var(--button-primary-border))] bg-[hsl(var(--button-primary-background))] px-4 text-[hsl(var(--button-primary-foreground))] hover:bg-[hsl(var(--button-primary-accent))] hover:text-[hsl(var(--button-primary-accent-foreground))]'
                )}
              >
                <Save className="h-3.5 w-3.5" />
                {saveButtonLabel}
              </Button>
              {!lockTenantSelection ? (
                <Button
                  onClick={handleCreateNewTenant}
                  variant="outline"
                  className={cn(HEADER_SECONDARY_BUTTON_CLASS, 'text-[9px] font-black uppercase tracking-[0.08em]')}
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Add Tenant
                </Button>
              ) : null}
            </div>
          }
        />

        <CardContent className="flex-1 min-h-0 overflow-hidden bg-muted/5 p-0">
          <ScrollArea className="h-full">
            <div className="space-y-8 p-4 pb-6 sm:p-6">
              <Card className="border bg-background shadow-none">
                <CardContent className="p-4 sm:p-5">
                  <div className="grid gap-2">
                    <Label htmlFor="tenant-name-header" className="ml-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Tenant Name
                    </Label>
                    <Input
                      id="tenant-name-header"
                      placeholder="Acme Aviation"
                      className="h-11 rounded-xl border-2 text-sm font-black uppercase tracking-tight focus-visible:ring-primary/20"
                      value={tenantName}
                      onChange={(event) => setTenantName(event.target.value)}
                    />
                    {isCreatingNewTenant ? (
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Saving in this state creates a brand-new tenant record and config.
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="space-y-6">
                  <Card className="border bg-background shadow-none">
                    <CardContent className="space-y-4 p-4 sm:p-5">
                      <div className="space-y-2">
                        <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tenant Logo</Label>
                        <div className="flex flex-col gap-4 rounded-3xl border bg-muted/5 p-4 sm:flex-row sm:items-center">
                          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border bg-background">
                            {logoPreview ? (
                              <Image src={logoPreview} alt="Tenant logo preview" width={96} height={96} className="h-full w-full object-contain" />
                            ) : (
                              <span className="px-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground">No Logo</span>
                            )}
                          </div>
                          <div className="flex-1 space-y-3">
                            <Input
                              type="file"
                              accept="image/*"
                              className="h-10 rounded-xl border-2 text-[10px] font-bold uppercase"
                              onChange={(event) => void handleLogoUpload(event.target.files?.[0])}
                            />
                            <Button type="button" variant="outline" className={TENANT_PAGE_BUTTON_CLASS} onClick={() => setLogoPreview('')} disabled={!logoPreview}>
                              Remove Logo
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Industry</Label>
                        <Select onValueChange={(value) => setIndustry(value as IndustryType)} value={industry}>
                          <SelectTrigger className="h-10 rounded-xl border-2 bg-background text-[10px] font-black uppercase tracking-tight shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-2">
                            {INDUSTRY_TYPES.map((value) => (
                              <SelectItem key={value} value={value} className="text-[10px] font-black uppercase">
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border bg-background shadow-none">
                  <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-muted/10 px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary">Menu Visibility</p>
                      <CardTitle className="text-xl font-black uppercase tracking-tight">Menus and Submenus</CardTitle>
                      <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                        Choose exactly which items should be visible for this tenant.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
                      {selectedMenuCount} selected
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/5 px-4 py-3">
                      <Button type="button" variant="outline" className={TENANT_PAGE_BUTTON_CLASS} onClick={() => setEnabledHrefs(buildDefaultEnabledHrefs())}>
                        Select All
                      </Button>
                      <Button type="button" variant="outline" className={TENANT_PAGE_BUTTON_CLASS} onClick={() => setEnabledHrefs(new Set())}>
                        Clear All
                      </Button>
                      <div className="ml-auto text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {selectedMenuCount} of {totalMenuCount} items enabled
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {tenantMenuRows
                        .filter((menu) => {
                          const term = menuFilter.trim().toLowerCase();
                          if (!term) return true;
                          if (menu.label.toLowerCase().includes(term) || menu.href.toLowerCase().includes(term)) return true;
                          return menu.subItems?.some(
                            (sub) =>
                              isTenantMenuHref(sub.href) &&
                              (sub.label.toLowerCase().includes(term) || sub.href.toLowerCase().includes(term))
                          ) ?? false;
                        })
                        .map((menu) => {
                        const subHrefs = menu.subItems?.map((sub) => sub.href).filter(isTenantMenuHref) || [];
                        const isSelected = enabledHrefs.has(menu.href);
                        const isMixed = menu.subItems?.length ? isParentMixed(menu.href, subHrefs) : false;
                        const stateLabel = isMixed ? 'Partial' : isSelected ? 'Selected' : 'Clear';

                        return (
                          <Card
                            key={menu.href}
                            className={cn(
                              'border shadow-none transition-all',
                              isSelected ? 'border-primary bg-primary/5' : 'border-slate-200',
                              isMixed ? 'ring-1 ring-amber-400/40' : ''
                            )}
                          >
                            <CardContent className="space-y-4 p-4 sm:p-5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className={cn('rounded-lg p-2', isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground')}>
                                    <menu.icon className="h-5 w-5" />
                                  </div>
                                  <div className="space-y-0.5">
                                    <p className="text-sm font-black uppercase tracking-tight text-foreground">{menu.label}</p>
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{menu.href}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest',
                                      isMixed
                                        ? 'border-amber-400/40 bg-amber-50 text-amber-700'
                                        : isSelected
                                          ? 'border-primary/20 bg-primary/5 text-primary'
                                          : 'border-slate-200 bg-muted/5 text-muted-foreground'
                                    )}
                                  >
                                    {stateLabel}
                                  </Badge>
                                  <Checkbox
                                    checked={isMixed ? 'indeterminate' : isSelected}
                                    onCheckedChange={() => toggleMenu(menu.href, subHrefs)}
                                    className="h-6 w-6 border-2 data-[state=checked]:bg-primary"
                                    aria-label={`${menu.label} menu ${isMixed ? 'partially selected' : isSelected ? 'selected' : 'not selected'}`}
                                  />
                                </div>
                              </div>

                              {menu.subItems?.length ? (
                                <div className="space-y-2 border-t pt-3">
                                  {menu.subItems.filter((sub) => isTenantMenuHref(sub.href)).map((sub) => {
                                    const isSubSelected = enabledHrefs.has(sub.href);
                                    return (
                                      <div key={sub.href} className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-40" />
                                          <div className="space-y-0.5">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-foreground">{sub.label}</p>
                                            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{sub.href}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              'rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest',
                                              isSubSelected
                                                ? 'border-primary/20 bg-primary/5 text-primary'
                                                : 'border-slate-200 bg-muted/5 text-muted-foreground'
                                            )}
                                          >
                                            {isSubSelected ? 'Selected' : 'Clear'}
                                          </Badge>
                                          <Checkbox
                                            checked={isSubSelected}
                                            onCheckedChange={() => toggleSubMenu(menu.href, sub.href, subHrefs)}
                                            className="h-4 w-4 border-2 data-[state=checked]:bg-primary"
                                            aria-label={`${sub.label} submenu ${isSubSelected ? 'selected' : 'not selected'}`}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>
        </CardContent>

      </Card>
    </div>
  );
}
