import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureTrainingRoutesSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

const normalizeRoute = (route: Record<string, unknown>, tenantId: string) => ({
  ...route,
  routeType: route.routeType === 'other' ? 'other' : 'training',
  tenantId,
});

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    await ensureTrainingRoutesSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ routes: [] }, { status: 200 });
    }

    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM training_routes WHERE tenant_id = $1 ORDER BY created_at ASC`,
      tenantId
    );

    return NextResponse.json({ routes: rows.map((row) => normalizeRoute(row.data as Record<string, unknown>, tenantId)) }, { status: 200 });
  } catch (error) {
    console.error('[training-routes] fallback to empty list:', error);
    return NextResponse.json({ routes: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureTrainingRoutesSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const route = body?.route;
    if (!route || typeof route !== 'object') {
      return NextResponse.json({ error: 'Invalid route payload.' }, { status: 400 });
    }

    const id = route.id || randomUUID();
    const data = normalizeRoute({ ...route, id }, tenantId);

    await prisma.$executeRawUnsafe(
      `INSERT INTO training_routes (id, tenant_id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      tenantId,
      JSON.stringify(data)
    );

    return NextResponse.json({ route: data }, { status: 200 });
  } catch (error) {
    console.error('[training-routes] write failed:', error);
    return NextResponse.json({ error: 'Failed to save route.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureTrainingRoutesSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const route = body?.route;
    if (!route || typeof route !== 'object' || !route.id) {
      return NextResponse.json({ error: 'Invalid route payload.' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE training_routes SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
      route.id,
      JSON.stringify(normalizeRoute(route as Record<string, unknown>, tenantId)),
      tenantId
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[training-routes] patch failed:', error);
    return NextResponse.json({ error: 'Failed to update route.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureTrainingRoutesSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(`DELETE FROM training_routes WHERE id = $1 AND tenant_id = $2`, id, tenantId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[training-routes] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete route.' }, { status: 500 });
  }
}
