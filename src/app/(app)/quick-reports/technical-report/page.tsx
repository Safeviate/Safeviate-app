'use client';

import { ChangeEvent, useMemo, useEffect, useState } from 'react';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { AlertTriangle, CalendarIcon, FileWarning, ImagePlus, Trash2, Wrench } from 'lucide-react';
import { MainPageHeader } from '@/components/page-header';
import { BackNavButton } from '@/components/back-nav-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { useToast } from '@/hooks/use-toast';
import type { Aircraft } from '@/types/aircraft';
import type { QuickReportPhotoAttachment } from '@/types/quick-reports';
import { cn } from '@/lib/utils';

const technicalReportSchema = z.object({
  aircraftId: z.string().optional(),
  eventDate: z.date({ required_error: 'Date is required.' }),
  eventTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Invalid time format (HH:mm).' }),
  location: z.string().min(1, 'Location is required.'),
  title: z.string().min(3, 'Short title is required.'),
  systemOrComponent: z.string().optional(),
  grounded: z.boolean().default(false),
  urgency: z.enum(['Low', 'Medium', 'High']),
  summary: z.string().min(10, 'Please provide a useful summary.'),
  immediateAction: z.string().optional(),
  reporterName: z.string().optional(),
  reporterEmail: z.string().email('Please enter a valid email address.').optional().or(z.literal('')),
});

type TechnicalReportValues = z.infer<typeof technicalReportSchema>;

export default function QuickTechnicalReportPage() {
  const router = useRouter();
  const pathname = usePathname() || '';
  const params = useParams<{ tenantId?: string }>();
  const { toast } = useToast();
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoAttachments, setPhotoAttachments] = useState<QuickReportPhotoAttachment[]>([]);
  const publicTenantId = typeof params?.tenantId === 'string' ? params.tenantId.trim() : '';
  const isPublicPortal = pathname.startsWith('/report/');
  const returnHref = isPublicPortal && publicTenantId ? `/report/${encodeURIComponent(publicTenantId)}` : '/quick-reports';
  const showBackButton = !isPublicPortal;
  const photoHelperText = useMemo(
    () => `${photoAttachments.length}/5 photos attached. Use this only for quick visual evidence.`,
    [photoAttachments.length]
  );

  useEffect(() => {
    let cancelled = false;
    const loadAircraft = async () => {
      try {
        const response = await fetch(
          publicTenantId ? `/api/schedule-data?tenantId=${encodeURIComponent(publicTenantId)}` : '/api/schedule-data',
          { cache: 'no-store' }
        );
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

  const form = useForm<TechnicalReportValues>({
    resolver: zodResolver(technicalReportSchema),
    defaultValues: {
      aircraftId: '',
      eventDate: new Date(),
      eventTime: format(new Date(), 'HH:mm'),
      location: '',
      title: '',
      systemOrComponent: '',
      grounded: false,
      urgency: 'Medium',
      summary: '',
      immediateAction: '',
      reporterName: '',
      reporterEmail: '',
    },
  });

  const onSubmit = async (values: TechnicalReportValues) => {
    setIsSubmitting(true);
    try {
      const selectedAircraft = aircrafts.find((aircraft) => aircraft.id === values.aircraftId);
      const response = await fetch('/api/technical-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: {
            reportNumber: `TECH-${String(Date.now()).slice(-6)}`,
            reportType: 'Preliminary Technical Report',
            eventDate: format(values.eventDate, 'yyyy-MM-dd'),
            eventTime: values.eventTime,
            location: values.location,
            title: values.title,
            systemOrComponent: values.systemOrComponent || null,
            grounded: values.grounded,
            urgency: values.urgency,
            summary: values.summary,
            immediateAction: values.immediateAction || null,
            photoAttachments: photoAttachments.length > 0 ? photoAttachments : null,
            aircraftId: values.aircraftId && values.aircraftId !== 'unassigned' ? values.aircraftId : null,
            aircraftLabel: selectedAircraft ? `${selectedAircraft.tailNumber} (${selectedAircraft.model})` : null,
            tenantId: publicTenantId || undefined,
            submittedByName: isPublicPortal ? values.reporterName?.trim() || 'External Reporter' : undefined,
            submittedByEmail: isPublicPortal ? values.reporterEmail?.trim() || null : undefined,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to submit technical report.');
      }

      toast({
        title: 'Technical Report Submitted',
        description: 'The preliminary technical report has been captured for management follow-up.',
      });

      router.push(returnHref);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: error instanceof Error ? error.message : 'Failed to submit technical report.',
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
        title="Technical Report"
        description={
          isPublicPortal
            ? 'Capture a quick preliminary technical report for this organization without logging in.'
            : 'Capture a quick preliminary technical report that management can analyze, assign, and escalate later.'
        }
        actions={showBackButton ? <BackNavButton href={returnHref} text="Back to Quick Reports" /> : undefined}
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="overflow-hidden border shadow-none">
            <CardHeader className="border-b bg-muted/5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-background">
                  <FileWarning className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <CardTitle>Preliminary Technical Report</CardTitle>
                  <CardDescription>
                    Use this for early technical reporting before engineering or management completes deeper analysis and assignment.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="grid gap-6 md:grid-cols-1">
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
              </div>

              {isPublicPortal ? (
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="reporterName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Name</FormLabel>
                        <FormControl>
                          <Input className="h-10" placeholder="Optional, helps with follow-up" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reporterEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Email</FormLabel>
                        <FormControl>
                          <Input type="email" className="h-10" placeholder="Optional contact email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : null}

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
                        <Input className="h-10" placeholder="e.g. Hangar, Apron, Workshop" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Nose wheel shimmy after landing" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="systemOrComponent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System / Component</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Brakes, Avionics, Landing light" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="urgency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Urgency</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select urgency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="grounded"
                  render={({ field }) => (
                    <FormItem className="flex flex-col rounded-lg border p-3 justify-center bg-muted/10">
                      <FormLabel className="text-xs">Ground Aircraft</FormLabel>
                      <div className="flex items-center space-x-2 pt-2">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {field.value ? 'This report indicates the aircraft should not be dispatched.' : 'No grounding recommendation recorded.'}
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Technical Summary</FormLabel>
                    <FormControl>
                      <Textarea
                        className="min-h-32"
                        placeholder="Describe what was found, under what conditions, and what the immediate concern is."
                        {...field}
                      />
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
                      <Textarea
                        className="min-h-24"
                        placeholder="Capture any action already taken, temporary controls, or dispatch restriction applied."
                        {...field}
                      />
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

              <div className="rounded-xl border bg-amber-50/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-background">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">Preliminary Capture</p>
                    <p className="text-sm text-amber-900/90">
                      This tool is intended for fast first capture. Management and engineering can analyze, assign, and escalate the report further after submission.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2 pb-8">
            <Button type="button" variant="outline" onClick={() => router.push(returnHref)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Wrench className="mr-2 h-4 w-4 animate-pulse" /> : <Wrench className="mr-2 h-4 w-4" />}
              Submit Technical Report
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
