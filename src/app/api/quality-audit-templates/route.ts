import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  return (await getTenantIdFromSession(request)) || session?.user?.tenantId?.trim() || 'safeviate';
}

async function getConfig(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
    tenantId
  );
  return (rows[0]?.data as Record<string, unknown>) || {};
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ templates: [] }, { status: 200 });
    const config = await getConfig(tenantId);
    const templates = Array.isArray(config['quality-audit-templates']) ? config['quality-audit-templates'] : [];
    return NextResponse.json({ templates }, { status: 200 });
  } catch (error) {
    console.error('[quality-audit-templates] fallback to empty list:', error);
    return NextResponse.json({ templates: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const template = body?.template;
  if (!template || typeof template !== 'object') return NextResponse.json({ error: 'Invalid template payload' }, { status: 400 });
  const incoming = { ...template, id: (template as { id?: string }).id || randomUUID() };
  const config = await getConfig(tenantId);
  const templates = Array.isArray(config['quality-audit-templates']) ? (config['quality-audit-templates'] as Array<{ id: string } & Record<string, unknown>>) : [];
  const nextTemplates = templates.some((t) => t.id === incoming.id)
    ? templates.map((t) => (t.id === incoming.id ? incoming : t))
    : [incoming, ...templates];
  const nextConfig = { ...config, 'quality-audit-templates': nextTemplates };
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(nextConfig)
  );
  return NextResponse.json({ template: incoming }, { status: 200 });
}

export async function DELETE(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const config = await getConfig(tenantId);
  const templates = Array.isArray(config['quality-audit-templates']) ? (config['quality-audit-templates'] as Array<{ id: string } & Record<string, unknown>>) : [];
  const nextTemplates = templates.filter((t) => t.id !== id);
  const nextConfig = { ...config, 'quality-audit-templates': nextTemplates };
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(nextConfig)
  );
  return NextResponse.json({ ok: true }, { status: 200 });
}
