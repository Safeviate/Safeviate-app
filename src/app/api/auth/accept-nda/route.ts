import { NextResponse } from 'next/server';
import { recordBetaNdaAcceptance, resolveBetaNdaTenantId } from '@/lib/server/beta-nda';
import { prisma } from '@/lib/prisma';

const readHeader = (headers: Headers, name: string) => headers.get(name)?.trim() || null;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = String(body?.email || '').trim().toLowerCase();
    const name = String(body?.name || '').trim();
    const bodyTenantId = String(body?.tenantId || '').trim();
    const signatureDataUrl = String(body?.signatureDataUrl || '').trim();
    const agreeToTerms = Boolean(body?.agreeToTerms);

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'Your name is required.' }, { status: 400 });
    }

    if (!signatureDataUrl) {
      return NextResponse.json({ error: 'A signature is required.' }, { status: 400 });
    }

    if (!agreeToTerms) {
      return NextResponse.json({ error: 'Please confirm that you accept the NDA.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { tenantId: true },
    }).catch(() => null);
    const tenantId = bodyTenantId || user?.tenantId?.trim() || await resolveBetaNdaTenantId(email, 'safeviate');

    const acceptance = await recordBetaNdaAcceptance({
      tenantId,
      email,
      name,
      signatureDataUrl,
      ipAddress:
        readHeader(request.headers, 'x-forwarded-for')?.split(',')[0]?.trim() ||
        readHeader(request.headers, 'x-real-ip') ||
        null,
      userAgent: readHeader(request.headers, 'user-agent'),
    });

    return NextResponse.json({
      ok: true,
      acceptedAt: acceptance.acceptedAt.toISOString(),
      email: acceptance.email,
      tenantId: acceptance.tenantId,
      version: acceptance.ndaVersion,
    });
  } catch (error: any) {
    console.error('NDA acceptance failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error.' }, { status: 500 });
  }
}
