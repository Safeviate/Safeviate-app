'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eye,
  FileCheck2,
  Gauge,
  KeyRound,
  LockKeyhole,
  Menu,
  Plane,
  Puzzle,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button as UiButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const coreCards = [
  {
    title: 'Multi-tenant architecture',
    icon: LockKeyhole,
    text: 'Strict tenant-scoped data isolation, secure authentication, and protected route access.',
  },
  {
    title: 'Role-based control',
    icon: Users,
    text: 'Granular permissions, role assignments, and tenant-aware access enforcement.',
  },
  {
    title: 'Configurable governance',
    icon: Gauge,
    text: 'Tenant-level thresholds, warnings, workflows, expiry rules, and sector-specific behavior.',
  },
  {
    title: 'Data-driven operations',
    icon: BarChart3,
    text: 'Centralized records, audit trails, dashboards, and operational intelligence across modules.',
  },
] as const;

const workspaces = [
  {
    title: 'Flight Schools',
    badge: 'ATO Workspace',
    icon: Plane,
    accent: 'green',
    image: '/images/safeviate-flight-schools-workspace.png',
    description:
      'Manage aircraft bookings, training workflows, instructor oversight, student progression, and fleet readiness in one connected workspace.',
    features: [
      'Aircraft scheduling and booking lifecycle',
      'Student progression and debrief workflows',
      'Instructor oversight and personnel-linked training',
      'Fleet availability linked to maintenance and thresholds',
      'Conflict detection and maintenance window awareness',
      'Pre-flight and post-flight workflow support',
    ],
    cta: 'Explore Flight Schools Workspace',
  },
  {
    title: 'Aircraft Maintenance',
    badge: 'AMO Workspace',
    icon: Wrench,
    accent: 'silver',
    image: '/images/safeviate-maintenance-workspace.png',
    description:
      'Control aircraft records, defects, service intervals, workpacks, maintenance windows, and asset readiness while staying connected to operations.',
    features: [
      'Aircraft hours, 50-hour and 100-hour thresholds',
      'Defect reporting and workpack management',
      'Maintenance windows and downtime coordination',
      'Approval-oriented maintenance workflows',
      'Booking restrictions when service thresholds are overdue',
      'Asset readiness and availability visibility',
    ],
    cta: 'Explore Workspace',
  },
  {
    title: 'Safety, Quality & OHS',
    badge: 'Safety & Quality Workspace',
    icon: ShieldCheck,
    accent: 'yellow',
    image: '/images/safeviate-ohs-workspace.png',
    description:
      'Run safety reports, risk registers, audits, corrective actions, compliance tracking, and occupational health workflows with audit-ready traceability.',
    features: [
      'Safety reporting and risk register support',
      'Quality audits and corrective action tracking',
      'Compliance and document-control workflows',
      'Occupational health and safety management',
      'Audit-ready traceability and approvals',
      'Cross-industry operational assurance',
    ],
    cta: 'Explore Workspace',
  },
] as const;

const intelligence = [
  {
    title: 'Live operational visibility',
    icon: Eye,
    text: 'See what is happening across training, maintenance, safety, quality, and compliance in real time.',
  },
  {
    title: 'Trend and performance insight',
    icon: BarChart3,
    text: 'Identify recurring issues, bottlenecks, progression trends, maintenance delays, and safety patterns.',
  },
  {
    title: 'Evidence-based management',
    icon: FileCheck2,
    text: 'Support decisions with structured data, audit trails, reports, and owned operational history.',
  },
  {
    title: 'Early risk detection',
    icon: Gauge,
    text: 'Spot weak signals before they become operational, safety, quality, or compliance problems.',
  },
] as const;

const assurance = [
  {
    title: 'Secure architecture',
    icon: ShieldCheck,
    text: 'Built with security-first principles, encryption, and industry best practices.',
  },
  {
    title: 'Audit-ready controls',
    icon: ClipboardCheck,
    text: 'Full traceability, approvals, and audit logs across all operational records.',
  },
  {
    title: 'Tenant-aware access',
    icon: Users,
    text: 'Strict access boundaries ensure each organisation operates in its own environment.',
  },
  {
    title: 'Scalable modular platform',
    icon: Puzzle,
    text: 'Add new sectors, modules, and workspace themes without rebuilding the core.',
  },
] as const;

