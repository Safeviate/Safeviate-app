import { NextResponse } from 'next/server';
import { authenticateAiRequest } from '@/lib/server/ai-auth';
import { sendWelcomeEmail } from '@/lib/server/mail';
import { createPasswordSetupInvite } from '@/lib/server/password-setup';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/server/request-security';

export async function POST(request: Request) {
  try {
    const rateLimit = enforceRateLimit({
      request,
      key: 'admin-send-password-reset',
      limit: 12,
    });
    if (rateLimit) {
      return NextResponse.json(
        { error: rateLimit.message },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const authResult = await authenticateAiRequest();
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.effectivePermissions.has('users-edit') && authResult.userProfile.role?.toLowerCase() !== 'developer') {
      return NextResponse.json({ error: 'Unauthorized to trigger password reset.' }, { status: 403 });
    }

    const { email, name, userId, tenantId } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const inviteTenantId = String(tenantId || authResult.tenantId || 'safeviate');
    const existingUser = userId
      ? await prisma.user.findFirst({ where: { id: String(userId), tenantId: inviteTenantId } })
      : await prisma.user.findFirst({ where: { email: normalizedEmail, tenantId: inviteTenantId } });

    if (!existingUser) {
      return NextResponse.json(
        { error: 'No matching tenant user was found for this password reset.' },
        { status: 404 }
      );
    }

    const finalTenantId = String(existingUser.tenantId || inviteTenantId);
    const invite = await createPasswordSetupInvite(request, {
      tenantId: finalTenantId,
      email: normalizedEmail,
      name: String(name || existingUser.firstName || normalizedEmail.split('@')[0] || 'User'),
      userId: existingUser.id,
    });

    const result = await sendWelcomeEmail({
      email: normalizedEmail,
      name: String(name || existingUser.firstName || 'User'),
      setupLink: invite.setupLink,
      variant: 'reset',
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Failed to send password reset email.',
          diagnostics: result.diagnostics || null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Password reset email dispatched.',
      diagnostics: { ...(result.diagnostics || {}), inviteLink: invite.setupLink },
    });
  } catch (error: any) {
    if (error?.message === 'This email address is already assigned to a different tenant.') {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error('Password reset dispatch failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error.' }, { status: 500 });
  }
}
