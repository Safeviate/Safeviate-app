import { NextResponse } from 'next/server';
import { authenticateAiRequest } from '@/lib/server/ai-auth';
import { sendWelcomeEmail } from '@/lib/server/mail';
import { ensurePersonnelSchema } from '@/lib/server/bootstrap-db';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { createPasswordSetupInvite } from '@/lib/server/password-setup';
import { invalidatePersonnelDirectoryCaches } from '@/lib/server/route-cache';

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

    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: { updatedAt: new Date() },
      create: { id: tenantId, name: tenantId },
    });

    await ensurePersonnelSchema();

    const uid = `user_${email.replace(/[^a-z0-9]+/g, '_')}`;

    await prisma.user.upsert({
      where: { email },
      update: {
        id: uid,
        tenantId,
        passwordHash: null,
        firstName,
        lastName,
        role,
        profilePath: `tenants/${tenantId}/personnel/${uid}`,
        updatedAt: new Date(),
      },
      create: {
        id: uid,
        tenantId,
        email,
        passwordHash: null,
        firstName,
        lastName,
        role,
        profilePath: `tenants/${tenantId}/personnel/${uid}`,
      },
    });

    await prisma.personnel.upsert({
      where: { id: uid },
      update: {
        tenantId,
        userNumber: userNumber || null,
        firstName,
        lastName,
        email,
        department: department || null,
        organizationId: organizationId || null,
        role,
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
        id: uid,
        tenantId,
        userNumber: userNumber || null,
        firstName,
        lastName,
        email,
        department: department || null,
        organizationId: organizationId || null,
        role,
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

    invalidatePersonnelDirectoryCaches(tenantId);

    const invite = await createPasswordSetupInvite(request, {
      tenantId,
      email,
      name: `${firstName} ${lastName}`,
      userId: uid,
    });

    const emailResult = await sendWelcomeEmail({ email, name: `${firstName} ${lastName}`, setupLink: invite.setupLink });

    if (!emailResult.success) {
      return NextResponse.json(
        {
          error: `Failed to send email. Resend Error: ${emailResult.error}`,
          diagnostics: emailResult.diagnostics || null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      uid,
      message: emailResult.diagnostics?.hasApiKey === false
        ? 'User created. Invite email was skipped because mail is not configured.'
        : 'User created and setup link sent.',
      diagnostics: { ...(emailResult.diagnostics || {}), inviteLink: invite.setupLink },
    });
  } catch (error: any) {
    console.error('User creation failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error during user creation.' }, { status: 500 });
  }
}
