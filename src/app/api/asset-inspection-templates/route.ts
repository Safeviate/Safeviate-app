import { prisma } from '@/lib/prisma';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { normalizeTextValue } from '@/lib/regulation-code';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type {
  AssetInspectionTemplate,
  AssetInspectionTemplateSection,
  AssetInspectionTemplateItem,
  AssetInspectionAssetType,
} from '@/types/inspection';

type TemplateRecord = AssetInspectionTemplate & {
  [key: string]: unknown;
};

const DEFAULT_TEMPLATES: AssetInspectionTemplate[] = [
  {
    id: 'aircraft-exterior-template',
    title: 'Aircraft Exterior Inspection',
    assetType: 'aircraft',
    sections: [
      {
        id: 'aircraft-exterior-section',
        title: 'Exterior',
        items: [
          { id: randomUUID(), label: 'Documents and technical logs', outcome: 'Pass', scope: 'Exterior', minPhotos: 4 },
          { id: randomUUID(), label: 'Walk-around and surface condition', outcome: 'Pass', scope: 'Exterior', minPhotos: 4 },
          { id: randomUUID(), label: 'Fuel, oil, and visible leaks', outcome: 'Pass', scope: 'Exterior', minPhotos: 4 },
        ],
      },
    ],
  },
  {
    id: 'aircraft-interior-template',
    title: 'Aircraft Interior Inspection',
    assetType: 'aircraft',
    sections: [
      {
        id: 'aircraft-interior-section',
        title: 'Interior',
        items: [
          { id: randomUUID(), label: 'Cabin / cockpit condition', outcome: 'Pass', scope: 'Interior', minPhotos: 4 },
          { id: randomUUID(), label: 'Emergency equipment and documents', outcome: 'Pass', scope: 'Interior', minPhotos: 4 },
        ],
      },
    ],
  },
  {
    id: 'aircraft-full-template',
    title: 'Aircraft Full Inspection',
    assetType: 'aircraft',
    sections: [
      {
        id: 'aircraft-full-exterior',
        title: 'Exterior',
        items: [
          { id: randomUUID(), label: 'Documents and technical logs', outcome: 'Pass', scope: 'Exterior', minPhotos: 4 },
          { id: randomUUID(), label: 'Walk-around and surface condition', outcome: 'Pass', scope: 'Exterior', minPhotos: 4 },
        ],
      },
      {
        id: 'aircraft-full-interior',
        title: 'Interior',
        items: [
          { id: randomUUID(), label: 'Cabin / cockpit condition', outcome: 'Pass', scope: 'Interior', minPhotos: 4 },
          { id: randomUUID(), label: 'Emergency equipment and documents', outcome: 'Pass', scope: 'Interior', minPhotos: 4 },
        ],
      },
    ],
  },
  {
    id: 'vehicle-exterior-template',
    title: 'Vehicle Inspection',
    assetType: 'vehicle',
    sections: [
      {
        id: 'vehicle-exterior-section',
        title: 'Exterior',
        items: [
          { id: randomUUID(), label: 'Registration and documents', outcome: 'Pass', scope: 'Exterior', minPhotos: 4 },
          { id: randomUUID(), label: 'Lights, tyres, and mirrors', outcome: 'Pass', scope: 'Exterior', minPhotos: 4 },
          { id: randomUUID(), label: 'Fluid leaks and visible damage', outcome: 'Pass', scope: 'Exterior', minPhotos: 4 },
        ],
      },
    ],
  },
];

function normalizeAssetType(value: unknown): AssetInspectionAssetType | 'all' {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'vehicle' ? 'vehicle' : normalized === 'all' ? 'all' : 'aircraft';
}

function normalizeScope(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'interior') return 'Interior';
  if (normalized === 'both') return 'Both';
  return 'Exterior';
}

function normalizeTemplateItems(value: unknown): AssetInspectionTemplateItem[] {
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
      const minPhotosRaw = Number(record.minPhotos);
      const minPhotos = Number.isFinite(minPhotosRaw) && minPhotosRaw > 0 ? Math.min(12, Math.floor(minPhotosRaw)) : undefined;
      if (!label) return null;
      return {
        id,
        label,
        outcome,
        notes: notes || undefined,
        scope: normalizeScope(record.scope),
        minPhotos,
      };
    })
    .filter(Boolean) as AssetInspectionTemplateItem[];
}

function normalizeTemplateSections(value: unknown): AssetInspectionTemplateSection[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((section) => {
      if (!section || typeof section !== 'object') return null;
      const record = section as Record<string, unknown>;
      const id = normalizeTextValue(record.id) || randomUUID();
      const title = normalizeTextValue(record.title);
      const items = normalizeTemplateItems(record.items);
      if (!title || items.length === 0) return null;
      return { id, title, items };
    })
    .filter(Boolean) as AssetInspectionTemplateSection[];
}

function sanitizeTemplate(item: TemplateRecord) {
  return {
    ...item,
    id: item.id || randomUUID(),
    title: normalizeTextValue(item.title),
    assetType: normalizeAssetType(item.assetType),
    organizationId: normalizeTextValue(item.organizationId) || null,
    sections: normalizeTemplateSections(item.sections),
    createdAt: normalizeTextValue(item.createdAt),
    updatedAt: normalizeTextValue(item.updatedAt),
  };
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

function getTemplates(config: Record<string, unknown>) {
  const saved = Array.isArray(config['asset-inspection-templates'])
    ? (config['asset-inspection-templates'] as TemplateRecord[]).map((item) => sanitizeTemplate(item))
    : [];

  return saved.length > 0 ? saved : DEFAULT_TEMPLATES;
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ templates: DEFAULT_TEMPLATES }, { status: 200 });

    const config = await getConfig(tenantId);
    return NextResponse.json({ templates: getTemplates(config) }, { status: 200 });
  } catch (error) {
    console.error('[asset-inspection-templates] fallback to defaults:', error);
    return NextResponse.json({ templates: DEFAULT_TEMPLATES }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const item = body?.template;
  if (!item || typeof item !== 'object') return NextResponse.json({ error: 'Invalid template payload' }, { status: 400 });

  const incoming = sanitizeTemplate({
    ...(item as TemplateRecord),
    id: (item as TemplateRecord).id || randomUUID(),
    organizationId: (item as TemplateRecord).organizationId || tenantId,
  });

  if (!incoming.title || incoming.sections.length === 0) {
    return NextResponse.json({ error: 'Template title and at least one section are required.' }, { status: 400 });
  }

  const config = await getConfig(tenantId);
  const templates = getTemplates(config);

  const nextTemplates = templates.some((entry) => entry.id === incoming.id)
    ? templates.map((entry) => (entry.id === incoming.id ? incoming : entry))
    : [...templates, incoming];

  const nextConfig = { ...config, 'asset-inspection-templates': nextTemplates };
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(nextConfig)
  );

  return NextResponse.json({ template: incoming }, { status: 200 });
}

export async function DELETE(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get('id')?.trim();
  if (!templateId) return NextResponse.json({ error: 'Template id is required' }, { status: 400 });

  const config = await getConfig(tenantId);
  const templates = getTemplates(config);
  const nextTemplates = templates.filter((template) => template.id !== templateId);

  if (nextTemplates.length === templates.length) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const nextConfig = { ...config, 'asset-inspection-templates': nextTemplates };
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(nextConfig)
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
