'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronsUpDown, PlusCircle } from 'lucide-react';
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
import type { Vehicle } from '@/types/vehicle';

const formSchema = z.object({
  registrationNumber: z.string().min(1, 'Registration number is required.'),
  make: z.string().min(1, 'Make is required.'),
  model: z.string().min(1, 'Model is required.'),
  type: z.enum(['Car', 'Truck', 'Van', 'Bus', 'Utility', 'Other']),
  vin: z.string().optional(),
  currentOdometer: z.coerce.number().min(0),
  nextServiceDueDate: z.string().optional(),
  nextServiceDueOdometer: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
});

export function AddVehicleDialog({ tenantId }: { tenantId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      registrationNumber: '',
      make: '',
      model: '',
      type: 'Car',
      vin: '',
      currentOdometer: 0,
      nextServiceDueDate: '',
      nextServiceDueOdometer: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const newVehicle: Vehicle = {
        ...values,
        id: values.registrationNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() + '-' + crypto.randomUUID().slice(0, 4),
        nextServiceDueDate: values.nextServiceDueDate || null,
        nextServiceDueOdometer: values.nextServiceDueOdometer === '' ? null : Number(values.nextServiceDueOdometer),
        documents: [],
        organizationId: tenantId,
      };

      const response = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle: newVehicle }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Failed to register vehicle.');
      }

      window.dispatchEvent(new Event('safeviate-vehicles-updated'));
      toast({
        title: 'Vehicle Added',
        description: `${values.registrationNumber} has been added to the fleet.`,
      });
      setIsOpen(false);
      form.reset();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to register vehicle.',
      });
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
            <PlusCircle className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Add Vehicle
          </span>
          {isMobile ? <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl p-8">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight">Register Ground Asset</DialogTitle>
          <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Enter the operational details for the new company vehicle.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="registrationNumber" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Registration</FormLabel><FormControl><Input placeholder="CA 123-456" className="h-11 font-black uppercase" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Car">Car</SelectItem><SelectItem value="Truck">Truck</SelectItem><SelectItem value="Van">Van</SelectItem><SelectItem value="Bus">Bus</SelectItem><SelectItem value="Utility">Utility</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="make" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Make</FormLabel><FormControl><Input className="h-11 font-bold" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="model" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Model</FormLabel><FormControl><Input className="h-11 font-bold" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="vin" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">VIN #</FormLabel><FormControl><Input placeholder="Optional" className="h-11 font-mono font-bold uppercase" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="currentOdometer" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Odometer (km)</FormLabel><FormControl><Input type="number" step="1" className="h-11 font-mono font-bold" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="nextServiceDueDate" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Next Service Date</FormLabel><FormControl><Input type="date" className="h-11 font-bold" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="nextServiceDueOdometer" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest opacity-70">Next Odo Target</FormLabel><FormControl><Input type="number" step="1" className="h-11 font-mono font-bold" value={field.value} onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button variant="outline" className="h-11 px-8 text-[10px] font-black uppercase border-slate-300 shadow-sm">Cancel</Button></DialogClose>
              <Button type="submit" className="h-11 px-8 text-[10px] font-black uppercase shadow-lg">Register Vehicle</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
