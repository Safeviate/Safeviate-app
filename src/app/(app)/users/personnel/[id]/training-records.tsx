'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { format } from 'date-fns';

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, 12);
};
const round1 = (value: number) => parseFloat(value.toFixed(1));
import { Badge } from '@/components/ui/badge';
import type { StudentProgressReport, StudentMilestoneSettings } from '@/types/training';
import type { InstructorAssignmentRecord, PilotProfile } from '../personnel-directory-page';
import type { Booking } from '@/types/booking';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, History, CheckCircle2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Star, TrendingDown, Target } from 'lucide-react';
import { buildTrainingCompetencyAreas, type TrainingCompetencyArea } from '@/lib/training-competencies';
import {
    buildExerciseCurrencySummary,
    buildExerciseProgressSummary,
    buildExerciseReadinessFlags,
    getExerciseStatusMeta,
    getTrendMeta,
    type ExerciseProgressSummary,
    type ExerciseReadinessFlag,
} from '@/lib/training-exercise-analytics';
import { TRAINING_EXERCISE_TEMPLATES } from '@/lib/training-exercise-templates';

interface TrainingRecordsProps {
    studentId: string;
    tenantId: string;
}

const getRatingColor = (rating: number) => {
    switch (rating) {
        case 1: return 'bg-red-500';
        case 2: return 'bg-orange-500';
        case 3: return 'bg-yellow-500 text-black';
        case 4: return 'bg-green-500';
        case 5: return 'bg-emerald-600';
        default: return 'bg-gray-400';
    }
}

const SectionHeader = ({ title, icon: Icon }: { title: string, icon: any }) => (
    <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-bold leading-tight">{title}</h3>
    </div>
);

const MilestoneProgress = ({ totalHours, milestone, warningThreshold }: { totalHours: number, milestone: number, warningThreshold: number }) => {
    const progress = Math.min((totalHours / milestone) * 100, 100);
    const isWarning = totalHours >= warningThreshold && totalHours < milestone;
    const isComplete = totalHours >= milestone;

    const getIndicatorColor = () => {
        if (isComplete) return 'bg-green-500';
        if (isWarning) return 'bg-yellow-500';
        return 'bg-primary';
    }

    return (
        <div className='space-y-3 bg-background/50 p-4 rounded-xl border border-card-border/50'>
            <div className="flex justify-between items-baseline border-b border-primary/20 pb-2 mb-3">
                <h4 className='text-[10px] font-bold uppercase text-primary tracking-wider'>{milestone} Hour Milestone</h4>
                <p className="text-[10px] font-mono font-bold text-muted-foreground">{totalHours.toFixed(1)} / {milestone}h</p>
            </div>
            <Progress value={progress} indicatorClassName={getIndicatorColor()} className='h-2' />
            {isComplete && (
                <div className='flex items-center gap-1 text-[10px] text-green-600 font-bold uppercase mt-1'>
                    <CheckCircle2 className='h-3 w-3' />
                    Goal Reached
                </div>
            )}
        </div>
    )
}

const formatLastSeen = (value: string | null) => {
    if (!value) return 'No recent record';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No recent record';
    return format(date, 'PPP');
};

const getMeterTone = (signal: TrainingCompetencyArea['signal']) => {
    if (signal === 'strength') {
        return {
            badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
            bar: 'bg-emerald-500',
            panel: 'border-emerald-200 bg-emerald-50/60',
        };
    }

    if (signal === 'growth') {
        return {
            badge: 'bg-rose-500/10 text-rose-700 border-rose-200',
            bar: 'bg-rose-500',
            panel: 'border-rose-200 bg-rose-50/60',
        };
    }

    return {
        badge: 'bg-amber-500/10 text-amber-700 border-amber-200',
        bar: 'bg-amber-500',
        panel: 'border-amber-200 bg-amber-50/60',
    };
};

