import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

function toStableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await getServerSession(authOptions);
  const actorId = session?.user?.id?.trim() || null;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const taskCard = body?.taskCard;
  if (!taskCard || typeof taskCard !== 'object') return NextResponse.json({ error: 'Invalid task card payload.' }, { status: 400 });

  const rows = await prisma.$queryRawUnsafe<{ data: unknown; tenant_id: string }[]>(
    `SELECT data, tenant_id FROM maintenance_task_cards WHERE id = $1 LIMIT 1`,
    id
  );
  const row = rows[0];
  if (!row || row.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Task card not found.' }, { status: 404 });
  }

  const existingTaskCard = row.data as Record<string, unknown>;
  const existingSignatures = Array.isArray((existingTaskCard as { signatures?: unknown[] }).signatures)
    ? ((existingTaskCard as { signatures?: unknown[] }).signatures ?? [])
    : [];
  const incomingSignatures = Array.isArray((taskCard as { signatures?: unknown[] }).signatures)
    ? ((taskCard as { signatures?: unknown[] }).signatures ?? [])
    : [];

  if (toStableJson(existingSignatures) !== toStableJson(incomingSignatures)) {
    if (!actorId) {
      return NextResponse.json({ error: 'You must be signed in to sign this task card.' }, { status: 401 });
    }
    if (incomingSignatures.length !== existingSignatures.length + 1) {
      return NextResponse.json({ error: 'Task card signatures can only be added by the active signed-in user.' }, { status: 403 });
    }
    const appendedSignature = incomingSignatures[incomingSignatures.length - 1] as { signatoryUserId?: string } | undefined;
    if (!appendedSignature?.signatoryUserId || appendedSignature.signatoryUserId !== actorId) {
      return NextResponse.json({ error: 'Task card signatures must belong to the current signed-in user.' }, { status: 403 });
    }
  }

  await prisma.$executeRawUnsafe(`UPDATE maintenance_task_cards SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`, id, JSON.stringify({ ...taskCard, id }), tenantId);
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await prisma.$executeRawUnsafe(`DELETE FROM maintenance_task_cards WHERE id = $1 AND tenant_id = $2`, id, tenantId);
  return NextResponse.json({ ok: true }, { status: 200 });
}
