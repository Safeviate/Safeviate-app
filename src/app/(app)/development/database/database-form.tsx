'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { menuConfig } from '@/lib/menu-config';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useUserProfile } from '@/hooks/use-user-profile';
import { TENANT_OVERRIDE_COOKIE } from '@/lib/tenant-constants';
import {
  SAFETY_QUALITY_LAYOUT_DEFINITIONS,
  buildDefaultPageLayoutSettings,
  type PageLayoutSettings,
} from '@/lib/tenant-setup-presets';
import { 
    Building2, 
    CheckCircle2, 
    PlusCircle, 
    Save, 
    Briefcase, 
    MonitorSmartphone,
    ShieldCheck,
    LayoutDashboard,
    ArrowRightLeft,
    ChevronRight,
    Users
} from 'lucide-react';
import type { Tenant, IndustryType } from '@/types/quality';
import { cn } from '@/lib/utils';
import { HEADER_TAB_LIST_CLASS, HEADER_TAB_TRIGGER_CLASS } from '@/components/page-header';

const DEFAULT_MAIN = { background: '#ebf5fb', primary: '#7cc4f7', 'primary-foreground': '#1e293b', accent: '#63b2a7' };
const TENANT_OVERRIDE_STORAGE_KEY = 'safeviate:selected-tenant';
const INDUSTRY_OVERRIDE_KEY = 'safeviate:industry-override';
const TENANT_SETUP_PRIMARY_BUTTON_CLASS = 'h-10 rounded-xl px-6 text-[10px] font-black uppercase tracking-widest shadow-sm';
type MainTheme = typeof DEFAULT_MAIN;

