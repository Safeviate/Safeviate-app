import { NextResponse } from 'next/server';
import { completePasswordSetup } from '@/lib/server/password-setup';
import { enforceRateLimit } from '@/lib/server/request-security';

export async function POST(request: Request) {
  try {
    const rateLimit = enforceRateLimit({
      request,
      key: 'auth-setup-password',
      limit: 10,
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
    const token = String(body?.token || '').trim();
    const password = String(body?.password || '');
    const confirmPassword = String(body?.confirmPassword || '');

    if (!token) {
      return NextResponse.json({ error: 'Invite token is required.' }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
    }

    const result = await completePasswordSetup(token, password);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to complete password setup.' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      email: result.email,
      userId: result.userId,
      diagnostics: result.diagnostics || null,
    });
  } catch (error: any) {
    console.error('Password setup failed:', error);
    return NextResponse.json({ error: error.message || 'Internal server error.' }, { status: 500 });
  }
}
