'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import type { SafetyReport } from '@/types/safety-report';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { cn } from '@/lib/utils';
import { dispatchSafeviateEvent, SAFEVIATE_SAFETY_REPORTS_UPDATED } from '@/lib/client-events';

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date(value);
  return new Date(year, month - 1, day, 12);
};

const formSchema = z.object({
  reportType: z.string().min(1, "Report type is required."),
  eventDate: z.date({ required_error: "Event date is required." }),
  eventTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: "Invalid time format (HH:mm)." }),
  location: z.string().min(1, "Location is required."),
  description: z.string().min(10, "Please provide a detailed description."),
});

type FormValues = z.infer<typeof formSchema>;

interface EditReportDialogProps {
  report: SafetyReport;
  tenantId: string;
  trigger?: ReactNode;
}

export function EditReportDialog({ report, tenantId, trigger }: EditReportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reportType: report.reportType,
      eventDate: parseLocalDate(report.eventDate),
      eventTime: report.eventTime,
      location: report.location,
      description: report.description,
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        reportType: report.reportType,
        eventDate: parseLocalDate(report.eventDate),
        eventTime: report.eventTime,
        location: report.location,
        description: report.description,
      });
    }
  }, [isOpen, report, form]);

  const onSubmit = async (values: FormValues) => {
    const dataToSave = {
      ...values,
      eventDate: format(values.eventDate, 'yyyy-MM-dd'),
    };

    try {
      const response = await fetch(`/api/safety-reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: { ...report, ...dataToSave } }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to update this report right now.');
      }
      toast({ title: 'Report Updated', description: `Safety Report #${report.reportNumber} has been updated.` });
      dispatchSafeviateEvent(SAFEVIATE_SAFETY_REPORTS_UPDATED);
      setIsOpen(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Unable to update this report right now.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="icon" className="h-8 w-8">
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit Report</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Report #{report.reportNumber}</DialogTitle>
          <DialogDescription>Modify the basic details of the safety report.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField control={form.control} name="reportType" render={({ field }) => (
              <FormItem>
                <FormLabel>Report Type</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="eventDate" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Event Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className={cn("w-full pl-3 text-left font-normal h-10", !field.value && "text-muted-foreground")}>
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CustomCalendar selectedDate={field.value} onDateSelect={field.onChange} />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="eventTime" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Event Time (24h)</FormLabel>
                  <FormControl><Input type="time" {...field} className="h-10" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="location" render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea className="min-h-32" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
