import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const resolveCanonicalHost = () => {
  const configuredUrl = process.env.NEXTAUTH_URL?.trim();
  if (!configuredUrl) return '';

  try {
    return new URL(configuredUrl).host.toLowerCase();
  } catch {
    return '';
  }
};

export function middleware(request: NextRequest) {
  const canonicalHost = resolveCanonicalHost();
  const host = request.headers.get('host')?.toLowerCase() ?? '';
  const isVercelHost = host.endsWith('.vercel.app');
  const isCanonicalHost = canonicalHost && host === canonicalHost;

  if (canonicalHost && isVercelHost && !isCanonicalHost) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.host = canonicalHost;
    redirectUrl.protocol = 'https';
    redirectUrl.port = '';
    const redirectResponse = NextResponse.redirect(redirectUrl, 308);
    applySecurityHeaders(redirectResponse);
    return redirectResponse;
  }

  const response = NextResponse.next();
  applySecurityHeaders(response);
  return response;
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '));
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=(self)');
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
