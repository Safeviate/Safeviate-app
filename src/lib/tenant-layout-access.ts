import type { Tenant } from '@/types/quality';

export type LayoutPageRequirement = {
  pageId: string;
};

export type LayoutSectionRequirement = {
  pageId: string;
  sectionId: string;
};

export type LayoutTabRequirement = {
  pageId: string;
  tabId: string;
};

export type TenantLayoutRequirement = {
  pageIds?: string[];
  sections?: LayoutSectionRequirement[];
  tabs?: LayoutTabRequirement[];
};

const ROUTE_LAYOUT_REQUIREMENTS: Record<string, TenantLayoutRequirement> = {
  '/dashboard': {
    pageIds: ['company-dashboard'],
  },
  '/my-dashboard': {
    pageIds: ['my-dashboard'],
  },
  '/safety': {
    pageIds: ['safety'],
  },
  '/safety/risk-register': {
    pageIds: ['safety', 'risk-register'],
    tabs: [{ pageId: 'safety', tabId: 'risk-register' }],
  },
  '/safety/safety-reports': {
    pageIds: ['safety', 'safety-reports'],
    tabs: [{ pageId: 'safety', tabId: 'safety-reports' }],
  },
  '/quality': {
    pageIds: ['quality-core'],
  },
  '/quality/audit-checklists': {
    pageIds: ['quality-core'],
    tabs: [{ pageId: 'quality-core', tabId: 'audit-checklists' }],
  },
  '/quality/gap-analyses': {
    pageIds: ['quality-core'],
    tabs: [{ pageId: 'quality-core', tabId: 'gap-analyses' }],
  },
  '/quality/gap-analyses/analyses': {
    pageIds: ['quality-core'],
    tabs: [{ pageId: 'quality-core', tabId: 'gap-analyses' }],
  },
  '/quality/audit-schedule': {
    pageIds: ['quality-core'],
    tabs: [{ pageId: 'quality-core', tabId: 'audit-schedule' }],
  },
  '/quality/audits': {
    pageIds: ['audits'],
  },
  '/quality/coherence-matrix': {
    pageIds: ['quality-core'],
    tabs: [{ pageId: 'quality-core', tabId: 'coherence-matrix' }],
  },
  '/quality/risk-plan': {
    pageIds: ['quality-core'],
    tabs: [{ pageId: 'quality-core', tabId: 'risk-plan' }],
  },
  '/quality/task-tracker': {
    pageIds: ['quality-core'],
    tabs: [{ pageId: 'quality-core', tabId: 'task-tracker' }],
  },
  '/users': {
    pageIds: ['users'],
  },
  '/users/personnel': {
    pageIds: ['users', 'users-personnel'],
    tabs: [{ pageId: 'users', tabId: 'personnel' }],
  },
  '/users/access-overview': {
    pageIds: ['users'],
    tabs: [{ pageId: 'users', tabId: 'access-overview' }],
  },
  '/admin': {
    pageIds: ['admin'],
  },
  '/admin/page-format': {
    pageIds: ['admin', 'admin-page-format'],
    tabs: [{ pageId: 'admin', tabId: 'page-format' }],
  },
  '/admin/roles': {
    pageIds: ['admin'],
    tabs: [{ pageId: 'admin', tabId: 'roles' }],
  },
  '/admin/department': {
    pageIds: ['admin'],
    tabs: [{ pageId: 'admin', tabId: 'department' }],
  },
  '/admin/external': {
    pageIds: ['admin'],
    tabs: [{ pageId: 'admin', tabId: 'external' }],
  },
  '/admin/permissions': {
    pageIds: ['admin'],
    tabs: [{ pageId: 'admin', tabId: 'permissions' }],
  },
  '/operations': {
    pageIds: ['operations-support'],
  },
  '/operations/alerts': {
    pageIds: ['operations-support'],
    tabs: [{ pageId: 'operations-support', tabId: 'alerts' }],
  },
  '/operations/company-documents': {
    pageIds: ['operations-support'],
    tabs: [{ pageId: 'operations-support', tabId: 'company-documents' }],
  },
  '/operations/emergency-response': {
    pageIds: ['operations-support'],
    tabs: [{ pageId: 'operations-support', tabId: 'emergency-response' }],
  },
};

export const getTenantLayoutManagedHrefs = () => Object.keys(ROUTE_LAYOUT_REQUIREMENTS);

export const getTenantHrefsForPage = (pageId: string) =>
  Object.entries(ROUTE_LAYOUT_REQUIREMENTS)
    .filter(([, requirement]) => requirement.pageIds?.includes(pageId))
    .map(([href]) => href);

export const getTenantHrefsForTab = (pageId: string, tabId: string) =>
  Object.entries(ROUTE_LAYOUT_REQUIREMENTS)
    .filter(([, requirement]) =>
      requirement.tabs?.some((tabRequirement) => tabRequirement.pageId === pageId && tabRequirement.tabId === tabId)
    )
    .map(([href]) => href);

export const getTenantLayoutRequirement = (href: string): TenantLayoutRequirement | null =>
  ROUTE_LAYOUT_REQUIREMENTS[href] ?? null;

export const isTenantLayoutRequirementEnabled = (
  tenant: Tenant | null | undefined,
  requirement: TenantLayoutRequirement | null | undefined
) => {
  if (!requirement) return true;

  const pages = tenant?.pageLayoutSettings?.pages ?? {};
  const pageIds = requirement.pageIds ?? [];
  const sections = requirement.sections ?? [];
  const tabs = requirement.tabs ?? [];

  return (
    pageIds.every((pageId) => pages[pageId]?.enabled ?? true) &&
    sections.every(({ pageId, sectionId }) => pages[pageId]?.sections?.[sectionId] ?? true) &&
    tabs.every(({ pageId, tabId }) => pages[pageId]?.tabs?.[tabId] ?? true)
  );
};

export const isTenantHrefEnabledByLayout = (
  tenant: Tenant | null | undefined,
  href: string
) => isTenantLayoutRequirementEnabled(tenant, getTenantLayoutRequirement(href));
