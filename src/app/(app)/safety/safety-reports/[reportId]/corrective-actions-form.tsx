'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type {
  CorrectiveAction,
  CorrectiveActionStatus,
  ReportHazard,
  RiskAssessment,
  RiskLevel,
  SafetyReport,
} from '@/types/safety-report';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { CalendarIcon, CheckCircle2, Save, ShieldCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const mitigationReviewSchema = z.object({
  hazardId: z.string(),
  riskId: z.string(),
  mitigationId: z.string(),
  responsiblePersonId: z.string().optional(),
  completionDate: z.date().nullable().optional(),
  status: z.enum(['Open', 'In Progress', 'Closed', 'Cancelled']),
});

const reviewSchema = z.object({
  mitigationReviews: z.array(mitigationReviewSchema),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

type FlattenedMitigation = {
  hazardId: string;
  hazardDescription: string;
  riskId: string;
  riskDescription: string;
  riskAssessment: RiskAssessment;
  mitigationId: string;
  mitigationDescription: string;
  mitigationResidualRiskAssessment: RiskAssessment;
  reviewAction?: CorrectiveAction;
};

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return new Date(year, month - 1, day, 12);
};

const toNoonUtcIso = (date?: Date | null) =>
  date ? new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString() : null;

const getRiskLevel = (score: number): RiskLevel => {
  if (score <= 4) return 'Low';
  if (score <= 9) return 'Medium';
  if (score <= 16) return 'High';
  return 'Critical';
};

const getRiskLevelTone = (level: RiskLevel) => {
  switch (level) {
    case 'Critical':
      return 'border-red-300 bg-red-50 text-red-800';
    case 'High':
      return 'border-orange-300 bg-orange-50 text-orange-800';
    case 'Medium':
      return 'border-amber-300 bg-amber-50 text-amber-800';
    default:
      return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  }
};

const flattenMitigations = (hazards: ReportHazard[] = [], correctiveActions: CorrectiveAction[] = []): FlattenedMitigation[] =>
  hazards.flatMap((hazard) =>
    (hazard.risks || []).flatMap((risk) =>
      (risk.mitigations || []).map((mitigation) => ({
        hazardId: hazard.id,
        hazardDescription: hazard.description,
        riskId: risk.id,
        riskDescription: risk.description,
        riskAssessment: risk.riskAssessment,
        mitigationId: mitigation.id,
        mitigationDescription: mitigation.description,
        mitigationResidualRiskAssessment: mitigation.residualRiskAssessment,
        reviewAction: correctiveActions.find((action) => action.id === mitigation.id),
      }))
    )
  );

interface CorrectiveActionsFormProps {
  report: SafetyReport;
  tenantId: string;
  personnel: Personnel[];
  isStacked?: boolean;
  onReportSaved?: (report: SafetyReport) => void;
}

export function CorrectiveActionsForm({
  report,
  tenantId,
  personnel,
  isStacked = false,
  onReportSaved,
}: CorrectiveActionsFormProps) {
  const { toast } = useToast();
  const mitigationItems = useMemo(
    () => flattenMitigations(report.initialHazards || [], report.correctiveActions || []),
    [report.initialHazards, report.correctiveActions]
  );

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      mitigationReviews: mitigationItems.map((item) => ({
        hazardId: item.hazardId,
        riskId: item.riskId,
        mitigationId: item.mitigationId,
        responsiblePersonId: item.reviewAction?.responsiblePersonId || '',
        completionDate: parseLocalDate(item.reviewAction?.deadline),
        status: item.reviewAction?.status || 'Open',
      })),
    },
  });

  useEffect(() => {
    form.reset({
      mitigationReviews: mitigationItems.map((item) => ({
        hazardId: item.hazardId,
        riskId: item.riskId,
        mitigationId: item.mitigationId,
        responsiblePersonId: item.reviewAction?.responsiblePersonId || '',
        completionDate: parseLocalDate(item.reviewAction?.deadline),
        status: item.reviewAction?.status || 'Open',
      })),
    });
  }, [form, mitigationItems]);

  const onSubmit = async (values: ReviewFormValues) => {
    const reviewMap = new Map(
      values.mitigationReviews.map((review) => [`${review.hazardId}:${review.riskId}:${review.mitigationId}`, review] as const)
    );

    const nextHazards = (report.initialHazards || []).map((hazard) => ({
      ...hazard,
      risks: (hazard.risks || []).map((risk) => ({
        ...risk,
        mitigations: (risk.mitigations || []).map((mitigation) => {
          const review = reviewMap.get(`${hazard.id}:${risk.id}:${mitigation.id}`);
          if (!review) return mitigation;
          return {
            ...mitigation,
            responsiblePersonId: review.responsiblePersonId || undefined,
            completionDate: toNoonUtcIso(review.completionDate),
            status: review.status as CorrectiveActionStatus,
          };
        }),
      })),
    }));

    const nextReport: SafetyReport = {
      ...report,
      initialHazards: nextHazards,
      correctiveActions: values.mitigationReviews.map((review) => {
        const item = mitigationItems.find((entry) => entry.mitigationId === review.mitigationId);
        const residual = item?.mitigationResidualRiskAssessment;
        return {
          id: review.mitigationId,
          description: item?.mitigationDescription || '',
          responsiblePersonId: review.responsiblePersonId || '',
          hazardId: review.hazardId,
          riskId: review.riskId,
          riskAssessmentView: 'Residual',
          residualLikelihood: residual?.likelihood ?? null,
          residualSeverity: residual?.severity ?? null,
          residualRiskScore: residual?.riskScore ?? null,
          residualRiskLevel: residual?.riskLevel ?? null,
          deadline: toNoonUtcIso(review.completionDate) || new Date().toISOString(),
          status: review.status as CorrectiveActionStatus,
        } satisfies CorrectiveAction;
      }),
    };

    try {
      const response = await fetch(`/api/safety-reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: nextReport }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to save corrective actions review.');
      }

      const payload = await response.json().catch(() => null);
      if (payload?.report) {
        onReportSaved?.(payload.report as SafetyReport);
      }

      toast({ title: 'Corrective Actions Review Saved' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to save corrective actions review.',
      });
    }
  };

  return (
    <div className={cn('flex flex-col h-full', !isStacked && 'overflow-hidden')}>
      <div className="shrink-0 border-b bg-muted/5 p-4">
        <h3 className="text-lg font-black uppercase tracking-tight">Corrective Actions Review</h3>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          Review and close the mitigation actions already defined under Hazard & Risk Identification.
        </p>
      </div>
      <div className={cn('flex-1 p-0 overflow-hidden flex flex-col', isStacked && 'overflow-visible h-auto')}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
            {isStacked ? (
              <div className="p-6 space-y-4">
                <ReviewFields items={mitigationItems} form={form} personnel={personnel} />
              </div>
            ) : (
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-4">
                  <ReviewFields items={mitigationItems} form={form} personnel={personnel} />
                </div>
              </ScrollArea>
            )}
            {!isStacked && (
              <div className="shrink-0 flex justify-end p-4 border-t bg-muted/5 gap-2 no-print">
                <Button type="submit" className="font-black uppercase text-xs h-10 px-8 shadow-md">
                  <Save className="mr-2 h-4 w-4" /> Save Corrective Actions Review
                </Button>
              </div>
            )}
          </form>
        </Form>
      </div>
    </div>
  );
}

function ReviewFields({
  items,
  form,
  personnel,
}: {
  items: FlattenedMitigation[];
  form: ReturnType<typeof useForm<ReviewFormValues>>;
  personnel: Personnel[];
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
        <CheckCircle2 className="h-12 w-12 mb-4" />
        <p className="text-sm font-black uppercase tracking-widest">No mitigation actions to review.</p>
        <p className="text-xs font-medium">Add mitigations under Hazard & Risk Identification first, then review them here.</p>
      </div>
    );
  }

  return (
    <>
      {items.map((item, index) => (
        <div key={item.mitigationId} className="rounded-lg border bg-muted/10 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-500" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              Corrective Action {index + 1}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard label="Hazard" value={item.hazardDescription} />
            <InfoCard label="Risk" value={item.riskDescription} />
          </div>

          <div className="rounded-lg border bg-background px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Mitigation / Control</p>
            <p className="mt-2 text-sm font-medium text-foreground whitespace-pre-wrap">
              {item.mitigationDescription || 'No mitigation description entered.'}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
            <RiskSummaryCard title="Initial Risk" assessment={item.riskAssessment} />
            <div className="hidden lg:flex items-center justify-center px-1">
              <Badge variant="outline" className="text-[9px] font-black uppercase">
                Reduced To
              </Badge>
            </div>
            <RiskSummaryCard title="Residual Risk" assessment={item.mitigationResidualRiskAssessment} />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField
              control={form.control}
              name={`mitigationReviews.${index}.responsiblePersonId`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Assignee</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger className="h-9 border-slate-200 bg-white text-xs font-bold">
                        <SelectValue placeholder="Assign to..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {personnel.map((person) => (
                        <SelectItem key={person.id} value={person.id} className="text-xs">
                          {person.firstName} {person.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`mitigationReviews.${index}.completionDate`}
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Deadline</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'h-9 pl-3 text-left font-bold bg-white text-xs border-slate-200',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? format(field.value, 'dd MMM yyyy') : <span>Select date</span>}
                          <CalendarIcon className="ml-auto h-3 w-3 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CustomCalendar selectedDate={field.value ?? undefined} onDateSelect={field.onChange} />
                    </PopoverContent>
                  </Popover>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`mitigationReviews.${index}.status`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-9 border-slate-200 bg-white text-xs font-bold">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {['Open', 'In Progress', 'Closed', 'Cancelled'].map((status) => (
                        <SelectItem key={status} value={status} className="text-xs">
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
        </div>
      ))}
    </>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value || '-'}</p>
    </div>
  );
}

function RiskSummaryCard({ title, assessment }: { title: string; assessment: RiskAssessment }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
        <Badge className={cn('text-[9px] font-black uppercase border', getRiskLevelTone(assessment.riskLevel))}>
          {assessment.riskLevel}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-md border bg-muted/10 px-2 py-2 text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">Score</p>
          <p className="mt-1 text-sm font-black text-foreground">{assessment.riskScore}</p>
        </div>
        <div className="rounded-md border bg-muted/10 px-2 py-2 text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">Likelihood</p>
          <p className="mt-1 text-sm font-black text-foreground">{assessment.likelihood}</p>
        </div>
        <div className="rounded-md border bg-muted/10 px-2 py-2 text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">Severity</p>
          <p className="mt-1 text-sm font-black text-foreground">{assessment.severity}</p>
        </div>
      </div>
    </div>
  );
}
