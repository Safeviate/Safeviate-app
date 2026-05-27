import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureExternalOrganizationsSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ organizations: [] }, { status: 200 });
    await ensureExternalOrganizationsSchema();

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM external_organizations WHERE tenant_id = $1 ORDER BY created_at ASC`,
      tenantId
    );

    return NextResponse.json({ organizations: rows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[external-organizations] fallback to empty list:', error);
    return NextResponse.json({ organizations: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureExternalOrganizationsSchema();

    const body = await request.json();
    const incoming = body?.organization ?? {};
    const id = incoming.id || randomUUID();
    const data = {
      ...incoming,
      id,
    };

    await prisma.$executeRawUnsafe(
      `INSERT INTO external_organizations (id, tenant_id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      tenantId,
      JSON.stringify(data)
    );

    return NextResponse.json({ organization: data }, { status: 200 });
  } catch (error) {
    console.error('[external-organizations] write failed:', error);
    return NextResponse.json({ error: 'Failed to save external company.' }, { status: 500 });
  }
}
