import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureErpStateSchema } from '@/lib/server/bootstrap-db';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantIdForSession(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email?.trim().toLowerCase()) {
    return null;
  }
  return getTenantIdFromSession(request);
}

export async function GET(request: Request) {
  try {
    await ensureErpStateSchema();
    const tenantId = await getTenantIdForSession(request);
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category')?.trim();

    if (!tenantId || !category) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM erp_state WHERE tenant_id = $1 AND category = $2 LIMIT 1`,
      tenantId,
      category
    );
    const row = rows[0];

    return NextResponse.json({ data: row?.data ?? [] });
  } catch (error) {
    console.error('[erp-state] fallback to empty data:', error);
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureErpStateSchema();
    const tenantId = await getTenantIdForSession(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const category = payload?.category?.toString()?.trim();
    const data = payload?.data ?? [];

    if (!category) {
      return NextResponse.json({ error: 'Missing category' }, { status: 400 });
    }

    const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM erp_state WHERE tenant_id = $1 AND category = $2 LIMIT 1`,
      tenantId,
      category
    );

    if (existing[0]?.id) {
      await prisma.$executeRawUnsafe(
        `UPDATE erp_state SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
        existing[0].id,
        JSON.stringify(data),
        tenantId
      );
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO erp_state (id, tenant_id, category, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())`,
        crypto.randomUUID(),
        tenantId,
        category,
        JSON.stringify(data)
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[erp-state] write failed:', error);
    return NextResponse.json({ error: 'Failed to save ERP state.' }, { status: 500 });
  }
}
