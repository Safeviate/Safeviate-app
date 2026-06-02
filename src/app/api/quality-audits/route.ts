import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureAircraftSchema, ensureExternalOrganizationsSchema } from '@/lib/server/bootstrap-db';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { recordSimulationRouteMetric } from '@/lib/server/simulation-telemetry';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { QualityAudit } from '@/types/quality';
import type { Aircraft } from '@/types/aircraft';

function toStableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

const AUDIT_SEQUENCE_PREFIX = 'AUD';

type AuditSequenceTx = {
  $executeRawUnsafe: typeof prisma.$executeRawUnsafe;
  $queryRawUnsafe: typeof prisma.$queryRawUnsafe;
};

function formatAuditSequenceNumber(prefix: string, value: number) {
  return `${prefix}-${String(Math.max(1, Math.floor(value))).padStart(4, '0')}`;
}

async function allocateNextAuditNumber(tx: AuditSequenceTx, tenantId: string) {
  const sequenceLockKey = `quality-audits:${tenantId}:${AUDIT_SEQUENCE_PREFIX}`;
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, sequenceLockKey);
  const rows = await tx.$queryRawUnsafe<{ next_number: number }[]>(
    `SELECT COALESCE(MAX(((regexp_match(data->>'auditNumber', '^AUD-([0-9]+)$'))[1])::integer), 0) + 1 AS next_number
     FROM quality_audits
     WHERE tenant_id = $1
       AND COALESCE(data->>'analysisType', '') <> 'gap-analysis'
       AND data->>'auditNumber' ~ '^AUD-[0-9]+$'`,
    tenantId
  );
  return formatAuditSequenceNumber(AUDIT_SEQUENCE_PREFIX, rows[0]?.next_number ?? 1);
}

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
  return (rows[0]?.data as any) || {};
}

async function loadAudits(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ id: string; data: unknown }[]>(
    `SELECT id, data FROM quality_audits WHERE tenant_id = $1 ORDER BY created_at DESC`,
    tenantId
  );
  return rows
    .map((row) => row.data)
    .filter((audit) => (audit as { analysisType?: string } | null)?.analysisType !== 'gap-analysis');
}

async function loadCaps(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ id: string; data: unknown }[]>(
    `SELECT id, data FROM corrective_action_plans WHERE tenant_id = $1 ORDER BY created_at DESC`,
    tenantId
  );
  return rows.map((row) => row.data);
}

