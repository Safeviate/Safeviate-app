'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronsUpDown, PlusCircle, Wrench } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { HEADER_ACTION_BUTTON_CLASS } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PAGE_FORMAT_MOBILE_FULL_WIDTH_BUTTON_CLASS } from '@/lib/page-format-buttons';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addMonths, format } from 'date-fns';
import type { Tool } from '@/types/tool';

const formSchema = z.object({
  name: z.string().min(1, 'Equipment name is required.'),
  manufacturer: z.string().optional(),
  modelNumber: z.string().optional(),
  serialNumber: z.string().min(1, 'Serial number is crucial for traceability.'),
  ownerType: z.enum(['COMPANY', 'CLIENT', 'EMPLOYEE']),
  status: z.enum(['CALIBRATED', 'OUT_OF_CALIBRATION', 'REFERENCE_ONLY', 'DAMAGED', 'LOST']),
  lastCalibrationDate: z.string().optional(),
  calibrationIntervalMonths: z.coerce.number().min(0).optional(),
});

export function AddToolDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      manufacturer: '',
      modelNumber: '',
      serialNumber: '',
      ownerType: 'COMPANY',
      status: 'CALIBRATED',
      lastCalibrationDate: '',
      calibrationIntervalMonths: 12,
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    let nextCalibrationDueDate = null;
    if (values.lastCalibrationDate && values.calibrationIntervalMonths) {
      const lastDate = new Date(values.lastCalibrationDate);
      const nextDate = addMonths(lastDate, values.calibrationIntervalMonths);
      nextCalibrationDueDate = format(nextDate, 'yyyy-MM-dd');
    }

    try {
      const tool: Tool = {
        ...values,
        id: crypto.randomUUID(),
        nextCalibrationDueDate: nextCalibrationDueDate || undefined,
        createdAt: new Date().toISOString(),
      };

      const res = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to add tool.');

      window.dispatchEvent(new Event('safeviate-assets-tools-updated'));
      window.dispatchEvent(new Event('safeviate-tools-updated'));
      toast({ title: 'Equipment Added', description: `${values.name} (${values.serialNumber}) has been added to the registry.` });
      setIsOpen(false);
      form.reset();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isMobile ? 'outline' : 'default'}
          size="default"
          className={isMobile ? PAGE_FORMAT_MOBILE_FULL_WIDTH_BUTTON_CLASS : HEADER_ACTION_BUTTON_CLASS}
        >
          <span className="flex items-center gap-2">
            <PlusCircle className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Add Equipment
          </span>
          {isMobile ? <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Register New Equipment</DialogTitle>
          <DialogDescription>Add a new equipment item to the calibration registry.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Equipment Name</FormLabel><FormControl><Input placeholder="e.g. Torque Wrench" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="serialNumber" render={({ field }) => (<FormItem><FormLabel>Serial Number</FormLabel><FormControl><Input placeholder="Required for tracing" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="manufacturer" render={({ field }) => (<FormItem><FormLabel>Manufacturer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="modelNumber" render={({ field }) => (<FormItem><FormLabel>Model Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="ownerType" render={({ field }) => (<FormItem><FormLabel>Ownership</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="COMPANY">Company Owned</SelectItem><SelectItem value="EMPLOYEE">Employee Owned</SelectItem><SelectItem value="CLIENT">Client Owned</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="status" render={({ field }) => (<FormItem><FormLabel>Calibration Status</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="CALIBRATED">Calibrated</SelectItem><SelectItem value="OUT_OF_CALIBRATION">Out of Calibration</SelectItem><SelectItem value="REFERENCE_ONLY">Reference Only</SelectItem><SelectItem value="DAMAGED">Damaged</SelectItem><SelectItem value="LOST">Lost</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="lastCalibrationDate" render={({ field }) => (<FormItem><FormLabel>Last Calibration Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="calibrationIntervalMonths" render={({ field }) => (<FormItem><FormLabel>Interval (Months)</FormLabel><FormControl><Input type="number" step="1" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button type="submit">Register Equipment</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
