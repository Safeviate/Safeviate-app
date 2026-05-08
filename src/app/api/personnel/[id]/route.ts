import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensurePersonnelSchema } from '@/lib/server/bootstrap-db';
import { invalidatePersonnelDirectoryCaches } from '@/lib/server/route-cache';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensurePersonnelSchema();
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  const { id } = await params;

  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { email },
    select: { tenantId: true },
  });
  const tenantId = currentUser?.tenantId || 'safeviate';

  const deletedPersonnel = await prisma.personnel.deleteMany({
    where: { id, tenantId },
  });

  await prisma.user.deleteMany({
    where: { id, tenantId },
  });

  if (deletedPersonnel.count === 0) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  invalidatePersonnelDirectoryCaches(tenantId);

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensurePersonnelSchema();
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  const { id } = await params;

  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { email },
    select: { tenantId: true },
  });
  const tenantId = currentUser?.tenantId || 'safeviate';

  const body = await request.json().catch(() => null);
  const personnel = body?.personnel;
  if (!personnel || typeof personnel !== 'object') {
    return NextResponse.json({ error: 'Invalid personnel payload.' }, { status: 400 });
  }

  const existing = await prisma.personnel.findFirst({
    where: { id, tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const data = {
    ...existing,
    ...personnel,
    id,
    tenantId,
  };

  const updatedRows = await prisma.$executeRawUnsafe(
    `UPDATE personnel
     SET user_number = $3,
         first_name = $4,
         last_name = $5,
         email = $6,
         user_type = $7,
         can_be_instructor = $8,
         can_be_student = $9,
         role = $10,
         department = $11,
         organization_id = $12,
         contact_number = $13,
         is_erp_incerfa_contact = $14,
         is_erp_alerfa_contact = $15,
         permissions = $16::jsonb,
         access_overrides = $17::jsonb,
         documents = $18::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    id,
    tenantId,
    data.userNumber || null,
    data.firstName,
    data.lastName,
    data.email,
    data.userType || existing.userType,
    typeof data.canBeInstructor === 'boolean' ? data.canBeInstructor : existing.canBeInstructor,
    typeof data.canBeStudent === 'boolean' ? data.canBeStudent : existing.canBeStudent,
    typeof data.canBePIC === 'boolean' ? data.canBePIC : existing.canBePIC,
    data.role,
    data.department || null,
    data.organizationId || null,
    data.contactNumber || null,
    !!data.isErpIncerfaContact,
    !!data.isErpAlerfaContact,
    JSON.stringify(data.permissions || []),
    JSON.stringify(data.accessOverrides || {}),
    JSON.stringify(data.documents || []),
  );

  if (!updatedRows) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  await prisma.user.updateMany({
    where: { id, tenantId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      role: data.role,
      updatedAt: new Date(),
    },
  });

  invalidatePersonnelDirectoryCaches(tenantId);

  return NextResponse.json({ personnel: data }, { status: 200 });
}
