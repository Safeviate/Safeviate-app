import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

const CONFIG_ID = 'spi-configurations';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ configurations: [] }, { status: 200 });

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
      tenantId
    );

    const data = (rows[0]?.data as any) || {};
    return NextResponse.json({ id: CONFIG_ID, configurations: Array.isArray(data.configurations) ? data.configurations : [] }, { status: 200 });
  } catch (error) {
    console.error('[spi-configurations] fallback to empty list:', error);
    return NextResponse.json({ configurations: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const configurations = Array.isArray(body?.configurations) ? body.configurations : [];
  const data = { id: CONFIG_ID, configurations };

  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(data)
  );

  return NextResponse.json(data, { status: 200 });
}
