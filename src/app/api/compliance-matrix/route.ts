import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { isMasterTenantEmail, MASTER_TENANT_ID } from '@/lib/server/tenant-access';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { normalizeRegulationCode, sanitizeComplianceMatrixEntry } from '@/lib/regulation-code';

type ComplianceMatrixEntry = {
  id: string;
  regulationCode?: string | null;
  parentRegulationCode?: string | null;
  organizationId?: string | null;
  regulationFamily?: string | null;
  [key: string]: unknown;
};

type PermissionSet = Set<string>;

function buildMatrixIdentityKey(item: ComplianceMatrixEntry) {
  return [
    normalizeRegulationFamily(item.regulationFamily),
    normalizeOrganizationScope(item.organizationId) || '',
    (typeof item.structureType === 'string' ? item.structureType.trim() : '') || '',
    normalizeRegulationCode(item.parentRegulationCode) || '',
    normalizeRegulationCode(item.regulationCode) || '',
  ].join('|');
}

function scoreMatrixEntry(item: ComplianceMatrixEntry) {
  let score = 0;
  if (normalizeRegulationCode(item.regulationCode)) score += 2;
  if (typeof item.regulationStatement === 'string' && item.regulationStatement.trim()) score += 4;
  if (typeof item.documentHeading === 'string' && item.documentHeading.trim()) score += 2;
  if (typeof item.technicalStandard === 'string' && item.technicalStandard.trim()) score += 5;
  if (typeof item.companyReference === 'string' && item.companyReference.trim()) score += 1;
  if (typeof item.responsibleManagerId === 'string' && item.responsibleManagerId.trim()) score += 1;
  return score;
}

function mergeMatrixEntries(base: ComplianceMatrixEntry, incoming: ComplianceMatrixEntry) {
  const merged: ComplianceMatrixEntry = { ...base, ...incoming };

  for (const [key, value] of Object.entries(base)) {
    if (!(key in merged)) {
      merged[key] = value;
      continue;
    }

    const incomingValue = merged[key];
    if (
      (incomingValue === null || incomingValue === undefined || incomingValue === '') &&
      value !== null &&
      value !== undefined &&
      value !== ''
    ) {
      merged[key] = value;
    }
  }

  merged.id = incoming.id || base.id || randomUUID();
  return merged;
}

function dedupeMatrixEntries(items: ComplianceMatrixEntry[]) {
  const deduped = new Map<string, ComplianceMatrixEntry>();

  for (const item of items) {
    const key = buildMatrixIdentityKey(item);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, item);
      continue;
    }

    const preferredBase = scoreMatrixEntry(existing) >= scoreMatrixEntry(item) ? existing : item;
    const preferredIncoming = preferredBase === existing ? item : existing;
    deduped.set(key, mergeMatrixEntries(preferredBase, preferredIncoming));
  }

  return Array.from(deduped.values());
}

function isWithinDeletionScope(item: ComplianceMatrixEntry, rootCode: string) {
  const itemCode = normalizeRegulationCode(item?.regulationCode);
  const itemParentCode = normalizeRegulationCode(item?.parentRegulationCode);

  if (!itemCode || !rootCode) {
    return false;
  }

  const matchesCodeTree =
    itemCode === rootCode ||
    itemCode.startsWith(`${rootCode}.`);

  const matchesParentTree =
    itemParentCode === rootCode ||
    itemParentCode.startsWith(`${rootCode}.`);

  return matchesCodeTree || matchesParentTree;
}

