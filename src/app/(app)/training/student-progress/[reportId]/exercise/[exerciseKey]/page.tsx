'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Booking } from '@/types/booking';
import type { StudentProgressReport } from '@/types/training';
import type { PilotProfile } from '@/app/(app)/users/personnel/personnel-directory-page';
import { TRAINING_EXERCISE_TEMPLATES } from '@/lib/training-exercise-templates';

interface ExerciseReviewPageProps {
  params: Promise<{ reportId: string; exerciseKey: string }>;
}

type ReviewEntry = {
  reportId: string;
  date: string;
  bookingId?: string;
  bookingNumber?: string;
  instructorId?: string;
  summary: string;
  rating: 1 | 2 | 3 | 4 | 5;
  recommendationAction?: StudentProgressReport['entries'][number]['instructorRecommendationAction'];
  recommendationComment?: string;
  criteria: StudentProgressReport['entries'][number]['criteriaRatings'];
  humanFactors?: StudentProgressReport['entries'][number]['humanFactors'];
};

type SummaryPayload = {
  students?: PilotProfile[];
  instructors?: PilotProfile[];
  bookings?: Array<Pick<Booking, 'studentId' | 'status'> & { date?: string }>;
  studentProgressReports?: StudentProgressReport[];
};

const formatLongDate = (value?: string | null) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
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

