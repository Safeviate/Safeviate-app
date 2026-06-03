'use client';

import { useForm } from 'react-hook-form';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { SafetyReport } from '@/types/safety-report';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useUserProfile } from '@/hooks/use-user-profile';

const isEmailLike = (value?: string | null) => Boolean(value && /\S+@\S+\.\S+/.test(value));

const resolveReporterLabel = (
  report: {
    isAnonymous?: boolean | null;
    submittedBy?: string | null;
    submittedByEmail?: string | null;
    submittedByName?: string | null;
  },
  currentUserEmail?: string | null,
) => {
  if (report.isAnonymous) return 'Anonymous';
  const submittedByEmail = report.submittedByEmail?.trim() || '';
  const submittedByName = report.submittedByName?.trim() || '';
  const submittedBy = report.submittedBy?.trim() || '';
  const viewerEmail = currentUserEmail?.trim() || '';

  if (submittedByEmail) return submittedByEmail;
  if (submittedByName && !/^vercel user$/i.test(submittedByName)) return submittedByName;
  if (isEmailLike(submittedBy)) return submittedBy;
  if ((/^vercel user$/i.test(submittedByName) || /^vercel-user$/i.test(submittedBy)) && viewerEmail) return viewerEmail;
  return submittedByName || submittedBy || 'Signed-in User';
};

const reportStatuses = ['Open', 'Under Review', 'Awaiting Action', 'Closed'];
const eventClassifications = ['Hazard', 'Incident', 'Accident'];

const ICAO_CATEGORIES = [
  { code: 'ADRM', description: 'Aerodrome' },
  { code: 'AMAN', description: 'Abrupt Maneuver' },
  { code: 'ARC', description: 'Abnormal Runway Contact' },
  { code: 'BIRD', description: 'Bird strike' },
  { code: 'CABIN', description: 'Cabin Safety Events' },
  { code: 'CFIT', description: 'Controlled Flight Into or Toward Terrain' },
  { code: 'CTOL', description: 'Collision with obstacle(s) during take-off and landing' },
  { code: 'EVAC', description: 'Evacuation' },
  { code: 'F-NI', description: 'Fire/smoke (non-impact)' },
  { code: 'F-POST', description: 'Fire/smoke (post-impact)' },
  { code: 'FUEL', description: 'Fuel related' },
  { code: 'GCOL', description: 'Ground Collision' },
  { code: 'GRS', description: 'Ground Handling' },
  { code: 'HIJACK', description: 'Hijacking' },
  { code: 'ICE', description: 'Icing' },
  { code: 'LOC-G', description: 'Loss of control - Ground' },
  { code: 'LOC-I', description: 'Loss of control - Inflight' },
  { code: 'MAC', description: 'Airprox/ ACAS alert/ loss of separation' },
  { code: 'NAV', description: 'Navigation error' },
  { code: 'RE', description: 'Runway Excursion' },
  { code: 'RI', description: 'Runway Incursion' },
  { code: 'SEC', description: 'Security related' },
  { code: 'SCF-NP', description: 'System/ component failure or malfunction (non-powerplant)' },
  { code: 'SCF-PP', description: 'System/ component failure or malfunction (powerplant)' },
  { code: 'TURB', description: 'Turbulence encounter' },
  { code: 'UCOL', description: 'Undershoot/ overshoot' },
  { code: 'WSTR', description: 'Windshear or thunderstorm' },
  { code: 'OTHER', description: 'Other' },
  { code: 'UNK', description: 'Unknown or undetermined' },
];

const triageSchema = z.object({
  status: z.string().min(1),
  occurrenceCategory: z.string().optional(),
  eventClassification: z.string().optional(),
});

type TriageFormValues = z.infer<typeof triageSchema>;

interface TriageFormProps {
  report: SafetyReport;
  tenantId: string;
  isStacked?: boolean;
}

export function TriageForm({ report, tenantId, isStacked = false }: TriageFormProps) {
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const reporterLabel = resolveReporterLabel(report, userProfile?.email);

  const form = useForm<TriageFormValues>({
    resolver: zodResolver(triageSchema),
    defaultValues: {
      status: report.status || 'Open',
      occurrenceCategory: report.occurrenceCategory || '',
      eventClassification: report.eventClassification || '',
    },
  });

  const onSubmit = async (values: TriageFormValues) => {
    try {
      const response = await fetch(`/api/safety-reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: { ...report, ...values } }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to save triage details.');
      }
      toast({ title: 'Triage Details Saved' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to save triage details.',
      });
    }
  };

  return (
    <div className={cn("flex flex-col h-full", !isStacked && "overflow-hidden")}>
      <div className="shrink-0 border-b bg-muted/5 p-4">
        <h3 className="text-lg font-black uppercase tracking-tight">Occurrence Details & Triage</h3>
      </div>
      
      <div className={cn("flex-1 p-0 overflow-hidden flex flex-col", isStacked && "overflow-visible h-auto")}>
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8">
            {/* --- INTEGRATED REPORT SUMMARY --- */}
            <section className="space-y-3">
                <div className="flex flex-col gap-0.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary opacity-80">Initial Narrative</p>
                    <p className="text-[11px] text-muted-foreground font-medium italic">Filed {format(new Date(report.submittedAt), 'PPP')} by {reporterLabel}</p>
                </div>
                <div className="p-5 rounded-xl bg-primary/5 border border-primary/10 shadow-inner">
                    <p className="text-sm text-foreground font-medium leading-relaxed whitespace-pre-wrap italic opacity-90">&quot;{report.description}&quot;</p>
                </div>
            </section>

            <Separator />

            {/* --- TRIAGE CONTROLS --- */}
            <section className="space-y-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary border-b pb-2">Classification & Management</p>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <TriageFields form={form} />
                        </div>
                        {!isStacked && (
                            <div className="flex justify-end pt-4">
                                <Button type="submit" className="font-black uppercase text-xs h-10 px-8 shadow-md">
                                    <Save className="mr-2 h-4 w-4" /> Save Triage Details
                                </Button>
                            </div>
                        )}
                    </form>
                </Form>
            </section>
        </div>
      </div>
    </div>
  );
}

function Separator() {
    return <div className="h-px w-full bg-slate-200/60" />;
}

function TriageFields({ form }: { form: any }) {
  return (
    <>
      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Report Status</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl><SelectTrigger className="h-10 bg-background font-bold text-xs"><SelectValue placeholder="Set status" /></SelectTrigger></FormControl>
              <SelectContent>{reportStatuses.map((status) => (<SelectItem key={status} value={status}>{status}</SelectItem>))}</SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="eventClassification"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Event Classification</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl><SelectTrigger className="h-10 bg-background font-bold text-xs"><SelectValue placeholder="Classify event" /></SelectTrigger></FormControl>
              <SelectContent>{eventClassifications.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="occurrenceCategory"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Occurrence Category (ICAO)</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl><SelectTrigger className="h-10 bg-background font-bold text-xs"><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
              <SelectContent><ScrollArea className="h-[300px]">{ICAO_CATEGORIES.map((cat) => (<SelectItem key={cat.code} value={cat.code}>{cat.code} - {cat.description}</SelectItem>))}</ScrollArea></SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
