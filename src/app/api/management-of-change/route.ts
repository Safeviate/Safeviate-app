import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureManagementOfChangeSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ mocs: [] }, { status: 200 });
    await ensureManagementOfChangeSchema();

    const mocId = new URL(request.url).searchParams.get('mocId');
    if (mocId) {
      const rows = await prisma.$queryRawUnsafe<{ data: unknown; tenant_id: string }[]>(
        `SELECT data, tenant_id FROM management_of_change WHERE id = $1 LIMIT 1`,
        mocId
      );
      const row = rows[0];
      if (!row || row.tenant_id !== tenantId) {
        return NextResponse.json({ moc: null }, { status: 200 });
      }
      return NextResponse.json({ moc: row.data ?? null }, { status: 200 });
    }

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM management_of_change WHERE tenant_id = $1 ORDER BY created_at ASC`,
      tenantId
    );

    return NextResponse.json({ mocs: rows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[management-of-change] fallback to empty payload:', error);
    const mocId = new URL(request.url).searchParams.get('mocId');
    return NextResponse.json(mocId ? { moc: null } : { mocs: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureManagementOfChangeSchema();

    const body = await request.json();
    const incoming = body?.moc ?? {};
    const id = incoming.id || randomUUID();

    const existing = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM management_of_change WHERE tenant_id = $1`,
      tenantId
    );
    const mocNumber = incoming.mocNumber || `MOC-${String((existing[0]?.count ?? 0) + 1).padStart(3, '0')}`;

    const data = {
      ...incoming,
      id,
      mocNumber,
    };

    await prisma.$executeRawUnsafe(
      `INSERT INTO management_of_change (id, tenant_id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      tenantId,
      JSON.stringify(data)
    );

    return NextResponse.json({ moc: data }, { status: 201 });
  } catch (error) {
    console.error('[management-of-change] write failed:', error);
    return NextResponse.json({ error: 'Failed to save management of change.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureManagementOfChangeSchema();

    const url = new URL(request.url);
    const mocId = url.searchParams.get('mocId');
    if (!mocId) return NextResponse.json({ error: 'Missing MOC id.' }, { status: 400 });

    const body = await request.json();
    const incoming = body?.moc;
    if (!incoming) return NextResponse.json({ error: 'Missing MOC payload.' }, { status: 400 });

    await prisma.$executeRawUnsafe(
      `UPDATE management_of_change SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
      mocId,
      JSON.stringify(incoming),
      tenantId
    );

    return NextResponse.json({ moc: incoming }, { status: 200 });
  } catch (error) {
    console.error('[management-of-change] update failed:', error);
    return NextResponse.json({ error: 'Failed to update management of change.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureManagementOfChangeSchema();

    const body = await request.json();
    const mocId = body?.mocId;
    if (!mocId) return NextResponse.json({ error: 'Missing MOC id.' }, { status: 400 });

    await prisma.$executeRawUnsafe(`DELETE FROM management_of_change WHERE id = $1 AND tenant_id = $2`, mocId, tenantId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[management-of-change] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete management of change.' }, { status: 500 });
  }
}
