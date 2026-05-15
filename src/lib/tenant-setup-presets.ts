export type PageTabDefinition = {
  id: string;
  label: string;
};

export type PageSectionDefinition = {
  id: string;
  label: string;
  tabs?: PageTabDefinition[];
};

export type PageLayoutDefinition = {
  id: string;
  href: string;
  label: string;
  description: string;
  sections: PageSectionDefinition[];
};

export type PageLayoutState = {
  enabled: boolean;
  sections: Record<string, boolean>;
  tabs: Record<string, boolean>;
};

export type PageLayoutSettings = {
  id: string;
  pages: Record<string, PageLayoutState>;
};

export const SAFETY_QUALITY_LAYOUT_DEFINITIONS: PageLayoutDefinition[] = [
  {
    id: 'company-dashboard',
    href: '/dashboard',
    label: 'Company Dashboard',
    description: 'The shared overview surface that leads into safety and quality work.',
    sections: [
      {
        id: 'executive-summary',
        label: 'Executive Summary',
      },
      {
        id: 'core-dashboard-focus',
        label: 'Core Dashboard Focus',
        tabs: [
          { id: 'safety', label: 'Safety' },
          { id: 'quality', label: 'Quality' },
          { id: 'users', label: 'Users' },
          { id: 'admin', label: 'Admin' },
        ],
      },
    ],
  },
  {
    id: 'my-dashboard',
    href: '/my-dashboard',
    label: 'My Dashboard',
    description: 'Personal tasks, messages, and logbook access.',
    sections: [
      {
        id: 'tasks',
        label: 'Tasks',
      },
      {
        id: 'messages',
        label: 'Messages',
      },
      {
        id: 'logbook',
        label: 'Logbook',
      },
    ],
  },
  {
    id: 'safety',
    href: '/safety',
    label: 'Safety',
    description: 'Safety reporting, indicators, and related control surfaces.',
    sections: [
      {
        id: 'modules',
        label: 'Core Safety Modules',
        tabs: [
          { id: 'management-of-change', label: 'Management of Change' },
          { id: 'safety-files', label: 'Safety Files' },
          { id: 'risk-matrix', label: 'Risk Matrix' },
          { id: 'risk-register', label: 'Risk Register' },
          { id: 'safety-indicators', label: 'Safety Indicators' },
          { id: 'safety-reports', label: 'Safety Reports' },
        ],
      },
    ],
  },
  {
    id: 'risk-register',
    href: '/safety/risk-register',
    label: 'Risk Register',
    description: 'Hazard areas, organization tabs, and register records.',
    sections: [
      {
        id: 'organization-scope',
        label: 'Organization Scope',
        tabs: [
          { id: 'internal', label: 'Internal' },
          { id: 'external', label: 'External Organizations' },
        ],
      },
      {
        id: 'hazard-areas',
        label: 'Hazard Areas',
      },
    ],
  },
  {
    id: 'safety-reports',
    href: '/safety/safety-reports',
    label: 'Safety Reports',
    description: 'Formal report sections and review tabs.',
    sections: [
      {
        id: 'report-views',
        label: 'Report Views',
        tabs: [
          { id: 'full', label: 'Full Report' },
          { id: 'triage', label: 'Report & Triage' },
          { id: 'hazards', label: 'Hazard & Risk ID' },
          { id: 'investigation', label: 'Investigation' },
          { id: 'cap', label: 'Corrective Actions' },
          { id: 'review', label: 'Final Review' },
          { id: 'discussion', label: 'Discussion' },
        ],
      },
    ],
  },
  {
    id: 'audits',
    href: '/quality/audits',
    label: 'Quality',
    description: 'Audit, risk, and task-tracking surfaces for quality control.',
    sections: [
      {
        id: 'audit-status',
        label: 'Audit Status',
        tabs: [
          { id: 'active', label: 'Active' },
          { id: 'archived', label: 'Archived' },
        ],
      },
      {
        id: 'organization-scope',
        label: 'Organization Scope',
        tabs: [
          { id: 'internal', label: 'Internal' },
          { id: 'external', label: 'External Organizations' },
        ],
      },
    ],
  },
  {
    id: 'quality-core',
    href: '/quality',
    label: 'Quality',
    description: 'Quality module landing area and linked tools.',
    sections: [
      {
        id: 'modules',
        label: 'Core Quality Modules',
        tabs: [
          { id: 'audit-checklists', label: 'Audit Checklists' },
          { id: 'audit-schedule', label: 'Audit Schedule' },
          { id: 'coherence-matrix', label: 'Coherence Matrix' },
          { id: 'risk-plan', label: 'Risk Plan' },
          { id: 'task-tracker', label: 'Task Tracker' },
        ],
      },
    ],
  },
  {
    id: 'users',
    href: '/users',
    label: 'Users',
    description: 'Personnel, roles, access, and account administration.',
    sections: [
      {
        id: 'directory',
        label: 'Directory',
        tabs: [
          { id: 'personnel', label: 'All Users' },
          { id: 'access-overview', label: 'Access Overview' },
        ],
      },
    ],
  },
  {
    id: 'users-personnel',
    href: '/users/personnel',
    label: 'Personnel',
    description: 'Personnel directory and account access assignments.',
    sections: [
      {
        id: 'directory',
        label: 'Directory',
      },
      {
        id: 'access',
        label: 'Access',
      },
      {
        id: 'permissions',
        label: 'Permissions',
      },
    ],
  },
  {
    id: 'admin',
    href: '/admin',
    label: 'Admin',
    description: 'Admin tools that support the safety and quality tenant footprint.',
    sections: [
      {
        id: 'configuration',
        label: 'Configuration',
        tabs: [
          { id: 'page-format', label: 'Page Format' },
          { id: 'roles', label: 'Roles' },
          { id: 'department', label: 'Department' },
          { id: 'external', label: 'External Companies' },
          { id: 'permissions', label: 'Permissions' },
        ],
      },
    ],
  },
  {
    id: 'admin-page-format',
    href: '/admin/page-format',
    label: 'Page Format',
    description: 'Branding and access tuning for the selected tenant.',
    sections: [
      {
        id: 'theme',
        label: 'Theme',
      },
      {
        id: 'visibility',
        label: 'Visibility',
      },
      {
        id: 'layout',
        label: 'Layout',
      },
    ],
  },
  {
    id: 'operations-support',
    href: '/operations',
    label: 'Operations Support',
    description: 'Operational surfaces that feed the safety and quality workflow.',
    sections: [
      {
        id: 'support-pages',
        label: 'Supporting Pages',
        tabs: [
          { id: 'alerts', label: 'Alerts' },
          { id: 'company-documents', label: 'Company Documents' },
          { id: 'emergency-response', label: 'Emergency Response' },
        ],
      },
    ],
  },
  {
    id: 'tenant-setup',
    href: '/development/database',
    label: 'Tenant Setup',
    description: 'Company and page-layout setup for the Safeviate tenant.',
    sections: [
      {
        id: 'setup',
        label: 'Setup',
      },
      {
        id: 'access',
        label: 'Access & Visibility',
      },
      {
        id: 'layout',
        label: 'Pages, Sections, and Tabs',
      },
    ],
  },
];

export const buildDefaultPageLayoutSettings = (): PageLayoutSettings => ({
  id: 'page-layout-settings',
  pages: SAFETY_QUALITY_LAYOUT_DEFINITIONS.reduce<Record<string, PageLayoutState>>((acc, page) => {
    acc[page.id] = {
      enabled: true,
      sections: page.sections.reduce<Record<string, boolean>>((sectionAcc, section) => {
        sectionAcc[section.id] = true;
        return sectionAcc;
      }, {}),
      tabs: page.sections.reduce<Record<string, boolean>>((tabAcc, section) => {
        (section.tabs || []).forEach((tab) => {
          tabAcc[tab.id] = true;
        });
        return tabAcc;
      }, {}),
    };
    return acc;
  }, {}),
});
