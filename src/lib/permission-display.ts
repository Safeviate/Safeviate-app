import type { PermissionAction } from '@/lib/permissions-config';

export type PermissionDisplayLabel = 'View' | 'Edit' | 'Manage';

const VIEW_ACTIONS = new Set<PermissionAction>([
  'view',
  'view-all',
  'history-view',
  'schedule-view',
]);

const EDIT_ACTIONS = new Set<PermissionAction>([
  'create',
  'edit',
  'calculate-booking',
  'preflight-manage',
  'postflight-manage',
  'manage-definitions',
  'edit-colors',
]);

const MANAGE_ACTIONS = new Set<PermissionAction>([
  'delete',
  'manage',
  'manage-templates',
  'schedule-manage',
  'approve',
  'approve-override',
  'techlog-override',
  'admin',
  'export',
  'sign',
]);

export function getPermissionDisplayLabel(action: PermissionAction): PermissionDisplayLabel {
  if (VIEW_ACTIONS.has(action)) return 'View';
  if (EDIT_ACTIONS.has(action)) return 'Edit';
  if (MANAGE_ACTIONS.has(action)) return 'Manage';

  return 'Manage';
}