function normalizeOrganizationScope(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function normalizeRegulationFamily(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSameMatrixScope(a: ComplianceMatrixEntry, b: ComplianceMatrixEntry) {
  return (
    normalizeOrganizationScope(a.organizationId) === normalizeOrganizationScope(b.organizationId) &&
    normalizeRegulationFamily(a.regulationFamily) === normalizeRegulationFamily(b.regulationFamily)
  );
}

function collectDeletionIds(items: ComplianceMatrixEntry[], rootItem: ComplianceMatrixEntry) {
  const rootCode = normalizeRegulationCode(rootItem.regulationCode);
  const scopedItems = items.filter((entry) => isSameMatrixScope(entry, rootItem));
  const idsToDelete = new Set<string>();
  const codesToVisit = new Set<string>();

  if (rootCode) {
    codesToVisit.add(rootCode);
  }

  idsToDelete.add(rootItem.id);

  let changed = true;
  while (changed) {
    changed = false;

    for (const entry of scopedItems) {
      if (idsToDelete.has(entry.id)) {
        continue;
      }

      const itemCode = normalizeRegulationCode(entry.regulationCode);
      const itemParentCode = normalizeRegulationCode(entry.parentRegulationCode);
      const matchesKnownTree = Array.from(codesToVisit).some((knownCode) => isWithinDeletionScope(entry, knownCode));
      const matchesKnownParent = itemParentCode ? codesToVisit.has(itemParentCode) : false;

      if (!matchesKnownTree && !matchesKnownParent) {
        continue;
      }

      idsToDelete.add(entry.id);
      if (itemCode) {
        codesToVisit.add(itemCode);
      }
      changed = true;
    }
  }

  return idsToDelete;
}

async function getTenantId(request: Request) {
  return getTenantIdFromSession(request);
}

function mergePermissions(rolePermissions: unknown, overridePermissions: unknown) {
  const inheritedPermissions = Array.isArray(rolePermissions) ? rolePermissions.filter((permission): permission is string => typeof permission === 'string') : [];
  const overrideList = Array.isArray(overridePermissions) ? overridePermissions.filter((permission): permission is string => typeof permission === 'string') : [];
  const deniedPermissions = new Set(
    overrideList.filter((permission) => permission.startsWith('!')).map((permission) => permission.slice(1))
  );

  const grantedPermissions = new Set<string>();

  inheritedPermissions.forEach((permission) => {
    if (!deniedPermissions.has(permission)) {
      grantedPermissions.add(permission);
    }
  });

  overrideList.forEach((permission) => {
    if (!permission.startsWith('!')) {
      grantedPermissions.add(permission);
    }
  });

  return grantedPermissions;
}

function hasPermission(permissions: PermissionSet, permissionId: string) {
  return permissions.has('*') || permissions.has(permissionId);
}

async function resolveMatrixAccess(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase() || '';
  const role = session?.user?.role?.trim().toLowerCase() || '';

  if (!email) {
    return { tenantId: null as string | null, permissions: new Set<string>() };
  }

  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return { tenantId: null as string | null, permissions: new Set<string>() };
  }

  if (role === 'dev' || role === 'developer' || isMasterTenantEmail(email)) {
    return { tenantId, permissions: new Set<string>(['*']) };
  }

  const personnelProfile = await prisma.personnel.findFirst({
      where: { tenantId, email },
      select: { permissions: true, role: true },
    }).catch(() => null);

  const resolvedRole = (personnelProfile?.role?.trim() || role || '').trim();
  const rolePermissions = resolvedRole
    ? await prisma.role.findFirst({
        where: {
          tenantId,
          OR: [
            { id: resolvedRole },
            { name: resolvedRole },
          ],
        },
        select: { permissions: true },
      }).catch(() => null)
    : null;

  const permissions = mergePermissions(rolePermissions?.permissions, personnelProfile?.permissions);

  return {
    tenantId,
    permissions,
  };
}

async function getConfig(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
    tenantId
  );
  return (rows[0]?.data as Record<string, unknown>) || {};
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ items: [] }, { status: 200 });
    const config = await getConfig(tenantId);
    const items = Array.isArray(config['compliance-matrix'])
      ? dedupeMatrixEntries(
          config['compliance-matrix'].map((item) => sanitizeComplianceMatrixEntry(item as Record<string, unknown>) as ComplianceMatrixEntry),
        )
      : [];
    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    console.error('[compliance-matrix] fallback to empty list:', error);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const access = await resolveMatrixAccess(request);
  if (!access.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(access.permissions, 'quality-matrix-manage')) {
    return NextResponse.json({ error: 'Unauthorized to modify the coherence matrix.' }, { status: 403 });
  }
  const tenantId = access.tenantId;
  const body = await request.json().catch(() => null);
  const item = body?.item;
  if (!item || typeof item !== 'object') return NextResponse.json({ error: 'Invalid item payload' }, { status: 400 });
  const incoming = {
    ...item,
    id: (item as ComplianceMatrixEntry).id || randomUUID(),
    regulationCode: normalizeRegulationCode((item as ComplianceMatrixEntry).regulationCode),
    parentRegulationCode: normalizeRegulationCode((item as ComplianceMatrixEntry).parentRegulationCode) || null,
  } as ComplianceMatrixEntry;
  const config = await getConfig(tenantId);
  const items = Array.isArray(config['compliance-matrix']) ? (config['compliance-matrix'] as ComplianceMatrixEntry[]) : [];
  const identityKey = buildMatrixIdentityKey(incoming);
  const matchingEntry = items.find((entry) => entry.id === incoming.id) || items.find((entry) => buildMatrixIdentityKey(entry) === identityKey);
  const mergedIncoming = matchingEntry ? mergeMatrixEntries(matchingEntry, incoming) : incoming;
  const nextItems = dedupeMatrixEntries(
    items.some((entry) => entry.id === mergedIncoming.id)
      ? items.map((entry) => (entry.id === mergedIncoming.id ? mergedIncoming : entry))
      : [...items, mergedIncoming],
  );
  const nextConfig = { ...config, 'compliance-matrix': nextItems };
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(nextConfig)
  );
  return NextResponse.json({ item: mergedIncoming }, { status: 200 });
}

