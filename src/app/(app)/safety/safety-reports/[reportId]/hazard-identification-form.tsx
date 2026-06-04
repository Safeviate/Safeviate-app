'use client';

import React from 'react';
import { useForm, useFieldArray, useFormContext, Controller, FormProvider, type UseFormReturn, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { CorrectiveAction, ReportHazard, SafetyReport } from '@/types/safety-report';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { PlusCircle, Trash2, Save, AlertTriangle, ShieldCheck, CalendarIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// --- Helper Functions ---
const getRiskLevel = (score: number): 'Low' | 'Medium' | 'High' | 'Critical' => {
    if (score <= 4) return 'Low';
    if (score <= 9) return 'Medium';
    if (score <= 16) return 'High';
    return 'Critical';
}

const getRiskScoreColor = (
    likelihood: number,
    severity: number,
    colors?: Record<string, string>
  ): { backgroundColor: string; color: string } => {
    const severityToLetter: Record<number, string> = { 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'E' };
    const severityLetter = severityToLetter[severity] || 'E';
    const cellId = `${likelihood}${severityLetter}`;
    
    if (colors && colors[cellId]) {
        const hex = colors[cellId].replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        const textColor = (yiq >= 128) ? 'black' : 'white';
        return { backgroundColor: colors[cellId], color: textColor };
    }
    
    const score = likelihood * severity;
    if (score > 9) return { backgroundColor: '#ef4444', color: 'white' };
    if (score > 4) return { backgroundColor: '#f59e0b', color: 'black' };
    return { backgroundColor: '#10b981', color: 'white' };
};

const buildRiskAssessmentPath = (
    basePath: `initialHazards.${number}.risks.${number}.riskAssessment`,
    field: 'likelihood' | 'severity' | 'riskScore' | 'riskLevel',
): FieldPath<FormValues> => `${basePath}.${field}` as FieldPath<FormValues>;

const deriveCorrectiveActionsFromHazards = (
    hazards: ReportHazard[],
    existingActions: CorrectiveAction[] = [],
): CorrectiveAction[] =>
    hazards.flatMap((hazard) =>
        (hazard.risks || []).flatMap((risk) =>
            (risk.mitigations || []).map((mitigation) => {
                const existingAction = existingActions.find((action) => action.id === mitigation.id);
                const residual = mitigation.residualRiskAssessment;
                return {
                    id: mitigation.id,
                    description: mitigation.description,
                    responsiblePersonId: existingAction?.responsiblePersonId || '',
                    hazardId: hazard.id,
                    riskId: risk.id,
                    riskAssessmentView: 'Residual',
                    residualLikelihood: residual.likelihood,
                    residualSeverity: residual.severity,
                    residualRiskScore: residual.riskScore,
                    residualRiskLevel: residual.riskLevel,
                    deadline: existingAction?.deadline || new Date().toISOString(),
                    status: existingAction?.status || 'Open',
                } satisfies CorrectiveAction;
            }),
        ),
    );

// --- Form Schemas ---
const riskAssessmentSchema = z.object({
    severity: z.number().min(1).max(5),
    likelihood: z.number().min(1).max(5),
    riskScore: z.number(),
    riskLevel: z.enum(["Low", "Medium", "High", "Critical"]),
});

const reportRiskSchema = z.object({
    id: z.string(),
    description: z.string().default(''),
    riskAssessment: riskAssessmentSchema,
    mitigations: z.array(z.object({
      id: z.string(),
      description: z.string().default(''),
      residualRiskAssessment: riskAssessmentSchema,
    })).default([]),
});

const reportHazardSchema = z.object({
    id: z.string(),
    description: z.string().default(''),
    risks: z.array(reportRiskSchema).optional(),
});

const hazardIdentificationSchema = z.object({
  initialHazards: z.array(reportHazardSchema),
});

type FormValues = z.infer<typeof hazardIdentificationSchema>;

const RiskAssessmentEditor = ({
    path,
    label,
    riskMatrixColors,
    compact = false,
}: {
    path: string;
    label: string;
    riskMatrixColors?: Record<string, string>;
    compact?: boolean;
}) => {
    const { control, setValue, watch } = useFormContext<FormValues>();
    const likelihoodPath = buildRiskAssessmentPath(path as `initialHazards.${number}.risks.${number}.riskAssessment`, 'likelihood');
    const severityPath = buildRiskAssessmentPath(path as `initialHazards.${number}.risks.${number}.riskAssessment`, 'severity');
    const riskScorePath = buildRiskAssessmentPath(path as `initialHazards.${number}.risks.${number}.riskAssessment`, 'riskScore');
    const riskLevelPath = buildRiskAssessmentPath(path as `initialHazards.${number}.risks.${number}.riskAssessment`, 'riskLevel');

    const likelihood = Number(watch(likelihoodPath)) || 1;
    const severity = Number(watch(severityPath)) || 1;
    
    const riskScore = likelihood * severity;
    const riskLevel = getRiskLevel(riskScore);
    const riskColors = getRiskScoreColor(likelihood, severity, riskMatrixColors);

    const likelihoodLabels: Record<number, string> = {
        5: 'Frequent', 4: 'Occasional', 3: 'Remote', 2: 'Improbable', 1: 'Ext. Improbable',
    };
    
    const severityLabels: Record<number, { letter: string; name: string }> = {
        5: { letter: 'A', name: 'Catastrophic' },
        4: { letter: 'B', name: 'Hazardous' },
        3: { letter: 'C', name: 'Major' },
        2: { letter: 'D', name: 'Minor' },
        1: { letter: 'E', name: 'Negligible' },
    };

    React.useEffect(() => {
        setValue(riskScorePath, riskScore);
        setValue(riskLevelPath, riskLevel);
    }, [riskScore, riskLevel, riskScorePath, riskLevelPath, setValue]);

    const editorContent = (
        <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4", compact && "gap-4")}>
            <Controller 
                control={control} 
                name={likelihoodPath} 
                render={({ field: { onChange, value } }) => {
                    const selectedLikelihood = Number(value) || 1;
                    return (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-baseline gap-1.5 min-w-0">
                            <Label className="text-[10px] uppercase font-black opacity-70 whitespace-nowrap">Likelihood:</Label>
                            <span className="text-[10px] font-black uppercase truncate">{likelihoodLabels[selectedLikelihood]}</span>
                        </div>
                        <div className="flex gap-1 overflow-x-auto no-scrollbar">
                            {[1, 2, 3, 4, 5].map((num) => (
                                <Button
                                    key={num}
                                    type="button"
                                    variant={selectedLikelihood === num ? "default" : "outline"}
                                    size="icon"
                                    className={cn(
                                        compact ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs",
                                        "font-bold transition-all shrink-0",
                                        selectedLikelihood === num 
                                            ? "bg-white text-black shadow-md border-white" 
                                            : "bg-transparent hover:bg-white/10 border-current opacity-70"
                                    )}
                                    onClick={() => onChange(num)}
                                >
                                    {num}
                                </Button>
                            ))}
                        </div>
                    </div>
                );}} 
            />
            <Controller 
                control={control} 
                name={severityPath} 
                render={({ field: { onChange, value } }) => {
                    const selectedSeverity = Number(value) || 1;
                    return (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-baseline gap-1.5 min-w-0">
                            <Label className="text-[10px] uppercase font-black opacity-70 whitespace-nowrap">Severity:</Label>
                            <span className="text-[10px] font-black uppercase truncate">{severityLabels[selectedSeverity]?.name}</span>
                        </div>
                        <div className="flex gap-1 overflow-x-auto no-scrollbar">
                            {[5, 4, 3, 2, 1].map((num) => (
                                <Button
                                    key={num}
                                    type="button"
                                    variant={selectedSeverity === num ? "default" : "outline"}
                                    size="icon"
                                    className={cn(
                                        compact ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs",
                                        "font-bold transition-all shrink-0",
                                        selectedSeverity === num 
                                            ? "bg-white text-black shadow-md border-white" 
                                            : "bg-transparent hover:bg-white/10 border-current opacity-70"
                                    )}
                                    onClick={() => onChange(num)}
                                >
                                    {severityLabels[num]?.letter}
                                </Button>
                            ))}
                        </div>
                    </div>
                );}}
            />
        </div>
    );

    if (compact) {
        return (
            <div className="mb-3 rounded-lg border bg-muted/10 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                    <Badge
                        variant="outline"
                        className="h-6 shrink-0 border-transparent text-[10px] font-black text-white"
                        style={{ backgroundColor: riskColors.backgroundColor }}
                    >
                        {likelihood}{severityLabels[(severity as number) || 1]?.letter} - {riskLevel}
                    </Badge>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <FormField
                        control={control}
                        name={likelihoodPath}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                                    {label} Likelihood
                                </FormLabel>
                                <Select
                                    onValueChange={(value) => field.onChange(Number(value))}
                                    value={field.value ? String(field.value) : '1'}
                                >
                                    <FormControl>
                                        <SelectTrigger className="h-9 border-slate-200 bg-white text-xs font-bold">
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {[1, 2, 3, 4, 5].map((value) => (
                                            <SelectItem key={value} value={String(value)} className="text-xs">
                                                {value} - {likelihoodLabels[value]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name={severityPath}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                                    {label} Severity
                                </FormLabel>
                                <Select
                                    onValueChange={(value) => field.onChange(Number(value))}
                                    value={field.value ? String(field.value) : '1'}
                                >
                                    <FormControl>
                                        <SelectTrigger className="h-9 border-slate-200 bg-white text-xs font-bold">
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {[1, 2, 3, 4, 5].map((value) => (
                                            <SelectItem key={value} value={String(value)} className="text-xs">
                                                {severityLabels[value]?.letter} - {severityLabels[value]?.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )}
                    />
                </div>
            </div>
        );
    }

    return (
        <div 
            className="border border-slate-200 rounded-xl p-4 mb-4 transition-colors"
            style={{ backgroundColor: riskColors.backgroundColor, color: riskColors.color }}
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 opacity-70" />
                    <h5 className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</h5>
                </div>
                <Badge variant="outline" className="h-6 font-black text-[10px] border-white/20 bg-white/10 text-inherit">
                    {likelihood}{severityLabels[(severity as number) || 1]?.letter} - {riskLevel}
                </Badge>
            </div>
            {editorContent}
        </div>
    );
};

const MitigationsArray = ({ hazardIndex, riskIndex, riskMatrixColors }: {
    hazardIndex: number;
    riskIndex: number;
    riskMatrixColors?: Record<string, string>;
}) => {
    const { control } = useFormContext<FormValues>();
    const basePath = `initialHazards.${hazardIndex}.risks.${riskIndex}.mitigations` as const;
    const { fields, append, remove } = useFieldArray({
        control,
        name: basePath,
    });

    return (
        <div className="space-y-3 border-t border-slate-100 pt-3">
            <div className="flex justify-end">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-[10px] font-black uppercase border-slate-300 no-print"
                    onClick={() => append({
                        id: uuidv4(),
                        description: '',
                        residualRiskAssessment: { likelihood: 1, severity: 1, riskScore: 1, riskLevel: 'Low' },
                    })}
                >
                    <PlusCircle className="mr-1 h-3 w-3" /> Add Corrective Action
                </Button>
            </div>
            {fields.map((field, mitigationIndex) => (
                <div key={field.id} className="rounded-lg border bg-background p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Mitigation {mitigationIndex + 1}</span>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(mitigationIndex)}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <FormField
                        control={control}
                        name={`${basePath}.${mitigationIndex}.description`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Mitigation / Control</FormLabel>
                                <FormControl>
                                    <textarea
                                        placeholder="Describe the mitigation action to reduce this risk..."
                                        {...field}
                                        className="w-full min-h-[56px] rounded-md border border-slate-200 bg-white p-3 text-sm focus-visible:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <RiskAssessmentEditor
                        path={`${basePath}.${mitigationIndex}.residualRiskAssessment`}
                        label="Residual Risk"
                        riskMatrixColors={riskMatrixColors}
                        compact
                    />
                </div>
            ))}
        </div>
    );
};

const RisksArray = ({ hazardIndex, riskMatrixColors }: { hazardIndex: number; riskMatrixColors?: Record<string, string> }) => {
    const { control } = useFormContext<FormValues>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: `initialHazards.${hazardIndex}.risks`,
    });

    return (
        <div className="space-y-3 pl-0 mt-3">
            {fields.map((field, riskIndex) => (
                <div key={field.id} className="p-3 bg-muted/30 border rounded-lg space-y-3">
                    <div className="flex items-start gap-2">
                        <FormField
                            control={control}
                            name={`initialHazards.${hazardIndex}.risks.${riskIndex}.description`}
                            render={({ field }) => (
                                <FormItem className="flex-1">
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Identified Risk / Outcome</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., Loss of separation, Mid-air collision" {...field} className="h-8 text-xs bg-background font-medium" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => remove(riskIndex)} 
                            className="h-8 w-8 text-destructive mt-5 no-print"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <RiskAssessmentEditor 
                        path={`initialHazards.${hazardIndex}.risks.${riskIndex}.riskAssessment`}
                        label="Initial Risk"
                        riskMatrixColors={riskMatrixColors}
                        compact
                    />
                    <MitigationsArray hazardIndex={hazardIndex} riskIndex={riskIndex} riskMatrixColors={riskMatrixColors} />
                </div>
            ))}
            <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => append({ 
                    id: uuidv4(), 
                    description: '', 
                    riskAssessment: { likelihood: 1, severity: 1, riskScore: 1, riskLevel: 'Low' },
                    mitigations: [],
                })}
                className="h-7 px-3 text-[10px] font-black uppercase border-slate-300 no-print"
            >
                <PlusCircle className="mr-1 h-3 w-3" /> Add Risk Impact
            </Button>
        </div>
    );
};

interface HazardIdentificationFormProps {
  report: SafetyReport;
  tenantId: string;
  personnel?: Personnel[];
  riskMatrixColors?: Record<string, string>;
  isStacked?: boolean;
  onReportSaved?: (report: SafetyReport) => void;
}

export function HazardIdentificationForm({ report, tenantId, personnel = [], riskMatrixColors, isStacked = false, onReportSaved }: HazardIdentificationFormProps) {
  const { toast } = useToast();
  const activeRiskMatrixColors = riskMatrixColors;
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const normalizedHazards = React.useMemo(
    () => (report.initialHazards || []).map((hazard) => ({
      ...hazard,
      risks: (hazard.risks || []).map((risk) => ({
        ...risk,
        mitigations: (risk.mitigations || []).map((mitigation) => ({
          id: mitigation.id,
          description: mitigation.description || '',
          residualRiskAssessment: mitigation.residualRiskAssessment,
        })),
      })),
    })),
    [report.initialHazards]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(hazardIdentificationSchema),
    defaultValues: {
      initialHazards: normalizedHazards,
    },
  });

  React.useEffect(() => {
    form.reset({
      initialHazards: normalizedHazards,
    });
  }, [form, normalizedHazards]);

  const { fields: hazardFields, append: appendHazard, remove: removeHazard } = useFieldArray({
    control: form.control,
    name: "initialHazards",
  });

  const onSubmit = async (values: FormValues) => {
    try {
      setSaveError(null);
      const dataToSave = {
        initialHazards: values.initialHazards.map((hazard) => ({
          ...hazard,
          description: hazard.description?.trim() || '',
          risks: (hazard.risks || []).map((risk) => ({
            ...risk,
            description: risk.description?.trim() || '',
            mitigations: (risk.mitigations || []).map((mitigation) => ({
              id: mitigation.id,
              description: mitigation.description?.trim() || '',
              residualRiskAssessment: mitigation.residualRiskAssessment,
            })),
          })),
        })),
      };
      const correctiveActions = deriveCorrectiveActionsFromHazards(
        dataToSave.initialHazards as ReportHazard[],
        report.correctiveActions || [],
      );
      const response = await fetch(`/api/safety-reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: { ...report, ...dataToSave, correctiveActions } }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to save hazard identification.');
      }
      const payload = await response.json().catch(() => null);
      if (payload?.report) {
        onReportSaved?.(payload.report as SafetyReport);
      }
      toast({ title: 'Hazard Identification Saved' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save hazard identification.';
      setSaveError(message);
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: message,
      });
    }
  };

  const onInvalid = () => {
    const message = 'Some hazard fields are still invalid. Save drafts should still work, so this indicates a form-shape problem that needs attention.';
    setSaveError(message);
    toast({
      variant: 'destructive',
      title: 'Save blocked',
      description: message,
    });
  };

  return (
    <div className={cn("flex flex-col h-full", !isStacked && "overflow-hidden")}>
      <div className="shrink-0 border-b bg-muted/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-lg font-black uppercase tracking-tight">Hazard & Risk Identification</h3>
        <Button type="button" size="sm" onClick={() => appendHazard({ id: uuidv4(), description: '', risks: [] })} className="font-black uppercase text-xs h-9 px-6 shadow-md no-print">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Hazard
        </Button>
      </div>
      <div className={cn("flex-1 p-0 overflow-hidden flex flex-col", isStacked && "overflow-visible h-auto")}>
        <FormProvider {...form}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="h-full flex flex-col">
              {saveError ? (
                <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-destructive">Hazard Save Error</p>
                  <p className="mt-1 text-sm font-medium text-destructive">{saveError}</p>
                </div>
              ) : null}
              {isStacked ? (
                <div className="p-6 space-y-6">
                  <HazardFields hazardFields={hazardFields} form={form} riskMatrixColors={activeRiskMatrixColors} removeHazard={removeHazard} />
                </div>
              ) : (
                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-6">
                    <HazardFields hazardFields={hazardFields} form={form} riskMatrixColors={activeRiskMatrixColors} removeHazard={removeHazard} />
                  </div>
                </ScrollArea>
              )}
              {!isStacked && (
                <div className="shrink-0 flex justify-end p-4 border-t bg-muted/5 gap-2 no-print">
                    <Button type="submit" className="font-black uppercase text-xs h-10 px-8 shadow-md">
                    <Save className="mr-2 h-4 w-4" /> Save Hazard Identification
                    </Button>
                </div>
              )}
            </form>
          </Form>
        </FormProvider>
      </div>
    </div>
  );
}

function HazardFields({ hazardFields, form, riskMatrixColors, removeHazard }: { hazardFields: Array<{ id: string }>; form: UseFormReturn<FormValues>; riskMatrixColors?: Record<string, string>; removeHazard: (i: number) => void }) {
  return (
    <>
      {hazardFields.map((field, index) => (
          <div key={field.id} className="rounded-xl border bg-muted/10 overflow-hidden border-slate-200">
              <div className="p-4 border-b bg-background/50">
                  <div className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-black">
                          {index + 1}
                      </div>
                      <FormField control={form.control} name={`initialHazards.${index}.description`} render={({ field }) => (
                          <FormItem className='flex-1 space-y-0'>
                              <FormControl>
                                  <Input placeholder="Describe the hazard (e.g., Bird strike on final)..." {...field} className="h-9 text-sm font-black bg-background border-slate-300" />
                              </FormControl>
                          </FormItem>
                      )} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeHazard(index)} className="text-destructive no-print hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                  </div>
              </div>
              <div className="p-4 pt-2">
                  <RisksArray hazardIndex={index} riskMatrixColors={riskMatrixColors} />
              </div>
          </div>
      ))}
      {hazardFields.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
              <AlertTriangle className="h-12 w-12 mb-4" />
              <p className="text-sm font-black uppercase tracking-widest">No hazards identified yet.</p>
              <p className="text-xs font-medium">Start by identifying the primary hazards associated with this report.</p>
          </div>
      )}
    </>
  );
}
