import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureToolsSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    await ensureToolsSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ tools: [] }, { status: 200 });
    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM tools WHERE tenant_id = $1 ORDER BY created_at ASC`,
      tenantId
    );
    return NextResponse.json({ tools: rows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[tools] fallback to empty list:', error);
    return NextResponse.json({ tools: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  await ensureToolsSchema();
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const tool = body?.tool;
  if (!tool || typeof tool !== 'object') return NextResponse.json({ error: 'Invalid tool payload.' }, { status: 400 });
  const id = tool.id || randomUUID();
  const data = { ...tool, id };
  await prisma.$executeRawUnsafe(
    `INSERT INTO tools (id, tenant_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    id,
    tenantId,
    JSON.stringify(data)
  );
  return NextResponse.json({ tool: data }, { status: 200 });
}
