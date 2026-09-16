'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, Megaphone, Copy, Database, Printer, Pencil } from 'lucide-react';
import type { ERPMediaTemplate } from '@/types/erp';
import { HEADER_ACTION_BUTTON_CLASS, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import { createClientId } from '@/lib/client/create-client-id';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';

interface MediaTabProps {
  tenantId: string;
}

const TYPE_ORDER: Record<string, number> = {
  'Immediate': 1,
  'Second Statement': 2,
  'Post-Incident': 3
};

const STANDARD_TEMPLATES: Omit<ERPMediaTemplate, 'id'>[] = [
  {
    type: 'Immediate',
    title: 'Initial Holding Statement (Crisis Start)',
    content: `FOR IMMEDIATE RELEASE\n\n[ORGANIZATION NAME] confirms that one of its aircraft, a [AIRCRAFT TYPE], was involved in an occurrence at approximately [TIME] on [DATE] near [LOCATION].\n\nOur emergency response protocols have been activated, and we are working closely with the relevant local authorities and emergency services.\n\nOur primary concern at this time is the safety and well-being of the individuals involved. We are currently gathering further information and will provide updates as soon as confirmed facts are available.\n\nOut of respect for the privacy of those involved and their families, no names or further details will be released until next of kin have been notified.\n\nMedia inquiries should be directed to the Media Relations Office at [PHONE NUMBER] or [EMAIL].\n\n###`,
  },
  {
    type: 'Second Statement',
    title: 'Secondary Update (Ongoing Response)',
    content: `FOR IMMEDIATE RELEASE - UPDATE #1\n\n[ORGANIZATION NAME] provides the following update regarding the aircraft occurrence involving a [AIRCRAFT TYPE] near [LOCATION] on [DATE].\n\nAt this time, we can confirm that [NUMBER] people were on board. We are working with [HOSPITAL/SERVICES] to ensure all individuals receive the necessary care.\n\nThe aircraft was performing a [TRAINING/PRIVATE/MAINTENANCE] flight at the time of the event. [ORGANIZATION NAME] is cooperating fully with the [AVIATION AUTHORITY/INVESTIGATION BOARD] as they begin their inquiry.\n\nWe will provide further information as it becomes available and is confirmed by the appropriate authorities.\n\nMedia inquiries: [PHONE/EMAIL]\n\n###`,
  },
  {
    type: 'Post-Incident',
    title: 'Final Closure Statement',
    content: `FOR IMMEDIATE RELEASE\n\n[ORGANIZATION NAME] wishes to express its deepest gratitude to the emergency services, local authorities, and volunteers who responded to the aircraft occurrence on [DATE].\n\nThe local response phase of this event has now concluded. The [AVIATION AUTHORITY] has assumed control of the investigation, and [ORGANIZATION NAME] will continue to provide all necessary support to their team.\n\nOur thoughts remain with the individuals and families affected by this event. We are providing internal support and counseling to our staff and students during this difficult time.\n\nThis will be the final statement from [ORGANIZATION NAME] regarding the immediate response. Future updates regarding the investigation will be issued by the [AVIATION AUTHORITY].\n\n###`,
  }
];

export function MediaTab({ tenantId }: MediaTabProps) {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ERPMediaTemplate | null>(null);
  const [templates, setTemplates] = useState<ERPMediaTemplate[]>([]);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await fetch('/api/erp-state?category=media', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        setTemplates((payload.data || []) as ERPMediaTemplate[]);
      } catch {
        // ignore load errors
      }
    };
    loadTemplates();
  }, []);

  const persistTemplates = async (nextTemplates: ERPMediaTemplate[]) => {
    setTemplates(nextTemplates);
    await fetch('/api/erp-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'media', data: nextTemplates }),
    }).catch(() => null);
  };

  const canAdmin = hasPermission('operations-erp-admin');

  const sortedTemplates = useMemo(() => {
    if (!templates) return [];
    return [...templates].sort((a, b) => {
      const orderA = TYPE_ORDER[a.type] || 99;
      const orderB = TYPE_ORDER[b.type] || 99;
      return orderA - orderB;
    });
  }, [templates]);

  const handleAddTemplate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canAdmin) return;

    const formData = new FormData(e.currentTarget);
    const newTemplate: ERPMediaTemplate = {
      id: createClientId(),
      type: formData.get('type') as any,
      title: formData.get('title') as string,
      content: formData.get('content') as string,
    };

    const nextTemplates = [newTemplate, ...templates];
    void persistTemplates(nextTemplates);
    setIsAddOpen(false);
    toast({ title: 'Template Saved' });
  };

  const handleUpdateTemplate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTemplate || !canAdmin) return;
    const formData = new FormData(e.currentTarget);
    const formType = formData.get('type') as any;
    const formTitle = formData.get('title') as string;
    const formContent = formData.get('content') as string;

    const nextTemplates = templates.map(t => t.id === editingTemplate.id ? { ...t, type: formType, title: formTitle, content: formContent } : t);
    void persistTemplates(nextTemplates);
    setIsEditOpen(false);
    setEditingTemplate(null);
    toast({ title: 'Template Updated' });
  };

  const handleSeedStandardTemplates = async () => {
    if (!canAdmin) return;
    
    try {
      const seeded = STANDARD_TEMPLATES.map(t => ({...t, id: createClientId()}));
      void persistTemplates([...seeded, ...templates]);
      toast({ title: 'Standard Templates Added' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Seeding Failed', description: error.message });
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to Clipboard' });
  };

  const handlePrint = (template: ERPMediaTemplate) => {
    const printWindow = window.open('', '_blank', 'height=600,width=800');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Media Release</title>');
      printWindow.document.write('<style>body { font-family: serif; padding: 3rem; white-space: pre-wrap; line-height: 1.6; color: #000; } h1 { border-bottom: 2px solid #000; padding-bottom: 0.5rem; margin-bottom: 2rem; font-size: 1.5rem; } .footer { margin-top: 3rem; border-top: 1px solid #ccc; padding-top: 1rem; font-style: italic; font-size: 0.8rem; }</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(`<h1>${template.title}</h1>`);
      printWindow.document.write(template.content);
      printWindow.document.write(`<div class="footer">Printed from Safeviate ERP on ${new Date().toLocaleString()}</div>`);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleDelete = async (id: string) => {
    if (!canAdmin) return;
    const nextTemplates = templates.filter(t => t.id !== id);
    void persistTemplates(nextTemplates);
    toast({ title: 'Template Deleted' });
  };

  return (
    <div className="space-y-6">
      <div className="border-b px-6 py-6">
        <h2 className="font-headline text-2xl font-semibold">Media Release</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Standardized statements for managing public information during a crisis.
        </p>
      </div>

      <div className="flex justify-end px-6">
        {canAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" className={HEADER_SECONDARY_BUTTON_CLASS} onClick={handleSeedStandardTemplates}>
              <Database className="mr-2 h-4 w-4" /> Seed Standard Templates
            </Button>
              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                 <Button className={HEADER_ACTION_BUTTON_CLASS}><PlusCircle className="mr-2 h-4 w-4" /> New Template</Button>
                </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>New Media Statement Template</DialogTitle>
                  <DialogDescription>
                    Create a reusable media statement template for emergency communication.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddTemplate} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Statement Type</Label>
                      <Select name="type" defaultValue="Immediate">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Immediate">Immediate Statement</SelectItem>
                          <SelectItem value="Second Statement">Secondary Update</SelectItem>
                          <SelectItem value="Post-Incident">Final Closure</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Internal Title</Label><Input name="title" required /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Statement Content</Label>
                    <Textarea name="content" className="min-h-64" placeholder="Use placeholders like [DATE], [LOCATION], [AIRCRAFT]..." required />
                  </div>
                  <DialogFooter>
                     <DialogClose asChild><Button variant="outline" className={HEADER_SECONDARY_BUTTON_CLASS}>Cancel</Button></DialogClose>
                     <Button type="submit" className={HEADER_ACTION_BUTTON_CLASS}>Save Template</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="border-y px-6 py-5">
          <h4 className="font-headline text-lg font-semibold">Media Release Templates</h4>
        </div>
        {sortedTemplates.map(template => (
          <section key={template.id} className="border-b px-6 py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h5 className="text-lg font-semibold">{template.title}</h5>
                <p className="text-sm text-muted-foreground">Type: {template.type}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className={HEADER_SECONDARY_BUTTON_CLASS} onClick={() => handlePrint(template)}><Printer className="h-4 w-4 mr-2" /> Print</Button>
                <Button variant="outline" className={HEADER_SECONDARY_BUTTON_CLASS} onClick={() => handleCopy(template.content)}><Copy className="h-4 w-4 mr-2" /> Copy</Button>
                {canAdmin && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => { setEditingTemplate(template); setIsEditOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(template.id)}><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-6">
              <div className="rounded-md border border-dashed bg-muted/30 p-4 font-serif text-sm italic leading-relaxed whitespace-pre-wrap">
                {template.content}
              </div>
            </div>
          </section>
        ))}
        {(!templates || templates.length === 0) && (
          <div className="flex h-48 flex-col items-center justify-center gap-4 border-b border-dashed text-muted-foreground">
            <Megaphone className="h-10 w-10 opacity-20" />
            <p className="text-sm">No media templates found.</p>
          </div>
        )}
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Media Statement Template</DialogTitle>
            <DialogDescription>
              Update the selected media statement template.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateTemplate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Statement Type</Label>
                <Select name="type" defaultValue={editingTemplate?.type}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Immediate">Immediate Statement</SelectItem>
                    <SelectItem value="Second Statement">Secondary Update</SelectItem>
                    <SelectItem value="Post-Incident">Final Closure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Internal Title</Label>
                <Input name="title" defaultValue={editingTemplate?.title} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Statement Content</Label>
              <Textarea name="content" className="min-h-64" defaultValue={editingTemplate?.content} required />
            </div>
            <DialogFooter>
               <DialogClose asChild><Button variant="outline" className={HEADER_SECONDARY_BUTTON_CLASS}>Cancel</Button></DialogClose>
               <Button type="submit" className={HEADER_ACTION_BUTTON_CLASS}>Update Template</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
