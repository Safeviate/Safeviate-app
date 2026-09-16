'use client';

import { useForm, useFieldArray, Controller, FormProvider, useFormContext, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { Risk, RiskItem, Mitigation, RiskMatrixSettings, RiskRegisterSettings } from '@/types/risk';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { CalendarIcon, PlusCircle, Trash2, ChevronDown, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';

const parseLocalDate = (value?: string | null) => {
    if (!value) return undefined;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return new Date(value);
    return new Date(year, month - 1, day, 12);
};

// --- Zod Schemas ---
const riskAssessmentSchema = z.object({
    severity: z.number().min(1).max(5),
    likelihood: z.number().min(1).max(5),
    riskScore: z.number(),
    riskLevel: z.enum(["Low", "Medium", "High", "Critical"]),
});

const mitigationSchema = z.object({
    id: z.string(),
    description: z.string().min(1, "Mitigation description is required."),
    responsiblePersonId: z.string().min(1, "Assignee is required."),
    reviewDate: z.date(),
    residualRiskAssessment: riskAssessmentSchema.optional(),
});

const trainingClassificationSchema = z.object({
    status: z.enum(['Unclassified', 'Proposed', 'Active']),
    audience: z.enum(['Instructors', 'Students', 'Both', 'All Personnel']),
    trainingArea: z.string(),
    learningObjective: z.string(),
    notes: z.string(),
    updatedAt: z.string().optional(),
});

const riskItemSchema: z.ZodType<Omit<RiskItem, 'mitigations'> & { mitigations: z.infer<typeof mitigationSchema>[] }> = z.lazy(() => z.object({
    id: z.string(),
    description: z.string().min(1, "Risk description is required"),
    initialRiskAssessment: riskAssessmentSchema.optional(),
    mitigations: z.array(mitigationSchema),
    trainingClassification: trainingClassificationSchema.optional(),
}));

const formSchema = z.object({
  hazardArea: z.string().min(1, 'Hazard area is required.'),
  hazard: z.string().min(1, 'Hazard description is required.'),
  risks: z.array(riskItemSchema).min(1, "At least one risk must be added."),
});

export type RiskFormValues = z.infer<typeof formSchema>;

// --- Helper Functions ---
const mapDatesToObjects = (risk?: Risk | null): RiskFormValues => {
    if (!risk) {
        return {
            hazardArea: '',
            hazard: '',
            risks: [],
        };
    }
    return {
        hazardArea: risk.hazardArea,
        hazard: risk.hazard,
        risks: (risk.risks || []).map(r => ({
            ...r,
            mitigations: (r.mitigations || []).map(m => ({
                ...m,
                reviewDate: parseLocalDate(m.reviewDate) || new Date(),
            }))
        }))
    };
};

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
): FieldPath<RiskFormValues> => `${basePath}.${field}` as FieldPath<RiskFormValues>;

// --- Risk Assessment Component ---
const RiskAssessmentEditor: React.FC<{ path: string; label: string; riskMatrixColors?: Record<string, string> }> = ({ path, label, riskMatrixColors }) => {
    const { control, setValue, watch } = useFormContext<RiskFormValues>();
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
                    {likelihood}{severityLabels[severity]?.letter} — {riskLevel}
                </Badge>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
                <Controller 
                    control={control} 
                    name={likelihoodPath} 
                    render={({ field: { onChange, value } }) => {
                        const selectedLikelihood = Number(value) || 1;
                        return (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex items-baseline gap-1.5 min-w-0 sm:min-w-[180px]">
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
                                            "h-8 w-8 text-xs font-bold transition-all shrink-0",
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
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex items-baseline gap-1.5 min-w-0 sm:min-w-[180px]">
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
                                            "h-8 w-8 text-xs font-bold transition-all shrink-0",
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
        </div>
    );
}

// --- Nested Field Arrays ---

const MitigationsArray = ({ riskIndex, personnel, riskMatrixColors }: { riskIndex: number; personnel: Personnel[]; riskMatrixColors?: Record<string, string> }) => {
    const { control } = useFormContext<RiskFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: `risks.${riskIndex}.mitigations` });

    return (
        <div className='pl-0 sm:pl-6 mt-4 space-y-4'>
            {fields.map((field, mitigationIndex) => (
                <div key={field.id} className="p-4 border rounded-xl bg-background shadow-sm border-slate-200">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <FormField control={control} name={`risks.${riskIndex}.mitigations.${mitigationIndex}.description`} render={({ field }) => ( <FormItem className="md:col-span-4"><FormLabel className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Mitigation Action</FormLabel><FormControl><Textarea placeholder='Describe the mitigation...' {...field} className="min-h-[80px] bg-muted/5 font-medium text-sm" /></FormControl><FormMessage /></FormItem> )} />
                      <FormField control={control} name={`risks.${riskIndex}.mitigations.${mitigationIndex}.responsiblePersonId`} render={({ field }) => ( <FormItem><FormLabel className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Assignee</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}> <FormControl><SelectTrigger className="h-9 bg-muted/5"><SelectValue placeholder="Assign..." /></SelectTrigger></FormControl><SelectContent>{personnel.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.firstName} {p.lastName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
                      <FormField control={control} name={`risks.${riskIndex}.mitigations.${mitigationIndex}.reviewDate`} render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Review Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("h-9 pl-3 text-left font-bold bg-muted/5 text-xs border-slate-300", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd MMM yyyy") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-3 w-3 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CustomCalendar selectedDate={field.value} onDateSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem>)}/>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(mitigationIndex)} className="h-9 w-9 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                  </div>
                  <div className="mt-4"><RiskAssessmentEditor path={`risks.${riskIndex}.mitigations.${mitigationIndex}.residualRiskAssessment`} label="Residual Risk Assessment" riskMatrixColors={riskMatrixColors} /></div>
                </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => append({ id: uuidv4(), description: '', responsiblePersonId: '', reviewDate: new Date(), residualRiskAssessment: { likelihood: 1, severity: 1, riskScore: 1, riskLevel: 'Low' } })} className="w-full h-9 border-dashed border-2 font-black uppercase text-[9px] tracking-widest bg-muted/5">
                <PlusCircle className="mr-2 h-3.5 w-3.5" /> Add Mitigation Control
            </Button>
        </div>
    )
}

const RisksArray = ({ personnel, riskMatrixColors }: { personnel: Personnel[]; riskMatrixColors?: Record<string, string> }) => {
    const { control } = useFormContext<RiskFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: `risks` });

    return (
        <div className="space-y-4">
            {fields.map((field, riskIndex) => (
                <Collapsible key={field.id} defaultOpen>
                    <Card className="bg-muted/10 border-none shadow-none rounded-xl overflow-hidden">
                        <CardHeader className="flex flex-row items-center p-4 bg-muted/20 border-b">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="icon" className="mr-2 h-8 w-8 [&[data-state=open]>svg]:rotate-180">
                                    <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                                </Button>
                            </CollapsibleTrigger>
                            <div className="flex-1">
                                <FormField control={control} name={`risks.${riskIndex}.description`} render={({ field }) => ( <FormItem><FormLabel className="sr-only">Risk</FormLabel><FormControl><Input placeholder='Describe the potential risk outcome...' {...field} className="bg-background font-bold text-sm h-10" /></FormControl><FormMessage /></FormItem> )}/>
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="text-destructive ml-2" onClick={() => remove(riskIndex)}><Trash2 className="h-4 w-4" /></Button>
                        </CardHeader>
                        <CollapsibleContent>
                            <CardContent className="space-y-4 p-4 pt-6">
                                <RiskAssessmentEditor path={`risks.${riskIndex}.initialRiskAssessment`} label="Initial Risk Assessment" riskMatrixColors={riskMatrixColors} />
                                <h4 className="font-black text-[9px] uppercase text-muted-foreground pt-4 border-t tracking-[0.2em] mb-2">Mitigations & Controls</h4>
                                <MitigationsArray riskIndex={riskIndex} personnel={personnel} riskMatrixColors={riskMatrixColors} />
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            ))}
            <Button type="button" variant="outline" className="w-full h-12 border-dashed border-2 font-black uppercase text-[10px] tracking-widest bg-primary/5 text-primary hover:bg-primary/10" onClick={() => append({ id: uuidv4(), description: '', initialRiskAssessment: { likelihood: 1, severity: 1, riskScore: 1, riskLevel: 'Low' }, mitigations: [] })}><PlusCircle className="mr-2 h-4 w-4" /> Define New Risk Potential</Button>
        </div>
    )
}


// --- Main Form Component ---
interface RiskFormProps {
  existingRisk?: Risk | null;
  personnel: Personnel[];
  onCancel?: () => void;
  hideHeader?: boolean;
}

export function RiskForm({ existingRisk, personnel, onCancel, hideHeader = false }: RiskFormProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { tenantId } = useUserProfile();
  const [hazardAreas, setHazardAreas] = React.useState<string[]>([]);
  const [riskMatrixSettings, setRiskMatrixSettings] = React.useState<RiskMatrixSettings | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [areasResponse, matrixResponse] = await Promise.all([
          fetch('/api/risk-register/areas', { cache: 'no-store' }),
          fetch('/api/risk-matrix', { cache: 'no-store' }),
        ]);
        const [areasPayload, matrixPayload] = await Promise.all([
          areasResponse.json().catch(() => ({ areas: [] })),
          matrixResponse.json().catch(() => ({ configuration: null })),
        ]);
        if (cancelled) return;
        setHazardAreas(Array.isArray(areasPayload?.areas) ? areasPayload.areas : []);
        if (matrixPayload?.configuration && typeof matrixPayload.configuration === 'object') {
          const parsed = matrixPayload.configuration as Partial<RiskMatrixSettings>;
          setRiskMatrixSettings({
            id: 'risk-matrix-config',
            colors: parsed.colors || {},
            likelihoodDefinitions: parsed.likelihoodDefinitions,
            severityDefinitions: parsed.severityDefinitions,
          });
        }
      } catch {
        if (!cancelled) {
          setHazardAreas([]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const form = useForm<RiskFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: mapDatesToObjects(existingRisk),
  });

  const onSubmit = async (data: RiskFormValues) => {
    if (!tenantId) return;
    setIsSubmitting(true);
    
    // Convert dates back to ISO strings before saving
    const dataToSave = {
        ...data,
        risks: data.risks.map(risk => ({
            ...risk,
            mitigations: risk.mitigations.map(mitigation => ({
                ...mitigation,
                reviewDate: new Date(Date.UTC(mitigation.reviewDate.getFullYear(), mitigation.reviewDate.getMonth(), mitigation.reviewDate.getDate(), 12)).toISOString()
            }))
        }))
    };

    try {
        const payload = {
          risk: existingRisk
            ? { ...existingRisk, ...dataToSave }
            : { id: uuidv4(), ...dataToSave, status: 'Open' },
        };
        const response = await fetch('/api/risk-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error('Failed to save risk register entry');
        }
        toast({ title: existingRisk ? 'Risk Updated' : 'Hazard Added', description: existingRisk ? 'The risk has been updated in the register.' : 'The new hazard and its risks have been added to the register.' });
        if (onCancel) onCancel();
        else router.push('/safety/risk-register');
    } catch (error) {
        console.error("Error saving risk:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not save the risk." });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  return (
    <FormProvider {...form}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {!hideHeader && (
            <CardHeader className="px-0">
                <CardTitle>Hazard Identification</CardTitle>
                <CardDescription>Assess operational hazards and define specific mitigation strategies.</CardDescription>
            </CardHeader>
          )}
          <CardContent className="px-0 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 border rounded-xl bg-muted/5">
                <FormField control={form.control} name="hazardArea" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Hazard Area</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} disabled={!hazardAreas.length}><FormControl><SelectTrigger className="h-11 bg-background border-slate-300 font-bold"><SelectValue placeholder={hazardAreas.length ? "Select area..." : "No managed areas available"} /></SelectTrigger></FormControl><SelectContent>{hazardAreas.map(area => ( <SelectItem key={area} value={area}>{area}</SelectItem> ))}</SelectContent></Select><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="hazard" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Identifying Hazard</FormLabel><FormControl><Input placeholder="e.g., Unstable approach conditions..." {...field} className="h-11 bg-background border-slate-300 font-bold" /></FormControl><FormMessage /></FormItem> )} />
            </div>
            
            <Separator />
            
            <div className="space-y-6">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Associated Risks & Outcomes
              </h3>
              <RisksArray personnel={personnel} riskMatrixColors={riskMatrixSettings?.colors} />
              <FormField control={form.control} name="risks" render={() => <FormMessage />} />
            </div>
          </CardContent>
          <div className="flex justify-end gap-2 pt-6 border-t mt-10">
              <Button type="button" variant="outline" onClick={onCancel || (() => router.back())} disabled={isSubmitting} className="h-10 px-8 text-xs font-black uppercase border-slate-300">Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="w-48 h-10 font-black uppercase text-xs shadow-md">
                  {isSubmitting ? 'Saving...' : (existingRisk ? 'Save Changes' : 'Record Hazard')}
              </Button>
          </div>
        </form>
      </Form>
    </FormProvider>
  );
}
