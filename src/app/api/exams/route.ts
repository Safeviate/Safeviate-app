import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

const TEMPLATE_KEY = 'exam-templates';
const RESULT_KEY = 'student-exam-results';
const TOPIC_KEY = 'exam-topics';
const POOL_KEY = 'question-pool';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

async function readConfig(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
    tenantId
  );
  return (rows[0]?.data as Record<string, unknown> | null) || {};
}

async function writeConfig(tenantId: string, config: Record<string, unknown>) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO tenant_configs (tenant_id, data, created_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    tenantId,
    JSON.stringify(config)
  );
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ templates: [], results: [], topics: [], poolItems: [] }, { status: 200 });
    }

    const config = await readConfig(tenantId);
    return NextResponse.json(
      {
        templates: Array.isArray(config[TEMPLATE_KEY]) ? config[TEMPLATE_KEY] : [],
        results: Array.isArray(config[RESULT_KEY]) ? config[RESULT_KEY] : [],
        topics: Array.isArray(config[TOPIC_KEY]) ? config[TOPIC_KEY] : [],
        poolItems: Array.isArray(config[POOL_KEY]) ? config[POOL_KEY] : [],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[exams] fallback to empty payload:', error);
    return NextResponse.json({ templates: [], results: [], topics: [], poolItems: [] }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const config = await readConfig(tenantId);

  if (Array.isArray(body?.templates)) config[TEMPLATE_KEY] = body.templates;
  if (Array.isArray(body?.results)) config[RESULT_KEY] = body.results;
  if (Array.isArray(body?.topics)) config[TOPIC_KEY] = body.topics;
  if (Array.isArray(body?.poolItems)) config[POOL_KEY] = body.poolItems;
  if (body?.template && typeof body.template === 'object') {
    const current = Array.isArray(config[TEMPLATE_KEY]) ? config[TEMPLATE_KEY] : [];
    const next = current.filter((template: any) => template.id !== body.template.id);
    config[TEMPLATE_KEY] = [body.template, ...next];
  }
  if (body?.result && typeof body.result === 'object') {
    const current = Array.isArray(config[RESULT_KEY]) ? config[RESULT_KEY] : [];
    config[RESULT_KEY] = [body.result, ...current];
  }

  await writeConfig(tenantId, config);
  return NextResponse.json({ ok: true }, { status: 200 });
}
