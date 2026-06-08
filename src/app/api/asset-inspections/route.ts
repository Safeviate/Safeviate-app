import { prisma } from '@/lib/prisma';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { normalizeTextValue } from '@/lib/regulation-code';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

type AssetInspectionRecord = {
  id: string;
  assetType?: string | null;
  assetId?: string | null;
  assetLabel?: string | null;
  inspectionType?: string | null;
  inspectionDate?: string | null;
  inspectorId?: string | null;
  inspectorName?: string | null;
  status?: string | null;
  findings?: string | null;
  notes?: string | null;
  nextInspectionDate?: string | null;
  checklistItems?: unknown;
  organizationId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
};

function normalizeAssetType(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'vehicle' ? 'vehicle' : 'aircraft';
}

function normalizeChecklistItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = normalizeTextValue(record.id) || randomUUID();
      const label = normalizeTextValue(record.label);
      const outcomeRaw = normalizeTextValue(record.outcome).toLowerCase();
      const outcome = outcomeRaw === 'fail' ? 'Fail' : outcomeRaw === 'n/a' || outcomeRaw === 'na' ? 'N/A' : 'Pass';
      const notes = normalizeTextValue(record.notes);
      const photos = Array.isArray(record.photos)
        ? record.photos
            .map((photo) => {
              if (!photo || typeof photo !== 'object') return null;
              const photoRecord = photo as Record<string, unknown>;
              const url = normalizeTextValue(photoRecord.url);
              const description = normalizeTextValue(photoRecord.description);
              if (!url) return null;
              return {
                url,
                description: description || 'Photo',
              };
            })
            .filter(Boolean)
        : [];

      if (!label) return null;

      return {
        id,
        label,
        outcome,
        notes: notes || undefined,
        photos,
      };
    })
    .filter(Boolean);
}

async function getTenantId(request: Request) {
  return getTenantIdFromSession(request);
}

async function getConfig(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
    tenantId
  );
  return (rows[0]?.data as Record<string, unknown>) || {};
}

function sanitizeInspection(item: AssetInspectionRecord) {
  return {
    ...item,
    id: item.id || randomUUID(),
    assetType: normalizeAssetType(item.assetType),
    assetId: normalizeTextValue(item.assetId),
    assetLabel: normalizeTextValue(item.assetLabel),
    inspectionType: normalizeTextValue(item.inspectionType),
    inspectionDate: normalizeTextValue(item.inspectionDate),
    inspectorId: normalizeTextValue(item.inspectorId),
    inspectorName: normalizeTextValue(item.inspectorName),
    status: normalizeTextValue(item.status) || 'Serviceable',
    findings: normalizeTextValue(item.findings),
    notes: normalizeTextValue(item.notes),
    nextInspectionDate: normalizeTextValue(item.nextInspectionDate),
    checklistItems: normalizeChecklistItems(item.checklistItems),
    organizationId: normalizeTextValue(item.organizationId) || null,
    createdAt: normalizeTextValue(item.createdAt),
    updatedAt: normalizeTextValue(item.updatedAt),
  };
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ inspections: [] }, { status: 200 });

    const { searchParams } = new URL(request.url);
    const assetType = searchParams.get('assetType')?.trim().toLowerCase();
    const assetId = searchParams.get('assetId')?.trim();

    const config = await getConfig(tenantId);
    const inspections = Array.isArray(config['asset-inspections'])
      ? (config['asset-inspections'] as AssetInspectionRecord[]).map((item) => sanitizeInspection(item))
      : [];

    const filtered = inspections
      .filter((item) => (assetType ? item.assetType === assetType : true))
      .filter((item) => (assetId ? item.assetId === assetId : true))
      .sort((a, b) => (new Date(b.inspectionDate || b.createdAt || 0).getTime() - new Date(a.inspectionDate || a.createdAt || 0).getTime()));

    return NextResponse.json({ inspections: filtered }, { status: 200 });
  } catch (error) {
    console.error('[asset-inspections] fallback to empty list:', error);
    return NextResponse.json({ inspections: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const item = body?.inspection;
  if (!item || typeof item !== 'object') return NextResponse.json({ error: 'Invalid inspection payload' }, { status: 400 });

  const incoming = sanitizeInspection({
    ...(item as AssetInspectionRecord),
    id: (item as AssetInspectionRecord).id || randomUUID(),
    organizationId: (item as AssetInspectionRecord).organizationId || tenantId,
  });

  if (!incoming.assetId || !incoming.inspectionType || !incoming.inspectionDate) {
    return NextResponse.json({ error: 'Asset, inspection type, and inspection date are required.' }, { status: 400 });
  }

  const config = await getConfig(tenantId);
  const inspections = Array.isArray(config['asset-inspections'])
    ? (config['asset-inspections'] as AssetInspectionRecord[])
    : [];

  const nextInspections = inspections.some((entry) => entry.id === incoming.id)
    ? inspections.map((entry) => (entry.id === incoming.id ? incoming : entry))
    : [...inspections, incoming];

  const nextConfig = { ...config, 'asset-inspections': nextInspections };
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(nextConfig)
  );

  return NextResponse.json({ inspection: incoming }, { status: 200 });
}
