'use client';

import { use, useState, useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CalendarDays, Clock3, Target, Star, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import type { PilotProfile } from '@/app/(app)/users/personnel/page';
import { TrainingRecords } from '@/app/(app)/users/personnel/[id]/training-records';
import { useUserProfile } from '@/hooks/use-user-profile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Booking } from '@/types/booking';
import type { MilestoneWarning, StudentMilestoneSettings, StudentProgressReport } from '@/types/training';
import {
  buildExerciseCurrencySummary,
  buildExerciseProgressSummary,
  buildExerciseReadinessFlags,
  getExerciseStatusMeta,
} from '@/lib/training-exercise-analytics';
import { TRAINING_EXERCISE_TEMPLATES } from '@/lib/training-exercise-templates';

interface StudentDetailPageProps {
  params: Promise<{ reportId: string }>;
}

type SummaryPayload = {
  students?: PilotProfile[];
  bookings?: Array<Pick<Booking, 'studentId' | 'status'> & {
    date?: string;
    preFlightData?: { hobbs?: number };
    postFlightData?: { hobbs?: number };
  }>;
  studentProgressReports?: StudentProgressReport[];
  studentMilestones?: StudentMilestoneSettings | null;
};

const DEFAULT_STUDENT_MILESTONES: MilestoneWarning[] = [
  { milestone: 10, warningHours: 7 },
  { milestone: 20, warningHours: 17 },
  { milestone: 30, warningHours: 27 },
  { milestone: 40, warningHours: 37 },
];

const formatHours = (hours: number) => `${hours.toFixed(1)}h`;

const formatDateLabel = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);

