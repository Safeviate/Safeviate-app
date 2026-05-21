import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasAcceptedBetaNda, BETA_NDA_VERSION } from '@/lib/server/beta-nda';
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
      });
    }

    const requestedTenantId = tenantId;
    const sessionTenantId = (await getTenantIdFromSession(request)) || 'safeviate';
    const resolvedTenantId = sessionEmail && isMasterTenantEmail(sessionEmail)
      ? requestedTenantId || sessionTenantId
      : sessionTenantId;
    const accepted = await hasAcceptedBetaNda(resolvedTenantId, requestEmail);
    return NextResponse.json({
      ok: true,
      accepted,
      version: BETA_NDA_VERSION,
      tenantId: resolvedTenantId,
    });
  } catch (error: any) {
    console.error('NDA status lookup failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error.' }, { status: 500 });
  }
}
