import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { recordSimulationRouteMetric } from '@/lib/server/simulation-telemetry';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import type { StudentProgressReport } from '@/types/training';

const REPORTS_KEY = 'student-progress-reports';
const MILESTONES_KEY = 'student-milestones';

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

function signatureChanged(previousValue: unknown, nextValue: unknown) {
  return (typeof previousValue === 'string' ? previousValue : '') !== (typeof nextValue === 'string' ? nextValue : '');
}

function validateDebriefSignatureMutation(
  existingReport: StudentProgressReport | null,
  incomingReport: StudentProgressReport,
  actorId: string | null,
) {
  if (!actorId) {
    if (incomingReport.instructorSignatureUrl || incomingReport.studentSignatureUrl) {
      return 'You must be signed in to record a debrief signature.';
    }
    return null;
  }

  if (signatureChanged(existingReport?.instructorSignatureUrl, incomingReport.instructorSignatureUrl)) {
    const assignedInstructorId = incomingReport.instructorId?.trim();
    if (!assignedInstructorId || actorId !== assignedInstructorId) {
      return 'Only the assigned instructor can sign the instructor debrief section.';
    }
  }

  if (signatureChanged(existingReport?.studentSignatureUrl, incomingReport.studentSignatureUrl)) {
    const assignedStudentId = incomingReport.studentId?.trim();
    if (!assignedStudentId || actorId !== assignedStudentId) {
      return 'Only the assigned student can sign the student acknowledgement section.';
    }
  }

  return null;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ reports: [], milestones: null }, { status: 200 });
    }

    const config = await readConfig(tenantId);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'student-training.GET',
      reads: 1,
      writes: 0,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        reports: Array.isArray(config[REPORTS_KEY]) ? config[REPORTS_KEY] : [],
        milestones: config[MILESTONES_KEY] ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[student-training] fallback to empty payload:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'student-training.GET',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ reports: [], milestones: null }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  const startedAt = Date.now();
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const session = await getServerSession(authOptions);
  const actorId = session?.user?.id?.trim() || null;

  const body = await request.json().catch(() => null);
  const config = (await readConfig(tenantId)) as Record<string, unknown>;
  const currentReports = Array.isArray(config[REPORTS_KEY]) ? (config[REPORTS_KEY] as StudentProgressReport[]) : [];

  if (body?.report && typeof body.report === 'object') {
    const incomingReport = body.report as StudentProgressReport;
    const existingReport = currentReports.find((report) => report.id === incomingReport.id) || null;
    const signatureError = validateDebriefSignatureMutation(existingReport, incomingReport, actorId);
    if (signatureError) {
      return NextResponse.json({ error: signatureError }, { status: 403 });
    }
    config[REPORTS_KEY] = [incomingReport, ...currentReports];
  }

  if (Array.isArray(body?.reports)) {
    const incomingReports = body.reports as StudentProgressReport[];
    for (const report of incomingReports) {
      const existingReport = currentReports.find((item) => item.id === report.id) || null;
      const signatureError = validateDebriefSignatureMutation(existingReport, report, actorId);
      if (signatureError) {
        return NextResponse.json({ error: signatureError }, { status: 403 });
      }
    }
    config[REPORTS_KEY] = incomingReports;
  }

  if (body?.milestones) {
    config[MILESTONES_KEY] = body.milestones;
  }

  await writeConfig(tenantId, config);
  await recordSimulationRouteMetric({
    tenantId,
    routeKey: 'student-training.PUT',
    reads: 1,
    writes: 1,
    durationMs: Date.now() - startedAt,
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}
