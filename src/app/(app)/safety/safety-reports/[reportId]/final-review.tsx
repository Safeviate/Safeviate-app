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

// --- Form Schemas ---
const hazardReviewSchema = z.object({
  id: z.string(),
  description: z.string(),
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
  hazards: z.array(hazardReviewSchema),
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
      hazards: report.initialHazards?.map(h => ({
          id: h.id,
          description: h.description,
          residualRiskLikelihood: h.risks?.[0]?.riskAssessment.likelihood || 1,
          residualRiskSeverity: h.risks?.[0]?.riskAssessment.severity || 1,
          residualRiskScore: h.risks?.[0]?.riskAssessment.riskScore || 1,
          residualRiskLevel: h.risks?.[0]?.riskAssessment.riskLevel || 'Low',
      })) || [],
      signatures: report.signatures || [],
    },
  });

  const { fields: hazardFields, remove: removeHazard } = useFieldArray({
    control: form.control,
    name: "hazards",
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const response = await fetch(`/api/safety-reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: { ...report, initialHazards: values.hazards } }),
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
                    <ReviewFields form={form} hazardFields={hazardFields} riskMatrixColors={riskMatrixColors} handleSignReport={handleSignReport} signatureDataUrl={signatureDataUrl} onSignatureChange={setSignatureDataUrl} />
                </div>
              ) : (
                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-10">
                    <ReviewFields form={form} hazardFields={hazardFields} riskMatrixColors={riskMatrixColors} handleSignReport={handleSignReport} signatureDataUrl={signatureDataUrl} onSignatureChange={setSignatureDataUrl} />
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
  form: UseFormReturn<FormValues>;
  hazardFields: FieldArrayWithId<FormValues, 'hazards', 'id'>[];
  riskMatrixColors?: Record<string, string>;
  handleSignReport: () => void | Promise<void>;
  signatureDataUrl: string;
  onSignatureChange: (value: string) => void;
};

function ReviewFields({ form, hazardFields, riskMatrixColors, handleSignReport, signatureDataUrl, onSignatureChange }: ReviewFieldsProps) {
  const signatures = form.watch('signatures') ?? [];

  return (
    <>
      <section>
        <div className="flex items-center gap-2 mb-6">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></div>
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Hazard Residual Risk Review</h3>
        </div>
        <div className="space-y-4">
          {hazardFields.map((field, index) => (
            <div key={field.id} className="p-4 border rounded-xl bg-muted/5">
              <div className="flex justify-between items-start gap-4 mb-4">
                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Hazard {index + 1}</p>
                  <p className="text-sm font-bold text-foreground">{field.description}</p>
                </div>
                <div className="flex items-center gap-3 bg-background border px-3 py-1.5 rounded-full shadow-sm">
                   <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Residual Risk:</span>
                   <span className="font-mono font-black text-xs">{(field.residualRiskLikelihood * field.residualRiskSeverity)}</span>
                </div>
              </div>
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
