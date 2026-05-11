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
import { Badge } from '@/components/ui/badge';
import type { StudentProgressReport, StudentMilestoneSettings } from '@/types/training';
import type { PilotProfile } from '../personnel-directory-page';
import type { Booking } from '@/types/booking';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, History, CheckCircle2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Star, TrendingDown, Target } from 'lucide-react';
import { buildTrainingCompetencyAreas, type TrainingCompetencyArea } from '@/lib/training-competencies';

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
