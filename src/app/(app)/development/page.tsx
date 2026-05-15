'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { menuConfig } from '@/lib/menu-config';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { RotateCcw } from 'lucide-react';
import { formatBookingSequenceNumber } from '@/lib/booking-sequence';
import { parseJsonResponse } from '@/lib/safe-json';

type BookingSequenceSettings = {
  id: 'booking-sequence';
  nextBookingNumber: number;
  lastResetAt?: string;
};

type DevelopmentDiagnostics = {
  tenantId: string | null;
  tenantName: string | null;
  roleCount: number;
  roleNames: string[];
  meStatus: number | null;
  rolesStatus: number | null;
  rolesLoaded: boolean;
};

const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || 'local-dev';
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || 'local build';

const PERFORMANCE_ROADMAP = [
  {
    title: '1. Finish CLS / Theme Stability',
    detail:
      'Keep first paint stable by aligning default and tenant formatting, reserving header/card space, and removing late layout-affecting theme passes.',
  },
  {
    title: '2. Trim Heavy First Renders',
    detail:
      'Render the page shell first, defer below-the-fold sections, and avoid mounting large trees before the user asks for them.',
  },
  {
    title: '3. Expand Safe Live Caching',
    detail:
      'Cache tenant config, aircraft/personnel reference lists, and dashboard summary payloads with short-lived tenant-scoped invalidation.',
  },
  {
    title: '4. Add Query-Level Hotspot Detection',
    detail:
      'Use Simulation Lab and route telemetry to surface expensive reads, repeated queries, and slow request paths before optimizing blindly.',
  },
  {
    title: '5. Optimize the Hottest Routes',
    detail:
      'Refactor the measured bottlenecks first using smaller selects, batched reads, and precomputed rollups where the app is actually under pressure.',
  },
  {
    title: '6. Decide on Archiving at Scale',
    detail:
      'Once seeded runs prove record-volume pressure, archive older bookings, telemetry, and historical records without affecting live operations.',
  },
];

const PERFORMANCE_THRESHOLDS = [
  {
    metric: 'LCP',
    good: 'Under 2.5s',
    coldStart: 'Up to about 3.5s can be acceptable on a first open.',
    warmStart: 'Warm repeat loads should usually land under 2.5s.',
  },
  {
    metric: 'CLS',
    good: 'Under 0.10',
    coldStart: 'Cold or first-open layout movement should still stay close to stable.',
    warmStart: 'Repeat loads should stay comfortably under 0.10.',
  },
  {
    metric: 'INP',
    good: 'Under 200ms',
    coldStart: 'A little extra time on the first interaction is normal, but it should stay responsive.',
    warmStart: 'Warm interactions should feel snappy and stay below 200ms.',
  },
];

const APP_LINK_TREE = [
  'Safeviate App',
  '|- Dashboard',
  '|  |- /dashboard',
  '|  |- Reads: /api/dashboard-summary, /api/tenant-config',
  '|- My Dashboard',
  '|  |- /my-dashboard/tasks',
  '|  |- /my-dashboard/messages',
  '|  |- /my-dashboard/logbook',
  '|- Bookings',
  '|  |- /bookings/schedule',
  '|  |  |- Reads: /api/schedule-data, /api/bookings, /api/aircraft, /api/personnel',
  '|  |- /bookings/history',
  '|  |  |- Reads: /api/bookings, /api/schedule-data',
  '|- Operations',
  '|  |- /operations/active-flight',
  '|  |  |- Reads: /api/schedule-data, /api/tenant-config, /api/aircraft',
  '|  |- /operations/fleet-tracker',
  '|  |- /operations/weather',
  '|  |- /operations/meetings',
  '|  |  |- Reads/Writes: /api/meetings',
  '|  |- /operations/vehicle-usage',
  '|  |  |- Reads/Writes: /api/vehicle-usage',
  '|- Safety',
  '|  |- /safety/risk-register',
  '|  |- /safety/safety-reports',
  '|  |- /safety/safety-indicators',
  '|- Quality',
  '|  |- /quality/audits',
  '|  |- /quality/task-tracker',
  '|  |- /quality/coherence-matrix',
  '|- Training',
  '|  |- /training/student-progress',
  '|  |  |- Reads: /api/student-training',
  '|  |- /training/exams',
  '|  |- /training/question-bank',
  '|- Assets',
  '|  |- /assets/aircraft',
  '|  |  |- Reads: /api/aircraft, /api/bookings, /api/tenant-config',
  '|  |- /assets/vehicles',
  '|- Maintenance',
  '|  |- /maintenance/workpacks',
  '|  |- /maintenance/defects',
  '|  |- /maintenance/schedule',
  '|- Users',
  '|  |- /users/personnel',
  '|  |- /users/role/[id]',
  '|  |  |- Reads: /api/users, /api/roles, /api/me',
  '|- Admin',
  '|  |- /admin/page-format',
  '|  |  |- Reads/Writes: /api/tenant-config',
  '|  |- /admin/roles',
  '|  |  |- Reads/Writes: /api/roles',
  '|  |- /admin/department',
  '|- Development',
  '|  |- /development',
  '|  |- /development/simulation-lab',
  '|  |  |- Reads/Writes: /api/development/simulation-lab',
].join('\n');

