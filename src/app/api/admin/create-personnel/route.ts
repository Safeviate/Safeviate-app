import { NextResponse } from 'next/server';
import { authenticateAiRequest } from '@/lib/server/ai-auth';
import { ensurePersonnelSchema } from '@/lib/server/bootstrap-db';
import { isDatabaseAvailable, prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { invalidatePersonnelDirectoryCaches } from '@/lib/server/route-cache';
import { createPasswordSetupInvite } from '@/lib/server/password-setup';
import { sendWelcomeEmail } from '@/lib/server/mail';

export async function POST(request: Request) {
  try {
    const authResult = await authenticateAiRequest();
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.effectivePermissions.has('users-create') && authResult.userProfile.role?.toLowerCase() !== 'developer') {
      return NextResponse.json({ error: 'Unauthorized to create users.' }, { status: 403 });
    }

      const body = await request.json();
      const {
        tenantId, email, firstName, lastName,
        userType, role, department, userNumber,
        organizationId, isErpIncerfaContact, isErpAlerfaContact,
        canBeInstructor, canBeStudent, canBePIC,
      } = body;
    const normalizedUserType = userType || 'Personnel';
    const resolvedCanBeInstructor = typeof canBeInstructor === 'boolean'
      ? canBeInstructor
      : normalizedUserType === 'Instructor';
    const resolvedCanBeStudent = typeof canBeStudent === 'boolean'
      ? canBeStudent
      : normalizedUserType === 'Student';
    const resolvedCanBePIC = typeof canBePIC === 'boolean'
      ? canBePIC
      : normalizedUserType === 'PIC';

    if (!tenantId || !email || !firstName || !lastName || !role) {
      return NextResponse.json({ error: 'Missing required user information.' }, { status: 400 });
    }

    if (!(await isDatabaseAvailable())) {
      return NextResponse.json({ error: 'Database is unavailable.' }, { status: 503 });
    }

    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: { updatedAt: new Date() },
      create: { id: tenantId, name: tenantId },
    });

    await ensurePersonnelSchema();

    const normalizedEmail = String(email).trim().toLowerCase();
    const generatedUserId = `user_${normalizedEmail.replace(/[^a-z0-9]+/g, '_')}`;
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, tenantId: true },
    });

    if (existingUser && existingUser.tenantId !== tenantId) {
      return NextResponse.json(
        {
          error: 'This email address is already assigned to a different tenant. User emails are limited to one tenant.',
        },
        { status: 409 }
      );
    }

    const resolvedUserId = existingUser?.id || generatedUserId;

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash: null,
          firstName,
          lastName,
          role,
          profilePath: `tenants/${tenantId}/personnel/${resolvedUserId}`,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.user.create({
        data: {
          id: resolvedUserId,
          tenantId,
          email: normalizedEmail,
          passwordHash: null,
          firstName,
          lastName,
          role,
          profilePath: `tenants/${tenantId}/personnel/${resolvedUserId}`,
        },
      });
    }

    await prisma.personnel.upsert({
      where: { id: resolvedUserId },
      update: {
        tenantId,
        userNumber: userNumber || null,
        firstName,
        lastName,
        email: normalizedEmail,
        department: department || null,
        organizationId: organizationId || null,
        role,
        primaryInstructorId: null,
        instructorAssignmentHistory: [],
        permissions: [],
        accessOverrides: Prisma.JsonNull,
        userType: normalizedUserType,
        canBeInstructor: resolvedCanBeInstructor,
        canBeStudent: resolvedCanBeStudent,
        canBePIC: resolvedCanBePIC,
        isErpIncerfaContact: !!isErpIncerfaContact,
        isErpAlerfaContact: !!isErpAlerfaContact,
        updatedAt: new Date(),
      },
      create: {
        id: resolvedUserId,
        tenantId,
        userNumber: userNumber || null,
        firstName,
        lastName,
        email: normalizedEmail,
        department: department || null,
        organizationId: organizationId || null,
        role,
        primaryInstructorId: null,
        instructorAssignmentHistory: [],
        permissions: [],
        accessOverrides: Prisma.JsonNull,
        userType: normalizedUserType,
        canBeInstructor: resolvedCanBeInstructor,
        canBeStudent: resolvedCanBeStudent,
        canBePIC: resolvedCanBePIC,
        isErpIncerfaContact: !!isErpIncerfaContact,
        isErpAlerfaContact: !!isErpAlerfaContact,
      },
    });

    await prisma.passwordSetupInvite.updateMany({
      where: {
        tenantId,
        email: normalizedEmail,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    const invite = await createPasswordSetupInvite(request, {
      tenantId,
      email: normalizedEmail,
      name: `${firstName} ${lastName}`,
      userId: resolvedUserId,
    });

    const emailResult = await sendWelcomeEmail({
      email: normalizedEmail,
      name: `${firstName} ${lastName}`,
      setupLink: invite.setupLink,
      variant: 'welcome',
    });

    if (!emailResult.success) {
      return NextResponse.json(
        {
          error: emailResult.error || 'Failed to send welcome email.',
          diagnostics: { ...(emailResult.diagnostics || {}), inviteLink: invite.setupLink },
        },
        { status: 500 }
      );
    }

    invalidatePersonnelDirectoryCaches(tenantId);

    return NextResponse.json({
      ok: true,
      uid: resolvedUserId,
      message: 'User created and welcome email sent.',
      diagnostics: { ...(emailResult.diagnostics || {}), inviteLink: invite.setupLink },
    });
  } catch (error: any) {
    if (error?.message === 'This email address is already assigned to a different tenant.') {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error('User creation failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error during user creation.' }, { status: 500 });
  }
}
