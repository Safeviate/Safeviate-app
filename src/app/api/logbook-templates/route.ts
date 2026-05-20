import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

const CONFIG_KEY = 'logbook-templates';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

async function readTemplates(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
    tenantId
  );

  const data = rows[0]?.data as Record<string, unknown> | null;
  const templates = data && Array.isArray(data[CONFIG_KEY]) ? data[CONFIG_KEY] : [];
  return templates;
}

async function writeTemplates(tenantId: string, templates: unknown[]) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
    tenantId
  );

  const data = (rows[0]?.data as Record<string, unknown> | null) || {};
  const nextConfig = { ...data, [CONFIG_KEY]: templates };

  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(nextConfig)
  );
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ templates: [] }, { status: 200 });
    }

    const templates = await readTemplates(tenantId);
    return NextResponse.json({ templates }, { status: 200 });
  } catch (error) {
    console.error('[logbook-templates] fallback to empty list:', error);
    return NextResponse.json({ templates: [] }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const templates = Array.isArray(body?.templates) ? body.templates : null;
  if (!templates) {
    return NextResponse.json({ error: 'Invalid templates payload.' }, { status: 400 });
  }

  await writeTemplates(tenantId, templates);
  return NextResponse.json({ ok: true }, { status: 200 });
}
