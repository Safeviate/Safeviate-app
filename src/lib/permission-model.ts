export type PermissionTier = 'view' | 'edit' | 'manage';

export type CanonicalPermission = {
  resource: string;
  tier: PermissionTier;
};

const TIER_RANK: Record<PermissionTier, number> = {
  view: 1,
  edit: 2,
  manage: 3,
};

const LEGACY_TO_CANONICAL: Record<string, CanonicalPermission> = {
  bookings: { resource: 'bookings', tier: 'view' },
  'bookings-view': { resource: 'bookings', tier: 'view' },
  'bookings-schedule-view': { resource: 'bookings', tier: 'view' },
  'bookings-history-view': { resource: 'bookings', tier: 'view' },
  'bookings-edit': { resource: 'bookings', tier: 'edit' },
  'bookings-schedule-manage': { resource: 'bookings', tier: 'edit' },
  'bookings-preflight-manage': { resource: 'bookings', tier: 'edit' },
  'bookings-postflight-manage': { resource: 'bookings', tier: 'edit' },
  'bookings-manage': { resource: 'bookings', tier: 'manage' },
  'bookings-delete': { resource: 'bookings', tier: 'manage' },
  'bookings-approve': { resource: 'bookings', tier: 'manage' },
  'bookings-approve-override': { resource: 'bookings', tier: 'manage' },
  'bookings-techlog-override': { resource: 'bookings', tier: 'manage' },

  'accounting-view': { resource: 'accounting', tier: 'view' },
  'accounting-export': { resource: 'accounting', tier: 'edit' },
  'accounting-edit': { resource: 'accounting', tier: 'edit' },
  'accounting-manage': { resource: 'accounting', tier: 'manage' },

  'quality-audits-view': { resource: 'quality-audits', tier: 'view' },
  'quality-audits-view-all': { resource: 'quality-audits', tier: 'edit' },
  'quality-audits-edit': { resource: 'quality-audits', tier: 'edit' },
  'quality-audits-manage': { resource: 'quality-audits', tier: 'manage' },

  'quality-audit-schedule-view': { resource: 'quality-audit-schedule', tier: 'view' },
  'quality-audit-schedule-edit': { resource: 'quality-audit-schedule', tier: 'edit' },
  'quality-audit-schedule-manage': { resource: 'quality-audit-schedule', tier: 'manage' },

  'operations-alerts-view': { resource: 'operations-alerts', tier: 'view' },
  'operations-alerts-create': { resource: 'operations-alerts', tier: 'edit' },
  'operations-alerts-edit': { resource: 'operations-alerts', tier: 'edit' },
  'operations-alerts-delete': { resource: 'operations-alerts', tier: 'manage' },

  'operations-erp-view': { resource: 'operations-erp', tier: 'view' },
  'operations-erp-manage': { resource: 'operations-erp', tier: 'manage' },
  'operations-erp-admin': { resource: 'operations-erp', tier: 'manage' },

  'risk-register-view': { resource: 'risk-register', tier: 'view' },
  'risk-register-manage-definitions': { resource: 'risk-register', tier: 'edit' },

  'risk-matrix-view': { resource: 'risk-matrix', tier: 'view' },
  'risk-matrix-manage-definitions': { resource: 'risk-matrix', tier: 'edit' },
  'risk-matrix-edit-colors': { resource: 'risk-matrix', tier: 'edit' },

  'assets-view': { resource: 'assets', tier: 'view' },
  'assets-create': { resource: 'assets', tier: 'edit' },
  'assets-edit': { resource: 'assets', tier: 'edit' },
  'assets-delete': { resource: 'assets', tier: 'manage' },

  'maintenance-workpacks-view': { resource: 'maintenance-workpacks', tier: 'view' },
  'maintenance-workpacks-create': { resource: 'maintenance-workpacks', tier: 'edit' },
  'maintenance-workpacks-edit': { resource: 'maintenance-workpacks', tier: 'edit' },
  'maintenance-workpacks-delete': { resource: 'maintenance-workpacks', tier: 'manage' },
  'maintenance-workpacks-sign': { resource: 'maintenance-workpacks', tier: 'manage' },
  'maintenance-workpacks-approve': { resource: 'maintenance-workpacks', tier: 'manage' },

  'maintenance-defects-view': { resource: 'maintenance-defects', tier: 'view' },
  'maintenance-defects-create': { resource: 'maintenance-defects', tier: 'edit' },
  'maintenance-defects-edit': { resource: 'maintenance-defects', tier: 'edit' },
  'maintenance-defects-delete': { resource: 'maintenance-defects', tier: 'manage' },

  'users-view': { resource: 'users', tier: 'view' },
  'users-create': { resource: 'users', tier: 'edit' },
  'users-edit': { resource: 'users', tier: 'edit' },
  'users-delete': { resource: 'users', tier: 'manage' },
};

const CANONICAL_PERMISSION_PATTERN = /^(.*)-(view|edit|manage)$/;

export function parseCanonicalPermission(permissionId: string): CanonicalPermission | null {
  const legacy = LEGACY_TO_CANONICAL[permissionId];
  if (legacy) return legacy;

  const match = permissionId.match(CANONICAL_PERMISSION_PATTERN);
  if (!match) return null;

  return {
    resource: match[1],
    tier: match[2] as PermissionTier,
  };
}

export function normalizePermissionId(permissionId: string): string | null {
  const canonical = parseCanonicalPermission(permissionId);
  if (!canonical) return null;
  return `${canonical.resource}-${canonical.tier}`;
}

export function normalizePermissionIds(permissionIds: string[] | undefined | null): string[] {
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) return [];
  const normalized = new Set<string>();

  for (const permissionId of permissionIds) {
    if (!permissionId) continue;
    if (permissionId === '*') {
      normalized.add('*');
      continue;
    }
    const isDeny = permissionId.startsWith('!');
    const rawId = isDeny ? permissionId.slice(1) : permissionId;
    const canonical = normalizePermissionId(rawId);
    if (!canonical) continue;
    normalized.add(isDeny ? `!${canonical}` : canonical);
  }

  return Array.from(normalized);
}

export function hasHierarchicalPermission(
  grantedPermissionIds: Iterable<string>,
  requestedPermissionId: string,
  deniedPermissionIds?: Iterable<string>,
): boolean {
  const requested = parseCanonicalPermission(requestedPermissionId);
  if (!requested) return false;

  const requestedKey = `${requested.resource}-${requested.tier}`;
  const deniedSet = deniedPermissionIds ? new Set(deniedPermissionIds) : new Set<string>();
  if (deniedSet.has(requestedKey)) return false;

  for (const grantedPermissionId of grantedPermissionIds) {
    const granted = parseCanonicalPermission(grantedPermissionId);
    if (!granted || granted.resource !== requested.resource) continue;
    if (TIER_RANK[granted.tier] >= TIER_RANK[requested.tier]) {
      return true;
    }
  }

  return false;
}