const accentStyles = {
  green: {
    border: 'border-emerald-300/60',
    glow: 'shadow-emerald-500/20',
    text: 'text-emerald-300',
    bg: 'bg-emerald-400/15',
    ring: 'ring-emerald-300/30',
    button: 'border-emerald-300/50 text-emerald-200 hover:bg-emerald-300/10',
  },
  silver: {
    border: 'border-slate-200/60',
    glow: 'shadow-slate-100/10',
    text: 'text-slate-100',
    bg: 'bg-slate-100/15',
    ring: 'ring-slate-100/30',
    button: 'border-slate-200/45 text-slate-100 hover:bg-white/10',
  },
  yellow: {
    border: 'border-amber-300/70',
    glow: 'shadow-amber-400/20',
    text: 'text-amber-300',
    bg: 'bg-amber-400/15',
    ring: 'ring-amber-300/30',
    button: 'border-amber-300/55 text-amber-200 hover:bg-amber-300/10',
  },
};

const sectorVisuals = [
  {
    label: 'Flight Training',
    icon: Plane,
    tone: 'border-cyan-300/20 bg-cyan-400/10 text-cyan-300',
  },
  {
    label: 'Aircraft Maintenance',
    icon: Settings,
    tone: 'border-slate-200/20 bg-slate-200/10 text-slate-100',
  },
  {
    label: 'Safety, Quality & OHS',
    icon: ShieldCheck,
    tone: 'border-amber-300/20 bg-amber-300/10 text-amber-300',
  },
] as const;

function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto mb-4 max-w-4xl text-center">
      {eyebrow ? (
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">{eyebrow}</p>
      ) : null}
      <h2 className="text-lg font-black tracking-tight text-white md:text-xl">{title}</h2>
      {subtitle ? <p className="mt-2 text-xs leading-5 text-slate-300 md:text-sm">{subtitle}</p> : null}
    </div>
  );
}