type BetaNdaAcceptanceRecord = {
  id: string;
  email: string;
  name: string;
  ndaVersion: string;
  acceptedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const INDUSTRY_TYPES: IndustryType[] = [
  'Aviation: Flight Training (ATO)',
  'Aviation: Charter / Ops (AOC)',
  'Aviation: Maintenance (AMO)',
  'General: Occupational Health & Safety (OHS)'
];

const PAGE_LAYOUT_TAB_ID = 'layout';

const buildDefaultEnabledHrefs = () =>
  new Set(
    menuConfig.flatMap((menu) => [
      menu.href,
      ...(menu.subItems?.map((subItem) => subItem.href) || []),
    ])
  );

const buildDisabledPageLayoutSettings = (): PageLayoutSettings => ({
  id: 'page-layout-settings',
  pages: SAFETY_QUALITY_LAYOUT_DEFINITIONS.reduce<Record<string, { enabled: boolean; sections: Record<string, boolean>; tabs: Record<string, boolean> }>>((acc, page) => {
    acc[page.id] = {
      enabled: false,
      sections: page.sections.reduce<Record<string, boolean>>((sectionAcc, section) => {
        sectionAcc[section.id] = false;
        return sectionAcc;
      }, {}),
      tabs: page.sections.reduce<Record<string, boolean>>((tabAcc, section) => {
        (section.tabs || []).forEach((tab) => {
          tabAcc[tab.id] = false;
        });
        return tabAcc;
      }, {}),
    };
    return acc;
  }, {}),
});

const normalizePageLayoutSettings = (value: unknown): PageLayoutSettings => {
  const fallback = buildDefaultPageLayoutSettings();
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const config = value as { id?: string; pages?: Record<string, unknown> };
  const pages = config.pages && typeof config.pages === 'object' ? config.pages : {};
  return {
    id: typeof config.id === 'string' ? config.id : fallback.id,
    pages: SAFETY_QUALITY_LAYOUT_DEFINITIONS.reduce<Record<string, { enabled: boolean; sections: Record<string, boolean>; tabs: Record<string, boolean> }>>((acc, page) => {
      const storedPage = pages[page.id] && typeof pages[page.id] === 'object'
        ? (pages[page.id] as { enabled?: boolean; sections?: Record<string, boolean>; tabs?: Record<string, boolean> })
        : null;
      acc[page.id] = {
        enabled: typeof storedPage?.enabled === 'boolean' ? storedPage.enabled : true,
        sections: page.sections.reduce<Record<string, boolean>>((sectionAcc, section) => {
          sectionAcc[section.id] = storedPage?.sections?.[section.id] ?? true;
          return sectionAcc;
        }, {}),
        tabs: page.sections.reduce<Record<string, boolean>>((tabAcc, section) => {
          (section.tabs || []).forEach((tab) => {
            tabAcc[tab.id] = storedPage?.tabs?.[tab.id] ?? true;
          });
          return tabAcc;
        }, {}),
      };
      return acc;
    }, {}),
  };
};

const formatLayoutLabel = (value: string) =>
  value
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export function DatabaseForm() {
  const { toast } = useToast();
  const { tenantId: activeTenantId, userProfile } = useUserProfile();
  
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoadingTenants, setIsLoadingTenants] = useState(true);

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState('');
  const [industry, setIndustry] = useState<IndustryType>('Aviation: Flight Training (ATO)');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [localIndustryOverride, setLocalIndustryOverride] = useState<string>('');
  
  const [mainTheme, setMainTheme] = useState<MainTheme>(DEFAULT_MAIN);
  const [enabledHrefs, setEnabledHrefs] = useState<Set<string>>(() => buildDefaultEnabledHrefs());
  const [pageLayoutSettings, setPageLayoutSettings] = useState<PageLayoutSettings>(() => buildDefaultPageLayoutSettings());
  const [ndaAcceptances, setNdaAcceptances] = useState<BetaNdaAcceptanceRecord[]>([]);
  const [isLoadingNdaAcceptances, setIsLoadingNdaAcceptances] = useState(false);
  const [ndaAcceptancesError, setNdaAcceptancesError] = useState<string | null>(null);

  const normalizeMainTheme = (main?: Record<string, string> | null): MainTheme => ({
    background: main?.background || DEFAULT_MAIN.background,
    primary: main?.primary || DEFAULT_MAIN.primary,
    'primary-foreground': main?.['primary-foreground'] || DEFAULT_MAIN['primary-foreground'],
    accent: main?.accent || DEFAULT_MAIN.accent,
  });

  const totalMenuCount = useMemo(() => buildDefaultEnabledHrefs().size, []);
  const totalPageCount = SAFETY_QUALITY_LAYOUT_DEFINITIONS.length;
  const totalSectionCount = useMemo(
    () => SAFETY_QUALITY_LAYOUT_DEFINITIONS.reduce((count, page) => count + page.sections.length, 0),
    []
  );
  const totalTabCount = useMemo(
    () =>
      SAFETY_QUALITY_LAYOUT_DEFINITIONS.reduce(
        (count, page) => count + page.sections.reduce((sectionCount, section) => sectionCount + (section.tabs?.length || 0), 0),
        0
      ),
    []
  );
  const enabledMenuCount = enabledHrefs.size;
  const enabledPageCount = Object.values(pageLayoutSettings.pages).filter((page) => page.enabled).length;
  const enabledSectionCount = Object.values(pageLayoutSettings.pages).reduce(
    (count, page) => count + Object.values(page.sections || {}).filter(Boolean).length,
    0
  );
  const enabledTabCount = Object.values(pageLayoutSettings.pages).reduce(
    (count, page) => count + Object.values(page.tabs || {}).filter(Boolean).length,
    0
  );

  // Load Tenants from LocalStorage
  useEffect(() => {
    const loadTenants = () => {
        fetch('/api/tenants', { cache: 'no-store' })
          .then((response) => response.json())
          .then((payload) => {
            const rows = Array.isArray(payload?.tenants) ? payload.tenants : [];
            if (rows.length > 0) {
              setTenants(rows as Tenant[]);
            } else {
              const initial: Tenant[] = [{
                id: 'safeviate',
                name: 'Safeviate Standard',
                industry: 'Aviation: Flight Training (ATO)',
                enabledMenus: Array.from(buildDefaultEnabledHrefs()),
                theme: {
                  primaryColour: DEFAULT_MAIN.primary,
                  backgroundColour: DEFAULT_MAIN.background,
                  accentColour: DEFAULT_MAIN.accent,
                  main: DEFAULT_MAIN
                },
                pageLayoutSettings: buildDefaultPageLayoutSettings(),
              }];
              setTenants(initial);
            }
          })
          .catch((e) => console.error('Failed to load tenants', e))
          .finally(() => setIsLoadingTenants(false));
    };

    loadTenants();
    
    if (typeof window !== 'undefined') {
        setLocalIndustryOverride(window.localStorage.getItem(INDUSTRY_OVERRIDE_KEY) || 'none');
    }

    const handleUpdate = () => loadTenants();
    window.addEventListener('safeviate-tenants-updated', handleUpdate);
    return () => window.removeEventListener('safeviate-tenants-updated', handleUpdate);
  }, []);

  const sortedTenants = useMemo(() => {
    return [...tenants].sort((a, b) => a.name.localeCompare(b.name));
  }, [tenants]);

  const handleLoadTenant = async (tenantId: string) => {
    const t = tenants.find(tenant => tenant.id === tenantId);
    if (!t) return;

    setSelectedTenantId(t.id);
    setTenantName(t.name);
    setIndustry(t.industry || 'Aviation: Flight Training (ATO)');
    setLogoPreview(t.logoUrl || null);
    setMainTheme(normalizeMainTheme(t.theme?.main || {
        ...DEFAULT_MAIN,
        primary: t.theme?.primaryColour || DEFAULT_MAIN.primary,
        background: t.theme?.backgroundColour || DEFAULT_MAIN.background,
        accent: t.theme?.accentColour || DEFAULT_MAIN.accent
    }));
    try {
      const response = await fetch(`/api/tenant-config?tenantId=${encodeURIComponent(t.id)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      const config = payload?.config && typeof payload.config === 'object' ? (payload.config as Record<string, unknown>) : {};
      const tenantMenus = Array.isArray(config.enabledMenus) ? config.enabledMenus.filter((value): value is string => typeof value === 'string') : (t.enabledMenus || []);
      setEnabledHrefs(new Set(tenantMenus.length > 0 ? tenantMenus : Array.from(buildDefaultEnabledHrefs())));
      setPageLayoutSettings(normalizePageLayoutSettings(config.pageLayoutSettings));
    } catch {
      const tenantMenus = new Set(t.enabledMenus || []);
      setEnabledHrefs(new Set(tenantMenus.size > 0 ? tenantMenus : Array.from(buildDefaultEnabledHrefs())));
      setPageLayoutSettings(buildDefaultPageLayoutSettings());
    }

    toast({ title: 'System Context Loaded', description: `Configuration for "${t.name}" inherited.` });
  };

  const handleIndustryChange = (newIndustry: IndustryType) => {
    setIndustry(newIndustry);

    setEnabledHrefs(buildDefaultEnabledHrefs());
    toast({ title: 'Company Logic Calibrated', description: `Module permissions synthesized for ${newIndustry}.` });
  };

  const handleApplyIndustryOverride = (val: string) => {
    if (typeof window === 'undefined') return;
    setLocalIndustryOverride(val);
    if (val === 'none') {
        window.localStorage.removeItem(INDUSTRY_OVERRIDE_KEY);
    } else {
        window.localStorage.setItem(INDUSTRY_OVERRIDE_KEY, val);
    }
    window.dispatchEvent(new Event('safeviate-industry-switch'));
    toast({ title: 'Simulation Parameter Set', description: `Interface synchronized to ${val === 'none' ? 'Company Default' : val}.` });
  };

  const handleSwitchTenant = (tenant: Tenant) => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(TENANT_OVERRIDE_STORAGE_KEY, tenant.id);
    window.document.cookie = `${TENANT_OVERRIDE_COOKIE}=${encodeURIComponent(tenant.id)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.dispatchEvent(new Event('safeviate-tenant-switch'));

    toast({
      title: 'Active Context Shifted',
      description: `Terminal established as "${tenant.name}".`,
    });
  };

  const tenantContextId = selectedTenantId || activeTenantId || 'safeviate';

  useEffect(() => {
    let cancelled = false;

    const loadNdaAcceptances = async () => {
      if (!tenantContextId) {
        setNdaAcceptances([]);
        return;
      }

      setIsLoadingNdaAcceptances(true);
      setNdaAcceptancesError(null);

      try {
        const params = new URLSearchParams({ tenantId: tenantContextId });
        const response = await fetch(`/api/beta-nda-acceptances?${params.toString()}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load NDA acceptances.');
        }

        setNdaAcceptances(Array.isArray(payload?.acceptances) ? payload.acceptances : []);
      } catch (error) {
        if (!cancelled) {
          setNdaAcceptances([]);
          setNdaAcceptancesError(error instanceof Error ? error.message : 'Failed to load NDA acceptances.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingNdaAcceptances(false);
        }
      }
    };

    void loadNdaAcceptances();

    return () => {
      cancelled = true;
    };
  }, [tenantContextId]);

  const handleClearForm = () => {
    setSelectedTenantId(null);
    setTenantName('');
    setIndustry('Aviation: Flight Training (ATO)');
    setLogoPreview(null);
    setMainTheme(DEFAULT_MAIN);
    setEnabledHrefs(buildDefaultEnabledHrefs());
    setPageLayoutSettings(buildDefaultPageLayoutSettings());
  };

  const handleResetCompanyDefaults = () => {
    setEnabledHrefs(buildDefaultEnabledHrefs());
    setPageLayoutSettings(buildDefaultPageLayoutSettings());
    toast({
      title: 'Company Defaults Restored',
      description: 'Baseline menus and page layout settings have been restored.',
    });
  };

  const handleEnableAllMenuItems = () => {
    setEnabledHrefs(buildDefaultEnabledHrefs());
  };

  const handleClearAllMenuItems = () => {
    setEnabledHrefs(new Set());
  };

  const handleEnableAllPages = () => {
    setPageLayoutSettings(buildDefaultPageLayoutSettings());
  };

  const handleDisableAllPages = () => {
    setPageLayoutSettings(buildDisabledPageLayoutSettings());
  };

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

  const toggleLayoutPage = (pageId: string) => {
    setPageLayoutSettings((current) => ({
      ...current,
      pages: {
        ...current.pages,
        [pageId]: {
          ...current.pages[pageId],
          enabled: !current.pages[pageId]?.enabled,
        },
      },
    }));
  };

  const toggleLayoutSection = (pageId: string, sectionId: string) => {
    setPageLayoutSettings((current) => ({
      ...current,
      pages: {
        ...current.pages,
        [pageId]: {
          ...current.pages[pageId],
          sections: {
            ...current.pages[pageId]?.sections,
            [sectionId]: !current.pages[pageId]?.sections?.[sectionId],
          },
        },
      },
    }));
  };

  const toggleLayoutTab = (pageId: string, tabId: string) => {
    setPageLayoutSettings((current) => ({
      ...current,
      pages: {
        ...current.pages,
        [pageId]: {
          ...current.pages[pageId],
          tabs: {
            ...current.pages[pageId]?.tabs,
            [tabId]: !current.pages[pageId]?.tabs?.[tabId],
          },
        },
      },
    }));
  };

  const handleSaveTenant = async () => {
    if (!tenantName) {
      toast({ variant: 'destructive', title: 'Invalid Operation', description: 'Company name is required.' });
      return;
    }
    
    const tenantId = selectedTenantId || tenantName.toLowerCase().replace(/\s+/g, '-');

    try {
      const nextTenants = [...tenants];
      const index = nextTenants.findIndex(t => t.id === tenantId);
      
      const tenantData: Tenant = {
          id: tenantId,
          name: tenantName,
          industry: industry,
          logoUrl: logoPreview || '',
          theme: {
            primaryColour: mainTheme.primary,
            backgroundColour: mainTheme.background,
            accentColour: mainTheme.accent,
            main: mainTheme,
          },
          enabledMenus: Array.from(new Set([
            ...enabledHrefs,
          ])),
          pageLayoutSettings,
          tabVisibilitySettings: {
            id: 'tab-visibility',
            visibilities: Object.fromEntries(
              Object.entries(pageLayoutSettings.pages).map(([pageKey, layout]) => [pageKey, layout.enabled])
            ),
          },
      };

      if (index >= 0) {
          nextTenants[index] = tenantData;
      } else {
          nextTenants.push(tenantData);
      }

      await fetch('/api/tenants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: tenantData }),
      });
      await fetch(`/api/tenant-config?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            id: tenantId,
            name: tenantName,
            industry,
            logoUrl: logoPreview || '',
            enabledMenus: Array.from(new Set([
              ...enabledHrefs,
            ])),
            pageLayoutSettings,
            tabVisibilitySettings: {
              id: 'tab-visibility',
              visibilities: Object.fromEntries(
                Object.entries(pageLayoutSettings.pages).map(([pageKey, layout]) => [pageKey, layout.enabled])
              ),
            },
          },
        }),
      });
      setTenants(nextTenants);
      window.dispatchEvent(new Event('safeviate-tenants-updated'));
      
      toast({
        title: selectedTenantId ? 'Company Updated' : 'Company Created',
        description: `"${tenantName}" has been saved in the database.`,
      });

      if (!selectedTenantId) handleClearForm();

    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Commit Failure', description: e instanceof Error ? e.message : 'System fault during persistence.' });
    }
  };

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-3xl border bg-background shadow-none">
      <CardHeader className="relative shrink-0 overflow-hidden border-b bg-muted/5 p-8">
        <div className="absolute right-0 top-0 p-8 opacity-5">
            <Building2 className="h-32 w-32 rotate-12" />
        </div>
        <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-4 text-left">
                <Badge variant="outline" className="h-7 px-4 text-[10px] font-black uppercase tracking-widest text-primary border-primary/30 bg-primary/5">
                    <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                    Company Setup Admin
                </Badge>
                <div>
                    <CardTitle className="text-4xl font-black uppercase leading-none tracking-tighter">Company Setup Console</CardTitle>
                    <CardDescription className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground opacity-70">
                        Create companies, choose default modules, and control page access before saving.
                    </CardDescription>
                </div>
            </div>
            <Button onClick={handleClearForm} className={TENANT_SETUP_PRIMARY_BUTTON_CLASS}>
              <PlusCircle className="mr-3 h-4 w-4" /> New Company
            </Button>
        </div>
      </CardHeader>

      <Tabs defaultValue="setup" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b bg-muted/5 px-4 py-3 sm:px-8">
          <TabsList className={cn(HEADER_TAB_LIST_CLASS, 'w-full overflow-x-auto')}>
            <TabsTrigger value="setup" className={cn(HEADER_TAB_TRIGGER_CLASS, 'text-[10px]')}>Setup</TabsTrigger>
            <TabsTrigger value="access" className={cn(HEADER_TAB_TRIGGER_CLASS, 'text-[10px]')}>Access & Visibility</TabsTrigger>
            <TabsTrigger value={PAGE_LAYOUT_TAB_ID} className={cn(HEADER_TAB_TRIGGER_CLASS, 'text-[10px]')}>Pages & Layout</TabsTrigger>
          </TabsList>
        </div>

        <CardContent className="flex-1 min-h-0 overflow-hidden bg-muted/5 p-0">
          <ScrollArea className="h-full">
            <div className="space-y-8 p-8 pb-6">
              <TabsContent value="setup" className="mt-0 space-y-8">
                <Card className="border shadow-none bg-background">
                  <CardContent className="space-y-4 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Company setup summary</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          Create a new company profile or clone an existing one, then tune its menu and layout defaults before saving.
                        </p>
                      </div>
                      <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
                        {selectedTenantId ? 'Editing existing company' : 'Creating new company'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-2xl border bg-muted/5 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Companies</p>
                        <p className="mt-1 text-lg font-black">{sortedTenants.length}</p>
                      </div>
                      <div className="rounded-2xl border bg-muted/5 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Menus</p>
                        <p className="mt-1 text-lg font-black">{enabledMenuCount}/{totalMenuCount}</p>
                      </div>
                      <div className="rounded-2xl border bg-muted/5 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Pages</p>
                        <p className="mt-1 text-lg font-black">{enabledPageCount}/{totalPageCount}</p>
                      </div>
                      <div className="rounded-2xl border bg-muted/5 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Sections</p>
                        <p className="mt-1 text-lg font-black">{enabledSectionCount}/{totalSectionCount}</p>
                      </div>
                      <div className="rounded-2xl border bg-muted/5 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Tabs</p>
                        <p className="mt-1 text-lg font-black">{enabledTabCount}/{totalTabCount}</p>
                      </div>
                      <div className="rounded-2xl border bg-muted/5 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Mode</p>
                        <p className="mt-1 text-lg font-black">{industry}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                  <div className="space-y-6">
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 items-end">
                          <div className="space-y-2.5 text-left">
                              <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Clone Existing Company</Label>
                              <Select onValueChange={handleLoadTenant} value={selectedTenantId || undefined}>
                                  <SelectTrigger className="h-10 rounded-xl border-2 bg-background text-[10px] font-bold uppercase shadow-none transition-colors hover:border-primary/50">
                                    <SelectValue placeholder={isLoadingTenants ? "Accessing Core..." : "Choose company..."} />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl border-2">
                                      {sortedTenants.map(t => (<SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase">{t.name}</SelectItem>))}
                                  </SelectContent>
                              </Select>
                          </div>
                          <div className="space-y-2.5 text-left">
                              <Label htmlFor="tenant-name" className="ml-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Company Name</Label>
                              <Input id="tenant-name" placeholder="Safeviate Aviation" className="h-10 rounded-xl border-2 text-sm font-black uppercase tracking-tight focus-visible:ring-primary/20" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
                          </div>
                          <div className="col-span-full space-y-2.5 text-left">
                              <Label className="ml-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                <Briefcase className="h-3.5 w-3.5 text-primary" />
                                Industry Logic Profile
                              </Label>
                              <Select onValueChange={(v) => handleIndustryChange(v as IndustryType)} value={industry}>
                                  <SelectTrigger className="h-10 rounded-xl border-2 bg-background text-[10px] font-black uppercase tracking-tight shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl border-2">
                                      {INDUSTRY_TYPES.map(t => <SelectItem key={t} value={t} className="text-[10px] font-black uppercase">{t}</SelectItem>)}
                                  </SelectContent>
                              </Select>
                          </div>
                      </div>
                  </div>

                  <div className="space-y-6">
                      <div className="group relative overflow-hidden rounded-3xl border bg-background p-6 shadow-none">
                          <div className="absolute right-0 top-0 p-4 opacity-5 transition-opacity group-hover:opacity-10">
                              <LayoutDashboard className="h-20 w-20" />
                          </div>
                          <div className="relative z-10 flex flex-col gap-2 text-left">
                              <div>
                                  <h3 className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                                    <MonitorSmartphone className="h-4 w-4" />
                                    Interface Vector Simulation
                                  </h3>
                                  <p className="text-[10px] font-bold uppercase opacity-50 text-muted-foreground">Local override for aesthetic validation.</p>
                              </div>
                              <div className="pt-4">
                                <Select value={localIndustryOverride} onValueChange={handleApplyIndustryOverride}>
                                    <SelectTrigger className="h-10 rounded-xl border-2 border-dashed bg-muted/5 text-[10px] font-bold uppercase shadow-none group-hover:border-primary/50">
                                        <SelectValue placeholder="Bypass Active" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="none" className="text-[10px] font-bold uppercase">No Simulation (Default)</SelectItem>
                                        {INDUSTRY_TYPES.map(t => <SelectItem key={t} value={t} className="text-[10px] font-bold uppercase">{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                              </div>
                          </div>
                      </div>

                      <div className="relative overflow-hidden rounded-3xl border bg-background p-6 shadow-none">
                          <div className="flex flex-col gap-2 text-left">
                              <div className="mb-2 flex items-center justify-between">
                                  <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                                      <ArrowRightLeft className="h-4 w-4" />
                                      System Impersonation
                                  </h3>
                                  <Badge variant="outline" className="h-6 gap-2 rounded-full border-2 border-primary/20 px-3 text-[9px] font-black uppercase tracking-widest text-primary">
                                      <CheckCircle2 className="h-3 w-3" />
                                      {(sortedTenants.find((tenant) => tenant.id === activeTenantId)?.name) || activeTenantId || 'None'}
                                  </Badge>
                              </div>
                              <div className="flex flex-wrap gap-2 pt-2">
                                  {sortedTenants.slice(0, 4).map((tenant) => {
                                      const isActive = tenant.id === activeTenantId;
                                      return (
                                          <Button
                                              key={tenant.id}
                                              variant={isActive ? 'secondary' : 'outline'}
                                              size="sm"
                                              className={cn(
                                                  'h-8 rounded-xl px-3 text-[9px] font-black uppercase tracking-widest shadow-none transition-all',
                                                  isActive ? 'bg-primary text-white' : 'hover:border-primary/50 hover:bg-primary/5'
                                              )}
                                              onClick={() => handleSwitchTenant(tenant)}
                                              disabled={isActive}
                                          >
                                              {tenant.name}
                                          </Button>
                                  );
                              })}
                              </div>
                          </div>
                      </div>

                      <div className="relative overflow-hidden rounded-3xl border bg-background p-6 shadow-none">
                          <div className="flex items-start justify-between gap-4 text-left">
                              <div>
                                  <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                                      <ShieldCheck className="h-4 w-4" />
                                      NDA Acceptances
                                  </h3>
                                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                                      Signed beta access records for the selected tenant.
                                  </p>
                              </div>
                              <Badge variant="outline" className="h-6 rounded-full border-2 border-primary/20 px-3 text-[9px] font-black uppercase tracking-widest text-primary">
                                  {tenantContextId}
                              </Badge>
                          </div>

                          <div className="mt-4 space-y-3">
                              {isLoadingNdaAcceptances ? (
                                  <div className="rounded-2xl border border-dashed border-slate-200 bg-muted/5 px-4 py-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                      Loading signed records...
                                  </div>
                              ) : ndaAcceptancesError ? (
                                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                                      {ndaAcceptancesError}
                                  </div>
                              ) : ndaAcceptances.length > 0 ? (
                                  ndaAcceptances.map((acceptance) => (
                                      <div key={acceptance.id} className="rounded-2xl border border-slate-200 bg-muted/5 px-4 py-4">
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                              <div>
                                                  <div className="text-sm font-black uppercase tracking-tight text-foreground">{acceptance.name}</div>
                                                  <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{acceptance.email}</div>
                                              </div>
                                              <Badge variant="outline" className="h-6 rounded-full border-2 border-primary/20 px-3 text-[9px] font-black uppercase tracking-widest text-primary">
                                                  {acceptance.ndaVersion}
                                              </Badge>
                                          </div>
                                          <div className="mt-3 grid grid-cols-1 gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:grid-cols-2">
                                              <div>
                                                  Accepted
                                                  <div className="mt-1 text-[11px] font-black tracking-tight text-foreground">
                                                      {new Date(acceptance.acceptedAt).toLocaleString()}
                                                  </div>
                                              </div>
                                              <div>
                                                  Signature
                                                  <div className="mt-1 text-[11px] font-black tracking-tight text-foreground">
                                                      Recorded electronically
                                                  </div>
                                              </div>
                                          </div>
                                      </div>
                                  ))
                              ) : (
                                  <div className="rounded-2xl border border-dashed border-slate-200 bg-muted/5 px-4 py-5 text-sm text-muted-foreground">
                                      No NDA acceptances recorded for this tenant yet.
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="access" className="mt-0 space-y-8">
                <div className="space-y-8">
                    <div className="flex items-center gap-4 text-left">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-none">
                            <Users className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter">Access & Visibility</h3>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Choose which modules, menus, and linked pages this company can see.</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-background px-4 py-3">
                      <Button type="button" variant="outline" className={TENANT_SETUP_PRIMARY_BUTTON_CLASS} onClick={handleEnableAllMenuItems}>
                        Enable All Menus
                      </Button>
                      <Button type="button" variant="outline" className={TENANT_SETUP_PRIMARY_BUTTON_CLASS} onClick={handleClearAllMenuItems}>
                        Clear All Menus
                      </Button>
                      <Button type="button" variant="outline" className={TENANT_SETUP_PRIMARY_BUTTON_CLASS} onClick={handleResetCompanyDefaults}>
                        Reset Company Defaults
                      </Button>
                      <div className="ml-auto text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {enabledMenuCount} of {totalMenuCount} menus enabled
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {menuConfig.map((menu) => {
                            const subHrefs = menu.subItems?.map(s => s.href) || [];
                            const isEnabled = enabledHrefs.has(menu.href);
                            return (
                                <div 
                                    key={menu.href} 
                                    className={cn(
                                        'group/menu space-y-4 rounded-3xl border bg-background p-6 shadow-none transition-all',
                                        isEnabled ? 'border-primary bg-primary/5' : 'border-slate-200'
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <div className={cn('rounded-lg p-2 transition-colors', isEnabled ? 'bg-primary text-white' : 'bg-muted text-muted-foreground group-hover/menu:bg-primary/10 group-hover/menu:text-primary')}>
                                                <menu.icon className="h-5 w-5" />
                                            </div>
                                            <Label htmlFor={`menu-${menu.href}`} className="cursor-pointer text-sm font-black uppercase tracking-tight leading-none">
                                                {menu.label}
                                            </Label>
                                        </div>
                                        <Checkbox 
                                            id={`menu-${menu.href}`} 
                                            checked={isEnabled} 
                                            onCheckedChange={() => toggleMenu(menu.href, subHrefs)}
                                            className="h-6 w-6 border-2 data-[state=checked]:bg-primary"
                                        />
                                    </div>
                                    
                                    {menu.subItems && (
                                        <div className="space-y-3 border-t border-slate-100 pl-4 pt-4">
                                            {menu.subItems.map((sub) => (
                                                <div key={sub.href} className="group/sub flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-30" />
                                                        <Label htmlFor={`sub-${sub.href}`} className="cursor-pointer text-[11px] font-bold uppercase tracking-widest opacity-60 transition-opacity group-hover/sub:opacity-100">{sub.label}</Label>
                                                    </div>
                                                    <Checkbox 
                                                        id={`sub-${sub.href}`} 
                                                        checked={enabledHrefs.has(sub.href)} 
                                                        onCheckedChange={() => toggleSubMenu(menu.href, sub.href)}
                                                        className="h-4 w-4 border-2 data-[state=checked]:bg-primary"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
              </TabsContent>

              <TabsContent value={PAGE_LAYOUT_TAB_ID} className="mt-0 space-y-8">
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-2 text-left">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
                          Layout Assignment
                        </Badge>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {Object.values(pageLayoutSettings.pages).filter((page) => page.enabled).length} pages enabled
                        </span>
                      </div>
                      <h3 className="text-2xl font-black uppercase tracking-tighter">Pages, Sections, and Tabs</h3>
                      <p className="max-w-3xl text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                        Switch pages on or off, then decide which sections and tabs remain available inside each one.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className={TENANT_SETUP_PRIMARY_BUTTON_CLASS} onClick={handleEnableAllPages}>
                        Enable All Pages
                      </Button>
                      <Button type="button" variant="outline" className={TENANT_SETUP_PRIMARY_BUTTON_CLASS} onClick={handleDisableAllPages}>
                        Disable All Pages
                      </Button>
                      <Button type="button" variant="outline" className={TENANT_SETUP_PRIMARY_BUTTON_CLASS} onClick={handleResetCompanyDefaults}>
                        Reset Layout Defaults
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    {SAFETY_QUALITY_LAYOUT_DEFINITIONS.map((page) => {
                      const layout = pageLayoutSettings.pages[page.id] || buildDefaultPageLayoutSettings().pages[page.id];
                      return (
                        <Card key={page.id} className={cn('border shadow-none', layout?.enabled ? 'border-primary/20 bg-primary/5' : 'border-slate-200')}>
                          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-muted/10 px-4 py-3">
                            <div className="space-y-1">
                              <p className="text-sm font-black uppercase tracking-tight text-foreground">{page.label}</p>
                              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{page.description}</p>
                              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                                {page.sections.length} sections · {page.sections.reduce((count, section) => count + (section.tabs?.length || 0), 0)} tabs
                              </p>
                            </div>
                            <Checkbox
                              checked={layout?.enabled ?? true}
                              onCheckedChange={() => toggleLayoutPage(page.id)}
                              className="h-5 w-5 shrink-0"
                            />
                          </CardHeader>
                          <CardContent className="space-y-4 px-4 py-4">
                            {page.sections.map((section) => (
                              <div key={section.id} className="space-y-3 rounded-2xl border bg-background p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground">
                                      {formatLayoutLabel(section.label)}
                                    </p>
                                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                      Section on this page
                                    </p>
                                  </div>
                                  <Checkbox
                                    checked={layout?.sections?.[section.id] ?? true}
                                    onCheckedChange={() => toggleLayoutSection(page.id, section.id)}
                                    className="h-4 w-4 shrink-0"
                                  />
                                </div>

                                {section.tabs && section.tabs.length > 0 && (
                                  <div className="space-y-2 border-t pt-3">
                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                                      Tabs
                                    </p>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      {section.tabs.map((tab) => (
                                        <div key={tab.id} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/5 px-3 py-2">
                                          <span className="text-[10px] font-black uppercase tracking-tight text-foreground">
                                            {tab.label}
                                          </span>
                                          <Checkbox
                                            checked={layout?.tabs?.[tab.id] ?? true}
                                            onCheckedChange={() => toggleLayoutTab(page.id, tab.id)}
                                            className="h-4 w-4 shrink-0"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </CardContent>
      </Tabs>

      <Separator />
      <div className="shrink-0 bg-background p-6 sm:p-8 flex justify-end">
          <Button onClick={handleSaveTenant} className={cn(TENANT_SETUP_PRIMARY_BUTTON_CLASS, 'w-full gap-3 sm:w-72')}>
              {selectedTenantId ? <><Save className="h-4 w-4" /> Update Company</> : <><PlusCircle className="h-4 w-4" /> Save Company</>}
          </Button>
      </div>
    </Card>
  );
}
