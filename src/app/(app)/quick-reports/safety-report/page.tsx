'use client';

import { ChangeEvent, useMemo, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, ImagePlus, ShieldAlert, Trash2 } from 'lucide-react';
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
import type { QuickReportPhotoAttachment } from '@/types/quick-reports';
import { cn } from '@/lib/utils';
import { dispatchSafeviateEvent, SAFEVIATE_QUICK_SAFETY_REPORTS_UPDATED } from '@/lib/client-events';

const quickSafetySchema = z.object({
  eventDate: z.date({ required_error: 'Date is required.' }),
  eventTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Invalid time format (HH:mm).' }),
  location: z.string().min(1, 'Location is required.'),
  aircraftId: z.string().optional(),
  summary: z.string().min(10, 'Please provide a useful summary.'),
  immediateAction: z.string().optional(),
});

type QuickSafetyValues = z.infer<typeof quickSafetySchema>;

export default function QuickSafetyReportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoAttachments, setPhotoAttachments] = useState<QuickReportPhotoAttachment[]>([]);
  const photoHelperText = useMemo(
    () => `${photoAttachments.length}/5 photos attached. Use this only for quick visual evidence.`,
    [photoAttachments.length]
  );

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
      eventDate: new Date(),
      eventTime: format(new Date(), 'HH:mm'),
      location: '',
      aircraftId: '',
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
            reportType: 'Preliminary Safety Report',
            eventDate: format(values.eventDate, 'yyyy-MM-dd'),
            eventTime: values.eventTime,
            location: values.location,
            aircraftId: values.aircraftId && values.aircraftId !== 'unassigned' ? values.aircraftId : null,
            aircraftLabel: selectedAircraft ? `${selectedAircraft.tailNumber} (${selectedAircraft.model})` : null,
            summary: values.summary,
            immediateAction: values.immediateAction || null,
            photoAttachments: photoAttachments.length > 0 ? photoAttachments : null,
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

      dispatchSafeviateEvent(SAFEVIATE_QUICK_SAFETY_REPORTS_UPDATED);
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

  const handlePhotoSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const availableSlots = Math.max(0, 5 - photoAttachments.length);
    const nextFiles = files.slice(0, availableSlots);

    try {
      const nextAttachments = await Promise.all(
        nextFiles.map(
          (file) =>
            new Promise<QuickReportPhotoAttachment>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  id: crypto.randomUUID(),
                  name: file.name,
                  mimeType: file.type || 'image/jpeg',
                  dataUrl: typeof reader.result === 'string' ? reader.result : '',
                });
              reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
              reader.readAsDataURL(file);
            })
        )
      );

      setPhotoAttachments((current) => [...current, ...nextAttachments.filter((item) => item.dataUrl)]);
      if (files.length > availableSlots) {
        toast({
          title: 'Photo Limit Reached',
          description: 'Only the first five photos were attached to this quick report.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Photo Capture Failed',
        description: error instanceof Error ? error.message : 'Failed to read the selected photo.',
      });
    }

    event.target.value = '';
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
              <div className="grid gap-6 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="eventDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'h-10 w-full justify-between rounded-md border border-input bg-background px-3 text-left text-sm font-normal shadow-sm hover:bg-background',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
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
                        <Input type="time" className="h-10" {...field} />
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
                        <Input className="h-10" placeholder="e.g. Apron, Flight line, Hangar" {...field} />
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
                        <SelectTrigger className="h-10">
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
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Photos</p>
                  <p className="text-xs text-muted-foreground">{photoHelperText}</p>
                </div>
                <label
                  className={cn(
                    'inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent/40',
                    photoAttachments.length >= 5 && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <ImagePlus className="h-4 w-4" />
                  <span>Add Photos</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="sr-only"
                    disabled={photoAttachments.length >= 5}
                    onChange={handlePhotoSelection}
                  />
                </label>
                {photoAttachments.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {photoAttachments.map((photo) => (
                      <div key={photo.id} className="overflow-hidden rounded-lg border bg-muted/5">
                        <img src={photo.dataUrl} alt={photo.name} className="h-32 w-full object-cover" />
                        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                          <p className="min-w-0 truncate text-xs font-medium">{photo.name}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => setPhotoAttachments((current) => current.filter((item) => item.id !== photo.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
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
