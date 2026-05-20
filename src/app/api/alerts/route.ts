import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureAlertsSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    await ensureAlertsSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ alerts: [] }, { status: 200 });
    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(`SELECT data FROM alerts WHERE tenant_id = $1 ORDER BY created_at DESC`, tenantId);
    return NextResponse.json({ alerts: rows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[alerts] fallback to empty list:', error);
    return NextResponse.json({ alerts: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureAlertsSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    const alert = body?.alert;
    if (!alert || typeof alert !== 'object') return NextResponse.json({ error: 'Invalid alert payload.' }, { status: 400 });
    const id = alert.id || randomUUID();
    const data = { ...alert, id };
    await prisma.$executeRawUnsafe(`INSERT INTO alerts (id, tenant_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`, id, tenantId, JSON.stringify(data));
    return NextResponse.json({ alert: data }, { status: 200 });
  } catch (error) {
    console.error('[alerts] write failed:', error);
    return NextResponse.json({ error: 'Failed to save alert.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureAlertsSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    const alert = body?.alert;
    if (!alert || typeof alert !== 'object' || !alert.id) {
      return NextResponse.json({ error: 'Invalid alert payload.' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE alerts SET data = $3::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      alert.id,
      tenantId,
      JSON.stringify(alert)
    );

    return NextResponse.json({ alert }, { status: 200 });
  } catch (error) {
    console.error('[alerts] patch failed:', error);
    return NextResponse.json({ error: 'Failed to update alert.' }, { status: 500 });
  }
}
