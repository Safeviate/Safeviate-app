export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'manage' | 'manage-templates' | 'calculate-booking' | 'schedule-view' | 'schedule-manage' | 'history-view' | 'preflight-manage' | 'postflight-manage' | 'view-all' | 'approve' | 'approve-override' | 'techlog-override' | 'manage-definitions' | 'edit-colors' | 'admin' | 'export' | 'sign';

export type PermissionResource = {
  id: string;
  name: string;
  actions: PermissionAction[];
};

/**
 * Defines all the granular permissions available in the application.
 */
export const permissionsConfig: PermissionResource[] = [
  { id: 'dashboard', name: 'Dashboard', actions: ['view'] },
  { id: 'my-dashboard', name: 'My Dashboard', actions: ['view'] },
  
  { id: 'operations', name: 'Operations', actions: ['view'] },
  { id: 'operations-alerts', name: 'Operations Alerts', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'operations-documents', name: 'Company Documents', actions: ['view', 'manage'] },
  { id: 'operations-erp', name: 'Emergency Response Plan', actions: ['view', 'manage', 'admin'] },
  
  { id: 'bookings', name: 'Bookings', actions: ['view', 'schedule-view', 'schedule-manage', 'history-view', 'preflight-manage', 'postflight-manage', 'delete', 'approve', 'approve-override', 'techlog-override'] },

  { id: 'accounting', name: 'Accounting', actions: ['view', 'manage', 'export'] },

  { id: 'safety', name: 'Safety', actions: ['view'] },
  { id: 'safety-reports', name: 'Safety Reports', actions: ['manage'] },
  { id: 'risk-register', name: 'Risk Register', actions: ['view', 'manage-definitions'] },
  { id: 'risk-matrix', name: 'Risk Matrix', actions: ['view', 'manage-definitions', 'edit-colors'] },
  { id: 'safety-indicators', name: 'Safety Indicators', actions: ['view'] },
  { id: 'moc', name: 'Management of Change', actions: ['manage'] },

  { id: 'quality', name: 'Quality', actions: ['view'] },
  { id: 'quality-audits', name: 'Quality Audits', actions: ['view', 'view-all', 'manage'] },
  { id: 'quality-templates', name: 'Quality Templates', actions: ['manage'] },
  { id: 'quality-caps', name: 'Quality CAPs', actions: ['view'] },
  { id: 'quality-tasks', name: 'Quality Tasks', actions: ['view'] },
  { id: 'quality-matrix', name: 'Quality Coherence Matrix', actions: ['view', 'manage'] },
  { id: 'quality-risk-plan', name: 'Quality Risk Plan', actions: ['view', 'manage'] },

  { id: 'training', name: 'Training', actions: ['view'] },
  { id: 'training-debriefs', name: 'Training: Student Debriefs', actions: ['view', 'edit'] },
  { id: 'training-exams', name: 'Training: Exams', actions: ['view', 'manage'] },
  { id: 'training-student-instructors', name: 'Training: Student Instructor Assignments', actions: ['manage'] },

  { id: 'assets', name: 'Assets: Aircraft', actions: ['view', 'create', 'edit', 'delete'] },

  { id: 'maintenance', name: 'Maintenance', actions: ['view', 'manage'] },
  { id: 'maintenance-workpacks', name: 'Maintenance Workpacks', actions: ['view', 'create', 'edit', 'delete', 'sign', 'approve'] },
  { id: 'maintenance-defects', name: 'Maintenance Defects', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'maintenance-schedule', name: 'Maintenance Schedule', actions: ['view', 'manage'] },

  { id: 'users', name: 'Users', actions: ['view', 'create', 'edit', 'delete'] },

  { id: 'admin', name: 'Admin', actions: ['view'] },
  { id: 'admin-roles', name: 'Admin: Roles', actions: ['manage'] },
  { id: 'admin-permissions', name: 'Admin: Permissions', actions: ['view', 'manage'] },
  { id: 'admin-departments', name: 'Admin: Departments', actions: ['manage'] },
  { id: 'admin-external-orgs', name: 'Admin: External Orgs', actions: ['manage'] },
  { id: 'admin-settings', name: 'Admin: General Settings', actions: ['manage'] },
  { id: 'admin-database', name: 'Admin: Database Management', actions: ['manage'] },

  { id: 'settings', name: 'Settings', actions: ['manage'] },
  { id: 'development', name: 'Development Tools', actions: ['view'] },
];
