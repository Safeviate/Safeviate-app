'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, MailCheck, ShieldCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const showResetLinkFallback = process.env.NODE_ENV === 'development';
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim()) {
      setMessage('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = payload?.error || 'Could not request a password reset link.';
        setMessage(errorMessage);
        setResetLink('');
        toast({
          variant: 'destructive',
          title: 'Reset Failed',
          description: errorMessage,
        });
        return;
      }

      setIsComplete(true);
      setMessage(String(payload?.message || 'If an account exists for that email, a password reset link has been sent.'));
      setResetLink(String(payload?.diagnostics?.inviteLink || ''));
      toast({
        title: 'Reset Link Sent',
        description: 'Check your inbox for a secure password reset link.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not request a password reset link.';
      setMessage(errorMessage);
      setResetLink('');
      toast({
        variant: 'destructive',
        title: 'Reset Failed',
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
              Reset your password.
              <span className="block text-cyan-300">Recover access securely.</span>
            </h1>
            <p className="max-w-lg text-sm font-medium leading-7 text-slate-300">
              Enter your email address and we'll send a one-time link to set a new password.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center p-4 sm:p-8 lg:p-12">
          <Card className="w-full max-w-md border-white/15 bg-slate-900/70 text-white shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <CardHeader className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/20">
                <MailCheck className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-black tracking-tight text-white">
                  {isComplete ? 'Reset link sent' : 'Forgot your password?'}
                </CardTitle>
                <CardDescription className="text-sm text-slate-300">
                  {isComplete
                    ? 'If the email exists, a one-time reset link has been sent.'
                    : "We'll send a secure link to the email address on file."}
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

                {isComplete && resetLink && showResetLinkFallback ? (
                  <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-50">
                    <p className="font-semibold">Email delivery is not configured in this environment.</p>
                    <a
                      href={resetLink}
                      className="mt-2 inline-flex break-all text-cyan-200 underline decoration-cyan-300/50 underline-offset-4"
                    >
                      Open the generated reset link
                    </a>
                  </div>
                ) : null}

                {!isComplete ? (
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isSubmitting}
                      autoComplete="email"
                      className="h-12 border-white/10 bg-white/95 font-medium text-slate-950 placeholder:text-slate-400"
                    />
                  </div>
                ) : null}
              </CardContent>

              <CardFooter className="flex flex-col gap-3">
                {!isComplete ? (
                  <Button
                    type="submit"
                    className="h-12 w-full bg-cyan-500 font-black uppercase tracking-[0.18em] text-slate-950 hover:bg-cyan-400"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Sending...' : 'Send Reset Link'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="h-12 w-full bg-cyan-500 font-black uppercase tracking-[0.18em] text-slate-950 hover:bg-cyan-400"
                    onClick={() => router.push('/login')}
                  >
                    Go to Sign In
                  </Button>
                )}
                <Button asChild variant="ghost" className="h-10 w-full text-slate-300 hover:bg-white/5 hover:text-white">
                  <Link href="/login" className="inline-flex items-center justify-center gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Login
                  </Link>
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
