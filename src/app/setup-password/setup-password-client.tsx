'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';

export default function SetupPasswordClient() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const token = useMemo(() => searchParams?.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [completedEmail, setCompletedEmail] = useState('');
  const loginHref = `/login?setup=1${completedEmail ? `&email=${encodeURIComponent(completedEmail)}` : ''}`;

  useEffect(() => {
    if (!isComplete) return;

    const timeout = window.setTimeout(() => {
      window.location.assign(loginHref);
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [isComplete, loginHref]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setMessage('This setup link is missing its token. Please request a new invite.');
      toast({
        variant: 'destructive',
        title: 'Setup Link Missing',
        description: 'Please request a new welcome email.',
      });
      return;
    }

    if (!password || !confirmPassword) {
      setMessage('Please enter and confirm your new password.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = payload?.error || 'Could not complete password setup.';
        setMessage(errorMessage);
        toast({
          variant: 'destructive',
          title: 'Setup Failed',
          description: errorMessage,
        });
        return;
      }

      setIsComplete(true);
      setCompletedEmail(String(payload?.email || ''));
      setMessage('Your password has been saved. You can now sign in.');
      toast({
        title: 'Password Saved',
        description: 'Your account is ready to use.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not complete password setup.';
      setMessage(errorMessage);
      toast({
        variant: 'destructive',
        title: 'Setup Failed',
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
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
              Set your password.
              <span className="block text-cyan-300">Finish account setup.</span>
            </h1>
            <p className="max-w-lg text-sm font-medium leading-7 text-slate-300">
              Choose a secure password to activate your account and access the Safeviate operations portal.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center p-4 sm:p-8 lg:p-12">
          <Card className="w-full max-w-md border-white/15 bg-slate-900/70 text-white shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <CardHeader className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/20">
                {isComplete ? <CheckCircle2 className="h-7 w-7" /> : <KeyRound className="h-7 w-7" />}
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-black tracking-tight text-white">
                  {isComplete ? 'Password saved' : 'Create your password'}
                </CardTitle>
                <CardDescription className="text-sm text-slate-300">
                  {isComplete
                    ? 'Your account is ready.'
                    : 'Use the secure invite link from your welcome email to activate your account.'}
                </CardDescription>
              </div>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-5">
                {message ? (
                  <div className={`rounded-xl border px-4 py-3 text-sm ${isComplete ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/30 bg-rose-500/10 text-rose-100'}`}>
                    {message}
                  </div>
                ) : null}

                {!isComplete ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300">
                        New Password
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isSubmitting}
                        autoComplete="new-password"
                        className="h-12 border-white/10 bg-white/95 font-medium text-slate-950 placeholder:text-slate-400"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword" className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300">
                        Confirm Password
                      </Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isSubmitting}
                        autoComplete="new-password"
                        className="h-12 border-white/10 bg-white/95 font-medium text-slate-950 placeholder:text-slate-400"
                      />
                    </div>
                  </>
                ) : null}
              </CardContent>

              <CardFooter className="flex flex-col gap-3">
                {!isComplete ? (
                  <Button
                    type="submit"
                    className="h-12 w-full bg-cyan-500 font-black uppercase tracking-[0.18em] text-slate-950 hover:bg-cyan-400"
                    disabled={isSubmitting || !token}
                  >
                    {isSubmitting ? 'Saving...' : 'Save Password'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="h-12 w-full bg-cyan-500 font-black uppercase tracking-[0.18em] text-slate-950 hover:bg-cyan-400"
                    onClick={() => window.location.assign(loginHref)}
                  >
                    Go to Sign In
                  </Button>
                )}
                <p className="text-center text-[11px] font-medium leading-5 text-slate-400">
                  {token ? 'This link can only be used once and expires automatically.' : 'Request a new invite if this link has expired.'}
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
