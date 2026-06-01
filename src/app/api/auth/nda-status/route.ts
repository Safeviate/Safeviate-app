import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasAcceptedBetaNda, BETA_NDA_VERSION, isBetaNdaRequiredForTenant, resolveBetaNdaTenantId } from '@/lib/server/beta-nda';
import { getPasswordSetupStatusByEmail } from '@/lib/server/password-setup';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { isMasterTenantEmail } from '@/lib/server/tenant-access';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email?.trim().toLowerCase() || '';
    const url = new URL(request.url);
    const requestEmail = url.searchParams.get('email')?.trim().toLowerCase() || '';
    const tenantId = url.searchParams.get('tenantId')?.trim() || '';

    if (!requestEmail) {
      return NextResponse.json({
        ok: true,
        accepted: false,
        version: BETA_NDA_VERSION,
        tenantId: tenantId || 'safeviate',
        passwordSetupPending: false,
        passwordSetupMessage: '',
      });
    }

    const requestedTenantId = tenantId;
    const sessionTenantId = (await getTenantIdFromSession(request)) || '';
    const inferredTenantId = requestEmail ? await resolveBetaNdaTenantId(requestEmail, sessionTenantId || 'safeviate') : sessionTenantId || 'safeviate';
    const resolvedTenantId = sessionEmail && isMasterTenantEmail(sessionEmail)
      ? requestedTenantId || sessionTenantId || inferredTenantId
      : sessionTenantId || inferredTenantId;
    const passwordSetupStatus = await getPasswordSetupStatusByEmail(requestEmail, resolvedTenantId);
    const { passwordSetupPending, passwordSetupMessage } = passwordSetupStatus;
    const enabled = await isBetaNdaRequiredForTenant(resolvedTenantId);
    if (!enabled) {
      return NextResponse.json({
        ok: true,
        accepted: true,
        enabled,
        passwordSetupPending,
        passwordSetupMessage,
        version: BETA_NDA_VERSION,
        tenantId: resolvedTenantId,
      });
    }
    const accepted = await hasAcceptedBetaNda(resolvedTenantId, requestEmail);
    return NextResponse.json({
      ok: true,
      accepted,
      enabled,
      passwordSetupPending,
      passwordSetupMessage,
      version: BETA_NDA_VERSION,
      tenantId: resolvedTenantId,
    });
  } catch (error: any) {
    console.error('NDA status lookup failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error.' }, { status: 500 });
  }
}
