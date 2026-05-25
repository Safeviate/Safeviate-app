import crypto from 'node:crypto';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getPublicBaseUrl } from '@/lib/server/site-url';

const INVITE_TTL_DAYS = 7;

export type PasswordSetupInviteInput = {
  tenantId: string;
  email: string;
  name: string;
  userId?: string | null;
};

export type PasswordSetupCompletionResult = {
  success: boolean;
  error?: string;
  email?: string;
  userId?: string;
  diagnostics?: Record<string, unknown>;
};

export type PasswordSetupStatus = {
  tenantId: string;
  hasActivePassword: boolean;
  hasPendingInvite: boolean;
  passwordSetupPending: boolean;
  passwordSetupMessage: string;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const splitName = (name: string) => {
  const compact = name.trim().replace(/\s+/g, ' ');
  if (!compact) return { firstName: 'User', lastName: '' };
  const [firstName, ...rest] = compact.split(' ');
  return { firstName, lastName: rest.join(' ') };
};

export async function getPasswordSetupStatusByEmail(
  email: string,
  fallbackTenantId = 'safeviate',
): Promise<PasswordSetupStatus> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return {
      tenantId: fallbackTenantId,
      hasActivePassword: false,
      hasPendingInvite: false,
      passwordSetupPending: false,
      passwordSetupMessage: '',
    };
  }

  const now = new Date();
  const [user, invite] = await Promise.all([
    prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { tenantId: true, passwordHash: true },
    }).catch(() => null),
    prisma.passwordSetupInvite.findFirst({
      where: {
        email: normalizedEmail,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: { tenantId: true },
    }).catch(() => null),
  ]);

  const tenantId = user?.tenantId?.trim() || invite?.tenantId?.trim() || fallbackTenantId;
  const hasActivePassword = Boolean(user?.passwordHash);
  const hasPendingInvite = Boolean(invite);

  if (hasActivePassword) {
    return {
      tenantId,
      hasActivePassword,
      hasPendingInvite,
      passwordSetupPending: false,
      passwordSetupMessage: '',
    };
  }

  if (hasPendingInvite) {
    return {
      tenantId,
      hasActivePassword,
      hasPendingInvite,
      passwordSetupPending: true,
      passwordSetupMessage: 'Password setup is still pending. Please open the reset link you received and save a new password.',
    };
  }

  if (user) {
    return {
      tenantId,
      hasActivePassword,
      hasPendingInvite,
      passwordSetupPending: true,
      passwordSetupMessage: 'This account does not have an active password yet. Please request a new password reset link.',
    };
  }

  return {
    tenantId,
    hasActivePassword,
    hasPendingInvite,
    passwordSetupPending: false,
    passwordSetupMessage: '',
  };
}

export async function createPasswordSetupInvite(
  request: Request,
  input: PasswordSetupInviteInput,
) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim() || email.split('@')[0] || 'User';
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, tenantId: true },
  });

  if (existingUser && existingUser.tenantId !== input.tenantId) {
    throw new Error('This email address is already assigned to a different tenant.');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const baseUrl = getPublicBaseUrl(request);
  const setupLink = `${baseUrl}/setup-password?token=${encodeURIComponent(token)}`;
  const invalidateConditions: Array<Record<string, unknown>> = [{ email, tenantId: input.tenantId }];
  if (input.userId) {
    invalidateConditions.push({ userId: input.userId });
  }

  await prisma.passwordSetupInvite.updateMany({
    where: {
      usedAt: null,
      OR: invalidateConditions,
    },
    data: { usedAt: new Date() },
  });

  await prisma.passwordSetupInvite.create({
    data: {
      id: `invite_${crypto.randomUUID().replace(/-/g, '')}`,
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      email,
      name,
      tokenHash,
      expiresAt,
    },
  });

  return { token, setupLink, email, name, expiresAt };
}

export async function completePasswordSetup(token: string, password: string): Promise<PasswordSetupCompletionResult> {
  const tokenHash = hashToken(token);
  const invite = await prisma.passwordSetupInvite.findUnique({
    where: { tokenHash },
    include: { tenant: true, user: true },
  });

  if (!invite) {
    return { success: false, error: 'Invalid or expired setup link.' };
  }

  if (invite.usedAt) {
    if (invite.user?.passwordHash) {
      return {
        success: true,
        email: normalizeEmail(invite.email),
        userId: invite.user.id,
        diagnostics: {
          tenantId: invite.tenantId,
          inviteId: invite.id,
          reused: true,
        },
      };
    }

    return {
      success: false,
      error: 'This setup link has already been used. Please request a new password reset link.',
    };
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    return { success: false, error: 'This setup link has expired. Please request a new invite.' };
  }

  const passwordHash = await hash(password, 12);
  const email = normalizeEmail(invite.email);
  const displayName = invite.name?.trim() || email.split('@')[0] || 'User';
  const { firstName, lastName } = splitName(displayName);
  const userId = invite.userId || `user_${email.replace(/[^a-z0-9]+/g, '_')}`;

  await prisma.tenant.upsert({
    where: { id: invite.tenantId },
    update: { updatedAt: new Date() },
    create: { id: invite.tenantId, name: invite.tenant.name || invite.tenantId },
  });

  const existingUser = invite.user || (await prisma.user.findUnique({ where: { email } }));

  if (existingUser) {
    if (existingUser.tenantId !== invite.tenantId) {
      return {
        success: false,
        error: 'This email address is already assigned to a different tenant.',
      };
    }

    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        firstName: existingUser.firstName || firstName,
        lastName: existingUser.lastName || lastName,
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.user.create({
      data: {
        id: userId,
        tenantId: invite.tenantId,
        email,
        passwordHash,
        firstName,
        lastName,
        role: 'Personnel',
        profilePath: `tenants/${invite.tenantId}/personnel/${userId}`,
      },
    });
  }

  await prisma.passwordSetupInvite.update({
    where: { tokenHash },
    data: { usedAt: new Date() },
  });

  return {
    success: true,
    email,
    userId: existingUser?.id || userId,
    diagnostics: {
      tenantId: invite.tenantId,
      inviteId: invite.id,
      expiresAt: invite.expiresAt.toISOString(),
    },
  };
}
