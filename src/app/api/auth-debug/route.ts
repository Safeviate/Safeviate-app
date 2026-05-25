import { authOptions } from '@/auth';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

const safeValue = (value: string | undefined | null) => {
  const trimmed = value?.replace(/\\r\\n|\\n|\\r/g, '').trim() || '';
  if (!trimmed) return '';
  if (trimmed.includes('@')) return trimmed.replace(/^(.{2}).*(@.*)$/, '$1***$2');
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
};

export async function GET() {
  const session = await getServerSession(authOptions);

  return NextResponse.json({
    environment: process.env.NODE_ENV,
    nextAuthUrl: safeValue(process.env.NEXTAUTH_URL),
    seedEmail: safeValue(process.env.AUTH_SEED_EMAIL),
    hasSeedEmail: Boolean(process.env.AUTH_SEED_EMAIL),
    hasSeedPassword: Boolean(process.env.AUTH_SEED_PASSWORD),
    hasSeedPasswordHash: Boolean(process.env.AUTH_SEED_PASSWORD_HASH),
    hasResendApiKey: Boolean(process.env.RESEND_API_KEY),
    mailFrom: safeValue(process.env.MAIL_FROM || process.env.RESEND_FROM || process.env.EMAIL_FROM),
    session: session
      ? {
          user: {
            id: session.user?.id ?? null,
            email: session.user?.email ?? null,
            name: session.user?.name ?? null,
          },
        }
      : null,
  });
}
