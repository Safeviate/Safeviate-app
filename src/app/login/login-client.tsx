'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { signIn } from 'next-auth/react';
import { ShieldCheck, LockKeyhole, ArrowRight, KeyRound } from 'lucide-react';
import Link from 'next/link';

export default function LoginClient() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const tenantId = searchParams?.get('tenantId')?.trim() || '';

  useEffect(() => {
    const nextEmail = searchParams?.get('email')?.trim();
    if (nextEmail) {
      setEmail(nextEmail);
    }
  }, [searchParams]);

  const getLoginErrorMessage = (errorMessage?: string | null) => {
    if (!errorMessage) return 'Incorrect email or password.';
    if (errorMessage === 'CredentialsSignin') {
      return 'Login failed. Check the password, or complete the beta NDA if this is a tester account.';
    }
    return errorMessage;
  };

  const redirectToNdaIfNeeded = async () => {
    const query = new URLSearchParams({ email });
    if (tenantId) {
      query.set('tenantId', tenantId);
    }

    const response = await fetch(`/api/auth/nda-status?${query.toString()}`, {
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (payload?.passwordSetupPending) {
      const message = String(
        payload?.passwordSetupMessage ||
          'Password setup is still pending. Please open the reset link you received and save a new password.',
      );
      setErrorMessage(message);
      toast({
        variant: 'destructive',
        title: 'Password Setup Pending',
        description: message,
      });
      return true;
    }
    if (payload?.enabled === false) {
      return false;
    }
    if (payload?.accepted === false) {
      const tenantQuery = payload?.tenantId ? `&tenantId=${encodeURIComponent(String(payload.tenantId))}` : '';
      router.push(`/beta-nda?email=${encodeURIComponent(email)}${tenantQuery}`);
      return true;
    }
    return false;
  };

  const handleUserLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please enter both email and password.',
      });
      return;
    }

    setIsLoginLoading(true);
    setErrorMessage(null);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        callbackUrl: '/dashboard',
        redirect: false,
      });

      if (!result || result.error) {
        const isGenericCredentialsFailure = !result?.error || result.error === 'CredentialsSignin';
        if (isGenericCredentialsFailure) {
          const followUpHandled = await redirectToNdaIfNeeded();
          if (followUpHandled) {
            return;
          }
        }

        const message = getLoginErrorMessage(result?.error);
        setErrorMessage(message);
        toast({
          variant: 'destructive',
          title: 'Login Failed',
          description: message,
        });
        return;
      }

      setErrorMessage(null);
      toast({
        title: 'Login Successful',
        description: `Welcome back to Safeviate.`,
      });
      window.location.assign(result.url || '/dashboard');
    } catch (error) {
      console.error('Login failed:', error);
      const message = getLoginErrorMessage(error instanceof Error ? error.message : undefined);
      setErrorMessage(message);
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: message,
      });
    } finally {
      setIsLoginLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.20),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.18),transparent_32%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.92))]" />
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

      <div className="relative z-10 grid flex-1 grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden lg:flex flex-col justify-between p-12 xl:p-16">
          <div className="max-w-xl space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.28em] text-cyan-100 backdrop-blur">
              <ShieldCheck className="h-4 w-4" />
              Safeviate Manager
            </div>
            <h1 className="text-5xl font-black leading-tight tracking-tight text-white xl:text-6xl">
              Secure operations.
              <span className="block text-cyan-300">One clean sign-in.</span>
            </h1>
            <p className="max-w-lg text-sm font-medium leading-7 text-slate-300">
              Access fleet, safety, quality, training, and personnel systems from a single authenticated workspace.
            </p>
          </div>

          <div className="grid max-w-2xl grid-cols-3 gap-4 text-xs">
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur">
              <p className="font-black uppercase tracking-[0.2em] text-cyan-200">DB-backed</p>
              <p className="mt-2 text-slate-300">Core business records live in one source of truth.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur">
              <p className="font-black uppercase tracking-[0.2em] text-cyan-200">Protected</p>
              <p className="mt-2 text-slate-300">Authentication gates the app before sensitive data loads.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur">
              <p className="font-black uppercase tracking-[0.2em] text-cyan-200">Audit-ready</p>
              <p className="mt-2 text-slate-300">Designed for traceable operational workflows.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center p-4 sm:p-8 lg:p-12">
          <Card className="w-full max-w-md border-white/15 bg-slate-900/70 text-white shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <CardHeader className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/20">
                <LockKeyhole className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-black tracking-tight text-white">Welcome back</CardTitle>
                <CardDescription className="text-sm text-slate-300">
                  {searchParams?.get('setup')
                    ? 'Your password has been saved. Sign in to continue.'
                    : searchParams?.get('nda')
                      ? 'Your NDA has been recorded. Sign in to continue.'
                      : 'Sign in to continue to the Safeviate operations portal.'}
                </CardDescription>
              </div>
            </CardHeader>

            <form onSubmit={handleUserLogin}>
              <CardContent className="space-y-5">
                {errorMessage ? (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {errorMessage}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoginLoading}
                    autoComplete="email"
                    className="h-12 border-white/10 bg-white/95 font-medium text-slate-950 placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoginLoading}
                    autoComplete="current-password"
                    className="h-12 border-white/10 bg-white/95 font-medium text-slate-950 placeholder:text-slate-400"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3">
                <Button
                  type="submit"
                  className="h-12 w-full bg-cyan-500 font-black uppercase tracking-[0.18em] text-slate-950 hover:bg-cyan-400"
                  disabled={isLoginLoading}
                >
                  {isLoginLoading ? 'Authorizing...' : (
                    <span className="inline-flex items-center gap-2">
                      Sign In
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
                <Button asChild variant="ghost" className="h-10 w-full text-slate-300 hover:bg-white/5 hover:text-white">
                  <Link href="/forgot-password" className="inline-flex items-center justify-center gap-2">
                    <KeyRound className="h-4 w-4" />
                    Forgot Password?
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="h-10 w-full text-slate-300 hover:bg-white/5 hover:text-white">
                  <Link href="/beta-nda" className="inline-flex items-center justify-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Beta NDA
                  </Link>
                </Button>
                <p className="text-center text-[11px] font-medium leading-5 text-slate-400">
                  Testers must accept the beta NDA before signing in.
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
