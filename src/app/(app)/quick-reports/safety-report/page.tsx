'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, ShieldAlert } from 'lucide-react';
import { MainPageHeader } from '@/components/page-header';
import { BackNavButton } from '@/components/back-nav-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { useToast } from '@/hooks/use-toast';
import type { Aircraft } from '@/types/aircraft';
import { cn } from '@/lib/utils';

const quickSafetySchema = z.object({
  reportType: z.string().min(1, 'Quick safety report type is required.'),
  eventDate: z.date({ required_error: 'Date is required.' }),
  eventTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Invalid time format (HH:mm).' }),
  location: z.string().min(1, 'Location is required.'),
  aircraftId: z.string().optional(),
  recommendedClassification: z.enum(['Hazard', 'Incident', 'Accident', 'General Concern']),
  summary: z.string().min(10, 'Please provide a useful summary.'),
  immediateAction: z.string().optional(),
});

type QuickSafetyValues = z.infer<typeof quickSafetySchema>;

const reportTypes = ['Flight Operations', 'Aircraft Defect', 'Ground Operations', 'General Safety Concern'] as const;

export default function QuickSafetyReportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadAircraft = async () => {
      try {
        const response = await fetch('/api/schedule-data', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ aircraft: [] }));
        if (!cancelled) {
          setAircrafts(Array.isArray(payload?.aircraft) ? payload.aircraft : []);
        }
      } catch {
        if (!cancelled) setAircrafts([]);
      }
    };

    void loadAircraft();
    return () => {
      cancelled = true;
    };
  }, []);

  const form = useForm<QuickSafetyValues>({
    resolver: zodResolver(quickSafetySchema),
    defaultValues: {
      reportType: '',
      eventDate: new Date(),
      eventTime: format(new Date(), 'HH:mm'),
      location: '',
      aircraftId: '',
      recommendedClassification: 'Incident',
      summary: '',
      immediateAction: '',
    },
  });

  const onSubmit = async (values: QuickSafetyValues) => {
    setIsSubmitting(true);
    try {
      const selectedAircraft = aircrafts.find((aircraft) => aircraft.id === values.aircraftId);
      const response = await fetch('/api/quick-safety-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: {
            reportNumber: `QSR-${String(Date.now()).slice(-6)}`,
            reportType: values.reportType,
            eventDate: format(values.eventDate, 'yyyy-MM-dd'),
            eventTime: values.eventTime,
            location: values.location,
            aircraftId: values.aircraftId && values.aircraftId !== 'unassigned' ? values.aircraftId : null,
            aircraftLabel: selectedAircraft ? `${selectedAircraft.tailNumber} (${selectedAircraft.model})` : null,
            recommendedClassification: values.recommendedClassification,
            summary: values.summary,
            immediateAction: values.immediateAction || null,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to submit quick safety report.');
      }

      toast({
        title: 'Quick Safety Report Submitted',
        description: 'The preliminary safety report has been captured for classification.',
      });

      router.push('/quick-reports');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: error instanceof Error ? error.message : 'Failed to submit quick safety report.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 p-4">
      <MainPageHeader
        title="Quick Safety Report"
        description="Capture a preliminary safety concern quickly, then classify it into the formal safety workflow when management is ready."
        actions={<BackNavButton href="/quick-reports" text="Back to Quick Reports" />}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="overflow-hidden border shadow-none">
            <CardHeader className="border-b bg-muted/5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-background">
                  <ShieldAlert className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <CardTitle>Preliminary Safety Report</CardTitle>
                  <CardDescription>
                    Use this for fast first capture. Management can later classify it into the full safety report workflow.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="reportType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Report Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a quick safety report type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {reportTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="recommendedClassification"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recommended Classification</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a classification" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Hazard">Hazard</SelectItem>
                          <SelectItem value="Incident">Incident</SelectItem>
                          <SelectItem value="Accident">Accident</SelectItem>
                          <SelectItem value="General Concern">General Concern</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="eventDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn('w-full justify-between pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                              {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                              <CalendarIcon className="h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CustomCalendar selectedDate={field.value} onDateSelect={field.onChange} />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="eventTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Apron, Flight line, Hangar" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="aircraftId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aircraft Involved</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an aircraft if relevant" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Not aircraft-specific</SelectItem>
                        {aircrafts.map((aircraft) => (
                          <SelectItem key={aircraft.id} value={aircraft.id}>
                            {aircraft.tailNumber} ({aircraft.model})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quick Summary</FormLabel>
                    <FormControl>
                      <Textarea className="min-h-32" placeholder="Capture the safety concern briefly but clearly." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="immediateAction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Immediate Action Taken</FormLabel>
                    <FormControl>
                      <Textarea className="min-h-24" placeholder="Record any immediate action, containment, or notification already made." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2 pb-8">
            <Button type="button" variant="outline" onClick={() => router.push('/quick-reports')} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Quick Safety Report'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
