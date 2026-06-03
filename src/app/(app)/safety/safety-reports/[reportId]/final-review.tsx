'use client';

import { useForm, useFieldArray, useFormContext, Controller, FormProvider } from 'react-hook-form';
import type { FieldArrayWithId, UseFormReturn } from 'react-hook-form';
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
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { SafetyReport } from '@/types/safety-report';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { Signature, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import React from 'react';
import { dispatchSafeviateEvent, SAFEVIATE_SAFETY_REPORTS_UPDATED } from '@/lib/client-events';
import { SignaturePad } from '@/components/ui/signature-pad';
import { useUserProfile } from '@/hooks/use-user-profile';
import type { ReportHazard, ReportRisk } from '@/types/safety-report';

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
    
    return { backgroundColor: '#10b981', color: 'white' };
};

type ReviewRiskEntry = {
  hazardId: string;
  hazardDescription: string;
  riskId: string;
  riskDescription: string;
  residualRiskLikelihood: number;
  residualRiskSeverity: number;
  residualRiskScore: number;
  residualRiskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
};

const deriveReviewRisks = (report: SafetyReport): ReviewRiskEntry[] => {
  const initialHazards = report.initialHazards || [];
  const mitigatedHazards = report.mitigatedHazards || [];

  return initialHazards.flatMap((hazard) => {
    const sourceRisks = hazard.risks?.length
      ? hazard.risks
      : [{
          id: `${hazard.id}-risk`,
          description: 'Residual risk after mitigation',
          riskAssessment: {
            likelihood: 1,
            severity: 1,
            riskScore: 1,
            riskLevel: 'Low' as const,
          },
        }];

    return sourceRisks.map((risk) => {
      const mitigatedHazard = mitigatedHazards.find((entry) => entry.id === hazard.id);
      const mitigatedRisk = mitigatedHazard?.risks?.find((entry) => entry.id === risk.id) || mitigatedHazard?.risks?.[0];
      const assessment = mitigatedRisk?.riskAssessment || risk.riskAssessment;

      return {
        hazardId: hazard.id,
        hazardDescription: hazard.description,
        riskId: risk.id,
        riskDescription: risk.description,
        residualRiskLikelihood: assessment?.likelihood || 1,
        residualRiskSeverity: assessment?.severity || 1,
        residualRiskScore: assessment?.riskScore || 1,
        residualRiskLevel: assessment?.riskLevel || 'Low',
      };
    });
  });
};

const buildMitigatedHazardsFromReview = (report: SafetyReport, reviewedRisks: FormValues['risks']): ReportHazard[] => {
  const grouped = new Map<string, ReportHazard>();

  for (const reviewedRisk of reviewedRisks) {
    const existing = grouped.get(reviewedRisk.hazardId);
    const risk: ReportRisk = {
      id: reviewedRisk.riskId,
      description: reviewedRisk.riskDescription,
      riskAssessment: {
        likelihood: reviewedRisk.residualRiskLikelihood,
        severity: reviewedRisk.residualRiskSeverity,
        riskScore: reviewedRisk.residualRiskScore,
        riskLevel: reviewedRisk.residualRiskLevel,
      },
    };

    if (existing) {
      existing.risks = [...(existing.risks || []), risk];
      continue;
    }

    grouped.set(reviewedRisk.hazardId, {
      id: reviewedRisk.hazardId,
      description: reviewedRisk.hazardDescription,
      risks: [risk],
    });
  }

  return Array.from(grouped.values());
};

// --- Form Schemas ---
const riskReviewSchema = z.object({
  hazardId: z.string(),
  hazardDescription: z.string(),
  riskId: z.string(),
  riskDescription: z.string(),
  residualRiskLikelihood: z.number(),
  residualRiskSeverity: z.number(),
  residualRiskScore: z.number(),
  residualRiskLevel: z.enum(["Low", "Medium", "High", "Critical"]),
});

const signatureSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  role: z.string(),
  signatureUrl: z.string(),
  signedAt: z.string(),
});

const reportReviewSchema = z.object({
  risks: z.array(riskReviewSchema),
  signatures: z.array(signatureSchema).optional(),
});

type FormValues = z.infer<typeof reportReviewSchema>;

interface FinalReviewProps {
  report: SafetyReport;
  tenantId: string;
  personnel: Personnel[];
  riskMatrixColors?: Record<string, string>;
  isStacked?: boolean;
}

export function FinalReview({ report, tenantId, personnel, riskMatrixColors, isStacked = false }: FinalReviewProps) {
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const [signatureDataUrl, setSignatureDataUrl] = React.useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(reportReviewSchema),
    defaultValues: {
      risks: deriveReviewRisks(report),
      signatures: report.signatures || [],
    },
  });

  const { fields: riskFields } = useFieldArray({
    control: form.control,
    name: "risks",
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const mitigatedHazards = buildMitigatedHazardsFromReview(report, values.risks);
      const response = await fetch(`/api/safety-reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: { ...report, mitigatedHazards } }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to save final review.');
      }
      toast({ title: 'Final Review Saved' });
      dispatchSafeviateEvent(SAFEVIATE_SAFETY_REPORTS_UPDATED);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to save final review.',
      });
    }
  };

  const handleSignReport = async () => {
    const currentUser = userProfile && userProfile.id
      ? personnel.find((person) => person.id === userProfile.id) || userProfile
      : null;
    if (!currentUser) return;
    if (!signatureDataUrl) {
      toast({
        variant: 'destructive',
        title: 'Signature Required',
        description: 'Please provide your signature before signing the report.',
      });
      return;
    }

    const newSignature = {
        userId: currentUser.id,
        userName: `${currentUser.firstName} ${currentUser.lastName}`,
        role: currentUser.role || "Safety Manager",
        signatureUrl: signatureDataUrl,
        signedAt: new Date().toISOString(),
    };
    
    const currentSignatures = form.getValues('signatures') || [];
    form.setValue('signatures', [...currentSignatures, newSignature]);

    try {
      const response = await fetch(`/api/safety-reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: { ...report, signatures: [...currentSignatures, newSignature] } }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to sign this report right now.');
      }
      toast({title: "Report Signed"});
      setSignatureDataUrl('');
      dispatchSafeviateEvent(SAFEVIATE_SAFETY_REPORTS_UPDATED);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Sign-off failed',
        description: error instanceof Error ? error.message : 'Unable to sign this report right now.',
      });
    }
  };

  return (
    <div className={cn("flex flex-col h-full", !isStacked && "overflow-hidden")}>
      <div className="shrink-0 border-b bg-muted/5 p-4">
        <h2 className="text-lg font-black uppercase tracking-tight">Final Review & Closure</h2>
      </div>
      <div className={cn("flex-1 p-0 overflow-hidden flex flex-col", isStacked && "overflow-visible h-auto")}>
        <FormProvider {...form}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
              {isStacked ? (
                <div className="p-6 space-y-10">
                    <ReviewFields report={report} form={form} riskFields={riskFields} riskMatrixColors={riskMatrixColors} handleSignReport={handleSignReport} signatureDataUrl={signatureDataUrl} onSignatureChange={setSignatureDataUrl} />
                </div>
              ) : (
                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-10">
                    <ReviewFields report={report} form={form} riskFields={riskFields} riskMatrixColors={riskMatrixColors} handleSignReport={handleSignReport} signatureDataUrl={signatureDataUrl} onSignatureChange={setSignatureDataUrl} />
                  </div>
                </ScrollArea>
              )}
              {!isStacked && (
                  <div className="shrink-0 flex justify-end p-4 border-t bg-muted/5 gap-2 no-print">
                      <Button type="submit" className="font-black uppercase text-xs h-10 px-8 shadow-md">
                          <Save className="mr-2 h-4 w-4" /> Save Final Review
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

type ReviewFieldsProps = {
  report: SafetyReport;
  form: UseFormReturn<FormValues>;
  riskFields: FieldArrayWithId<FormValues, 'risks', 'id'>[];
  riskMatrixColors?: Record<string, string>;
  handleSignReport: () => void | Promise<void>;
  signatureDataUrl: string;
  onSignatureChange: (value: string) => void;
};

function ReviewFields({ report, form, riskFields, riskMatrixColors, handleSignReport, signatureDataUrl, onSignatureChange }: ReviewFieldsProps) {
  const signatures = form.watch('signatures') ?? [];

  return (
    <>
      <section>
        <div className="flex items-center gap-2 mb-6">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></div>
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Residual Risk Review</h3>
        </div>
        <div className="space-y-4">
          {riskFields.map((field, index) => (
            <div key={field.id} className="p-4 border rounded-xl bg-muted/5">
              <div className="flex justify-between items-start gap-4 mb-4">
                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Hazard {index + 1}</p>
                  <p className="text-sm font-bold text-foreground">{field.hazardDescription}</p>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Linked Risk</p>
                  <p className="text-sm font-semibold text-foreground">{field.riskDescription}</p>
                </div>
                <div className="flex items-center gap-3 bg-background border px-3 py-1.5 rounded-full shadow-sm">
                   <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Residual Risk:</span>
                   <span className="font-mono font-black text-xs">{(field.residualRiskLikelihood * field.residualRiskSeverity)}</span>
                </div>
              </div>
              {report?.correctiveActions?.some((action) => action.hazardId === field.hazardId && (!action.riskId || action.riskId === field.riskId)) ? (
                <div className="mt-3 rounded-lg border bg-background px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Linked Mitigation Actions</p>
                  <div className="mt-2 space-y-2">
                    {report.correctiveActions
                      .filter((action) => action.hazardId === field.hazardId && (!action.riskId || action.riskId === field.riskId))
                      .map((action) => (
                        <div key={action.id} className="flex flex-col gap-1 rounded-md border bg-muted/10 px-3 py-2">
                          <p className="text-xs font-semibold text-foreground">{action.description}</p>
                          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            <span>Status {action.status}</span>
                            {action.riskId ? <span>Risk linked</span> : <span>Hazard-wide action</span>}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <Separator className="bg-slate-200/60" />

      <section>
        <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10 text-primary"><Signature className="h-4 w-4" /></div>
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Authorization & Sign-off</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleSignReport} className="h-9 px-6 text-xs font-black uppercase border-slate-300 shadow-sm no-print">
              Sign Report
            </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {signatures.map((sig, idx) => (
            <div key={idx} className="p-4 border rounded-xl bg-background shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-start border-b pb-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-tight text-foreground">{sig.userName}</p>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{sig.role}</p>
                </div>
                <p className="text-[10px] font-medium text-muted-foreground">{format(new Date(sig.signedAt), 'PPP')}</p>
              </div>
              <div className="bg-muted/10 rounded-lg p-4 flex items-center justify-center border-2 border-dashed h-24">
                <img src={sig.signatureUrl} alt="Signature" className="max-h-16 grayscale opacity-80" />
              </div>
            </div>
          ))}
          {signatures.length === 0 && (
              <div className="md:col-span-2 py-10 flex flex-col items-center justify-center border-2 border-dashed rounded-xl opacity-40">
                  <Signature className="h-10 w-10 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Awaiting Sign-off</p>
              </div>
          )}
        </div>
        <div className="mt-6 rounded-xl border bg-muted/10 p-4 space-y-3 no-print">
          <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Your Signature</Label>
          <SignaturePad onSignatureEnd={onSignatureChange} initialDataUrl={signatureDataUrl} height={140} />
        </div>
      </section>
    </>
  );
}
