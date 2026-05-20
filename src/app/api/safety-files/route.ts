import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import {
  ensureSafetyFileAssignmentsSchema,
  ensureSafetyFileProjectsSchema,
} from '@/lib/server/bootstrap-db';
import type { SafetyFileProject } from '@/types/safety-file';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    await ensureSafetyFileProjectsSchema();
    await ensureSafetyFileAssignmentsSchema();

    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ projects: [] }, { status: 200 });
    }

    const [projectRows, assignmentRows] = await Promise.all([
      prisma.$queryRawUnsafe<{ data: SafetyFileProject }[]>(
        `SELECT data FROM safety_file_projects WHERE tenant_id = $1 ORDER BY created_at DESC`,
        tenantId
      ),
      prisma.$queryRawUnsafe<{ project_id: string; count: string | number }[]>(
        `SELECT project_id, COUNT(*)::int AS count FROM safety_file_assignments WHERE tenant_id = $1 GROUP BY project_id`,
        tenantId
      ),
    ]);

    const assignmentCountMap = new Map(
      assignmentRows.map((row) => [row.project_id, Number(row.count || 0)])
    );

    return NextResponse.json(
      {
        projects: projectRows.map((row) => ({
          ...row.data,
          assignmentCount: assignmentCountMap.get(row.data.id) || 0,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[safety-files] fallback to empty list:', error);
    return NextResponse.json({ projects: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureSafetyFileProjectsSchema();

    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const project = body?.project;
    if (!project || typeof project !== 'object') {
      return NextResponse.json({ error: 'Invalid safety file project payload.' }, { status: 400 });
    }

    const id = project.id || randomUUID();
    const now = new Date().toISOString();
    const data: SafetyFileProject = {
      id,
      name: project.name?.toString()?.trim() || '',
      clientName: project.clientName?.toString()?.trim() || '',
      siteName: project.siteName?.toString()?.trim() || '',
      siteAddress: project.siteAddress?.toString()?.trim() || '',
      principalContractor: project.principalContractor?.toString()?.trim() || '',
      scopeOfWork: project.scopeOfWork?.toString()?.trim() || '',
      startDate: project.startDate || '',
      endDate: project.endDate || '',
      status: (project.status as SafetyFileProject['status']) || 'PLANNING',
      permitRequired: !!project.permitRequired,
      notificationRequired: !!project.notificationRequired,
      createdAt: project.createdAt || now,
      updatedAt: now,
    };

    if (!data.name) {
      return NextResponse.json({ error: 'Project name is required.' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO safety_file_projects (id, tenant_id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      tenantId,
      JSON.stringify(data)
    );

    return NextResponse.json({ project: data }, { status: 200 });
  } catch (error) {
    console.error('[safety-files] failed to save project:', error);
    return NextResponse.json({ error: 'Failed to save safety file project.' }, { status: 500 });
  }
}
