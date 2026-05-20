import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureSafetyFileAssignmentsSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    await ensureSafetyFileAssignmentsSchema();

    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId, assignmentId } = await params;
    await prisma.$executeRawUnsafe(
      `DELETE FROM safety_file_assignments WHERE id = $1 AND tenant_id = $2 AND project_id = $3`,
      assignmentId,
      tenantId,
      projectId
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[safety-files/[id]/assignments/[assignmentId]] failed to delete assignment:', error);
    return NextResponse.json({ error: 'Failed to delete project assignment.' }, { status: 500 });
  }
}
