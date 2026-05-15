'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { usePermissions } from '@/hooks/use-permissions';

const formSchema = z.object({
  taskNumber: z.string().min(1, 'Required'),
  taskDescription: z.string().min(1, 'Required'),
  requiresInspector: z.boolean().default(false),
  partsList: z.string().optional(),
  toolsList: z.string().optional(),
});

export function TaskCardDialog({ workpackId, tenantId, canCreateTaskCards = true }: { workpackId: string; tenantId: string; canCreateTaskCards?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = canCreateTaskCards || hasPermission('maintenance-workpacks-create') || hasPermission('admin-view');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { taskNumber: '', taskDescription: '', requiresInspector: false, partsList: '', toolsList: '' },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const parts = values.partsList?.split('\n').filter((l) => l.trim()).map((line) => {
        const [pn, sn] = line.split(':').map((s) => s.trim());
        return { partNumber: pn || 'Unknown', serialNumber: sn || 'N/A', quantity: 1 };
      }) || [];
      const tools = values.toolsList?.split(',').map((t) => t.trim()).filter(Boolean) || [];
      const taskCard = {
        id: crypto.randomUUID(),
        tenantId,
        workpackId,
        taskNumber: values.taskNumber,
        taskDescription: values.taskDescription,
        requiresInspector: values.requiresInspector,
        isCompleted: false,
        toolsUsed: tools,
        partsInstalled: parts,
        attachments: [],
        createdAt: new Date().toISOString(),
      };
      const res = await fetch('/api/maintenance/task-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskCard }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to create task card.');
      window.dispatchEvent(new Event('safeviate-maintenance-task-cards-updated'));
      toast({ title: 'Task Card Appended', description: `Card ${values.taskNumber} added.` });
      setIsOpen(false);
      form.reset();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to create task card.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="h-9 px-4 text-xs font-black uppercase tracking-tight gap-2 shadow-md shrink-0" disabled={!canCreate}>
          <PlusCircle className="h-4 w-4" /> Append Task Card
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Task Card</DialogTitle>
          <DialogDescription>Add a discrete job card to this workpack.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="taskNumber" render={({ field }) => (
              <FormItem><FormLabel>Task Reference / AMM</FormLabel><FormControl><Input placeholder="e.g. TC-001 or AMM 12-34-56" {...field} className="uppercase font-mono" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="taskDescription" render={({ field }) => (
              <FormItem><FormLabel>Task Description & Scope</FormLabel><FormControl><Textarea className="resize-none" rows={4} placeholder="Perform visual inspection..." {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="requiresInspector" render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="font-bold flex items-center text-red-600">Required Inspection Item (RII)</FormLabel>
                  <DialogDescription className="text-[10px]">Dual-certification needed for flight critical items.</DialogDescription>
                </div>
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="partsList" render={({ field }) => (
                <FormItem>
                  <FormLabel>Parts Installed</FormLabel>
                  <FormControl><Textarea className="font-mono text-xs" rows={3} placeholder="PN: SN (One per line)" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="toolsList" render={({ field }) => (
                <FormItem>
                  <FormLabel>Special Tools</FormLabel>
                  <FormControl><Textarea className="font-mono text-xs" rows={3} placeholder="e.g. TW-001, MG-500" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={!canCreate}>Build Card</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
