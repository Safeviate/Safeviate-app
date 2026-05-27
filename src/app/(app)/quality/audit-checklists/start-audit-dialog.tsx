'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { CalendarIcon, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QualityAudit, QualityAuditChecklistTemplate, ExternalOrganization } from '@/types/quality';
import type { Department } from '../../admin/department/page';
import type { Personnel } from '../../users/personnel/page';

const toNoonUtcIso = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString();

const formSchema = z.object({
  auditeeId: z.string().min(1, 'Auditee is required.'),
  scope: z.string().min(1, 'Scope is required.'),
  auditDate: z.date({ required_error: 'Audit date is required.' }),
});

type FormValues = z.infer<typeof formSchema>;

interface StartAuditDialogProps {
  template: QualityAuditChecklistTemplate;
  tenantId: string;
  personnel: Personnel[];
  departments: Department[];
  trigger?: React.ReactNode;
}

export function StartAuditDialog({
  template,
  tenantId,
  personnel,
  departments,
  trigger,
}: StartAuditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newAuditId, setNewAuditId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);

  useEffect(() => {
    if (isOpen) {
        void fetch('/api/external-organizations', { cache: 'no-store' })
          .then((response) => response.json())
          .then((payload) => setOrganizations(Array.isArray(payload.organizations) ? payload.organizations : []))
          .catch(() => setOrganizations([]));
    }
  }, [isOpen]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      auditeeId: '',
      scope: '',
      auditDate: new Date(),
    },
  });
  const auditOwnerName = userProfile
    ? `${userProfile.firstName} ${userProfile.lastName}`.trim() || userProfile.email
    : 'Current user';
  const totalSections = template.sections.length;
  const totalItems = template.sections.reduce((count, section) => count + section.items.length, 0);
  
  useEffect(() => {
    if (!isOpen && newAuditId) {
      router.push(`/quality/audits/${newAuditId}`);
      setNewAuditId(null);
    }
  }, [isOpen, newAuditId, router]);


  const onSubmit = async (values: FormValues) => {
    if (!userProfile) {
      toast({ variant: 'destructive', title: 'Error', description: 'User session not found.' });
        return;
    }
    setIsSubmitting(true);
    
    try {
        const auditsResponse = await fetch('/api/quality-audits', { cache: 'no-store' });
        const auditsPayload = await auditsResponse.json().catch(() => ({ audits: [] }));
        const auditsList = Array.isArray(auditsPayload.audits) ? (auditsPayload.audits as QualityAudit[]) : [];
        const nextCount = auditsList.length + 1;
        const newAuditNumber = `AUD-${String(nextCount).padStart(4, '0')}`;

        // Detect if auditee is an external company
        const isExternalOrg = organizations?.some(org => org.id === values.auditeeId);

        const createdId = crypto.randomUUID();
        const newAuditData: QualityAudit = {
            id: createdId,
            templateId: template.id,
            title: template.title,
            auditNumber: newAuditNumber,
            auditorId: userProfile.id,
            auditeeId: values.auditeeId,
            organizationId: isExternalOrg ? values.auditeeId : null,
            scope: values.scope,
            auditDate: toNoonUtcIso(values.auditDate),
            status: 'Scheduled',
            findings: [],
        };

        const response = await fetch('/api/quality-audits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audit: newAuditData }),
        });
        if (!response.ok) throw new Error('Failed to save audit');
        
        setNewAuditId(createdId);
        toast({ title: 'Audit Created', description: `Audit ${newAuditNumber} is ready to open.` });
        
        window.dispatchEvent(new Event('safeviate-quality-updated'));
        setIsOpen(false);

    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Failed to start audit', description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {trigger ? (
            <DialogTrigger asChild>{trigger}</DialogTrigger>
        ) : (
            <DialogTrigger asChild>
                <Button><PlayCircle className='mr-2 h-4 w-4' /> Create Audit</Button>
            </DialogTrigger>
        )}
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Create Audit Session</DialogTitle>
          <DialogDescription>
            Using template: &quot;{template.title}&quot;. This will create a scheduled audit record and open the audit workspace after save.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <Card className="border bg-muted/20 shadow-none">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">What will be created</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{template.title}</p>
                  </div>
                  <div className="rounded-full border bg-background px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                    {totalSections} sections · {totalItems} items
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border bg-background px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Audit target</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">Department, person, or external company</p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Scope</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">Short description of what is being reviewed</p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Start date</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">Planned audit date and opening timestamp</p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-2 sm:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Audit owner</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{auditOwnerName}</p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Status on create</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">Scheduled</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <FormField
              control={form.control}
              name="auditeeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Audit Target</FormLabel>
                   <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select target..." />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                           <SelectGroup>
                               <SelectLabel>Internal departments</SelectLabel>
                               {departments.map(dept => (
                                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                               ))}
                           </SelectGroup>
                           <SelectGroup>
                               <SelectLabel>External companies</SelectLabel>
                               {(organizations || []).map(org => (
                                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                               ))}
                           </SelectGroup>
                           <SelectGroup>
                               <SelectLabel>Personnel</SelectLabel>
                               {personnel.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                                ))}
                           </SelectGroup>
                        </SelectContent>
                   </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose the department, person, or external company this audit will be attached to.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="scope" render={({ field }) => (
              <FormItem>
                <FormLabel>Audit Scope / Objective</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Q2 maintenance procedures review" {...field} />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Keep this short and specific so the audit purpose is obvious at a glance.
                </p>
                <FormMessage />
              </FormItem>
            )} />
             <FormField
                control={form.control}
                name="auditDate"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel>Planned Start Date</FormLabel>
                    <Popover>
                        <PopoverTrigger asChild>
                        <FormControl>
                            <Button
                            variant={"outline"}
                            className={cn("w-full pl-3 text-left font-normal",!field.value && "text-muted-foreground")}
                            >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                        </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                        <CustomCalendar
                            selectedDate={field.value}
                            onDateSelect={field.onChange}
                        />
                        </PopoverContent>
                        </Popover>
                    <p className="text-xs text-muted-foreground">
                      This is the date the audit session will be opened and scheduled from.
                    </p>
                    <FormMessage />
                    </FormItem>
                )}
             />
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create Audit"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