const getDaysSince = (date: Date | null, reference = new Date()) => {
  if (!date) return null;
  const diff = reference.getTime() - date.getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const formatDaysSince = (days: number | null) => {
  if (days === null) return 'N/A';
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
};

const getPeriodDays = (period: 'week' | 'month' | 'all') => {
  if (period === 'week') return 7;
  if (period === 'month') return 30;
  return 90;
};

const getPeriodStart = (period: 'week' | 'month' | 'all', reference = new Date()) => {
  if (period === 'week') {
    const start = new Date(reference);
    start.setDate(reference.getDate() - 7);
    return start;
  }
  if (period === 'month') {
    const start = new Date(reference);
    start.setMonth(reference.getMonth() - 1);
    return start;
  }
  return null;
};

const getStudentRecommendation = (row: {
  status: 'safe' | 'watch' | 'over';
  daysSinceFlight: number | null;
  daysSinceDebrief: number | null;
  forecastDaysToNextMilestone: number | null;
}) => {
  if (row.daysSinceFlight === null) return 'Schedule first lesson';
  if (row.daysSinceFlight >= 30) return 'Re-engage student';
  if (row.daysSinceFlight >= 14) return 'Book refresher flight';
  if (row.daysSinceDebrief === null || row.daysSinceDebrief > row.daysSinceFlight) return 'Complete debrief';
  if (row.status !== 'safe') return 'Review milestone';
  if (row.forecastDaysToNextMilestone !== null && row.forecastDaysToNextMilestone <= 30) return 'Plan milestone check';
  return 'Keep current pace';
};

function MetricPill({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/5 px-3 py-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-sm font-black">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{hint}</p>
    </div>
  );
}

function ProgressSummary({
  student,
  progress,
}: {
  student: PilotProfile;
  progress: {
    totalFlightHours: number;
    recentFlightHours: number;
    daysSinceFlight: number | null;
    daysSinceDebrief: number | null;
    pacePerWeek: number;
    forecastDaysToNextMilestone: number | null;
    recommendedAction: string;
    milestoneHours: number | null;
    status: 'safe' | 'watch' | 'over';
    lastFlightDate: string | null;
    lastDebriefDate: string | null;
  };
}) {
  const lastFlight = progress.lastFlightDate ? new Date(progress.lastFlightDate) : null;
  const lastDebrief = progress.lastDebriefDate ? new Date(progress.lastDebriefDate) : null;
  const statusClass = progress.status === 'over'
    ? 'border-red-200 bg-red-50 text-red-700'
    : progress.status === 'watch'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <Card className="overflow-hidden border shadow-none">
      <CardHeader className="border-b bg-muted/5 px-4 py-3">
        <CardTitle className="text-sm font-black uppercase tracking-tight">
          {student.firstName} {student.lastName}
        </CardTitle>
        <CardDescription className="text-xs">Progression snapshot before the full training history.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricPill icon={<Clock3 className="h-3.5 w-3.5" />} label="Last Flight" value={lastFlight ? formatDateLabel(lastFlight) : 'None'} hint={formatDaysSince(progress.daysSinceFlight)} />
          <MetricPill icon={<CalendarDays className="h-3.5 w-3.5" />} label="Last Debrief" value={lastDebrief ? formatDateLabel(lastDebrief) : 'None'} hint={formatDaysSince(progress.daysSinceDebrief)} />
          <MetricPill icon={<Target className="h-3.5 w-3.5" />} label="Pace" value={`${progress.pacePerWeek.toFixed(1)}h/wk`} hint="Based on selected period" />
          <MetricPill icon={<Clock3 className="h-3.5 w-3.5" />} label="Recent Hours" value={formatHours(progress.recentFlightHours)} hint={`Total ${formatHours(progress.totalFlightHours)}`} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-background px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Forecast</p>
            <p className="mt-1 text-sm font-black">
              {progress.forecastDaysToNextMilestone !== null ? `${progress.forecastDaysToNextMilestone} days` : 'N/A'}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {progress.milestoneHours !== null ? `Next ${progress.milestoneHours}h milestone` : 'No milestone'}
            </p>
          </div>
          <div className="rounded-xl border bg-background px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Action</p>
            <p className="mt-1 text-sm font-black">{progress.recommendedAction}</p>
          </div>
          <div className={cn('rounded-xl border px-3 py-3', statusClass)}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em]">
              {progress.status === 'over' ? 'At risk' : progress.status === 'watch' ? 'Watch' : 'Safe'}
            </p>
            <p className="mt-1 text-sm font-black">
              {progress.milestoneHours !== null ? `Next ${progress.milestoneHours}h` : 'No milestone'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExerciseSignalsSummary({ reports }: { reports: StudentProgressReport[] }) {
  const summaries = useMemo(() => buildExerciseProgressSummary(reports, TRAINING_EXERCISE_TEMPLATES), [reports]);
  const readiness = useMemo(() => buildExerciseReadinessFlags(summaries), [summaries]);
  const currency = useMemo(
    () => buildExerciseCurrencySummary(summaries, [
      'exer-13-circuit-approach-and-landing',
      'exer-12-13e-emergencies',
      'exer-18a-navigation',
      'exer-19-basic-instrument-flight',
    ]),
    [summaries],
  );
  const focusExercises = summaries
    .filter((summary) => summary.status === 'needs_review' || summary.status === 'practising')
    .slice(0, 3);
  const strongestExercise = summaries
    .filter((summary) => summary.attemptCount > 0)
    .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))[0];

  return (
    <Card className="overflow-hidden border shadow-none">
      <CardHeader className="border-b bg-muted/5 px-4 py-3">
        <CardTitle className="text-sm font-black uppercase tracking-tight">Exercise Readiness</CardTitle>
        <CardDescription className="text-xs">Use the exercise syllabus data to decide what the next flight should actually do.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            {readiness.map((flag) => (
              <div
                key={flag.key}
                className={cn(
                  'rounded-xl border p-4 space-y-2',
                  flag.signal === 'ready'
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : flag.signal === 'blocked'
                      ? 'border-rose-200 bg-rose-50/60'
                      : 'border-amber-200 bg-amber-50/60',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black">{flag.label}</p>
                  <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.16em]">
                    {flag.signal}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{flag.detail}</p>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-emerald-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Strongest exercise</p>
              </div>
              <p className="mt-2 text-sm font-black">{strongestExercise?.label || 'No exercise trend yet'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {strongestExercise?.strengths[0]?.label
                  ? `Most consistent in ${strongestExercise.strengths[0].label}.`
                  : 'More debrief detail will identify the student’s most stable exercise.'}
              </p>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-rose-600" />
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Priority exercises</p>
              </div>
              {focusExercises.length > 0 ? focusExercises.map((summary) => {
                const status = getExerciseStatusMeta(summary.status);
                return (
                  <div key={summary.templateKey} className="rounded-lg border bg-background px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black">{summary.label}</p>
                      <Badge variant="outline" className={cn('text-[10px] font-black uppercase tracking-[0.14em]', status.badge)}>
                        {status.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {summary.focusCriteria[0]?.label
                        ? `Next focus: ${summary.focusCriteria[0].label}.`
                        : summary.latestComment || 'Needs another structured attempt before progressing.'}
                    </p>
                  </div>
                );
              }) : (
                <p className="text-sm text-muted-foreground">No urgent exercise concern is standing out right now.</p>
              )}
            </div>

            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Exercise currency</p>
              <div className="grid gap-2">
                {currency.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                    <span className="text-xs font-semibold">{item.label}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      {item.daysSince === null ? 'N/A' : `${item.daysSince}d`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StudentDetailPage({ params }: StudentDetailPageProps) {
  const resolvedParams = use(params);
  const { tenantId } = useUserProfile();
  const studentId = resolvedParams.reportId;

  const [student, setStudent] = useState<PilotProfile | null>(null);
  const [summary, setSummary] = useState<SummaryPayload>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/dashboard-summary', { cache: 'no-store' });
        const payload = (await response.json().catch(() => ({}))) as SummaryPayload;
        const students = Array.isArray(payload?.students) ? payload.students : [];
        const found = students.find((s: { id?: string }) => s.id === studentId);
        if (!cancelled) {
          setStudent(found || null);
          setSummary(payload || {});
        }
      } catch (e) {
        console.error('Failed to load student', e);
        if (!cancelled) {
          setStudent(null);
          setSummary({});
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (isLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full flex flex-col h-full min-h-0 overflow-hidden gap-6 pt-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }
  

  
  if (!student) {
      return <div className="max-w-[1100px] mx-auto w-full text-center py-10">Student not found.</div>
  }

  const studentMilestones = (() => {
    const settings = summary.studentMilestones;
    const milestones = settings && Array.isArray(settings.milestones) ? settings.milestones : DEFAULT_STUDENT_MILESTONES;
    return milestones
      .map((entry) => ({
        milestone: typeof entry.milestone === 'number' ? entry.milestone : Number(entry.milestone),
        warningHours: typeof entry.warningHours === 'number' ? entry.warningHours : Number(entry.warningHours),
      }))
      .filter((entry) => Number.isFinite(entry.milestone) && Number.isFinite(entry.warningHours) && entry.milestone > 0 && entry.warningHours >= 0 && entry.warningHours < entry.milestone)
      .sort((a, b) => a.milestone - b.milestone);
  })();

  const progress = (() => {
    const bookings = Array.isArray(summary.bookings) ? summary.bookings : [];
    const reports = Array.isArray(summary.studentProgressReports) ? summary.studentProgressReports : [];
    const now = new Date();
    const periodStart = getPeriodStart('month');
    const periodDays = getPeriodDays('month');
    const studentBookings = bookings.filter((booking) => booking.studentId === student.id);
    const periodStudentBookings = periodStart
      ? bookings.filter((booking) => {
          if (!booking.date || booking.studentId !== student.id) return false;
          const bookingDate = new Date(booking.date);
          return !Number.isNaN(bookingDate.getTime()) && bookingDate >= periodStart && bookingDate <= now;
        })
      : [];
    const studentReports = reports.filter((report) => report.studentId === student.id);
    const totalFlightHours = studentBookings.reduce((sum, booking) => {
      const pre = booking.preFlightData?.hobbs;
      const post = booking.postFlightData?.hobbs;
      if (pre === undefined || post === undefined) return sum;
      return sum + Math.max(0, post - pre);
    }, 0);
    const recentFlightHours = periodStudentBookings.reduce((sum, booking) => {
      const pre = booking.preFlightData?.hobbs;
      const post = booking.postFlightData?.hobbs;
      if (pre === undefined || post === undefined) return sum;
      return sum + Math.max(0, post - pre);
    }, 0);
    const lastFlightDate = studentBookings
      .map((booking) => booking.date ? new Date(booking.date) : null)
      .filter((date): date is Date => date !== null && !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;
    const lastDebriefDate = studentReports
      .map((report) => new Date(report.date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;
    const daysSinceFlight = getDaysSince(lastFlightDate, now);
    const daysSinceDebrief = getDaysSince(lastDebriefDate, now);
    const nextMilestone = studentMilestones.find((milestone) => totalFlightHours < milestone.milestone) || null;
    const pacePerWeek = periodDays > 0 ? parseFloat(((recentFlightHours / periodDays) * 7).toFixed(1)) : 0;
    const forecastDaysToNextMilestone = nextMilestone && recentFlightHours > 0
      ? Math.max(0, Math.ceil(((nextMilestone.milestone - totalFlightHours) / recentFlightHours) * periodDays))
      : null;
    const status: 'safe' | 'watch' | 'over' = !nextMilestone
      ? 'over'
      : totalFlightHours >= nextMilestone.warningHours
        ? 'watch'
        : 'safe';
    const recommendedAction = getStudentRecommendation({
      status,
      daysSinceFlight,
      daysSinceDebrief,
      forecastDaysToNextMilestone,
    });

    return {
      totalFlightHours: parseFloat(totalFlightHours.toFixed(1)),
      recentFlightHours: parseFloat(recentFlightHours.toFixed(1)),
      lastFlightDate: lastFlightDate ? lastFlightDate.toISOString() : null,
      lastDebriefDate: lastDebriefDate ? lastDebriefDate.toISOString() : null,
      daysSinceFlight,
      daysSinceDebrief,
      pacePerWeek,
      forecastDaysToNextMilestone,
      recommendedAction,
      milestoneHours: nextMilestone ? nextMilestone.milestone : null,
      status,
    };
  })();
  const studentReports = Array.isArray(summary.studentProgressReports)
    ? summary.studentProgressReports.filter((report) => report.studentId === student.id)
    : [];

  return (
    <Card className="mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col overflow-hidden shadow-none border">
      <CardHeader className="shrink-0 border-b bg-muted/5 px-4 py-3">
        <CardTitle className="text-[13px] font-black uppercase tracking-tight md:text-lg">
          Student Progress
        </CardTitle>
        <CardDescription className="text-[10px] font-medium capitalize tracking-normal text-muted-foreground md:text-sm">
          Track progression, recency, and training pace for the selected student.
        </CardDescription>
      </CardHeader>

      <ScrollArea className="min-h-0 flex-1">
        <CardContent className="space-y-4 p-4">
          <ProgressSummary student={student} progress={progress} />
          <ExerciseSignalsSummary reports={studentReports} />

          <div className="flex-1 min-h-0 overflow-hidden px-1">
            <TrainingRecords studentId={studentId} tenantId={tenantId || ''} />
          </div>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