export default function ExerciseReviewPage({ params }: ExerciseReviewPageProps) {
  const resolvedParams = use(params);
  const studentId = resolvedParams.reportId;
  const exerciseKey = resolvedParams.exerciseKey;

  const [student, setStudent] = useState<PilotProfile | null>(null);
  const [summary, setSummary] = useState<SummaryPayload>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/dashboard-summary', { cache: 'no-store' });
        const payload = (await response.json().catch(() => ({}))) as SummaryPayload;
        const students = Array.isArray(payload.students) ? payload.students : [];
        const found = students.find((item) => item.id === studentId) || null;
        if (!cancelled) {
          setStudent(found);
          setSummary(payload || {});
        }
      } catch (error) {
        console.error('Failed to load exercise review', error);
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

  const exerciseTemplate = useMemo(
    () => TRAINING_EXERCISE_TEMPLATES.find((template) => template.key === exerciseKey),
    [exerciseKey],
  );

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

  const matchingDebriefs = useMemo(() => {
    const reports = Array.isArray(summary.studentProgressReports) ? summary.studentProgressReports : [];
    const mapped = reports
      .filter((report) => report.studentId === studentId)
      .flatMap((report) =>
        report.entries
          .filter((entry) => entry.exerciseTemplateKey === exerciseKey)
          .map((entry) => ({
            reportId: report.id,
            date: report.date,
            bookingId: report.bookingId,
            bookingNumber: report.bookingNumber,
            instructorId: report.instructorId,
            summary: entry.comment,
            rating: entry.rating,
            recommendationAction: entry.instructorRecommendationAction,
            recommendationComment: entry.instructorRecommendationComment,
            criteria: Array.isArray(entry.criteriaRatings) ? entry.criteriaRatings : [],
            humanFactors: Array.isArray(entry.humanFactors) ? entry.humanFactors : [],
          })),
      ) as ReviewEntry[];
    return mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [exerciseKey, studentId, summary.studentProgressReports]);

  const matchingReviews = useMemo(() => {
    const reviews = Array.isArray(student?.progressionReviewHistory) ? student.progressionReviewHistory : [];
    return reviews
      .filter((review) => review.currentPhase === exerciseKey || review.recommendedNextPhase === exerciseKey)
      .sort((a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime());
  }, [exerciseKey, student?.progressionReviewHistory]);

  const latestDebrief = matchingDebriefs[0];
  if (isLoading) {
    return (
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col gap-4 overflow-hidden pt-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!student) {
    return <div className="mx-auto max-w-[1100px] py-10 text-center">Student not found.</div>;
  }

  return (
    <Card className="mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col overflow-hidden border shadow-none">
      <CardHeader className="shrink-0 border-b bg-muted/5 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-[13px] font-black uppercase tracking-tight md:text-lg">
              Exercise Review
            </CardTitle>
            <CardDescription className="text-[10px] font-medium tracking-normal text-muted-foreground md:text-sm">
              Review instructor debriefs and CFI / HoT entries for one exercise before making a progression call.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/training/student-progress/${studentId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Student Progress
            </Link>
          </Button>
        </div>
      </CardHeader>

      <ScrollArea className="min-h-0 flex-1">
        <CardContent className="space-y-4 p-4">
          <Card className="overflow-hidden border shadow-none">
            <CardHeader className="border-b bg-muted/5 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-tight">
                    {exerciseTemplate?.label || exerciseKey}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {student.firstName} {student.lastName}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.16em]">
                  {matchingDebriefs.length} debrief{matchingDebriefs.length === 1 ? '' : 's'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2">
              <div className="rounded-xl border bg-muted/5 px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Last debrief</p>
                <p className="mt-1 text-sm font-black">{formatLongDate(latestDebrief?.date)}</p>
              </div>
              <div className="rounded-xl border bg-muted/5 px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Latest instructor handoff</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black">
                    {latestDebrief ? getInstructorRecommendationMeta(latestDebrief.recommendationAction).label : 'No recommendation yet'}
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] font-black uppercase tracking-[0.16em]',
                      latestDebrief ? getInstructorRecommendationMeta(latestDebrief.recommendationAction).badge : 'border-slate-200 bg-slate-50 text-slate-700',
                    )}
                  >
                    {latestDebrief ? 'Handoff' : 'Open'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border shadow-none">
            <CardHeader className="border-b bg-muted/5 px-4 py-3">
              <CardTitle className="text-sm font-black uppercase tracking-tight">Instructor Debriefs</CardTitle>
              <CardDescription className="text-xs">Chronological exercise-specific instructor evidence.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {matchingDebriefs.length > 0 ? (
                matchingDebriefs.map((item) => (
                  <div key={`${item.reportId}-${item.date}`} className="rounded-xl border bg-background p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">{formatLongDate(item.date)}</p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {item.instructorId ? (instructorNameById.get(item.instructorId) || item.instructorId) : 'Unknown instructor'}
                          {item.bookingNumber ? ` · Booking #${item.bookingNumber}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.16em]">
                        {item.rating}/5
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-black uppercase tracking-[0.16em]',
                          getInstructorRecommendationMeta(item.recommendationAction).badge,
                        )}
                      >
                        {getInstructorRecommendationMeta(item.recommendationAction).label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.summary || 'No instructor summary was recorded for this debrief.'}
                    </p>
                    {item.recommendationComment ? (
                      <div className="rounded-lg border bg-muted/20 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Instructor recommendation note</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.recommendationComment}</p>
                      </div>
                    ) : null}
                    {Array.isArray(item.criteria) && item.criteria.length > 0 ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {item.criteria.map((criterion) => (
                          <div key={criterion.id} className="rounded-lg border bg-muted/20 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold">{criterion.label}</p>
                              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                {criterion.rating}/5
                              </span>
                            </div>
                            {criterion.comment ? (
                              <p className="mt-1 text-xs text-muted-foreground">{criterion.comment}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {Array.isArray(item.humanFactors) && item.humanFactors.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                          Full human-factors capture, including Not Applicable items
                        </p>
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Human Factors</p>
                          {item.humanFactors
                            .filter((factor) => factor.category === 'human_factor')
                            .map((factor) => (
                              <div key={factor.id} className="rounded-lg border bg-muted/20 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold">{factor.label}</p>
                                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                    {factor.status === 'observed' ? 'Observed' : factor.status === 'needs_attention' ? 'Needs Attention' : 'N/A'}
                                  </span>
                                </div>
                                {factor.comment ? <p className="mt-1 text-xs text-muted-foreground">{factor.comment}</p> : null}
                              </div>
                            ))}
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Hazardous Attitudes</p>
                          {item.humanFactors
                            .filter((factor) => factor.category === 'hazardous_attitude')
                            .map((factor) => (
                              <div key={factor.id} className="rounded-lg border bg-muted/20 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold">{factor.label}</p>
                                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                    {factor.status === 'observed' ? 'Observed' : factor.status === 'needs_attention' ? 'Needs Attention' : 'N/A'}
                                  </span>
                                </div>
                                {factor.comment ? <p className="mt-1 text-xs text-muted-foreground">{factor.comment}</p> : null}
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No instructor debriefs have been recorded for this exercise yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border shadow-none">
            <CardHeader className="border-b bg-muted/5 px-4 py-3">
              <CardTitle className="text-sm font-black uppercase tracking-tight">CFI / HoT Entries</CardTitle>
              <CardDescription className="text-xs">Phase-related management reviews linked to this exercise.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {matchingReviews.length > 0 ? (
                matchingReviews.map((item) => (
                  <div key={item.id} className="rounded-xl border bg-background p-4 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">{formatLongDate(item.reviewedAt)}</p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {item.reviewedByEmail || 'Unknown reviewer'}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-black uppercase tracking-[0.16em]',
                          item.status === 'ready_to_progress' || item.status === 'ready_for_first_solo'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : item.status === 'hold'
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700',
                        )}
                      >
                        {item.status?.replaceAll('_', ' ') || 'review'}
                      </Badge>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-lg border bg-muted/20 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Current phase</p>
                        <p className="mt-1 text-sm font-black">
                          {TRAINING_EXERCISE_TEMPLATES.find((template) => template.key === item.currentPhase)?.label || item.currentPhase || 'Not recorded'}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Recommended next phase</p>
                        <p className="mt-1 text-sm font-black">
                          {TRAINING_EXERCISE_TEMPLATES.find((template) => template.key === item.recommendedNextPhase)?.label || item.recommendedNextPhase || 'Not recorded'}
                        </p>
                      </div>
                    </div>
                    {item.recommendationComment ? (
                      <p className="text-sm text-muted-foreground">{item.recommendationComment}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No CFI / HoT entries have been linked to this exercise yet.
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
