import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

const DEFAULT_AUDIT_AREAS = [
  'Personnel & Training',
  'Flight Operations',
  'Ground Operations',
  'Maintenance',
  'Cabin Safety',
  'Facilities & Equipment',
  'Emergency Response',
  'Security',
];

async function getTenantId(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  return (await getTenantIdFromSession(request)) || session?.user?.tenantId?.trim() || 'safeviate';
}

async function getConfig(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
    tenantId
  );
  return (rows[0]?.data as any) || {};
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ areas: DEFAULT_AUDIT_AREAS, items: [] }, { status: 200 });
    }

    const config = await getConfig(tenantId);
    return NextResponse.json({
      areas: Array.isArray(config['audit-areas']) && config['audit-areas'].length ? config['audit-areas'] : DEFAULT_AUDIT_AREAS,
      items: Array.isArray(config['audit-schedule-items']) ? config['audit-schedule-items'] : [],
    });
  } catch (error) {
    console.error('[audit-schedule] fallback to defaults:', error);
    return NextResponse.json({ areas: DEFAULT_AUDIT_AREAS, items: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const areas = Array.isArray(body?.areas) ? body.areas.filter((area: unknown) => typeof area === 'string' && area.trim()) : DEFAULT_AUDIT_AREAS;
  const items = Array.isArray(body?.items) ? body.items : [];
  const config = await getConfig(tenantId);
  const next = {
    ...config,
    'audit-areas': areas,
    'audit-schedule-items': items,
  };

  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(next)
  );

  return NextResponse.json({ areas, items }, { status: 200 });
}
