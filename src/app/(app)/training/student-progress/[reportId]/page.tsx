'use client';

import { use, useState, useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CalendarDays, Clock3 } from 'lucide-react';
import Link from 'next/link';
import type { PilotProfile, StudentProgressionRecommendation } from '@/app/(app)/users/personnel/personnel-directory-page';
import { TrainingRecords } from '@/app/(app)/users/personnel/[id]/training-records';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Booking } from '@/types/booking';
import type { MilestoneWarning, StudentMilestoneSettings, StudentProgressReport } from '@/types/training';
import { buildTrainingCompetencyAreas, type TrainingCompetencyArea } from '@/lib/training-competencies';
import { TRAINING_EXERCISE_TEMPLATES } from '@/lib/training-exercise-templates';

interface StudentDetailPageProps {
  params: Promise<{ reportId: string }>;
}

type SummaryPayload = {
  students?: PilotProfile[];
  instructors?: PilotProfile[];
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

const PROGRESSION_STATUS_OPTIONS: Array<{
  value: NonNullable<StudentProgressionRecommendation['status']>;
  label: string;
  badge: string;
}> = [
  { value: 'hold', label: 'Hold', badge: 'border-rose-200 bg-rose-50 text-rose-700' },
  { value: 'continue', label: 'Continue Current Phase', badge: 'border-amber-200 bg-amber-50 text-amber-700' },
  { value: 'ready_to_progress', label: 'Ready to Progress', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { value: 'ready_for_first_solo', label: 'Ready for First Solo', badge: 'border-sky-200 bg-sky-50 text-sky-700' },
  { value: 'needs_review', label: 'Needs Review', badge: 'border-slate-200 bg-slate-50 text-slate-700' },
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

const getProgressionStatusMeta = (status?: StudentProgressionRecommendation['status']) =>
  PROGRESSION_STATUS_OPTIONS.find((option) => option.value === status) || PROGRESSION_STATUS_OPTIONS[1];

type CompetencyHighlight = Pick<TrainingCompetencyArea, 'key' | 'label' | 'score' | 'signal' | 'nextAction'>;

const getCompetencyTone = (signal: TrainingCompetencyArea['signal']) => {
  if (signal === 'strength') {
    return {
      border: 'border-emerald-200',
      bg: 'bg-emerald-50',
      pill: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
      bar: 'bg-emerald-500',
      label: 'Strength',
    };
  }

  if (signal === 'growth') {
    return {
      border: 'border-rose-200',
      bg: 'bg-rose-50',
      pill: 'bg-rose-500/10 text-rose-700 border-rose-200',
      bar: 'bg-rose-500',
      label: 'Growth area',
    };
  }

  return {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    pill: 'bg-amber-500/10 text-amber-700 border-amber-200',
    bar: 'bg-amber-500',
    label: 'Watch',
  };
};

const getCompetencySnapshot = (reports: StudentProgressReport[]) => {
  const areas = buildTrainingCompetencyAreas(reports);
  const strengths = areas.filter((area) => area.signal === 'strength').slice(0, 2) as CompetencyHighlight[];
  const weakPoints = [
    ...areas.filter((area) => area.signal === 'growth'),
    ...areas.filter((area) => area.signal === 'watch'),
  ].slice(0, 2) as CompetencyHighlight[];
  const signal: TrainingCompetencyArea['signal'] = weakPoints.some((area) => area.signal === 'growth')
    ? 'growth'
    : weakPoints.length > 0
      ? 'watch'
      : 'strength';
  const headline = weakPoints[0]?.label || strengths[0]?.label || 'No competency data yet';
  const score = areas.length > 0 ? areas.reduce((sum, area) => sum + area.score, 0) / areas.length : 0;
  const nextFocus = weakPoints[0]
    ? `Next focus: ${weakPoints[0].label}`
    : strengths[0]
      ? `Keep reinforcing ${strengths[0].label}`
      : 'Next focus: add debrief notes';

  return {
    signal,
    headline,
    score: parseFloat(score.toFixed(1)),
    nextFocus,
    strengths,
    weakPoints,
  };
};

function CompetencyStrip({ reports }: { reports: StudentProgressReport[] }) {
  const snapshot = useMemo(() => getCompetencySnapshot(reports), [reports]);
  const tone = getCompetencyTone(snapshot.signal);
  const strengthItems = snapshot.strengths.length > 0
    ? snapshot.strengths
    : [{ key: 'strength-empty', label: 'No clear strength yet', score: 0, signal: 'strength' as const, nextAction: 'Keep adding debrief evidence.' }];
  const weakPointItems = snapshot.weakPoints.length > 0
    ? snapshot.weakPoints
    : [{ key: 'weak-empty', label: 'No weak point flagged yet', score: 0, signal: 'watch' as const, nextAction: 'More debrief detail will surface the next focus.' }];

  const renderHighlightCard = (area: CompetencyHighlight) => {
    const areaTone = getCompetencyTone(area.signal);
    return (
      <div key={area.key} className={cn('rounded-xl border bg-background/70 p-3 space-y-2', areaTone.border)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              {area.signal === 'strength' ? 'Strength' : 'Weak point'}
            </p>
            <p className="mt-1 text-[11px] font-semibold leading-snug">{area.label}</p>
          </div>
          <Badge variant="outline" className={cn('shrink-0 text-[10px] font-black uppercase tracking-[0.16em]', areaTone.pill)}>
            {Math.round(area.score)} / 100
          </Badge>
        </div>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground leading-snug">
          {area.nextAction}
        </p>
      </div>
    );
  };

  return (
    <Card className={cn('overflow-hidden border shadow-none', tone.border, tone.bg)}>
      <CardHeader className="border-b bg-muted/5 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em]">Strengths / Weak points</p>
            </div>
            <p className="mt-1 text-[11px] font-semibold leading-snug">{snapshot.headline}</p>
          </div>
          <Badge variant="outline" className={cn('text-[10px] font-black uppercase tracking-[0.16em]', tone.pill)}>
            {tone.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1.25">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            <span>Average skill score</span>
            <span>{Math.round(snapshot.score)} / 100</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted/60">
            <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${Math.min(Math.max(snapshot.score, 0), 100)}%` }} />
          </div>
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {snapshot.nextFocus}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Strengths</p>
              <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.16em] bg-emerald-500/10 text-emerald-700 border-emerald-200">
                {strengthItems.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {strengthItems.map(renderHighlightCard)}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">Weak points</p>
              <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.16em] bg-rose-500/10 text-rose-700 border-rose-200">
                {weakPointItems.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {weakPointItems.map(renderHighlightCard)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const PHASE_OPTIONS = TRAINING_EXERCISE_TEMPLATES.map((template) => ({
  value: template.key,
  label: template.label,
}));

const formatLongDate = (value?: string | null) => {
  if (!value) return 'No debrief yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No debrief yet';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const getInstructorRecommendationMeta = (value?: StudentProgressReport['entries'][number]['instructorRecommendationAction']) => {
  switch (value) {
    case 'repeat_exercise':
      return { label: 'Repeat Exercise', badge: 'border-rose-200 bg-rose-50 text-rose-700' };
    case 'recommend_next_phase':
      return { label: 'Recommend Next Phase', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'recommend_solo_review':
      return { label: 'Recommend Solo Review', badge: 'border-sky-200 bg-sky-50 text-sky-700' };
    case 'continue_current_phase':
    default:
      return { label: 'Continue Current Phase', badge: 'border-amber-200 bg-amber-50 text-amber-700' };
  }
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
        <CardDescription className="text-xs">Simple flight and debrief snapshot before the full training history.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MetricPill icon={<Clock3 className="h-3.5 w-3.5" />} label="Last Flight" value={lastFlight ? formatDateLabel(lastFlight) : 'None'} hint={formatDaysSince(progress.daysSinceFlight)} />
          <MetricPill icon={<CalendarDays className="h-3.5 w-3.5" />} label="Last Debrief" value={lastDebrief ? formatDateLabel(lastDebrief) : 'None'} hint={formatDaysSince(progress.daysSinceDebrief)} />
          <MetricPill icon={<Clock3 className="h-3.5 w-3.5" />} label="Hours Flown" value={formatHours(progress.totalFlightHours)} hint={progress.recentFlightHours > 0 ? `${formatHours(progress.recentFlightHours)} this period` : 'No hours in this period'} />
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressionDecisionCard({
  recommendation,
  canManage,
  onSave,
}: {
  recommendation?: StudentProgressionRecommendation;
  canManage: boolean;
  onSave: (next: StudentProgressionRecommendation) => Promise<void>;
}) {
  const [draft, setDraft] = useState<StudentProgressionRecommendation>({
    currentPhase: recommendation?.currentPhase || '',
    status: recommendation?.status || 'continue',
    recommendedNextPhase: recommendation?.recommendedNextPhase || '',
    recommendationComment: recommendation?.recommendationComment || '',
    recommendedAt: recommendation?.recommendedAt || null,
    recommendedByEmail: recommendation?.recommendedByEmail || null,
    recommendedByUserId: recommendation?.recommendedByUserId || null,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft({
      currentPhase: recommendation?.currentPhase || '',
      status: recommendation?.status || 'continue',
      recommendedNextPhase: recommendation?.recommendedNextPhase || '',
      recommendationComment: recommendation?.recommendationComment || '',
      recommendedAt: recommendation?.recommendedAt || null,
      recommendedByEmail: recommendation?.recommendedByEmail || null,
      recommendedByUserId: recommendation?.recommendedByUserId || null,
    });
  }, [recommendation]);

  const statusMeta = getProgressionStatusMeta(draft.status);
  const lastUpdatedLabel = recommendation?.recommendedAt
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(recommendation.recommendedAt))
    : 'No CFI / HoT entry yet';
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        ...draft,
        status: draft.status || 'continue',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden border shadow-none">
      <CardHeader className="border-b bg-muted/5 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm font-black uppercase tracking-tight">Progression Review</CardTitle>
            <CardDescription className="text-xs">Current phase, next phase recommendation, and the review trail for the student.</CardDescription>
          </div>
          <Badge variant="outline" className={cn('text-[10px] font-black uppercase tracking-[0.16em]', statusMeta.badge)}>
            {statusMeta.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="current-phase">Current training phase</Label>
            <Select
              value={draft.currentPhase || ''}
              onValueChange={(value) => setDraft((current) => ({ ...current, currentPhase: value }))}
              disabled={!canManage || isSaving}
            >
              <SelectTrigger id="current-phase" className="h-10">
                <SelectValue placeholder="Select current phase" />
              </SelectTrigger>
              <SelectContent>
                {PHASE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recommended-next-phase">Next phase recommendation</Label>
            <Select
              value={draft.recommendedNextPhase || ''}
              onValueChange={(value) => setDraft((current) => ({ ...current, recommendedNextPhase: value }))}
              disabled={!canManage || isSaving}
            >
              <SelectTrigger id="recommended-next-phase" className="h-10">
                <SelectValue placeholder="Select recommended next phase" />
              </SelectTrigger>
              <SelectContent>
                {PHASE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="progression-status">Review outcome</Label>
            <Select
              value={draft.status || 'continue'}
              onValueChange={(value) => setDraft((current) => ({ ...current, status: value as StudentProgressionRecommendation['status'] }))}
              disabled={!canManage || isSaving}
            >
              <SelectTrigger id="progression-status" className="h-10">
                <SelectValue placeholder="Select progression status" />
              </SelectTrigger>
              <SelectContent>
                {PROGRESSION_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

        <div className="space-y-2">
          <Label htmlFor="progression-comment">Review note</Label>
          <Textarea
            id="progression-comment"
            value={draft.recommendationComment || ''}
            onChange={(event) => setDraft((current) => ({ ...current, recommendationComment: event.target.value }))}
            placeholder="Record the approved progression decision, any hold points, and what must be achieved before the next phase."
            rows={4}
            disabled={!canManage || isSaving}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Latest review</p>
            <p className="text-sm font-black">{lastUpdatedLabel}</p>
            <p className="text-xs text-muted-foreground">
              {recommendation?.recommendedByEmail || 'No review has been recorded yet.'}
            </p>
          </div>
          {canManage ? (
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save review'}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Only training-management roles can edit this review.</p>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

export default function StudentDetailPage({ params }: StudentDetailPageProps) {
  const resolvedParams = use(params);
  const { tenantId } = useUserProfile();
  const { hasPermission } = usePermissions();
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

  const canManageProgression = hasPermission('training-student-progression-manage');
  const instructorNameById = useMemo(
    () =>
      new Map(
        (Array.isArray(summary.instructors) ? summary.instructors : []).map((instructor) => [
          instructor.id,
          `${instructor.firstName} ${instructor.lastName}`.trim(),
        ]),
      ),
    [summary.instructors],
  );
  const competencyReports = useMemo(
    () => (Array.isArray(summary.studentProgressReports) ? summary.studentProgressReports.filter((report) => report.studentId === studentId) : []),
    [studentId, summary.studentProgressReports],
  );

  if (isLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full flex flex-col h-full min-h-0 overflow-hidden gap-6 pt-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  if (!student) {
    return <div className="max-w-[1100px] mx-auto w-full text-center py-10">Student not found.</div>;
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
    const status: 'safe' | 'watch' | 'over' = !nextMilestone
      ? 'over'
      : totalFlightHours >= nextMilestone.warningHours
        ? 'watch'
        : 'safe';

    return {
      totalFlightHours: parseFloat(totalFlightHours.toFixed(1)),
      recentFlightHours: parseFloat(recentFlightHours.toFixed(1)),
      lastFlightDate: lastFlightDate ? lastFlightDate.toISOString() : null,
      lastDebriefDate: lastDebriefDate ? lastDebriefDate.toISOString() : null,
      daysSinceFlight,
      daysSinceDebrief,
      milestoneHours: nextMilestone ? nextMilestone.milestone : null,
      status,
    };
  })();

  const handleSaveProgressionRecommendation = async (next: StudentProgressionRecommendation) => {
    const response = await fetch(`/api/personnel/${student.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personnel: {
          progressionRecommendation: next,
        },
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save progression recommendation.');
    }

    const payload = await response.json().catch(() => null);
    const updatedStudent = payload?.personnel as PilotProfile | undefined;
    if (updatedStudent) {
      setStudent((current) => current ? { ...current, progressionRecommendation: updatedStudent.progressionRecommendation } : current);
    } else {
      setStudent((current) => current ? { ...current, progressionRecommendation: next } : current);
    }
  };

  return (
    <Card className="mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col overflow-hidden shadow-none border">
      <CardHeader className="shrink-0 border-b bg-muted/5 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-[13px] font-black uppercase tracking-tight md:text-lg">
              Student Progress
            </CardTitle>
            <CardDescription className="text-[10px] font-medium capitalize tracking-normal text-muted-foreground md:text-sm">
              Track progression, recency, and training pace for the selected student.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/training/student-progress">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-auto p-0">
        <div className="h-full min-w-[1100px] md:min-w-0">
          <div className="space-y-4 p-4">
            <ProgressSummary student={student} progress={progress} />
            <CompetencyStrip reports={competencyReports} />
            <ProgressionDecisionCard
              recommendation={student.progressionRecommendation}
              canManage={canManageProgression}
              onSave={handleSaveProgressionRecommendation}
            />

            <div className="flex-1 min-h-0 overflow-hidden px-1">
              <TrainingRecords studentId={studentId} tenantId={tenantId || ''} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