export async function DELETE(request: Request) {
  const access = await resolveMatrixAccess(request);
  if (!access.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(access.permissions, 'quality-matrix-manage')) {
    return NextResponse.json({ error: 'Unauthorized to modify the coherence matrix.' }, { status: 403 });
  }
  const tenantId = access.tenantId;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const regulationCode = normalizeRegulationCode(searchParams.get('code'));
  const organizationId = normalizeOrganizationScope(searchParams.get('organizationId'));
  const regulationFamily = normalizeRegulationFamily(searchParams.get('regulationFamily'));
  if (!id && !regulationCode) return NextResponse.json({ error: 'Missing id or code' }, { status: 400 });
  const config = await getConfig(tenantId);
  const items = Array.isArray(config['compliance-matrix']) ? dedupeMatrixEntries(config['compliance-matrix'] as ComplianceMatrixEntry[]) : [];
  const rootItem =
    (id
      ? items.find(
          (entry) =>
            entry.id === id &&
            (searchParams.has('organizationId') ? normalizeOrganizationScope(entry.organizationId) === organizationId : true) &&
            (searchParams.has('regulationFamily') ? normalizeRegulationFamily(entry.regulationFamily) === regulationFamily : true),
        )
      : undefined) ||
    (regulationCode
      ? items.find(
          (entry) =>
            normalizeRegulationCode(entry?.regulationCode) === regulationCode &&
            (searchParams.has('organizationId') ? normalizeOrganizationScope(entry.organizationId) === organizationId : true) &&
            (searchParams.has('regulationFamily') ? normalizeRegulationFamily(entry.regulationFamily) === regulationFamily : true),
        )
      : undefined);

  if (!rootItem) {
    return NextResponse.json({ ok: true, deleted: 0 }, { status: 200 });
  }

  const idsToDelete = collectDeletionIds(items, rootItem);

  const nextItems = items.filter((entry) => !idsToDelete.has(entry.id));
  const nextConfig = { ...config, 'compliance-matrix': nextItems };
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(nextConfig)
  );
  return NextResponse.json({ ok: true, deleted: idsToDelete.size }, { status: 200 });
}
