import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureToolsSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureToolsSchema();
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const tool = body?.tool;
  if (!tool || typeof tool !== 'object') return NextResponse.json({ error: 'Invalid tool payload.' }, { status: 400 });
  await prisma.$executeRawUnsafe(`UPDATE tools SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`, id, JSON.stringify({ ...tool, id }), tenantId);
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureToolsSchema();
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  await prisma.$executeRawUnsafe(`DELETE FROM tools WHERE id = $1 AND tenant_id = $2`, id, tenantId);
  return NextResponse.json({ ok: true }, { status: 200 });
}
