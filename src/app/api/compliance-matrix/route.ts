import { prisma } from '@/lib/prisma';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

function normalizeRegulationCode(value?: string | null) {
  return value?.trim() || '';
}

type ComplianceMatrixEntry = {
  id: string;
  regulationCode?: string | null;
  parentRegulationCode?: string | null;
  [key: string]: unknown;
};

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

async function getTenantId(request: Request) {
  const tenantIdFromQuery = new URL(request.url).searchParams.get('tenantId')?.trim() || null;
  return tenantIdFromQuery || await getTenantIdFromSession(request);
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
    return NextResponse.json({ items: Array.isArray(config['compliance-matrix']) ? config['compliance-matrix'] : [] }, { status: 200 });
  } catch (error) {
    console.error('[compliance-matrix] fallback to empty list:', error);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const item = body?.item;
  if (!item || typeof item !== 'object') return NextResponse.json({ error: 'Invalid item payload' }, { status: 400 });
  const incoming = { ...item, id: (item as ComplianceMatrixEntry).id || randomUUID() } as ComplianceMatrixEntry;
  const config = await getConfig(tenantId);
  const items = Array.isArray(config['compliance-matrix']) ? (config['compliance-matrix'] as ComplianceMatrixEntry[]) : [];
  const nextItems = items.some((entry) => entry.id === incoming.id)
    ? items.map((entry) => (entry.id === incoming.id ? incoming : entry))
    : [...items, incoming];
  const nextConfig = { ...config, 'compliance-matrix': nextItems };
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(nextConfig)
  );
  return NextResponse.json({ item: incoming }, { status: 200 });
}

export async function DELETE(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const regulationCode = normalizeRegulationCode(searchParams.get('code'));
  if (!id && !regulationCode) return NextResponse.json({ error: 'Missing id or code' }, { status: 400 });
  const config = await getConfig(tenantId);
  const items = Array.isArray(config['compliance-matrix']) ? (config['compliance-matrix'] as ComplianceMatrixEntry[]) : [];
  const rootItem =
    (id ? items.find((entry) => entry.id === id) : undefined) ||
    (regulationCode ? items.find((entry) => normalizeRegulationCode(entry?.regulationCode) === regulationCode) : undefined);

  if (!rootItem) {
    return NextResponse.json({ ok: true, deleted: 0 }, { status: 200 });
  }

  const rootCode = normalizeRegulationCode(rootItem.regulationCode);
  const idsToDelete = new Set<string>(
    items
      .filter((entry) => entry.id === rootItem.id || isWithinDeletionScope(entry, rootCode))
      .map((entry) => entry.id)
      .filter((entryId) => typeof entryId === 'string' && entryId.trim())
  );

  const nextItems = items.filter((entry) => !idsToDelete.has(entry.id));
  const nextConfig = { ...config, 'compliance-matrix': nextItems };
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(nextConfig)
  );
  return NextResponse.json({ ok: true, deleted: idsToDelete.size }, { status: 200 });
}
