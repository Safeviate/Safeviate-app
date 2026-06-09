'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronsUpDown, PlusCircle, Plane, Box, Timer, Gauge, ShieldCheck } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { HEADER_COMPACT_CONTROL_CLASS } from '@/components/page-header';
import {
  PAGE_FORMAT_PRIMARY_BUTTON_CLASS,
  PAGE_FORMAT_SECONDARY_BUTTON_CLASS,
} from '@/lib/page-format-buttons';

const formSchema = z.object({
  tailNumber: z.string().min(1, 'Tail number is required.'),
  make: z.string().min(1, 'Make is required.'),
  model: z.string().min(1, 'Model is required.'),
  type: z.enum(['Single-Engine', 'Multi-Engine']),
  currentHobbs: z.coerce.number().min(0),
  currentTacho: z.coerce.number().min(0),
  tachoAtNext50Inspection: z.coerce.number().min(0),
  tachoAtNext100Inspection: z.coerce.number().min(0),
});

export function AddAircraftDialog({ tenantId }: { tenantId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tailNumber: '',
      make: '',
      model: '',
      type: 'Single-Engine',
      currentHobbs: 0,
      currentTacho: 0,
      tachoAtNext50Inspection: 50,
      tachoAtNext100Inspection: 100,
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const response = await fetch('/api/aircraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft: {
            ...values,
            id: values.tailNumber.replace('-', '').toUpperCase() + '-' + crypto.randomUUID().slice(0, 4),
            components: [],
            documents: [],
            initialHobbs: values.currentHobbs,
            initialTacho: values.currentTacho,
            organizationId: tenantId,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to save aircraft.');
      window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
      toast({ title: 'Aircraft Registered', description: `${values.tailNumber} is now live in the organization fleet.` });
      setIsOpen(false);
      form.reset();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Registration Failed' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          size="compact"
          variant="outline"
          className={cn(
            isMobile
              ? 'w-full justify-between'
              : HEADER_COMPACT_CONTROL_CLASS,
            !isMobile && 'border-card-border bg-background text-foreground shadow-none hover:bg-muted/40'
          )}
        >
          <PlusCircle className="h-4 w-4" />
          <span>Register Asset</span>
          {isMobile ? <ChevronsUpDown className="h-4 w-4 opacity-30" /> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden rounded-xl border-2 p-0 shadow-2xl sm:w-full">
        <DialogHeader className="shrink-0 border-b bg-muted/5 px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.2rem] bg-primary text-white shadow-lg shadow-primary/20 rotate-3 sm:h-14 sm:w-14">
              <Plane className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight sm:text-2xl">Fleet Initialization</DialogTitle>
              <DialogDescription className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground sm:text-[10px]">
                Register a new organization asset for airworthiness tracking.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
              <div className="space-y-6 sm:space-y-8">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
                  <FormField control={form.control} name="tailNumber" render={({ field }) => ( <FormItem><FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Registration Identification</FormLabel><FormControl><Input placeholder="e.g. ZS-XYZ" className="h-11 font-black uppercase tracking-tight shadow-inner sm:h-12 sm:text-lg" {...field} /></FormControl><FormMessage /></FormItem> )} />
                  <FormField control={form.control} name="type" render={({ field }) => ( <FormItem><FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60"><Box className="h-3.5 w-3.5 text-primary" /> Engine Configuration</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-11 font-black uppercase border-2 shadow-sm sm:h-12"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-2xl border-2"><SelectItem value="Single-Engine">Single-Engine</SelectItem><SelectItem value="Multi-Engine">Multi-Engine</SelectItem></SelectContent></Select></FormItem> )} />
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
                  <FormField control={form.control} name="make" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest opacity-60">Manufacturer</FormLabel><FormControl><Input className="h-11 font-bold" placeholder="e.g. Cessna" {...field} /></FormControl></FormItem> )} />
                  <FormField control={form.control} name="model" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest opacity-60">Designation / Model</FormLabel><FormControl><Input className="h-11 font-bold" placeholder="e.g. 172S Skyhawk" {...field} /></FormControl></FormItem> )} />
                </div>
                <div className="grid grid-cols-1 gap-6 rounded-[1.5rem] border-2 bg-muted/5 px-5 py-5 shadow-inner md:grid-cols-2 md:gap-8 sm:px-6 sm:py-6">
                  <FormField control={form.control} name="currentHobbs" render={({ field }) => ( <FormItem><FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary opacity-60"><Timer className="h-3 w-3" /> Initial Hobbs</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-black" {...field} /></FormControl></FormItem> )} />
                  <FormField control={form.control} name="currentTacho" render={({ field }) => ( <FormItem><FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary opacity-60"><Gauge className="h-3 w-3" /> Initial Tacho</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-black" {...field} /></FormControl></FormItem> )} />
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 border-t px-6 py-4 sm:px-8">
              <div className="flex w-full flex-col gap-3 sm:flex-row">
                <DialogClose asChild><Button variant="outline" className={cn(PAGE_FORMAT_SECONDARY_BUTTON_CLASS, 'h-11 flex-1 border-2 px-4 sm:h-12')}>Cancel</Button></DialogClose>
                <Button type="submit" className={cn(PAGE_FORMAT_PRIMARY_BUTTON_CLASS, 'h-11 flex-1 px-4 shadow-xl sm:h-12')}>Confirm Registration</Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
