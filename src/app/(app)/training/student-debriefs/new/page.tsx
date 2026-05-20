'use client';

import { use, useState, useMemo, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, Trash2, Save, User } from 'lucide-react';
import type { Booking } from '@/types/booking';
import type { PilotProfile } from '@/app/(app)/users/personnel/page';
import { SignaturePad } from '@/components/ui/signature-pad';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BackNavButton } from '@/components/back-nav-button';
import { CardControlHeader } from '@/components/page-header';
import { DEFAULT_TRAINING_COMPETENCY_KEY, TRAINING_COMPETENCY_OPTIONS } from '@/lib/training-competencies';
import { DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY, type TrainingExerciseTemplate, getTrainingExerciseTemplate, getTrainingExerciseTemplateOptions, resolveTrainingExerciseTemplates } from '@/lib/training-exercise-templates';
import { Badge } from '@/components/ui/badge';
import type { HumanFactorsStatus, InstructorRecommendationAction, StudentProgressCriterionRating, StudentProgressHumanFactor } from '@/types/training';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { usePermissions } from '@/hooks/use-permissions';

const RATING_GUIDE = [
    { value: '1', label: 'Unsafe', hint: 'Instructor intervention required immediately.' },
    { value: '2', label: 'Significant Support Needed', hint: 'Heavy prompting or corrective input required.' },
    { value: '3', label: 'Acceptable With Coaching', hint: 'Safe enough to continue, but still needs active coaching.' },
    { value: '4', label: 'Competent', hint: 'Meets standard with only light instructor input.' },
    { value: '5', label: 'Strong / Independent', hint: 'Confident, disciplined, and largely self-directed.' },
] as const;

const INSTRUCTOR_RECOMMENDATION_OPTIONS: Array<{
    value: InstructorRecommendationAction;
    label: string;
    hint: string;
}> = [
    { value: 'repeat_exercise', label: 'Repeat Exercise', hint: 'Keep working this exercise before moving on.' },
    { value: 'continue_current_phase', label: 'Continue Current Phase', hint: 'Stay in the current phase and consolidate performance.' },
    { value: 'recommend_next_phase', label: 'Recommend Next Phase', hint: 'Instructor feels the student is ready to progress.' },
    { value: 'recommend_solo_review', label: 'Recommend Solo Review', hint: 'Escalate for a solo-readiness review by training management.' },
];

const HUMAN_FACTORS_OPTIONS: Array<{
    value: HumanFactorsStatus;
    label: string;
    hint: string;
}> = [
    { value: 'observed', label: 'Observed', hint: 'This was clearly present on the flight.' },
    { value: 'needs_attention', label: 'Needs Attention', hint: 'This area needs active coaching or mitigation.' },
    { value: 'not_applicable', label: 'Not Applicable', hint: 'This was not relevant to this exercise.' },
];

const HUMAN_FACTORS_CHECKS: Array<{ id: string; label: string; category: 'human_factor' | 'hazardous_attitude'; description: string }> = [
    { id: 'situational_awareness', label: 'Situational Awareness', category: 'human_factor', description: 'Maintains the big picture and notices changes early.' },
    { id: 'workload_management', label: 'Workload Management', category: 'human_factor', description: 'Prioritizes tasks and avoids overload or fixation.' },
    { id: 'decision_making', label: 'Decision Making', category: 'human_factor', description: 'Makes timely, safe decisions and adapts when conditions change.' },
    { id: 'communication', label: 'Communication', category: 'human_factor', description: 'Uses clear briefing, callouts, and radio discipline.' },
    { id: 'fitness_for_flight', label: 'Fitness for Flight', category: 'human_factor', description: 'Shows awareness of fatigue, stress, illness, or distraction.' },
    { id: 'error_management', label: 'Error Management', category: 'human_factor', description: 'Recognizes and corrects mistakes before they grow.' },
];

const HAZARDOUS_ATTITUDE_OPTIONS = [
    { value: 'anti_authority', label: 'Anti-Authority', description: 'Resists rules, procedures, or guidance.' },
    { value: 'impulsivity', label: 'Impulsivity', description: 'Acts too quickly without enough thought.' },
    { value: 'invulnerability', label: 'Invulnerability', description: 'Underestimates personal exposure to risk.' },
    { value: 'macho', label: 'Macho', description: 'Takes unnecessary chances to prove skill or bravado.' },
    { value: 'resignation', label: 'Resignation', description: 'Feels outcomes are out of control and stops trying to manage them.' },
];

