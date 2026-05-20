import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ vehicles: [] }, { status: 200 });
    }

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM vehicles WHERE tenant_id = $1 ORDER BY created_at ASC`,
      tenantId
    );

    return NextResponse.json({ vehicles: rows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[vehicles] fallback to empty list:', error);
    return NextResponse.json({ vehicles: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const incoming = body?.vehicle ?? {};
  const id = incoming.id || randomUUID();
  const data = {
    ...incoming,
    id,
    organizationId: incoming.organizationId || tenantId,
    documents: Array.isArray(incoming.documents) ? incoming.documents : [],
  };

  await prisma.$executeRawUnsafe(
    `INSERT INTO vehicles (id, tenant_id, data, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    id,
    tenantId,
    JSON.stringify(data)
  );

  return NextResponse.json({ vehicle: data }, { status: 200 });
}
