import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { ensureTenantConfigSchema } from '@/lib/server/bootstrap-db';
import { BETA_NDA_AGREEMENT_TEXT, BETA_NDA_VERSION } from '@/lib/beta-nda-content';

export { BETA_NDA_AGREEMENT_TEXT, BETA_NDA_VERSION } from '@/lib/beta-nda-content';

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const readBetaNdaRequired = (configData: unknown) => {
  if (!configData || typeof configData !== 'object') return true;
  const featureSettings = (configData as Record<string, unknown>)['feature-settings'];
  if (!featureSettings || typeof featureSettings !== 'object') return true;
  const betaNdaRequired = (featureSettings as Record<string, unknown>).betaNdaRequired;
  return typeof betaNdaRequired === 'boolean' ? betaNdaRequired : true;
};

async function resolveTenantIdFromEmail(email: string, fallbackTenantId = 'safeviate') {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return fallbackTenantId;

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { tenantId: true },
  }).catch(() => null);

  const userTenantId = user?.tenantId?.trim();
  if (userTenantId) {
    return userTenantId;
  }

  const invite = await prisma.passwordSetupInvite.findFirst({
    where: {
      email: normalizedEmail,
      usedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { tenantId: true },
  }).catch(() => null);

  const inviteTenantId = invite?.tenantId?.trim();
  if (inviteTenantId) {
    return inviteTenantId;
  }

  return fallbackTenantId;
}

export async function hasAcceptedBetaNda(tenantId: string, email: string): Promise<boolean> {
  const normalizedTenantId = tenantId.trim() || 'safeviate';
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const acceptance = await prisma.betaNdaAcceptance.findUnique({
    where: {
      tenantId_email_ndaVersion: {
        tenantId: normalizedTenantId,
        email: normalizedEmail,
        ndaVersion: BETA_NDA_VERSION,
      },
    },
    select: { id: true },
  });

  return Boolean(acceptance);
}

export async function resolveBetaNdaTenantId(email: string, fallbackTenantId = 'safeviate') {
  return resolveTenantIdFromEmail(email, fallbackTenantId);
}

export async function isBetaNdaRequiredForTenant(tenantId: string) {
  const normalizedTenantId = tenantId.trim() || 'safeviate';
  try {
    await ensureTenantConfigSchema();
    const configRow = await prisma.tenantConfig.findUnique({
      where: { tenantId: normalizedTenantId },
      select: { data: true },
    });
    return readBetaNdaRequired(configRow?.data);
  } catch {
    return true;
  }
}

export type RecordBetaNdaAcceptanceInput = {
  tenantId: string;
  email: string;
  name: string;
  signatureDataUrl: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function recordBetaNdaAcceptance(input: RecordBetaNdaAcceptanceInput) {
  const tenantId = input.tenantId.trim() || 'safeviate';
  const email = normalizeEmail(input.email);
  const name = input.name.trim().replace(/\s+/g, ' ') || email.split('@')[0] || 'User';
  const now = new Date();

  return prisma.betaNdaAcceptance.upsert({
    where: {
      tenantId_email_ndaVersion: {
        tenantId,
        email,
        ndaVersion: BETA_NDA_VERSION,
      },
    },
    create: {
      id: `nda_${crypto.randomUUID().replace(/-/g, '')}`,
      tenantId,
      email,
      name,
      ndaVersion: BETA_NDA_VERSION,
      agreementText: BETA_NDA_AGREEMENT_TEXT,
      signatureDataUrl: input.signatureDataUrl,
      acceptedAt: now,
      ipAddress: input.ipAddress?.trim() || null,
      userAgent: input.userAgent?.trim() || null,
    },
    update: {
      tenantId,
      name,
      agreementText: BETA_NDA_AGREEMENT_TEXT,
      signatureDataUrl: input.signatureDataUrl,
      acceptedAt: now,
      ipAddress: input.ipAddress?.trim() || null,
      userAgent: input.userAgent?.trim() || null,
    },
  });
}
