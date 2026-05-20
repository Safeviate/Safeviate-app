import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ areas: [] }, { status: 200 });

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
      tenantId
    );
    const data = (rows[0]?.data as any) || {};
    const areas = Array.isArray(data['risk-register-areas']) && data['risk-register-areas'].length
      ? data['risk-register-areas']
      : [];

    return NextResponse.json({ areas }, { status: 200 });
  } catch (error) {
    console.error('[risk-register/areas] fallback to empty list:', error);
    return NextResponse.json({ areas: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const areas = Array.isArray(body?.areas) ? body.areas.filter((area: unknown) => typeof area === 'string' && area.trim()) : [];
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
    tenantId
  );
  const existing = (rows[0]?.data as any) || {};
  const next = { ...existing, 'risk-register-areas': areas };

  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(next)
  );

  return NextResponse.json({ areas }, { status: 200 });
}