const APP_FLOW_MAP = [
  {
    title: 'Identity & Access',
    detail: 'Session and user identity flow through /api/me. UserProfileProvider feeds permissions, tenant resolution, tab visibility, and route gating.',
  },
  {
    title: 'Tenant Branding & Format',
    detail: 'Server bootstrap in layout.tsx paints the saved company format first. Client hooks then refresh from /api/tenant-config for live admin updates.',
  },
  {
    title: 'Operational Scheduling',
    detail: 'Bookings, Daily Schedule, Active Flight, and related views read from /api/schedule-data and /api/bookings, with aircraft and personnel support data joining that path.',
  },
  {
    title: 'Dashboards & Rollups',
    detail: 'High-level cards and overviews flow through /api/dashboard-summary, which aggregates aircraft, booking, personnel, and training summary data.',
  },
  {
    title: 'Training & Competency',
    detail: 'Student Progress and debrief-linked views read /api/student-training, then derive strengths, growth areas, and recent competency signals.',
  },
  {
    title: 'Simulation & Telemetry',
    detail: 'Simulation Lab writes seeded tenant data into the DB, then tracks observed route usage from dashboard, schedule, meetings, safety, quality, and training flows.',
  },
];

const MODULE_FLOW_GROUPS = [
  {
    title: 'Shared Identity Layer',
    items: [
      'NextAuth session',
      'UserProfileProvider',
      '/api/me',
      'Permissions / route gating',
      'Tenant resolution',
    ],
  },
  {
    title: 'Branding & Configuration',
    items: [
      'Server bootstrap in layout.tsx',
      '/api/tenant-config',
      'ThemeProvider',
      'Page Format',
      'Feature / visibility switches',
    ],
  },
  {
    title: 'Core Operations',
    items: [
      'Dashboard',
      'Bookings',
      'Schedule Data',
      'Aircraft / Vehicles',
      'Active Flight / Meetings / Weather',
    ],
  },
  {
    title: 'Assurance & Training',
    items: [
      'Safety',
      'Quality',
      'Training',
      'Student Progress',
      'Audit / Risk / Reports',
    ],
  },
  {
    title: 'Developer Observability',
    items: [
      'Simulation Lab',
      'Route telemetry',
      'Usage Estimator',
      'Diagnostics',
      'Performance roadmap',
    ],
  },
];

const API_DEPENDENCY_GROUPS = [
  {
    title: 'Identity APIs',
    endpoints: ['/api/me', '/api/auth/session'],
    usage: 'Used by session-aware hooks, permissions, tenant resolution, and sidebar/profile state.',
  },
  {
    title: 'Branding & Config APIs',
    endpoints: ['/api/tenant-config'],
    usage: 'Feeds page format, feature flags, booking-sequence settings, and module visibility.',
  },
  {
    title: 'Operations APIs',
    endpoints: ['/api/dashboard-summary', '/api/schedule-data', '/api/bookings', '/api/aircraft', '/api/vehicle-usage', '/api/meetings'],
    usage: 'Powers dashboard cards, booking grids, active-flight views, aircraft snapshots, and vehicle/meeting workflows.',
  },
  {
    title: 'Assurance & Training APIs',
    endpoints: ['/api/student-training', '/api/safety-reports', '/api/quality-audits', '/api/corrective-action-plans', '/api/risk-register'],
    usage: 'Supports progress tracking, safety reporting, audits, CAPs, and risk workflows.',
  },
  {
    title: 'Developer & Telemetry APIs',
    endpoints: ['/api/development/simulation-lab'],
    usage: 'Seeds live simulation data, records telemetry, stores run metadata, and supports comparison/export flows.',
  },
];