function CompetencyRow({ area }: { area: TrainingCompetencyArea }) {
    const tone = getMeterTone(area.signal);
    const label = area.signal === 'strength' ? 'Strength' : area.signal === 'growth' ? 'Growth area' : 'Watch';

    return (
        <div className={cn('rounded-xl border p-4 space-y-3', tone.panel)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        {area.signal === 'strength' ? (
                            <Star className="h-4 w-4 text-emerald-600" />
                        ) : area.signal === 'growth' ? (
                            <TrendingDown className="h-4 w-4 text-rose-600" />
                        ) : (
                            <Target className="h-4 w-4 text-amber-600" />
                        )}
                        <p className="text-sm font-black">{area.label}</p>
                    </div>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        {area.sampleCount} debrief{area.sampleCount === 1 ? '' : 's'} · Avg {area.trend.toFixed(1)}/5 · Last seen {formatLastSeen(area.lastSeen)}
                    </p>
                </div>
                <Badge variant="outline" className={cn('text-[10px] font-black uppercase tracking-[0.18em]', tone.badge)}>
                    {label}
                </Badge>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    <span>Strength meter</span>
                    <span>{Math.round(area.score)} / 100</span>
                </div>
                <Progress value={Math.min(Math.max(area.score, 0), 100)} indicatorClassName={tone.bar} className="h-2" />
            </div>

            <div className="flex items-center justify-between gap-3 text-xs">
                <p className="font-medium text-muted-foreground">Next focus</p>
                <p className="text-right font-black">{area.nextAction}</p>
            </div>
        </div>
    );
}

function StrengthMeter({ areas }: { areas: TrainingCompetencyArea[] }) {
    const strengths = [...areas].filter((area) => area.signal === 'strength').sort((a, b) => b.score - a.score).slice(0, 3);
    const growthAreas = [...areas].filter((area) => area.signal === 'growth').sort((a, b) => a.score - b.score).slice(0, 3);
    const watchAreas = [...areas].filter((area) => area.signal === 'watch').sort((a, b) => a.score - b.score).slice(0, 2);
    const focusAreas = [...growthAreas, ...watchAreas].slice(0, 3);

    if (areas.length === 0) {
        return (
            <section>
                <SectionHeader title="Strength & Growth Meter" icon={Star} />
                <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                    No skill-specific debrief notes have been captured yet, so the meter will populate once instructors log exercise feedback.
                </div>
            </section>
        );
    }

    return (
        <section className="space-y-4">
            <SectionHeader title="Strength & Growth Meter" icon={Star} />
            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-2xl border bg-background p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-black uppercase tracking-[0.18em]">Strengths</p>
                            <p className="text-xs text-muted-foreground">Skills that are holding up under repeated debrief pressure.</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.18em]">
                            {strengths.length} highlighted
                        </Badge>
                    </div>
                    <div className="space-y-3">
                        {strengths.length > 0 ? strengths.map((area) => <CompetencyRow key={area.key} area={area} />) : (
                            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                No current strength signal yet. Encourage more debrief entries to surface the student&apos;s most consistent areas.
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border bg-background p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-black uppercase tracking-[0.18em]">Growth areas</p>
                            <p className="text-xs text-muted-foreground">The most useful skills to target in the next flight or debrief.</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.18em]">
                            {focusAreas.length} prioritized
                        </Badge>
                    </div>
                    <div className="space-y-3">
                        {focusAreas.length > 0 ? focusAreas.map((area) => <CompetencyRow key={area.key} area={area} />) : (
                            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                No growth area signal yet. Once instructors enter more specific exercise notes, the meter will highlight where the student needs help.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

function ReadinessSignalCard({ item }: { item: ExerciseReadinessFlag }) {
    const tone = item.signal === 'ready'
        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700'
        : item.signal === 'blocked'
            ? 'border-rose-200 bg-rose-50/60 text-rose-700'
            : 'border-amber-200 bg-amber-50/60 text-amber-700';

    return (
        <div className={cn('rounded-xl border p-4 space-y-2', tone)}>
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black">{item.label}</p>
                <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.18em]">
                    {item.signal}
                </Badge>
            </div>
            <p className="text-xs font-medium">{item.detail}</p>
        </div>
    );
}

function ExerciseProgressMatrix({ summaries }: { summaries: ExerciseProgressSummary[] }) {
    const activeSummaries = summaries.filter((summary) => summary.attemptCount > 0);
    const highlights = activeSummaries
        .filter((summary) => summary.status === 'needs_review' || summary.status === 'practising')
        .slice(0, 3);
    const strongest = activeSummaries
        .filter((summary) => summary.status === 'competent' || summary.status === 'consolidating')
        .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
        .slice(0, 3);

    return (
        <section className="space-y-4">
            <SectionHeader title="Exercise Progress Matrix" icon={Target} />
            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-2xl border bg-background overflow-hidden">
                    <div className="grid grid-cols-[minmax(0,1.8fr)_90px_84px_82px_98px] gap-3 border-b bg-muted/40 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                        <span>Exercise</span>
                        <span>Attempts</span>
                        <span>Latest</span>
                        <span>Average</span>
                        <span>Status</span>
                    </div>
                    <div className="divide-y">
                        {summaries.map((summary) => {
                            const statusMeta = getExerciseStatusMeta(summary.status);
                            const trendMeta = getTrendMeta(summary.trend);
                            return (
                                <div key={summary.templateKey} className="grid grid-cols-[minmax(0,1.8fr)_90px_84px_82px_98px] gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black">{summary.label}</p>
                                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                            {summary.lastFlown ? `Last flown ${formatLastSeen(summary.lastFlown)}` : 'No attempts yet'}
                                        </p>
                                        {summary.attemptCount > 0 ? (
                                            <p className={cn('mt-1 text-[10px] font-black uppercase tracking-[0.16em]', trendMeta.tone)}>
                                                {trendMeta.label}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="text-sm font-black">{summary.attemptCount}</div>
                                    <div className="text-sm font-black">{summary.latestRating ? `${summary.latestRating}/5` : '—'}</div>
                                    <div className="text-sm font-black">{summary.averageRating ? `${summary.averageRating}/5` : '—'}</div>
                                    <div>
                                        <Badge variant="outline" className={cn('text-[10px] font-black uppercase tracking-[0.14em]', statusMeta.badge)}>
                                            {statusMeta.label}
                                        </Badge>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border bg-background p-5 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black uppercase tracking-[0.18em]">Exercises to target</p>
                            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.18em]">
                                {highlights.length} priority
                            </Badge>
                        </div>
                        <div className="space-y-3">
                            {highlights.length > 0 ? highlights.map((summary) => (
                                <div key={summary.templateKey} className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-2">
                                    <p className="text-sm font-black">{summary.label}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {summary.focusCriteria[0]?.label
                                            ? `Main weak point: ${summary.focusCriteria[0].label}`
                                            : 'Exercise still needs more consolidation.'}
                                    </p>
                                </div>
                            )) : (
                                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                    No urgent exercise concerns are standing out right now.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border bg-background p-5 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black uppercase tracking-[0.18em]">Most stable exercises</p>
                            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.18em]">
                                {strongest.length} highlighted
                            </Badge>
                        </div>
                        <div className="space-y-3">
                            {strongest.length > 0 ? strongest.map((summary) => (
                                <div key={summary.templateKey} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-2">
                                    <p className="text-sm font-black">{summary.label}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {summary.strengths[0]?.label
                                            ? `Holding steady in ${summary.strengths[0].label}.`
                                            : 'Recent ratings show stable control in this exercise.'}
                                    </p>
                                </div>
                            )) : (
                                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                    No stable exercise signal yet. More debrief entries will sharpen this picture.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function InstructorAssignmentTimeline({
    currentInstructorName,
    history,
    reports,
    instructorsMap,
}: {
    currentInstructorName: string;
    history: InstructorAssignmentRecord[];
    reports: StudentProgressReport[];
    instructorsMap: Map<string, string>;
}) {
    const timelineItems = [...history]
        .sort((a, b) => parseLocalDate(b.changedAt).getTime() - parseLocalDate(a.changedAt).getTime());

    const instructorPerformance = Array.from(
        reports.reduce((map, report) => {
            const instructorId = report.instructorId || 'unknown';
            const entryRatings = report.entries.map((entry) => entry.rating);
            const average = entryRatings.length > 0
                ? entryRatings.reduce((sum, value) => sum + value, 0) / entryRatings.length
                : 0;
            const existing = map.get(instructorId);
            if (existing) {
                existing.reportCount += 1;
                existing.ratingTotal += average;
                existing.lastDate = existing.lastDate && parseLocalDate(existing.lastDate).getTime() > parseLocalDate(report.date).getTime()
                    ? existing.lastDate
                    : report.date;
                return map;
            }
            map.set(instructorId, {
                instructorId,
                reportCount: 1,
                ratingTotal: average,
                lastDate: report.date,
            });
            return map;
        }, new Map<string, { instructorId: string; reportCount: number; ratingTotal: number; lastDate: string }>()),
    )
        .map(([, item]) => ({
            ...item,
            averageRating: round1(item.ratingTotal / item.reportCount),
            instructorName: item.instructorId === 'unknown'
                ? 'Unknown Instructor'
                : instructorsMap.get(item.instructorId) || item.instructorId,
        }))
        .sort((a, b) => b.reportCount - a.reportCount || b.averageRating - a.averageRating);

    return (
        <section className="space-y-4">
            <SectionHeader title="Instructor Timeline & Performance" icon={History} />
            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-2xl border bg-background p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-black uppercase tracking-[0.18em]">Assigned Instructor</p>
                            <p className="text-xs text-muted-foreground">Use this timeline to relate assessment changes to instructor handovers.</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.18em]">
                            {currentInstructorName}
                        </Badge>
                    </div>
                    <div className="space-y-3">
                        {timelineItems.length > 0 ? timelineItems.map((item, index) => {
                            const instructorName = item.instructorId
                                ? instructorsMap.get(item.instructorId) || item.instructorId
                                : 'Unassigned';
                            return (
                                <div key={`${item.changedAt}-${index}`} className="rounded-xl border bg-muted/20 px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-black">{instructorName}</p>
                                            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                                Changed {formatLastSeen(item.changedAt)}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.16em]">
                                            {item.instructorId ? 'Assigned' : 'Cleared'}
                                        </Badge>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                No instructor assignment changes have been recorded yet.
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border bg-background p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-black uppercase tracking-[0.18em]">Assessment Performance by Instructor</p>
                            <p className="text-xs text-muted-foreground">This helps show whether the student’s debrief pattern shifts under different instructors.</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.18em]">
                            {instructorPerformance.length} instructors
                        </Badge>
                    </div>
                    <div className="space-y-3">
                        {instructorPerformance.length > 0 ? instructorPerformance.map((item) => (
                            <div key={item.instructorId} className="rounded-xl border bg-muted/20 px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-black">{item.instructorName}</p>
                                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                            {item.reportCount} debrief{item.reportCount === 1 ? '' : 's'} · Last seen {formatLastSeen(item.lastDate)}
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.16em]">
                                        Avg {item.averageRating}/5
                                    </Badge>
                                </div>
                            </div>
                        )) : (
                            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                No debriefs have been tied to instructors yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

export function TrainingRecords({ studentId, tenantId }: TrainingRecordsProps) {
    const [reports, setReports] = useState<StudentProgressReport[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [instructors, setInstructors] = useState<PilotProfile[]>([]);
    const [milestoneSettings, setMilestoneSettings] = useState<StudentMilestoneSettings | null>(null);
    const [student, setStudent] = useState<PilotProfile | null>(null);

    const [isLoadingReports, setIsLoadingReports] = useState(true);
    const [isLoadingBookings, setIsLoadingBookings] = useState(true);
    const [isLoadingInstructors, setIsLoadingInstructors] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const [summaryResponse, trainingResponse] = await Promise.all([
                    fetch('/api/dashboard-summary', { cache: 'no-store' }),
                    fetch('/api/student-training', { cache: 'no-store' }),
                ]);

                const [summaryPayload, trainingPayload] = await Promise.all([
                    summaryResponse.json().catch(() => ({})),
                    trainingResponse.json().catch(() => ({})),
                ]);

                if (cancelled) return;

                const summaryStudents = Array.isArray(summaryPayload?.students) ? summaryPayload.students : [];
                const summaryInstructors = Array.isArray(summaryPayload?.instructors) ? summaryPayload.instructors : [];
                const summaryBookings = Array.isArray(summaryPayload?.bookings) ? summaryPayload.bookings : [];

                const s = summaryStudents.find((u: PilotProfile) => u.id === studentId);
                if (s) setStudent(s);

                setInstructors(summaryInstructors);
                setBookings(summaryBookings.filter((b: Booking) => b.studentId === studentId && b.status === 'Completed'));
                setReports((Array.isArray(trainingPayload?.reports) ? trainingPayload.reports : []).filter((r: StudentProgressReport) => r.studentId === studentId));
                setMilestoneSettings(trainingPayload?.milestones || null);
            } catch (error) {
                console.error('Failed to load training records', error);
            } finally {
                if (!cancelled) {
                    setIsLoadingInstructors(false);
                    setIsLoadingReports(false);
                    setIsLoadingBookings(false);
                }
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [studentId]);

    const isLoading = isLoadingReports || isLoadingInstructors || isLoadingBookings;

    const instructorsMap = useMemo(() => {
        if (!instructors) return new Map();
        return new Map(instructors.map(i => [i.id, `${i.firstName} ${i.lastName}`]));
    }, [instructors]);

    const totalFlightHours = useMemo(() => {
        if (!bookings) return 0;
        return bookings.reduce((total, booking) => {
            if (booking.postFlightData?.hobbs !== undefined && booking.preFlightData?.hobbs !== undefined) {
                return total + (booking.postFlightData.hobbs - booking.preFlightData.hobbs);
            }
            return total;
        }, 0);
    }, [bookings]);
    
    const defaultMilestones = [
        { milestone: 10, warningHours: 7 },
        { milestone: 20, warningHours: 17 },
        { milestone: 30, warningHours: 27 },
        { milestone: 40, warningHours: 37 },
    ];
    
    const milestones = milestoneSettings?.milestones.length ? milestoneSettings.milestones : defaultMilestones;

    const sortedReports = useMemo(() => {
        if (!reports) return [];
        return [...reports].sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
    }, [reports]);

    const competencyAreas = useMemo(() => buildTrainingCompetencyAreas(reports), [reports]);
    const exerciseSummaries = useMemo(
        () => buildExerciseProgressSummary(reports, TRAINING_EXERCISE_TEMPLATES),
        [reports],
    );
    const readinessFlags = useMemo(
        () => buildExerciseReadinessFlags(exerciseSummaries),
        [exerciseSummaries],
    );
    const currencySummary = useMemo(
        () => buildExerciseCurrencySummary(exerciseSummaries, [
            'exer-13-circuit-approach-and-landing',
            'exer-12-13e-emergencies',
            'exer-18a-navigation',
            'exer-19-basic-instrument-flight',
        ]),
        [exerciseSummaries],
    );
    const primaryInstructorName = useMemo(() => {
        if (!student?.primaryInstructorId) return 'Unassigned';
        return instructorsMap.get(student.primaryInstructorId) || student.primaryInstructorId;
    }, [student?.primaryInstructorId, instructorsMap]);
    const assignmentHistory = useMemo<InstructorAssignmentRecord[]>(
        () => Array.isArray(student?.instructorAssignmentHistory) ? student.instructorAssignmentHistory : [],
        [student?.instructorAssignmentHistory],
    );

    if (isLoading) {
        return (
            <div className="h-full space-y-6">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    return (
        <Card className="flex flex-col h-full overflow-hidden shadow-none border">
            <CardHeader className="shrink-0 border-b bg-muted/5">
                <CardTitle>{student ? `${student.firstName} ${student.lastName} - ` : ''}Training Progress & History</CardTitle>
                <CardDescription>Comprehensive overview of flight hour milestones and instructor debriefs.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                    <div className="p-6 space-y-10">
                        <section>
                            <SectionHeader title="Flight Hour Milestones" icon={Trophy} />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {milestones.map(ms => (
                                    <MilestoneProgress 
                                        key={ms.milestone}
                                        totalHours={totalFlightHours}
                                        milestone={ms.milestone}
                                        warningThreshold={ms.warningHours}
                                    />
                                ))}
                            </div>
                        </section>

                        <Separator />

                        <StrengthMeter areas={competencyAreas} />

                        <Separator />

                        <section className="space-y-4">
                            <SectionHeader title="Readiness & Currency" icon={Target} />
                            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                                <div className="rounded-2xl border bg-background p-5 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-black uppercase tracking-[0.18em]">Progression Signals</p>
                                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.18em]">
                                            {readinessFlags.length} checks
                                        </Badge>
                                    </div>
                                    <div className="space-y-3">
                                        {readinessFlags.map((flag) => (
                                            <ReadinessSignalCard key={flag.key} item={flag} />
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-2xl border bg-background p-5 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-black uppercase tracking-[0.18em]">Exercise Currency</p>
                                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.18em]">
                                            4 watches
                                        </Badge>
                                    </div>
                                    <div className="space-y-3">
                                        {currencySummary.map((item) => (
                                            <div key={item.key} className="rounded-xl border bg-muted/20 px-4 py-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-black">{item.label}</p>
                                                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                                            {item.lastFlown ? `Last flown ${formatLastSeen(item.lastFlown)}` : 'Not flown yet'}
                                                        </p>
                                                    </div>
                                                    <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.16em]">
                                                        {item.daysSince === null ? 'N/A' : `${item.daysSince}d`}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <Separator />

                        <ExerciseProgressMatrix summaries={exerciseSummaries} />

                        <Separator />

                        <InstructorAssignmentTimeline
                            currentInstructorName={primaryInstructorName}
                            history={assignmentHistory}
                            reports={reports}
                            instructorsMap={instructorsMap}
                        />

                        <Separator />

                        <section>
                            <SectionHeader title="Detailed Training History" icon={History} />
                            {sortedReports && sortedReports.length > 0 ? (
                                <Accordion type="multiple" className="w-full space-y-4">
                                    {sortedReports.filter(r => r.entries.length > 0).map(report => (
                                        <AccordionItem key={report.id} value={report.id} className='border rounded-xl bg-background overflow-hidden'>
                                            <AccordionTrigger className='px-4 hover:no-underline'>
                                                <div className="flex justify-between items-center w-full pr-4">
                                                    <div className="text-left">
                                                        <p className="font-bold text-sm">Debrief {report.bookingNumber ? `#${report.bookingNumber}` : ''}</p>
                                                        <p className="text-xs text-muted-foreground">{format(parseLocalDate(report.date), 'PPP')} with {instructorsMap.get(report.instructorId!) || 'Unknown'}</p>
                                                    </div>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="px-4 pb-4 space-y-4 pt-2 border-t bg-muted/10">
                                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                                    {report.entries.map(entry => (
                                                        <div key={entry.id} className="p-3 rounded-lg border bg-background flex flex-col justify-between">
                                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                                <p className="font-bold text-xs">{entry.exercise}</p>
                                                                <Badge className={cn(getRatingColor(entry.rating), "text-white text-[10px] h-5")}>{entry.rating}/5</Badge>
                                                            </div>
                                                            {Array.isArray(entry.criteriaRatings) && entry.criteriaRatings.length > 0 ? (
                                                                <div className="mb-3 space-y-2">
                                                                    {entry.criteriaRatings.map((criterion) => (
                                                                        <div key={criterion.id} className="rounded-md border bg-muted/30 px-2.5 py-2">
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <p className="text-[11px] font-semibold">{criterion.label}</p>
                                                                                <Badge variant="outline" className="h-5 text-[10px] font-black">
                                                                                    {criterion.rating}/5
                                                                                </Badge>
                                                                            </div>
                                                                            {criterion.comment ? (
                                                                                <p className="mt-1 text-[11px] text-muted-foreground italic">{criterion.comment}</p>
                                                                            ) : null}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : null}
                                                            <p className="text-xs text-muted-foreground italic">{entry.comment || 'No specific notes.'}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                {report.overallComment && (
                                                    <div className="pt-4 border-t">
                                                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Overall Instructor Comment</p>
                                                        <p className="text-sm font-medium leading-relaxed">{report.overallComment}</p>
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                                                    {report.instructorSignatureUrl && (
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Instructor Signature</p>
                                                            <div className='bg-white border rounded-lg p-2 flex justify-center'>
                                                                <img src={report.instructorSignatureUrl} alt="Instructor Signature" className="max-h-20 object-contain" />
                                                            </div>
                                                        </div>
                                                    )}
                                                    {report.studentSignatureUrl && (
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Student Acknowledgement</p>
                                                            <div className='bg-white border rounded-lg p-2 flex justify-center'>
                                                                <img src={report.studentSignatureUrl} alt="Student Signature" className="max-h-20 object-contain" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            ) : (
                                <div className='py-12 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-muted-foreground'>
                                    <History className='h-8 w-8 mb-2 opacity-20' />
                                    <p className="text-sm">No debriefs recorded yet.</p>
                                </div>
                            )}
                        </section>
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