function Button({
  children,
  variant = 'solid',
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  variant?: 'solid' | 'outline';
  className?: string;
  onClick?: () => void;
}) {
  const base =
    'inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-bold transition';
  const styles =
    variant === 'solid'
      ? 'bg-blue-500 text-white hover:bg-blue-400 shadow-lg shadow-blue-500/25'
      : 'border border-white/25 bg-transparent text-white hover:bg-white/10';

  return (
    <button type="button" onClick={onClick} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export default function LoginClient() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const tenantId = searchParams?.get('tenantId')?.trim() || '';

  useEffect(() => {
    const nextEmail = searchParams?.get('email')?.trim();
    if (nextEmail) {
      setEmail(nextEmail);
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams?.get('setup') || searchParams?.get('nda')) {
      setLoginOpen(true);
    }
  }, [searchParams]);

  const getLoginErrorMessage = (nextErrorMessage?: string | null) => {
    if (!nextErrorMessage) return 'Incorrect email or password.';
    if (nextErrorMessage === 'CredentialsSignin') {
      return 'Login failed. Check the password, or complete the beta NDA if this is a tester account.';
    }
    return nextErrorMessage;
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
      setLoginOpen(true);
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
        setLoginOpen(true);
        return;
      }

      setErrorMessage(null);
      toast({
        title: 'Login Successful',
        description: 'Welcome back to Safeviate.',
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
      setLoginOpen(true);
    } finally {
      setIsLoginLoading(false);
    }
  };

  const openLogin = () => {
    setErrorMessage(null);
    setLoginOpen(true);
  };

  const closeLogin = () => {
    if (!isLoginLoading) {
      setLoginOpen(false);
    }
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen((current) => !current);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#06101e] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(31,164,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(31,164,255,.08)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(0,174,255,.18),transparent_32%),radial-gradient(circle_at_70%_70%,rgba(2,126,255,.12),transparent_38%)]" />
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,.05)_45%,transparent_45%,transparent_55%,rgba(255,255,255,.04)_55%,transparent_100%)] bg-[size:90px_90px] opacity-30" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-[1180px] flex-col gap-4 px-5 py-6 md:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full items-start justify-between gap-3 lg:w-auto lg:items-center">
          <a href="#" className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 ring-1 ring-cyan-300/30">
              <ShieldCheck className="h-7 w-7 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-black uppercase tracking-[0.16em] sm:text-2xl">Safeviate</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-400 sm:text-[10px] sm:tracking-[0.34em]">
                One platform. Total control.
              </p>
            </div>
          </a>

          <button
            className="rounded-xl border border-white/15 p-2 lg:hidden"
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
            onClick={toggleMobileMenu}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-200 lg:flex">
          {['Platform', 'Workspaces', 'Solutions', 'Resources', 'Company'].map((item) => (
            <a key={item} href="#" className="flex items-center gap-1 hover:text-cyan-200">
              {item} <ChevronDown className="h-3.5 w-3.5" />
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button
            variant="outline"
            onClick={openLogin}
            className="rounded-xl border-white/25 bg-transparent px-6 text-white hover:bg-white/10"
          >
            Sign In
          </Button>
          <Button className="rounded-xl bg-blue-500 px-6 font-bold text-white hover:bg-blue-400">Book Demo</Button>
        </div>

        <div className="flex w-full gap-2 lg:hidden">
          <Button
            variant="outline"
            onClick={openLogin}
            className="flex-1 rounded-xl border-white/25 bg-transparent px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-white/10"
          >
            Sign In
          </Button>
          <Button className="rounded-xl bg-blue-500 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-blue-400">
            Demo
          </Button>
        </div>

        {mobileMenuOpen ? (
          <div className="w-full rounded-2xl border border-white/10 bg-[#081529]/95 p-3 shadow-xl shadow-black/20 lg:hidden">
            <nav className="flex flex-col gap-2">
              {['Platform', 'Workspaces', 'Solutions', 'Resources', 'Company'].map((item) => (
                <a
                  key={item}
                  href="#"
                  onClick={closeMobileMenu}
                  className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/5"
                >
                  {item}
                </a>
              ))}
            </nav>
          </div>
        ) : null}
      </header>

      <section className="relative z-10 mx-auto grid max-w-[1180px] items-center gap-6 px-5 pb-8 pt-6 md:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:pt-8">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65 }}
          className="relative hidden min-h-[320px] overflow-hidden rounded-[2rem] border border-blue-300/15 bg-blue-950/20 shadow-2xl shadow-blue-950/40 lg:block"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(46,201,255,0.18),transparent_26%),radial-gradient(circle_at_75%_78%,rgba(255,193,59,0.12),transparent_22%),linear-gradient(145deg,rgba(7,18,34,0.98),rgba(9,28,52,0.98))]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(44,120,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(44,120,255,.08)_1px,transparent_1px)] bg-[size:42px_42px]" />
          <div className="relative flex h-full flex-col justify-between p-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">Multi-industry ready</p>
              <h2 className="mt-2 max-w-sm text-xl font-black leading-tight text-white">
                One modular system, expressed through three clear operating environments.
              </h2>
            </div>

            <div className="grid gap-3">
              {sectorVisuals.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className={`rounded-2xl border p-3 ${item.tone}`}>
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-current/20 bg-black/10">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">Workspace</p>
                        <p className="mt-1 text-base font-black text-white">{item.label}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.08 }}
          className="text-center lg:text-left"
        >
          <span className="inline-flex rounded-full border border-cyan-300/25 bg-white/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">
            Modular platform
          </span>

          <h1 className="mt-3 max-w-[32rem] text-lg font-black uppercase leading-[1.04] tracking-tight text-white sm:text-[1.45rem] lg:text-[1.95rem]">
            One Safeviate platform for
            <span className="mt-1 block text-cyan-400">three sector-ready workspaces.</span>
            <span className="mt-1 block text-white">Built for data-driven decisions.</span>
          </h1>

          <p className="mx-auto mt-3 max-w-[30rem] text-sm leading-6 text-slate-200 lg:mx-0">
            Safeviate unifies training, maintenance, safety, quality, and compliance workflows inside one
            tenant-aware platform, helping teams turn live operational data into decision-ready intelligence.
          </p>

          <div className="mt-3 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Button className="h-13 rounded-xl bg-blue-500 px-7 font-bold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-400">
              Book Demo <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              className="h-13 rounded-xl border-cyan-300/45 bg-transparent px-7 font-bold text-white hover:bg-cyan-300/10"
            >
              Explore Workspaces <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto grid max-w-[1180px] gap-4 px-5 py-6 md:px-8 lg:grid-cols-3">
        {workspaces.map((workspace, index) => {
          const Icon = workspace.icon;
          const styles = accentStyles[workspace.accent];

          return (
            <motion.article
              key={workspace.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className={`group overflow-hidden rounded-[1.7rem] border ${styles.border} bg-[#071525]/85 shadow-2xl ${styles.glow} backdrop-blur-xl transition hover:-translate-y-1`}
            >
              <div className="relative h-56 overflow-hidden">
                <img
                  src={workspace.image}
                  alt=""
                  className="h-full w-full object-cover opacity-70 transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#071525] via-[#071525]/40 to-transparent" />
                <div className="absolute left-6 top-6">
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-full ${styles.bg} ring-1 ${styles.ring} shadow-xl`}
                  >
                    <Icon className={`h-8 w-8 ${styles.text}`} />
                  </div>
                </div>
              </div>

              <div className="p-6">
                <h3 className={`text-3xl font-black uppercase leading-none tracking-tight ${styles.text}`}>
                  {workspace.title}
                </h3>

                <span
                  className={`mt-3 inline-flex rounded-lg border ${styles.border} px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${styles.text}`}
                >
                  {workspace.badge}
                </span>

                <p className="mt-4 min-h-[84px] text-sm leading-6 text-slate-200">{workspace.description}</p>

                <div className="my-5 h-px bg-white/12" />

                <ul className="space-y-3">
                  {workspace.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm leading-5 text-slate-200">
                      <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${styles.text}`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <UiButton
                  type="button"
                  variant="outline"
                  className={`mt-6 h-12 w-full rounded-xl bg-transparent font-bold ${styles.button}`}
                >
                  {workspace.cta} <ArrowRight className="ml-2 h-4 w-4" />
                </UiButton>
              </div>
            </motion.article>
          );
        })}
      </section>

      <section className="relative z-10 mx-auto max-w-[1180px] px-5 py-4 md:px-8">
        <div className="mb-5 flex items-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
          <p className="text-center text-sm font-black uppercase tracking-[0.24em] text-white md:text-base">
            A shared operational core behind every workspace
          </p>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {coreCards.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="rounded-2xl border-blue-300/15 bg-blue-950/30 backdrop-blur-xl">
                <CardContent className="flex gap-4 p-5">
                  <Icon className="mt-1 h-9 w-9 shrink-0 text-blue-400" />
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.08em] text-white">{item.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{item.text}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-[1180px] px-5 py-4 md:px-8">
        <Card className="rounded-3xl border-blue-300/15 bg-blue-950/30 backdrop-blur-xl">
          <CardContent className="p-3 md:p-4">
            <SectionTitle
              eyebrow="From operational data to data-driven decisions"
              title="Turn daily activity into decision-ready intelligence."
              subtitle="Safeviate connects bookings, training, maintenance, safety, quality, and compliance data into one operational picture. Leaders can identify trends, act earlier, and make decisions based on live evidence."
            />

            <div className="rounded-3xl border border-blue-300/15 bg-[#071525]/70">
              <div className="grid gap-2.5 p-3 md:grid-cols-2 lg:grid-cols-4">
                {intelligence.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="p-3 lg:border-r lg:border-white/10 lg:last:border-r-0 lg:pr-4"
                    >
                      <Icon className="mb-2.5 h-7 w-7 text-blue-400" />
                      <h3 className="text-[11px] font-black uppercase leading-5 tracking-[0.12em] text-blue-300">
                        {item.title}
                      </h3>
                      <p className="mt-1.5 text-[11px] leading-5 text-slate-300">{item.text}</p>
                    </div>
                  );
                })}
              </div>

              <div className="mx-3 h-px bg-white/10" />

              <div className="grid gap-2.5 p-3 md:grid-cols-2 lg:grid-cols-4">
                {assurance.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="flex gap-3 p-3 lg:border-r lg:border-white/10 lg:last:border-r-0 lg:pr-3"
                    >
                      <Icon className="mt-0.5 h-8 w-8 shrink-0 text-cyan-400" />
                      <div>
                        <h3 className="text-[11px] font-black uppercase leading-5 tracking-[0.1em] text-white">
                          {item.title}
                        </h3>
                        <p className="mt-1.5 text-[11px] leading-5 text-slate-300">{item.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="relative z-10 mx-auto flex max-w-[1180px] flex-col gap-4 px-5 py-8 text-sm text-slate-300 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-cyan-400" />
          <span className="text-lg font-black uppercase tracking-[0.22em] text-white">Safeviate</span>
        </div>
        <p>One platform. Every operation. Smarter decisions.</p>
        <p>www.safeviate.com</p>
      </footer>

      {loginOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020812]/80 px-4 py-6 backdrop-blur-md">
          <div className="absolute inset-0" onClick={closeLogin} aria-hidden="true" />
          <Card className="relative z-10 w-full max-w-lg border-white/15 bg-slate-900/95 text-white shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <CardHeader className="space-y-5 pb-5">
              <div className="flex items-center justify-between gap-3">
                <Badge
                  variant="outline"
                  className="border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100"
                >
                  Authenticated
                </Badge>
                <button
                  type="button"
                  onClick={closeLogin}
                  disabled={isLoginLoading}
                  className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close login"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/20">
                <LockKeyhole className="h-8 w-8" />
              </div>

              <div className="space-y-2 text-center">
                <CardTitle className="text-2xl font-black tracking-tight text-white">Welcome back</CardTitle>
                <CardDescription className="space-y-1 text-sm text-slate-300">
                  <span className="block">Sign in to continue to the Safeviate operations portal.</span>
                  {searchParams?.get('setup') ? (
                    <span className="block text-cyan-200">Your password has been saved. Sign in to continue.</span>
                  ) : searchParams?.get('nda') ? (
                    <span className="block text-cyan-200">Your NDA has been recorded. Sign in to continue.</span>
                  ) : (
                    <span className="block text-slate-400">
                      If your tenant requires the beta NDA, you will be prompted after sign-in.
                    </span>
                  )}
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
                  <Label
                    htmlFor="password"
                    className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-300"
                  >
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
                <UiButton
                  type="submit"
                  className="h-12 w-full bg-gradient-to-r from-cyan-400 via-cyan-500 to-emerald-400 font-black uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-cyan-500/20 hover:from-cyan-300 hover:to-emerald-300"
                  disabled={isLoginLoading}
                >
                  {isLoginLoading ? (
                    'Authorizing...'
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      Sign In
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </UiButton>
                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <UiButton asChild variant="ghost" className="h-10 flex-1 text-slate-300 hover:bg-white/5 hover:text-white">
                    <Link href="/forgot-password" className="inline-flex items-center justify-center gap-2">
                      <KeyRound className="h-4 w-4" />
                      Forgot Password?
                    </Link>
                  </UiButton>
                  <UiButton asChild variant="ghost" className="h-10 flex-1 text-slate-300 hover:bg-white/5 hover:text-white">
                    <Link href="/beta-nda" className="inline-flex items-center justify-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Beta NDA
                    </Link>
                  </UiButton>
                </div>
              </CardFooter>
            </form>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
