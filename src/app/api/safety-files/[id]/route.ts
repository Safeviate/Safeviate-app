import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import {
  ensureSafetyFileAssignmentsSchema,
  ensureSafetyFileProjectsSchema,
} from '@/lib/server/bootstrap-db';
import type { SafetyFileAssignment, SafetyFileProject } from '@/types/safety-file';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSafetyFileProjectsSchema();
    await ensureSafetyFileAssignmentsSchema();

    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ project: null, assignments: [] }, { status: 200 });
    }

    const { id } = await params;
    const [projectRows, assignmentRows] = await Promise.all([
      prisma.$queryRawUnsafe<{ data: SafetyFileProject }[]>(
        `SELECT data FROM safety_file_projects WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        id,
        tenantId
      ),
      prisma.$queryRawUnsafe<{ data: SafetyFileAssignment }[]>(
        `SELECT data FROM safety_file_assignments WHERE project_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
        id,
        tenantId
      ),
    ]);

    return NextResponse.json(
      {
        project: projectRows[0]?.data ?? null,
        assignments: assignmentRows.map((row) => row.data),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[safety-files/[id]] fallback to null:', error);
    return NextResponse.json({ project: null, assignments: [] }, { status: 200 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSafetyFileProjectsSchema();

    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const project = body?.project;
    if (!project || typeof project !== 'object') {
      return NextResponse.json({ error: 'Invalid safety file project payload.' }, { status: 400 });
    }

    const data = {
      ...project,
      id,
      updatedAt: new Date().toISOString(),
    };

    await prisma.$executeRawUnsafe(
      `UPDATE safety_file_projects SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
      id,
      JSON.stringify(data),
      tenantId
    );

    return NextResponse.json({ project: data }, { status: 200 });
  } catch (error) {
    console.error('[safety-files/[id]] failed to update project:', error);
    return NextResponse.json({ error: 'Failed to update safety file project.' }, { status: 500 });
  }
}