async function loadExternalOrganizations(tenantId: string) {
  await ensureExternalOrganizationsSchema();
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM external_organizations WHERE tenant_id = $1 ORDER BY created_at ASC`,
    tenantId
  );
  return rows.map((row) => row.data);
}

async function loadAircraft(tenantId: string) {
  await ensureAircraftSchema();
  const rows = await prisma.aircraftRecord.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => row.data as unknown as Aircraft);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ audits: [], templates: [], personnel: [], departments: [], organizations: [], aircraft: [], caps: [], findingLevels: [] }, { status: 200 });

    const [audits, caps, config, organizations, aircraft] = await Promise.all([
      loadAudits(tenantId),
      loadCaps(tenantId),
      getConfig(tenantId),
      loadExternalOrganizations(tenantId),
      loadAircraft(tenantId),
    ]);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'quality-audits.GET',
      reads: 3,
      writes: 0,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      audits,
      caps,
      templates: Array.isArray(config['quality-audit-templates']) ? config['quality-audit-templates'] : [],
      personnel: Array.isArray(config['personnel']) ? config['personnel'] : [],
      departments: Array.isArray(config['departments']) ? config['departments'] : [],
      organizations,
      aircraft,
      findingLevels: Array.isArray(config['finding-levels'])
        ? config['finding-levels']
        : Array.isArray(config['finding-levels-settings']?.levels)
          ? config['finding-levels-settings'].levels
          : [],
    }, { status: 200 });
  } catch (error) {
    console.error('[quality-audits] fallback to empty payload:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'quality-audits.GET',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ audits: [], templates: [], personnel: [], departments: [], organizations: [], aircraft: [], caps: [], findingLevels: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await getServerSession(authOptions);
  const actorId = session?.user?.id?.trim() || null;
  const actorEmail = session?.user?.email?.trim().toLowerCase() || null;
  const body = await request.json().catch(() => null);
  const audit = body?.audit;
  if (!audit || typeof audit !== 'object') return NextResponse.json({ error: 'Invalid audit payload' }, { status: 400 });
  const id = audit.id || randomUUID();
  const incomingAudit = { ...audit, id } as QualityAudit;

  const actorPersonnelId = actorEmail
    ? await prisma.personnel.findFirst({
        where: {
          tenantId,
          email: actorEmail,
        },
        select: { id: true },
      }).then((person) => person?.id?.trim() || null).catch(() => null)
    : null;
  const allowedActorIds = new Set([actorId, actorPersonnelId].filter((value): value is string => Boolean(value)));

  if (allowedActorIds.size > 0 && typeof incomingAudit.auditorId === 'string' && !allowedActorIds.has(incomingAudit.auditorId.trim())) {
    return NextResponse.json({ error: 'Quality audits must be created under the active signed-in auditor.' }, { status: 403 });
  }

  const existingRows = await prisma.$queryRawUnsafe<{ data: unknown; tenant_id: string }[]>(
    `SELECT data, tenant_id FROM quality_audits WHERE id = $1 LIMIT 1`,
    id
  );
  const existingRow = existingRows[0];
  if (existingRow && existingRow.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Audit not found in the current tenant.' }, { status: 404 });
  }
  const signoffError = validateAuditSignoffMutation((existingRow?.data as QualityAudit | undefined) ?? null, incomingAudit, allowedActorIds);
  if (signoffError) {
    return NextResponse.json({ error: signoffError }, { status: 403 });
  }

  const persistedAudit = await prisma.$transaction(async (tx) => {
    const nextAuditNumber = !existingRow
      ? await allocateNextAuditNumber(tx, tenantId)
      : null;
    const data: QualityAudit = {
      ...incomingAudit,
      id,
      auditNumber: existingAuditNumber(existingRow?.data as QualityAudit | undefined, incomingAudit, nextAuditNumber),
    };

    await tx.$executeRawUnsafe(
      `INSERT INTO quality_audits (id, tenant_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      tenantId,
      JSON.stringify(data)
    );

    return data;
  });
  await recordSimulationRouteMetric({
    tenantId,
    routeKey: 'quality-audits.POST',
    reads: 0,
    writes: 1,
    durationMs: Date.now() - startedAt,
  });
  return NextResponse.json({ audit: persistedAudit }, { status: 200 });
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();
  const tenantId = await getTenantId(request);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  await prisma.$executeRawUnsafe(`DELETE FROM quality_audits WHERE id = $1 AND tenant_id = $2`, id, tenantId);
  await recordSimulationRouteMetric({
    tenantId,
    routeKey: 'quality-audits.DELETE',
    reads: 0,
    writes: 1,
    durationMs: Date.now() - startedAt,
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}

function validateAuditSignoffMutation(existingAudit: QualityAudit | null, incomingAudit: QualityAudit, allowedActorIds: Set<string>) {
  if (!existingAudit) return null;

  const existingAuditorSignoff = existingAudit.auditorSignoff ?? null;
  const incomingAuditorSignoff = incomingAudit.auditorSignoff ?? null;
  if (toStableJson(existingAuditorSignoff) !== toStableJson(incomingAuditorSignoff)) {
    if (allowedActorIds.size === 0) return 'You must be signed in to record an auditor sign-off.';
    if (!allowedActorIds.has((incomingAudit.auditorId || '').trim())) {
      return 'Only the assigned auditor can sign the auditor sign-off.';
    }
    if (!incomingAuditorSignoff || !allowedActorIds.has((incomingAuditorSignoff.signedById || '').trim())) {
      return 'Auditor sign-off must belong to the active assigned auditor.';
    }
  }

  const existingAuditeeSignoff = existingAudit.auditeeSignoff ?? null;
  const incomingAuditeeSignoff = incomingAudit.auditeeSignoff ?? null;
  if (toStableJson(existingAuditeeSignoff) !== toStableJson(incomingAuditeeSignoff)) {
    if (allowedActorIds.size === 0) return 'You must be signed in to record an auditee sign-off.';
    if (!allowedActorIds.has((incomingAudit.auditeeId || '').trim())) {
      return 'Only the assigned auditee can sign the auditee sign-off.';
    }
    if (!incomingAuditeeSignoff || !allowedActorIds.has((incomingAuditeeSignoff.signedById || '').trim())) {
      return 'Auditee sign-off must belong to the active assigned auditee.';
    }
  }

  return null;
}

function existingAuditNumber(existingAudit: QualityAudit | undefined, incomingAudit: QualityAudit, nextAuditNumber: string | null) {
  if (existingAudit?.auditNumber?.trim()) return existingAudit.auditNumber.trim();
  if (nextAuditNumber) return nextAuditNumber;
  if (incomingAudit.auditNumber?.trim()) return incomingAudit.auditNumber.trim();
  return formatAuditSequenceNumber(AUDIT_SEQUENCE_PREFIX, 1);
}
