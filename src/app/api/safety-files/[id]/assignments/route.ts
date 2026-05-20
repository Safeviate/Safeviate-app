import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureSafetyFileAssignmentsSchema } from '@/lib/server/bootstrap-db';
import type { SafetyFileAssignment } from '@/types/safety-file';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSafetyFileAssignmentsSchema();

    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;
    const body = await request.json().catch(() => null);
    const assignment = body?.assignment;
    if (!assignment || typeof assignment !== 'object') {
      return NextResponse.json({ error: 'Invalid assignment payload.' }, { status: 400 });
    }

    const duplicateRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM safety_file_assignments WHERE tenant_id = $1 AND project_id = $2 AND personnel_id = $3 LIMIT 1`,
      tenantId,
      projectId,
      assignment.personnelId
    );

    if (duplicateRows.length > 0) {
      return NextResponse.json({ error: 'This user is already assigned to the project.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const data: SafetyFileAssignment = {
      id: assignment.id || randomUUID(),
      projectId,
      personnelId: assignment.personnelId?.toString() || '',
      siteRole: assignment.siteRole?.toString()?.trim() || '',
      employerName: assignment.employerName?.toString()?.trim() || '',
      isActive: assignment.isActive !== false,
      assignedAt: assignment.assignedAt || now,
      requiredDocumentNames: Array.isArray(assignment.requiredDocumentNames)
        ? assignment.requiredDocumentNames.filter(Boolean)
        : [],
      createdAt: assignment.createdAt || now,
      updatedAt: now,
    };

    if (!data.personnelId || !data.siteRole) {
      return NextResponse.json({ error: 'Personnel and site role are required.' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO safety_file_assignments (id, tenant_id, project_id, personnel_id, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())`,
      data.id,
      tenantId,
      projectId,
      data.personnelId,
      JSON.stringify(data)
    );

    return NextResponse.json({ assignment: data }, { status: 200 });
  } catch (error) {
    console.error('[safety-files/[id]/assignments] failed to save assignment:', error);
    return NextResponse.json({ error: 'Failed to save project assignment.' }, { status: 500 });
  }
}
