export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'manage' | 'manage-templates' | 'calculate-booking' | 'schedule-view' | 'schedule-manage' | 'history-view' | 'preflight-manage' | 'postflight-manage' | 'view-all' | 'approve' | 'approve-override' | 'techlog-override' | 'manage-definitions' | 'edit-colors' | 'admin' | 'export' | 'sign';

export type PermissionResource = {
  id: string;
  name: string;
  actions: PermissionAction[];
  hidden?: boolean;
  description?: string;
};

/**
 * Defines all the granular permissions available in the application.
 */
export const permissionsConfig: PermissionResource[] = [
  { id: 'dashboard', name: 'Dashboard', actions: ['view'] },
  { id: 'my-dashboard', name: 'My Dashboard', actions: ['view'] },
  
  { id: 'operations', name: 'Operations', actions: ['view'] },
  { id: 'operations-alerts', name: 'Alerts', actions: ['view', 'edit', 'manage'] },
  { id: 'operations-documents', name: 'Company Documents', actions: ['view', 'manage'] },
  { id: 'operations-erp', name: 'Emergency Response Plan', actions: ['view', 'edit', 'manage'] },
  
  {
    id: 'bookings',
    name: 'Bookings',
    actions: ['view', 'edit', 'manage'],
    description: 'Schedule access also respects aircraft service-block rules, so red 50h/100h warnings prevent new flight bookings until hours are updated.',
  },

  { id: 'accounting', name: 'Accounting & Billing', actions: ['view', 'edit', 'manage'] },

  { id: 'safety', name: 'Safety', actions: ['view'] },
  { id: 'safety-reports', name: 'Safety Reports', actions: ['manage'] },
  { id: 'risk-register', name: 'Risk Register', actions: ['view', 'edit'] },
  { id: 'risk-matrix', name: 'Risk Matrix', actions: ['view', 'edit', 'manage'] },
  { id: 'safety-indicators', name: 'Safety Indicators', actions: ['view'] },
  { id: 'moc', name: 'Management of Change', actions: ['manage'] },

  { id: 'quality', name: 'Quality', actions: ['view'] },
  { id: 'quality-audits', name: 'Audits', actions: ['view', 'edit', 'manage'] },
  { id: 'quality-audit-schedule', name: 'Audit Schedule', actions: ['view', 'edit', 'manage'] },
  { id: 'quality-templates', name: 'Quality Templates', actions: ['manage'], hidden: true },
  { id: 'quality-caps', name: 'Quality CAPs', actions: ['view'], hidden: true },
  { id: 'quality-tasks', name: 'Task Tracker', actions: ['view'] },
  { id: 'quality-matrix', name: 'Coherence Matrix', actions: ['view', 'manage'] },
  { id: 'quality-risk-plan', name: 'Quality Risk Plan', actions: ['view', 'manage'] },

  { id: 'training', name: 'Training', actions: ['view'] },
  { id: 'training-debriefs', name: 'Student Progress', actions: ['view', 'edit'] },
  { id: 'training-exams', name: 'Exams', actions: ['view', 'manage'] },
  { id: 'training-student-instructors', name: 'Student Instructor Assignments', actions: ['manage'], hidden: true },
  { id: 'training-student-progression', name: 'Student Progression Decisions', actions: ['manage'], hidden: true },

  { id: 'assets', name: 'Aircraft', actions: ['view', 'edit', 'manage'] },

  { id: 'maintenance', name: 'Maintenance', actions: ['view', 'manage'] },
  { id: 'maintenance-workpacks', name: 'Workpacks', actions: ['view', 'edit', 'manage'] },
  { id: 'maintenance-defects', name: 'Defect Reports', actions: ['view', 'edit', 'manage'] },
  { id: 'maintenance-schedule', name: 'Maintenance Schedule', actions: ['view', 'manage'] },

  { id: 'users', name: 'Users', actions: ['view', 'edit', 'manage'] },

  { id: 'admin', name: 'Admin', actions: ['view'] },
  { id: 'admin-roles', name: 'Roles', actions: ['manage'] },
  { id: 'admin-permissions', name: 'Permissions List', actions: ['view', 'manage'] },
  { id: 'admin-departments', name: 'Department', actions: ['manage'] },
  { id: 'admin-external-orgs', name: 'External Companies', actions: ['manage'] },
  { id: 'admin-settings', name: 'Admin Settings', actions: ['manage'] },
  { id: 'admin-database', name: 'Database Management', actions: ['manage'] },

  { id: 'settings', name: 'Theme & Branding', actions: ['manage'], hidden: true },
  { id: 'development', name: 'Development', actions: ['view'] },
];