const debriefSchema = z.object({
    overallComment: z.string().optional(),
    entries: z.array(z.object({
        id: z.string(),
        exercise: z.string().min(1, "Exercise name is required."),
        exerciseTemplateKey: z.string().optional(),
        rating: z.coerce.number().min(1).max(5),
        comment: z.string().optional(),
        instructorRecommendationAction: z.enum(['repeat_exercise', 'continue_current_phase', 'recommend_next_phase', 'recommend_solo_review']).optional(),
        instructorRecommendationComment: z.string().optional(),
        competencyKey: z.string().optional(),
        competencySignal: z.enum(['strength', 'growth', 'watch']).optional(),
        criteriaRatings: z.array(z.object({
            id: z.string(),
            key: z.string().optional(),
            label: z.string().min(1, "Criterion label is required."),
            rating: z.coerce.number().min(1).max(5),
            comment: z.string().optional(),
            competencyKey: z.string().optional(),
            source: z.enum(['template', 'custom']).optional(),
        })).optional(),
        humanFactors: z.array(z.object({
            id: z.string(),
            label: z.string().min(1),
            category: z.enum(['human_factor', 'hazardous_attitude']),
            status: z.enum(['observed', 'needs_attention', 'not_applicable']),
            comment: z.string().optional(),
        })).optional(),
    })).min(1, "At least one exercise entry is required."),
    instructorSignatureUrl: z.string().optional(),
    studentSignatureUrl: z.string().optional(),
});

type FormValues = z.infer<typeof debriefSchema>;

const buildCriterionRatingsFromTemplate = (templateKey: string, templates?: TrainingExerciseTemplate[]): StudentProgressCriterionRating[] => {
    const template = getTrainingExerciseTemplate(templateKey, templates);
    if (!template) return [];

    return template.criteria.map((criterion) => ({
        id: uuidv4(),
        key: criterion.key,
        label: criterion.label,
        rating: 4,
        comment: '',
        competencyKey: criterion.competencyKey,
        source: 'template',
    }));
};

const createDebriefEntry = (templates?: TrainingExerciseTemplate[]) => {
    const template = getTrainingExerciseTemplate(DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY, templates);

    return {
        id: uuidv4(),
        exercise: template?.label || '',
        exerciseTemplateKey: DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY,
        rating: 4 as const,
        comment: '',
        instructorRecommendationAction: 'continue_current_phase' as const,
        instructorRecommendationComment: '',
        competencyKey: template?.coreCompetencyKeys[0] || DEFAULT_TRAINING_COMPETENCY_KEY,
        competencySignal: 'growth' as const,
        criteriaRatings: buildCriterionRatingsFromTemplate(DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY, templates),
        humanFactors: buildHumanFactorsChecklist(),
    };
};

const createDebriefEntryFromTemplate = (templateKey?: string | null, templates?: TrainingExerciseTemplate[]) => {
    const resolvedTemplateKey = getTrainingExerciseTemplate(templateKey, templates)?.key || DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY;
    const template = getTrainingExerciseTemplate(resolvedTemplateKey, templates);

    return {
        id: uuidv4(),
        exercise: template?.label || '',
        exerciseTemplateKey: resolvedTemplateKey,
        rating: 4 as const,
        comment: '',
        instructorRecommendationAction: 'continue_current_phase' as const,
        instructorRecommendationComment: '',
        competencyKey: template?.coreCompetencyKeys[0] || DEFAULT_TRAINING_COMPETENCY_KEY,
        competencySignal: 'growth' as const,
        criteriaRatings: buildCriterionRatingsFromTemplate(resolvedTemplateKey, templates),
        humanFactors: buildHumanFactorsChecklist(),
    };
};

const buildHumanFactorsChecklist = (): StudentProgressHumanFactor[] =>
    HUMAN_FACTORS_CHECKS.map((item) => ({
        id: uuidv4(),
        label: item.label,
        category: item.category,
        status: 'not_applicable' as const,
        comment: '',
    }));

function NewDebriefContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const bookingId = searchParams?.get('bookingId') ?? '';
    const { toast } = useToast();
    const { tenant } = useTenantConfig();
    const { hasPermission } = usePermissions();
    const canEditDebrief = hasPermission('training-debriefs-edit') || hasPermission('admin-view');

    const [booking, setBooking] = useState<Booking | null>(null);
    const [student, setStudent] = useState<PilotProfile | null>(null);
    const [instructor, setInstructor] = useState<PilotProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const trainingExerciseTemplates = useMemo(
        () => resolveTrainingExerciseTemplates((tenant as Record<string, unknown> | null | undefined) ?? null),
        [tenant],
    );
    const trainingExerciseOptions = useMemo(
        () => getTrainingExerciseTemplateOptions(trainingExerciseTemplates),
        [trainingExerciseTemplates],
    );

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const response = await fetch('/api/dashboard-summary', { cache: 'no-store' });
                const payload = await response.json().catch(() => ({}));
                const bookings = Array.isArray(payload?.bookings) ? payload.bookings : [];
                const students = Array.isArray(payload?.students) ? payload.students : [];
                const instructors = Array.isArray(payload?.instructors) ? payload.instructors : [];

                const b = bookings.find((x: Booking) => x.id === bookingId);
                if (b && !cancelled) {
                    setBooking(b);
                    setStudent(students.find((s: PilotProfile) => s.id === b.studentId) || null);
                    setInstructor(instructors.find((i: PilotProfile) => i.id === b.instructorId) || null);
                }
            } catch (e) {
                console.error('Failed to load data', e);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [bookingId]);

    const isLoadingBooking = isLoading;
    const isLoadingStudent = isLoading;
    const isLoadingInstructor = isLoading;

    const form = useForm<FormValues>({
        resolver: zodResolver(debriefSchema),
        defaultValues: {
            overallComment: '',
            entries: [createDebriefEntry(trainingExerciseTemplates)],
            instructorSignatureUrl: '',
            studentSignatureUrl: '',
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "entries",
    });

    const watchedEntries = form.watch('entries');

    useEffect(() => {
        if (!booking?.trainingExerciseTemplateKey) return;

        const currentEntries = form.getValues('entries');
        const firstEntry = currentEntries[0];
        if (
            currentEntries.length === 1
            && firstEntry
            && firstEntry.exerciseTemplateKey === DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY
            && !form.formState.isDirty
        ) {
            form.setValue('entries', [createDebriefEntryFromTemplate(booking.trainingExerciseTemplateKey, trainingExerciseTemplates)], { shouldDirty: false });
        }
    }, [booking?.trainingExerciseTemplateKey, form, trainingExerciseTemplates]);

    const handleExerciseTemplateChange = useCallback((index: number, templateKey: string) => {
        const template = getTrainingExerciseTemplate(templateKey, trainingExerciseTemplates);
        const existing = form.getValues(`entries.${index}`);
        const customCriteria = (existing.criteriaRatings || []).filter((criterion) => criterion.source === 'custom');

        form.setValue(`entries.${index}.exerciseTemplateKey`, templateKey, { shouldDirty: true });
        form.setValue(`entries.${index}.exercise`, template?.label || existing.exercise, { shouldDirty: true });
        form.setValue(`entries.${index}.competencyKey`, template?.coreCompetencyKeys[0] || DEFAULT_TRAINING_COMPETENCY_KEY, { shouldDirty: true });
        form.setValue(
            `entries.${index}.criteriaRatings`,
            [...buildCriterionRatingsFromTemplate(templateKey, trainingExerciseTemplates), ...customCriteria],
            { shouldDirty: true }
        );
        form.setValue(`entries.${index}.humanFactors`, buildHumanFactorsChecklist(), { shouldDirty: true });
    }, [form, trainingExerciseTemplates]);

    const handleCriterionChange = useCallback((entryIndex: number, criterionIndex: number, patch: Partial<StudentProgressCriterionRating>) => {
        const current = form.getValues(`entries.${entryIndex}.criteriaRatings`) || [];
        const next = current.map((criterion, index) => (index === criterionIndex ? { ...criterion, ...patch } : criterion));
        form.setValue(`entries.${entryIndex}.criteriaRatings`, next, { shouldDirty: true });
    }, [form]);

    const handleAddCustomCriterion = useCallback((entryIndex: number) => {
        const current = form.getValues(`entries.${entryIndex}.criteriaRatings`) || [];
        form.setValue(`entries.${entryIndex}.criteriaRatings`, [
            ...current,
            {
                id: uuidv4(),
                label: '',
                rating: 4,
                comment: '',
                competencyKey: DEFAULT_TRAINING_COMPETENCY_KEY,
                source: 'custom',
            },
        ], { shouldDirty: true });
    }, [form]);

    const handleRemoveCriterion = useCallback((entryIndex: number, criterionIndex: number) => {
        const current = form.getValues(`entries.${entryIndex}.criteriaRatings`) || [];
        form.setValue(
            `entries.${entryIndex}.criteriaRatings`,
            current.filter((_, index) => index !== criterionIndex),
            { shouldDirty: true }
        );
    }, [form]);

    const handleHumanFactorChange = useCallback((entryIndex: number, factorIndex: number, patch: Partial<StudentProgressHumanFactor>) => {
        const current = form.getValues(`entries.${entryIndex}.humanFactors`) || [];
        const next = current.map((factor, index) => (index === factorIndex ? { ...factor, ...patch } : factor));
        form.setValue(`entries.${entryIndex}.humanFactors`, next, { shouldDirty: true });
    }, [form]);

    const handleAddHazardousAttitude = useCallback((entryIndex: number) => {
        const current = form.getValues(`entries.${entryIndex}.humanFactors`) || [];
        const firstHazard = HAZARDOUS_ATTITUDE_OPTIONS[0];
        form.setValue(`entries.${entryIndex}.humanFactors`, [
            ...current,
            {
                id: uuidv4(),
                label: firstHazard.label,
                category: 'hazardous_attitude',
                status: 'observed',
                comment: '',
            },
        ], { shouldDirty: true });
    }, [form]);

    const getHazardousAttitudeOptions = useCallback((currentLabel?: string) => {
        const currentOption = HAZARDOUS_ATTITUDE_OPTIONS.find((option) => option.label === currentLabel);
        return currentOption ? [currentOption, ...HAZARDOUS_ATTITUDE_OPTIONS.filter((option) => option.value !== currentOption.value)] : HAZARDOUS_ATTITUDE_OPTIONS;
    }, []);

    const onSubmit = async (values: FormValues) => {
        if (!booking) return;
        if (!canEditDebrief) {
            toast({
                variant: 'destructive',
                title: 'Permission Denied',
                description: 'You do not have permission to save training debriefs.',
            });
            return;
        }

        const debriefData = {
            ...values,
            id: crypto.randomUUID(),
            bookingId: booking.id,
            bookingNumber: booking.bookingNumber,
            studentId: booking.studentId,
            instructorId: booking.instructorId,
            date: new Date().toISOString(),
        };

        try {
            const response = await fetch('/api/student-training', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ report: debriefData }),
            });

            if (!response.ok) {
                throw new Error('Failed to save debrief.');
            }
            
            window.dispatchEvent(new Event('safeviate-training-updated'));
            
            toast({
                title: 'Debrief Saved',
                description: 'The training progress has been updated for this student.',
            });
            
            router.push('/bookings/history');
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.message || 'Failed to save debrief.',
            });
        }
    };

    if (isLoadingBooking || isLoadingStudent || isLoadingInstructor) {
        return (
            <div className="space-y-6 max-w-4xl mx-auto h-full min-h-0 overflow-hidden">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    if (!booking) {
        return (
            <div className="text-center py-12 h-full min-h-0 overflow-hidden">
                <p className="text-muted-foreground mb-4">No booking found for this debrief.</p>
                <BackNavButton href="/bookings/history" text="Back to History" />
            </div>
        );
    }

    const studentName = student ? `${student.firstName} ${student.lastName}` : 'Unknown Student';
    const instructorName = instructor ? `${instructor.firstName} ${instructor.lastName}` : 'Unknown Instructor';

    return (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col gap-6 overflow-hidden px-1">
            <Card className="flex min-h-0 flex-col overflow-hidden border border-card-border shadow-none">
                <CardControlHeader
                    className="sticky top-0 z-20 bg-muted/5"
                    context={
                        <div className="flex min-w-0 flex-col gap-1">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                        Post-Flight Instructor Debrief
                                    </p>
                                    <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                        Booking #{booking.bookingNumber} · {booking.type}
                                    </p>
                                </div>
                                <BackNavButton href="/bookings/history" text="Back to History" />
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
                                <span>Student: {studentName}</span>
                                <Separator orientation="vertical" className="h-4" />
                                <span>Instructor: {instructorName}</span>
                            </div>
                        </div>
                    }
                />
                <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
                            <ScrollArea className="flex-1 p-6">
                                <div className="space-y-8">
                                    <div className="rounded-xl border bg-muted/5 p-4 space-y-4">
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-black uppercase tracking-[0.08em]">Instructor Assessment Guide</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Rate what the student or higher-rated pilot actually demonstrated on this flight, then tag the main competency being assessed.
                                            </p>
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                            {RATING_GUIDE.map((item) => (
                                                <div key={item.value} className="rounded-lg border bg-background p-3">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Rating {item.value}</p>
                                                    <p className="mt-1 text-sm font-semibold">{item.label}</p>
                                                    <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div>
                                                <h3 className="text-lg font-semibold">Assessment Entries</h3>
                                                <p className="text-sm text-muted-foreground">Log each observed exercise, competency, and instructor signal from the flight.</p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="w-full sm:w-auto"
                                                onClick={() =>
                                                    append(
                                                        booking?.trainingExerciseTemplateKey
                                                            ? createDebriefEntryFromTemplate(booking.trainingExerciseTemplateKey, trainingExerciseTemplates)
                                                            : createDebriefEntry(trainingExerciseTemplates)
                                                    )
                                                }
                                            >
                                                <PlusCircle className="mr-2 h-4 w-4" /> Add Exercise
                                            </Button>
                                        </div>

                                        {fields.map((field, index) => (
                                            <div key={field.id} className="rounded-xl border bg-background p-4 space-y-4">
                                                {(() => {
                                                    const entry = watchedEntries?.[index];
                                                    const selectedTemplate = getTrainingExerciseTemplate(entry?.exerciseTemplateKey || DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY, trainingExerciseTemplates);
                                                    const criteriaRatings = entry?.criteriaRatings || [];
                                                    const humanFactors = entry?.humanFactors || [];

                                                    return (
                                                        <>
                                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Entry {index + 1}</p>
                                                                    <p className="text-sm font-semibold">Exercise, focus areas, and instructor feedback</p>
                                                                </div>
                                                                <Button 
                                                                    type="button" 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    onClick={() => remove(index)} 
                                                                    className="self-start text-destructive sm:self-auto"
                                                                    disabled={fields.length === 1}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>

                                                            {booking?.trainingExerciseTemplateKey ? (
                                                                <div className="rounded-xl border bg-muted/5 px-4 py-3">
                                                                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Booked Exercise</p>
                                                                    <p className="mt-1 text-sm font-semibold">{selectedTemplate?.label || entry?.exercise || 'Training exercise selected in booking'}</p>
                                                                </div>
                                                            ) : (
                                                                <div className="grid grid-cols-1 gap-4">
                                                                    <FormItem>
                                                                        <FormLabel className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Exercise</FormLabel>
                                                                        <Select
                                                                            value={entry?.exerciseTemplateKey || DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY}
                                                                            onValueChange={(value) => handleExerciseTemplateChange(index, value)}
                                                                        >
                                                                            <FormControl>
                                                                                <SelectTrigger>
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                            </FormControl>
                                                                            <SelectContent>
                                                                                {trainingExerciseOptions.map((option) => (
                                                                                    <SelectItem key={option.value} value={option.value}>
                                                                                        {option.label}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </FormItem>
                                                                </div>
                                                            )}

                                                            {selectedTemplate ? (
                                                                <div className="rounded-xl border bg-muted/5 px-4 py-3 space-y-2">
                                                                    <div className="space-y-1">
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Exercise Focus</p>
                                                                        <p className="text-sm font-semibold">{selectedTemplate.label}</p>
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {selectedTemplate.coreCompetencyKeys.map((key) => {
                                                                            const option = TRAINING_COMPETENCY_OPTIONS.find((candidate) => candidate.value === key);
                                                                            return (
                                                                                <Badge key={key} variant="secondary" className="text-[10px] font-black uppercase">
                                                                                    {option?.label || key}
                                                                                </Badge>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ) : null}

                                                            <div className="rounded-xl border bg-muted/5 p-4 space-y-4">
                                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                                    <div>
                                                                        <p className="text-sm font-semibold">Exercise Focus Areas</p>
                                                                        <p className="text-sm text-muted-foreground">Capture the focus areas that mattered on this flight. Add another one if the instructor wants to include more.</p>
                                                                    </div>
                                                                    <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => handleAddCustomCriterion(index)}>
                                                                        <PlusCircle className="mr-2 h-4 w-4" /> Add Focus Area
                                                                    </Button>
                                                                </div>

                                                                <div className="space-y-3">
                                                                    {criteriaRatings.map((criterion, criterionIndex) => {
                                                                        const isCustom = criterion.source === 'custom';

                                                                        return (
                                                                            <div key={criterion.id} className="rounded-lg border bg-background p-3 space-y-3">
                                                                                <div className="flex items-start justify-between gap-3">
                                                                                    <div className="space-y-2 flex-1">
                                                                                        {isCustom ? (
                                                                                            <div className="space-y-2">
                                                                                                <Input
                                                                                                    value={criterion.label}
                                                                                                    placeholder="Additional focus area"
                                                                                                    onChange={(event) => handleCriterionChange(index, criterionIndex, { label: event.target.value })}
                                                                                                />
                                                                                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Additional focus</p>
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div>
                                                                                                <p className="text-sm font-semibold">{criterion.label}</p>
                                                                                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Focus area</p>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        {isCustom ? (
                                                                                            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => handleRemoveCriterion(index, criterionIndex)}>
                                                                                                <Trash2 className="h-4 w-4" />
                                                                                            </Button>
                                                                                        ) : null}
                                                                                    </div>
                                                                                </div>
                                                                                <Input
                                                                                    value={criterion.comment || ''}
                                                                                    placeholder="Add a short note for this focus area"
                                                                                    onChange={(event) => handleCriterionChange(index, criterionIndex, { comment: event.target.value })}
                                                                                />
                                                                                <div className="grid grid-cols-1 md:grid-cols-[220px_170px] gap-3">
                                                                                    <Select
                                                                                        value={criterion.competencyKey || DEFAULT_TRAINING_COMPETENCY_KEY}
                                                                                        onValueChange={(value) => handleCriterionChange(index, criterionIndex, { competencyKey: value })}
                                                                                    >
                                                                                        <SelectTrigger>
                                                                                            <SelectValue placeholder="Select focus" />
                                                                                        </SelectTrigger>
                                                                                        <SelectContent>
                                                                                            {TRAINING_COMPETENCY_OPTIONS.map((option) => (
                                                                                                <SelectItem key={option.value} value={option.value}>
                                                                                                    {option.label}
                                                                                                </SelectItem>
                                                                                            ))}
                                                                                        </SelectContent>
                                                                                    </Select>
                                                                                    <Select value={String(criterion.rating)} onValueChange={(value) => handleCriterionChange(index, criterionIndex, { rating: Number(value) as 1 | 2 | 3 | 4 | 5 })}>
                                                                                        <SelectTrigger>
                                                                                            <SelectValue />
                                                                                        </SelectTrigger>
                                                                                        <SelectContent>
                                                                                            {RATING_GUIDE.map((item) => (
                                                                                                <SelectItem key={item.value} value={item.value}>
                                                                                                    {item.value} - {item.label}
                                                                                                </SelectItem>
                                                                                            ))}
                                                                                        </SelectContent>
                                                                                    </Select>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>

                                                            <div className="rounded-xl border bg-muted/5 p-3.5 space-y-3.5">
                                                                <div className="flex items-start justify-between gap-4">
                                                                    <div className="space-y-1">
                                                                        <p className="text-sm font-semibold">Human Factors</p>
                                                                        <p className="text-sm text-muted-foreground">
                                                                            Mark the core human-factors checks that were relevant on this flight.
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div className="grid gap-2.5 md:grid-cols-2">
                                                                    {HUMAN_FACTORS_CHECKS.filter((item) => item.category === 'human_factor').map((item) => {
                                                                        const factorIndex = humanFactors.findIndex((entry) => entry.label === item.label);
                                                                        const factor = factorIndex >= 0 ? humanFactors[factorIndex] : {
                                                                            id: uuidv4(),
                                                                            label: item.label,
                                                                            category: item.category,
                                                                            status: 'not_applicable' as const,
                                                                            comment: '',
                                                                        };

                                                                        return (
                                                                            <div key={item.id} className="rounded-lg border bg-background p-2.5 space-y-2">
                                                                                <div className="flex items-start justify-between gap-3">
                                                                                    <div className="space-y-0.5">
                                                                                        <p className="text-sm font-semibold leading-tight">{item.label}</p>
                                                                                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                                                                                            {item.category === 'hazardous_attitude' ? 'Hazardous Attitude' : 'Human Factor'}
                                                                                        </p>
                                                                                    </div>
                                                                                    <p className="text-[10px] text-muted-foreground text-right">{item.description}</p>
                                                                                </div>
                                                                                <Select
                                                                                    value={factor.status}
                                                                                    onValueChange={(value) => {
                                                                                        if (factorIndex >= 0) {
                                                                                            handleHumanFactorChange(index, factorIndex, { status: value as HumanFactorsStatus, label: item.label, category: item.category });
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    <SelectTrigger>
                                                                                        <SelectValue placeholder="Select status" />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent>
                                                                                        {HUMAN_FACTORS_OPTIONS.map((option) => (
                                                                                            <SelectItem key={option.value} value={option.value}>
                                                                                                {option.label}
                                                                                            </SelectItem>
                                                                                        ))}
                                                                                    </SelectContent>
                                                                                </Select>
                                                                                <Input
                                                                                    value={factor.comment || ''}
                                                                                    placeholder="Optional note"
                                                                                    onChange={(event) => {
                                                                                        if (factorIndex >= 0) {
                                                                                            handleHumanFactorChange(index, factorIndex, { comment: event.target.value, label: item.label, category: item.category });
                                                                                        }
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>

                                                            <div className="rounded-xl border bg-muted/5 p-4 space-y-4">
                                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                                    <div className="space-y-1">
                                                                        <p className="text-sm font-semibold">Hazardous Attitudes</p>
                                                                        <p className="text-sm text-muted-foreground">
                                                                            Add a hazardous attitude only when it was actually observed on this flight.
                                                                        </p>
                                                                    </div>
                                                                    <Button type="button" variant="outline" size="sm" className="h-8 w-full text-[10px] font-black uppercase sm:w-auto" onClick={() => handleAddHazardousAttitude(index)}>
                                                                        <PlusCircle className="mr-2 h-4 w-4" /> Add Hazardous Attitude
                                                                    </Button>
                                                                </div>

                                                                {humanFactors.some((factor) => factor.category === 'hazardous_attitude') ? (
                                                                    <div className="space-y-2.5">
                                                                        {humanFactors
                                                                            .map((factor, factorIndex) => ({ factor, factorIndex }))
                                                                            .filter(({ factor }) => factor.category === 'hazardous_attitude')
                                                                            .map(({ factor, factorIndex }) => (
                                                                                <div key={factor.id} className="rounded-lg border bg-background p-2.5 space-y-2.5">
                                                                                    <div className="flex items-start justify-between gap-3">
                                                                                        <div className="space-y-1 flex-1">
                                                                                            <Select
                                                                                                value={factor.label}
                                                                                                onValueChange={(value) => {
                                                                                                    const selected = HAZARDOUS_ATTITUDE_OPTIONS.find((option) => option.value === value);
                                                                                                    if (selected) {
                                                                                                        handleHumanFactorChange(index, factorIndex, {
                                                                                                            label: selected.label,
                                                                                                            category: 'hazardous_attitude',
                                                                                                            status: 'observed',
                                                                                                        });
                                                                                                    }
                                                                                                }}
                                                                                            >
                                                                                                <SelectTrigger>
                                                                                                    <SelectValue placeholder="Select hazardous attitude" />
                                                                                                </SelectTrigger>
                                                                                                <SelectContent>
                                                                                                    {getHazardousAttitudeOptions(factor.label).map((option) => (
                                                                                                        <SelectItem key={option.value} value={option.value}>
                                                                                                            {option.label}
                                                                                                        </SelectItem>
                                                                                                    ))}
                                                                                                </SelectContent>
                                                                                            </Select>
                                                                                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Observed hazardous attitude</p>
                                                                                        </div>
                                                                                        <Button
                                                                                            type="button"
                                                                                            variant="ghost"
                                                                                            size="icon"
                                                                                            className="text-destructive"
                                                                                            onClick={() => handleRemoveCriterion(index, factorIndex)}
                                                                                        >
                                                                                            <Trash2 className="h-4 w-4" />
                                                                                        </Button>
                                                                                    </div>
                                                                                    <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                                                                                        <Select
                                                                                            value={factor.status}
                                                                                            onValueChange={(value) => {
                                                                                                handleHumanFactorChange(index, factorIndex, { status: value as HumanFactorsStatus });
                                                                                            }}
                                                                                        >
                                                                                            <SelectTrigger>
                                                                                                <SelectValue placeholder="Select status" />
                                                                                            </SelectTrigger>
                                                                                            <SelectContent>
                                                                                                {HUMAN_FACTORS_OPTIONS.filter((option) => option.value !== 'not_applicable').map((option) => (
                                                                                                    <SelectItem key={option.value} value={option.value}>
                                                                                                        {option.label}
                                                                                                    </SelectItem>
                                                                                                ))}
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                        <Input
                                                                                            value={factor.comment || ''}
                                                                                            placeholder="Optional note"
                                                                                            onChange={(event) => {
                                                                                                handleHumanFactorChange(index, factorIndex, { comment: event.target.value });
                                                                                            }}
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-xs text-muted-foreground italic">No hazardous attitudes added for this debrief yet.</p>
                                                                )}
                                                            </div>

                                                            <FormField 
                                                                control={form.control} 
                                                                name={`entries.${index}.comment`} 
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Instructor Summary For This Exercise</FormLabel>
                                                                        <FormControl><Textarea placeholder="What went well, what needed intervention, and what should be reinforced next flight..." {...field} /></FormControl>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )} 
                                                            />

                                                            <div className="rounded-xl border bg-muted/5 p-4 space-y-4">
                                                                <div className="space-y-1">
                                                                    <p className="text-sm font-semibold">Instructor Recommendation</p>
                                                                    <p className="text-sm text-muted-foreground">Record the instructor handoff so the CFI / HoT can see what the instructor recommends for this exercise next.</p>
                                                                </div>

                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                    <FormField
                                                                        control={form.control}
                                                                        name={`entries.${index}.instructorRecommendationAction`}
                                                                        render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Recommended Action</FormLabel>
                                                                                <Select value={field.value || 'continue_current_phase'} onValueChange={field.onChange}>
                                                                                    <FormControl>
                                                                                        <SelectTrigger>
                                                                                            <SelectValue />
                                                                                        </SelectTrigger>
                                                                                    </FormControl>
                                                                                    <SelectContent>
                                                                                        {INSTRUCTOR_RECOMMENDATION_OPTIONS.map((option) => (
                                                                                            <SelectItem key={option.value} value={option.value}>
                                                                                                {option.label}
                                                                                            </SelectItem>
                                                                                        ))}
                                                                                    </SelectContent>
                                                                                </Select>
                                                                                <p className="text-xs text-muted-foreground">
                                                                                    {INSTRUCTOR_RECOMMENDATION_OPTIONS.find((option) => option.value === (field.value || 'continue_current_phase'))?.hint}
                                                                                </p>
                                                                                <FormMessage />
                                                                            </FormItem>
                                                                        )}
                                                                    />

                                                                    <FormField
                                                                        control={form.control}
                                                                        name={`entries.${index}.instructorRecommendationComment`}
                                                                        render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Recommendation Note</FormLabel>
                                                                                <FormControl>
                                                                                    <Textarea
                                                                                        placeholder="Capture why the instructor recommends repeating, continuing, progressing, or escalating this exercise."
                                                                                        {...field}
                                                                                    />
                                                                                </FormControl>
                                                                                <FormMessage />
                                                                            </FormItem>
                                                                        )}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-6">
                                        <FormField 
                                            control={form.control} 
                                            name="instructorSignatureUrl" 
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Instructor Signature</FormLabel>
                                                    <FormControl>
                                                        <SignaturePad 
                                                            onSignatureEnd={field.onChange} 
                                                            height={150} 
                                                            className="w-full"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )} 
                                        />
                                        <FormField 
                                            control={form.control} 
                                            name="studentSignatureUrl" 
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Student Acknowledgement</FormLabel>
                                                    <FormControl>
                                                        <SignaturePad 
                                                            onSignatureEnd={field.onChange} 
                                                            height={150} 
                                                            className="w-full"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )} 
                                        />
                                    </div>
                                </div>
                            </ScrollArea>

                            <div className="shrink-0 flex justify-end gap-4 p-6 border-t bg-muted/5">
                                <Button asChild variant="outline" type="button">
                                    <Link href="/bookings/history">Cancel</Link>
                                </Button>
                                <Button type="submit" disabled={!canEditDebrief}>
                                    <Save className="mr-2 h-4 w-4" /> Save Debrief
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}

export default function NewDebriefPage() {
    return (
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <NewDebriefContent />
        </Suspense>
    );
}


