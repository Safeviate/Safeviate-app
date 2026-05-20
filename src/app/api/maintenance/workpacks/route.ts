import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

async function loadRows(table: string, tenantId: string) {
  return prisma.$queryRawUnsafe<{ data: unknown }[]>(`SELECT data FROM ${table} WHERE tenant_id = $1 ORDER BY created_at DESC`, tenantId);
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ workpacks: [], taskCards: [] }, { status: 200 });
    const [workpackRows, taskCardRows] = await Promise.all([loadRows('workpacks', tenantId), loadRows('maintenance_task_cards', tenantId)]);
    return NextResponse.json({ workpacks: workpackRows.map((row) => row.data), taskCards: taskCardRows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[maintenance/workpacks] fallback to empty payload:', error);
    return NextResponse.json({ workpacks: [], taskCards: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const workpack = body?.workpack;
  if (!workpack || typeof workpack !== 'object') return NextResponse.json({ error: 'Invalid workpack payload.' }, { status: 400 });
  const id = workpack.id || randomUUID();
  const data = { ...workpack, id };
  await prisma.$executeRawUnsafe(
    `INSERT INTO workpacks (id, tenant_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    id,
    tenantId,
    JSON.stringify(data)
  );
  return NextResponse.json({ workpack: data }, { status: 200 });
}
