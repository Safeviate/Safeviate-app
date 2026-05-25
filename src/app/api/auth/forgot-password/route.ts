import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPasswordSetupInvite } from '@/lib/server/password-setup';
import { sendWelcomeEmail } from '@/lib/server/mail';
import { enforceRateLimit } from '@/lib/server/request-security';

export async function POST(request: Request) {
  try {
    const rateLimit = enforceRateLimit({
      request,
      key: 'auth-forgot-password',
      limit: 5,
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

    const body = await request.json().catch(() => null);
    const email = String(body?.email || '').trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, tenantId: true, firstName: true, lastName: true, email: true, passwordHash: true, suspendedAt: true },
    });

    if (existingUser) {
      if (existingUser.suspendedAt) {
        return NextResponse.json({
          ok: true,
          message: 'If an account exists for that email, a password reset link has been sent.',
        });
      }

      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash: null,
          updatedAt: new Date(),
        },
      });

      const invite = await createPasswordSetupInvite(request, {
        tenantId: existingUser.tenantId,
        email: existingUser.email,
        name: `${existingUser.firstName} ${existingUser.lastName}`.trim() || existingUser.email.split('@')[0] || 'User',
        userId: existingUser.id,
      });

      const result = await sendWelcomeEmail({
        email: existingUser.email,
        name: `${existingUser.firstName} ${existingUser.lastName}`.trim() || existingUser.email.split('@')[0] || 'User',
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

      if (!result.diagnostics?.hasApiKey) {
        return NextResponse.json({
          ok: true,
          message: 'Password reset link generated. Email delivery is not configured in this environment, so the link is shown below.',
          diagnostics: { ...(result.diagnostics || {}), inviteLink: invite.setupLink },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
  } catch (error: any) {
    console.error('Forgot password dispatch failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error.' }, { status: 500 });
  }
}
