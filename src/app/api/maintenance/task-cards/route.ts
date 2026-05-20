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
    if (!tenantId) return NextResponse.json({ taskCards: [] }, { status: 200 });
    const { searchParams } = new URL(request.url);
    const workpackId = searchParams.get('workpackId');
    const rows = workpackId
      ? await prisma.$queryRawUnsafe<{ data: unknown }[]>(
          `SELECT data FROM maintenance_task_cards WHERE tenant_id = $1 AND data->>'workpackId' = $2 ORDER BY created_at ASC`,
          tenantId,
          workpackId
        )
      : await prisma.$queryRawUnsafe<{ data: unknown }[]>(
          `SELECT data FROM maintenance_task_cards WHERE tenant_id = $1 ORDER BY created_at ASC`,
          tenantId
        );
    return NextResponse.json({ taskCards: rows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[maintenance/task-cards] fallback to empty list:', error);
    return NextResponse.json({ taskCards: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const taskCard = body?.taskCard;
  if (!taskCard || typeof taskCard !== 'object') return NextResponse.json({ error: 'Invalid task card payload.' }, { status: 400 });
  const id = taskCard.id || randomUUID();
  const data = { ...taskCard, id };
  await prisma.$executeRawUnsafe(
    `INSERT INTO maintenance_task_cards (id, tenant_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    id,
    tenantId,
    JSON.stringify(data)
  );
  return NextResponse.json({ taskCard: data }, { status: 200 });
}