const DB_FLOW_ROWS = [
  {
    area: 'Identity & Access',
    readPattern: 'High read / low write',
    notes: 'Frequent checks for the signed-in user, tenant, permissions, and menu visibility.',
  },
  {
    area: 'Bookings & Schedule',
    readPattern: 'High read / medium write',
    notes: 'Heavy list reads, date grouping, and history growth. Strong candidate for pagination and later archive rules.',
  },
  {
    area: 'Dashboard Rollups',
    readPattern: 'High read / derived summary',
    notes: 'Aggregates booking, aircraft, personnel, and training data into summary payloads.',
  },
  {
    area: 'Training, Safety, Quality',
    readPattern: 'Medium read / medium write',
    notes: 'More transactional than the dashboard, but still summary-sensitive when lists grow.',
  },
  {
    area: 'Simulation & Telemetry',
    readPattern: 'Burst write / analysis read',
    notes: 'Writes large seeded datasets and telemetry bursts, then reads them back for diagnostics and comparison.',
  },
];

export default function DevelopmentPage() {
  const { toast } = useToast();
  const { canAccessMenuItem } = usePermissions();
  const developmentMenu = menuConfig.find(item => item.href === '/development');
  const [bookingSequenceSettings, setBookingSequenceSettings] = useState<BookingSequenceSettings | null>(null);
  const [isLoadingSequence, setIsLoadingSequence] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DevelopmentDiagnostics | null>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(true);

  const loadBookingSequence = useCallback(async () => {
    setIsLoadingSequence(true);
    try {
      const response = await fetch('/api/tenant-config', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      const config = payload?.config && typeof payload.config === 'object' ? payload.config : {};
      const sequenceConfig = config['booking-sequence-settings'];

      if (sequenceConfig && typeof sequenceConfig === 'object') {
        setBookingSequenceSettings({
          id: 'booking-sequence',
          nextBookingNumber: Number((sequenceConfig as Record<string, unknown>).nextBookingNumber) || 1,
          lastResetAt: typeof (sequenceConfig as Record<string, unknown>).lastResetAt === 'string'
            ? (sequenceConfig as Record<string, unknown>).lastResetAt as string
            : undefined,
        });
      } else {
        setBookingSequenceSettings({
          id: 'booking-sequence',
          nextBookingNumber: 1,
        });
      }
    } catch (error) {
      console.error('Failed to load booking sequence', error);
      setBookingSequenceSettings({
        id: 'booking-sequence',
        nextBookingNumber: 1,
      });
    } finally {
      setIsLoadingSequence(false);
    }
  }, []);

  const loadDiagnostics = useCallback(async () => {
    setIsLoadingDiagnostics(true);
    try {
      const [meResponse, rolesResponse] = await Promise.all([
        fetch('/api/me', { cache: 'no-store' }),
        fetch('/api/roles', { cache: 'no-store' }),
      ]);
      const [mePayload, rolesPayload] = await Promise.all([
        parseJsonResponse<{
          tenant?: {
            id?: string | null;
            name?: string | null;
          } | null;
        }>(meResponse),
        parseJsonResponse<{ roles?: { name?: string | null }[] }>(rolesResponse),
      ]);
      const roleNames = Array.isArray(rolesPayload?.roles)
        ? rolesPayload!.roles
            .map((role) => (typeof role?.name === 'string' ? role.name.trim() : ''))
            .filter(Boolean)
        : [];

      setDiagnostics({
        tenantId: mePayload?.tenant?.id || null,
        tenantName: mePayload?.tenant?.name || null,
        roleCount: roleNames.length,
        roleNames,
        meStatus: meResponse.status,
        rolesStatus: rolesResponse.status,
        rolesLoaded: rolesResponse.ok,
      });
    } catch (error) {
      console.error('Failed to load development diagnostics', error);
      setDiagnostics({
        tenantId: null,
        tenantName: null,
        roleCount: 0,
        roleNames: [],
        meStatus: null,
        rolesStatus: null,
        rolesLoaded: false,
      });
    } finally {
      setIsLoadingDiagnostics(false);
    }
  }, []);

  useEffect(() => {
    void loadBookingSequence();
    void loadDiagnostics();
    const handler = () => void loadBookingSequence();
    window.addEventListener('safeviate-booking-sequence-updated', handler);
    window.addEventListener('safeviate-roles-updated', loadDiagnostics);
    window.addEventListener('safeviate-tenant-config-updated', loadDiagnostics);
    return () => {
      window.removeEventListener('safeviate-booking-sequence-updated', handler);
      window.removeEventListener('safeviate-roles-updated', loadDiagnostics);
      window.removeEventListener('safeviate-tenant-config-updated', loadDiagnostics);
    };
  }, [loadBookingSequence, loadDiagnostics]);

  const handleResetBookingSequence = async () => {
    const confirmed = window.confirm('Reset booking numbering back to 00001? Only do this after old bookings have been cleared or archived.');
    if (!confirmed) return;

    const nextSettings: BookingSequenceSettings = {
      id: 'booking-sequence',
      nextBookingNumber: 1,
      lastResetAt: new Date().toISOString(),
    };

    try {
      const response = await fetch('/api/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            'booking-sequence-settings': nextSettings,
          },
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to reset booking sequence.');
      }

      setBookingSequenceSettings(nextSettings);
      window.dispatchEvent(new Event('safeviate-booking-sequence-updated'));
      toast({ title: 'Booking Sequence Reset', description: 'The next booking number will start from 00001.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Reset Failed', description: error instanceof Error ? error.message : 'Reset failed.' });
    }
  };

  if (!developmentMenu || !developmentMenu.subItems) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Development section not configured.</p>
      </div>
    );
  }

  const devSubItems = developmentMenu.subItems.filter((item) => canAccessMenuItem(item, developmentMenu));
  const diagnosticsSummary = useMemo(() => {
    if (!diagnostics) return 'Diagnostics unavailable.';
    if (!diagnostics.rolesLoaded) return 'Unable to confirm live role menu data.';
    if (diagnostics.roleCount === 0) return 'No dynamic roles were returned for the current tenant.';
    return `${diagnostics.roleCount} dynamic roles were returned for the current tenant.`;
  }, [diagnostics]);

  return (
      <div className="grid gap-6">
      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-primary">
            Build Identity
          </h3>
          <p className="text-xs text-muted-foreground font-medium">
            Confirms which commit and build artifact the app is currently serving.
          </p>
        </div>

        <Card className="border shadow-none">
          <CardContent className="p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-background px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Commit</p>
                <p className="mt-1 font-mono text-sm font-semibold text-foreground">{BUILD_SHA}</p>
              </div>
              <div className="rounded-2xl border bg-background px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Built At</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{BUILD_TIME}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-primary">
            Live Diagnostics
          </h3>
          <p className="text-xs text-muted-foreground font-medium">
            Quick verification for tenant resolution and dynamic user-role submenu data.
          </p>
        </div>

        <Card className="border shadow-none">
          <CardContent className="p-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border bg-background px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Tenant</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {isLoadingDiagnostics ? 'Loading...' : diagnostics?.tenantName || diagnostics?.tenantId || 'Unavailable'}
                </p>
                {diagnostics?.tenantId ? (
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {diagnostics.tenantId}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border bg-background px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">API /me</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {isLoadingDiagnostics ? 'Loading...' : diagnostics?.meStatus ?? 'Unavailable'}
                </p>
              </div>

              <div className="rounded-2xl border bg-background px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">API /roles</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {isLoadingDiagnostics ? 'Loading...' : diagnostics?.rolesStatus ?? 'Unavailable'}
                </p>
              </div>

              <div className="rounded-2xl border bg-background px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Dynamic Roles</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {isLoadingDiagnostics ? 'Loading...' : diagnostics?.roleCount ?? 0}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border bg-muted/10 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Interpretation</p>
              <p className="mt-1 text-sm font-medium leading-6 text-muted-foreground">{diagnosticsSummary}</p>
              {!isLoadingDiagnostics && diagnostics?.roleNames?.length ? (
                <p className="mt-2 text-[11px] font-semibold text-foreground">
                  {diagnostics.roleNames.join(' · ')}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset Booking Sequence
          </h3>
          <p className="text-xs text-muted-foreground font-medium">
            Reset the booking counter after old bookings have been cleared or archived.
          </p>
        </div>

        <Card className="border shadow-none">
          <CardContent className="p-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Next Booking Number</Label>
              <p className="text-2xl font-black tracking-tight text-foreground">
                {isLoadingSequence ? '-----' : formatBookingSequenceNumber(bookingSequenceSettings?.nextBookingNumber || 1)}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                The next created booking will use this number.
              </p>
              {bookingSequenceSettings?.lastResetAt ? (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Last reset: {new Date(bookingSequenceSettings.lastResetAt).toLocaleString()}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
                onClick={handleResetBookingSequence}
                disabled={isLoadingSequence}
              >
                <RotateCcw className="h-4 w-4" />
                Reset Sequence
              </Button>
              <p className="text-[10px] font-medium text-muted-foreground">
                This will restart the sequence for new bookings.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-primary">
            App Link Tree
          </h3>
          <p className="text-xs text-muted-foreground font-medium">
            Quick map of the main app surfaces, their routes, and the core APIs or shared data paths behind them.
          </p>
        </div>

        <Card className="border shadow-none">
          <CardContent className="p-5 space-y-5">
            <div className="rounded-2xl border bg-slate-950 px-4 py-4 text-slate-100">
              <pre className="overflow-x-auto whitespace-pre text-[11px] leading-6 font-mono">
                {APP_LINK_TREE}
              </pre>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {APP_FLOW_MAP.map((item) => (
                <div key={item.title} className="rounded-2xl border bg-background px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-primary">
                  Module Flow Diagram
                </h4>
                <p className="text-xs text-muted-foreground font-medium">
                  Read this left to right: shared identity and branding feed the operational modules, which then feed assurance and simulation telemetry.
                </p>
              </div>

              <div className="grid gap-3 xl:grid-cols-5">
                {MODULE_FLOW_GROUPS.map((group, index) => (
                  <div key={group.title} className="rounded-2xl border bg-background px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground">
                        {group.title}
                      </p>
                      {index < MODULE_FLOW_GROUPS.length - 1 ? (
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                          -&gt;
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 space-y-2">
                      {group.items.map((item) => (
                        <div
                          key={item}
                          className="rounded-xl border bg-muted/10 px-3 py-2 text-[11px] font-semibold text-muted-foreground"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-primary">
                  API Dependency Map
                </h4>
                <p className="text-xs text-muted-foreground font-medium">
                  These are the main API groups the app leans on during normal use, and what they feed back into the UI.
                </p>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {API_DEPENDENCY_GROUPS.map((group) => (
                  <div key={group.title} className="rounded-2xl border bg-background px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground">
                      {group.title}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {group.endpoints.map((endpoint) => (
                        <span
                          key={endpoint}
                          className="rounded-full border bg-slate-950 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-slate-100"
                        >
                          {endpoint}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-sm font-medium leading-6 text-muted-foreground">
                      {group.usage}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-primary">
                  DB Read / Write Pattern
                </h4>
                <p className="text-xs text-muted-foreground font-medium">
                  Practical view of which modules mostly read, which ones write, and where record growth will matter first.
                </p>
              </div>

              <div className="grid gap-3">
                {DB_FLOW_ROWS.map((row) => (
                  <div key={row.area} className="rounded-2xl border bg-background px-4 py-3">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-foreground">
                          {row.area}
                        </p>
                        <p className="text-sm font-medium leading-6 text-muted-foreground">
                          {row.notes}
                        </p>
                      </div>
                      <span className="rounded-full border bg-primary/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
                        {row.readPattern}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-primary">
            Performance Roadmap
          </h3>
          <p className="text-xs text-muted-foreground font-medium">
            Internal review path for performance work after simulation, telemetry, and live rendering checks.
          </p>
        </div>

        <Card className="border shadow-none">
          <CardContent className="p-5">
            <div className="grid gap-3">
              {PERFORMANCE_ROADMAP.map((step) => (
                <div key={step.title} className="rounded-2xl border bg-background px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-muted-foreground">{step.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-primary">
            Performance Thresholds
          </h3>
          <p className="text-xs text-muted-foreground font-medium">
            Quick reference for what we expect on cold starts versus warm repeat loads.
          </p>
        </div>

        <Card className="border shadow-none">
          <CardContent className="p-5">
            <div className="grid gap-3 lg:grid-cols-3">
              {PERFORMANCE_THRESHOLDS.map((item) => (
                <div key={item.metric} className="rounded-2xl border bg-background px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground">
                      {item.metric}
                    </p>
                    <span className="rounded-full border bg-primary/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
                      {item.good}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="rounded-xl border bg-muted/10 px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">Cold Start</p>
                      <p className="mt-1 text-sm font-medium leading-6 text-muted-foreground">{item.coldStart}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/10 px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">Warm Start</p>
                      <p className="mt-1 text-sm font-medium leading-6 text-muted-foreground">{item.warmStart}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {devSubItems.map((item) => (
          <Link href={item.href} key={item.href}>
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
