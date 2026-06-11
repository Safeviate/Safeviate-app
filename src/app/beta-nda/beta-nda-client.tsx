'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SignaturePad } from '@/components/ui/signature-pad';
import { useToast } from '@/hooks/use-toast';
import { BETA_NDA_AGREEMENT_TEXT, BETA_NDA_SUMMARY, BETA_NDA_TITLE, BETA_NDA_VERSION } from '@/lib/beta-nda-content';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';

const agreementSections = BETA_NDA_AGREEMENT_TEXT.split('\n\n').filter(Boolean);

export default function BetaNdaClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { toast } = useToast();
  const initialEmail = searchParams?.get('email')?.trim() || '';
  const initialTenantId = searchParams?.get('tenantId')?.trim() || '';

  const [email, setEmail] = useState(initialEmail);
  const [tenantId, setTenantId] = useState(initialTenantId);
  const [name, setName] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [signatureResetSignal, setSignatureResetSignal] = useState(0);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    const nextEmail = searchParams?.get('email')?.trim();
    if (nextEmail) {
      setEmail(nextEmail);
    }
    const nextTenantId = searchParams?.get('tenantId')?.trim();
    if (nextTenantId) {
      setTenantId(nextTenantId);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const checkStatus = async () => {
      if (!email) {
        setAlreadyAccepted(false);
        return;
      }

      try {
        const query = new URLSearchParams({ email });
        if (tenantId) {
          query.set('tenantId', tenantId);
        }
        const response = await fetch(`/api/auth/nda-status?${query.toString()}`, {
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (!cancelled) {
          setIsEnabled(payload?.enabled !== false);
          setAlreadyAccepted(Boolean(payload?.accepted));
          if (!tenantId && payload?.tenantId) {
            setTenantId(String(payload.tenantId));
          }
        }
      } catch {
        if (!cancelled) {
          setIsEnabled(true);
          setAlreadyAccepted(false);
        }
      }
    };

    void checkStatus();
    return () => {
      cancelled = true;
    };
  }, [email, tenantId]);

  const canSubmit = useMemo(() => {
    return Boolean(email.trim() && name.trim() && signatureDataUrl && agreeToTerms && !isSubmitting);
  }, [agreeToTerms, email, isSubmitting, name, signatureDataUrl]);

  const handleResetSignature = () => {
    setSignatureDataUrl('');
    setSignatureResetSignal((current) => current + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isEnabled) {
      router.push('/login');
      return;
    }
    if (!email.trim() || !name.trim() || !signatureDataUrl || !agreeToTerms) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please complete the NDA form and add your signature.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/accept-nda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          tenantId,
          name,
          signatureDataUrl,
          agreeToTerms,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Unable to record NDA acceptance.');
      }

      toast({
        title: 'NDA Accepted',
        description: 'Thanks. You can now continue to sign in.',
      });

      if (session?.user?.email) {
        router.push('/dashboard');
      } else {
        const tenantQuery = tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : '';
        router.push(`/login?email=${encodeURIComponent(email)}${tenantQuery}&nda=accepted`);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: error?.message || 'Unable to submit the NDA acceptance.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_32%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.92))]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.28em] text-cyan-100 backdrop-blur">
          <ShieldCheck className="h-4 w-4" />
          Beta NDA
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-white/15 bg-slate-900/75 text-white shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/20">
                  <LockKeyhole className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black tracking-tight text-white">{BETA_NDA_TITLE}</CardTitle>
                  <CardDescription className="text-slate-300">{BETA_NDA_SUMMARY}</CardDescription>
                </div>
              </div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                Version {BETA_NDA_VERSION}
              </p>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="max-h-[32rem] space-y-4 overflow-auto pr-2 text-sm leading-7 text-slate-200">
                  {agreementSections.map((section, index) => (
                    <p key={index} className={index === 0 ? 'font-black text-white' : ''}>
                      {section}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
                This agreement is recorded electronically. Your signature, email address, timestamp, and browser details are saved with the acceptance record.
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/15 bg-slate-900/75 text-white shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl font-black tracking-tight text-white">Sign to continue</CardTitle>
              <CardDescription className="text-slate-300">
                Accept the NDA and you will be routed back to sign in with your email prefilled.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {!isEnabled ? (
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  The beta NDA is currently turned off for this tenant. You can go straight back to sign in.
                </div>
              ) : alreadyAccepted ? (
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  This email has already accepted the current beta NDA.
                </div>
              ) : null}

              <form className="space-y-5" onSubmit={handleSubmit}>
                {!isEnabled ? null : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="nda-email" className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300">
                        Email Address
                      </Label>
                      <Input
                        id="nda-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className="h-12 border-white/10 bg-white/95 font-medium text-slate-950 placeholder:text-slate-400"
                        placeholder="name@company.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="nda-name" className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300">
                        Full Name
                      </Label>
                      <Input
                        id="nda-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-12 border-white/10 bg-white/95 font-medium text-slate-950 placeholder:text-slate-400"
                        placeholder="Your full name"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300">
                          Signature
                        </Label>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 hover:bg-white/5 hover:text-white"
                          onClick={handleResetSignature}
                          disabled={!signatureDataUrl}
                        >
                          Reset Signature
                        </Button>
                      </div>
                      <SignaturePad
                        height={180}
                        onSignatureEnd={setSignatureDataUrl}
                        resetSignal={signatureResetSignal}
                        className="rounded-2xl border border-white/10 bg-white/95 p-2"
                      />
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <Checkbox
                        id="nda-agree"
                        checked={agreeToTerms}
                        onCheckedChange={(checked) => setAgreeToTerms(Boolean(checked))}
                        className="mt-1 border-white/20 data-[state=checked]:bg-cyan-400 data-[state=checked]:text-slate-950"
                      />
                      <Label htmlFor="nda-agree" className="cursor-pointer text-sm leading-6 text-slate-200">
                        I have read the beta NDA, I agree to keep the information confidential, and I understand that my electronic signature is binding for this beta access request.
                      </Label>
                    </div>

                    <Button
                      type="submit"
                      className="h-12 w-full bg-cyan-500 font-black uppercase tracking-[0.18em] text-slate-950 hover:bg-cyan-400"
                      disabled={!canSubmit}
                    >
                      {isSubmitting ? 'Recording...' : (
                        <span className="inline-flex items-center gap-2">
                          Accept NDA
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      )}
                    </Button>
                  </>
                )}

                <Button asChild variant="ghost" className="h-10 w-full text-slate-300 hover:bg-white/5 hover:text-white">
                  <Link href="/login" className="inline-flex items-center justify-center gap-2">
                    Back to Sign In
                  </Link>
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
