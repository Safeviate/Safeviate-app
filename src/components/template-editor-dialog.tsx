'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, GripVertical, Trash2, Library } from 'lucide-react';
import type { QualityAuditChecklistTemplate, AuditChecklistItem, ChecklistSection, ComplianceRequirement, ExternalOrganization } from '@/types/quality';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  CardControlHeader,
  HEADER_ACTION_BUTTON_CLASS,
  HEADER_MOBILE_ACTION_BUTTON_CLASS,
} from '@/components/page-header';
import { BackNavButton } from '@/components/back-nav-button';

type DepartmentOption = { id: string; name: string };

const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string().min(1, 'Item text is required.'),
  type: z.enum(['Checkbox', 'Textbox', 'Number', 'Date']),
  regulationReference: z.string().optional(),
  companyReference: z.string().optional(),
  responsibleManagerId: z.string().optional(),
  nextAuditDate: z.string().optional(),
});

const sectionSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Section title is required'),
  items: z.array(checklistItemSchema),
});

const formSchema = z.object({
  title: z.string().min(1, 'Template title is required.'),
  departmentId: z.string().min(1, 'Department is required.'),
  companyId: z.string().default('internal'),
  sections: z.array(sectionSchema).min(1, 'At least one section is required.'),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(defaultDepartmentId: string, existingTemplate?: QualityAuditChecklistTemplate): FormValues {
  if (existingTemplate) {
    return {
      title: existingTemplate.title,
      departmentId: existingTemplate.departmentId,
      companyId: existingTemplate.organizationId || 'internal',
      sections: existingTemplate.sections,
    };
  }

  return {
    title: '',
    departmentId: defaultDepartmentId,
    companyId: 'internal',
    sections: [],
  };
}

type TemplateEditorActionArgs = {
  complianceItems: ComplianceRequirement[];
  onAiGeneratedSections: (sections: ChecklistSection[]) => void;
  onImportFromMatrix: (sections: ChecklistSection[]) => void;
};

interface TemplateEditorDialogProps {
  tenantId: string;
  departments: DepartmentOption[];
  existingTemplate?: QualityAuditChecklistTemplate;
  trigger?: ReactNode;
  templateLabel: string;
  dialogDescription: string;
  saveEndpoint: string;
  successCreateTitle: string;
  successUpdateTitle: string;
  successDescription: string;
  generatedToastTitle: string;
  generatedToastDescription: (sectionCount: number) => string;
  importedToastTitle: string;
  importedToastDescription: (sectionCount: number) => string;
  renderSectionActions: (args: TemplateEditorActionArgs) => ReactNode;
  enableOrganizationSelection?: boolean;
  renderAsPage?: boolean;
  pageBackHref?: string;
  pageBackText?: string;
}

export function TemplateEditorDialog({
  tenantId,
  departments,
  existingTemplate,
  trigger,
  templateLabel,
  dialogDescription,
  saveEndpoint,
  successCreateTitle,
  successUpdateTitle,
  successDescription,
  generatedToastTitle,
  generatedToastDescription,
  importedToastTitle,
  importedToastDescription,
  renderSectionActions,
  enableOrganizationSelection = false,
  renderAsPage = false,
  pageBackHref = '/',
  pageBackText = 'Back',
}: TemplateEditorDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();
  const [complianceItems, setComplianceItems] = useState<ComplianceRequirement[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<DepartmentOption[]>(departments);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const departmentOptions = availableDepartments.length > 0 ? availableDepartments : [{ id: 'general', name: 'General' }];
  const defaultDepartmentId = availableDepartments[0]?.id ?? 'general';
  const dragSectionNode = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen && !renderAsPage) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/tenant-config', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ config: null }));
        const config = payload?.config || {};
        if (!cancelled && Array.isArray(config['compliance-matrix'])) {
          setComplianceItems(config['compliance-matrix']);
        }
      } catch {
        if (!cancelled) setComplianceItems([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    setAvailableDepartments(departments);
  }, [departments]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const loadDepartments = async () => {
      try {
        const response = await fetch('/api/departments', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ departments: [] }));
        if (!cancelled && Array.isArray(payload.departments)) {
          setAvailableDepartments(payload.departments);
        }
      } catch {
        if (!cancelled) {
          setAvailableDepartments(departments);
        }
      }
    };

    void loadDepartments();

    return () => {
      cancelled = true;
    };
  }, [departments, isOpen]);

  useEffect(() => {
    if ((!isOpen && !renderAsPage) || !enableOrganizationSelection) return;

    let cancelled = false;
    const loadOrganizations = async () => {
      try {
        const response = await fetch('/api/external-organizations', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ organizations: [] }));
        if (!cancelled && Array.isArray(payload.organizations)) {
          setOrganizations(payload.organizations);
        }
      } catch {
        if (!cancelled) {
          setOrganizations([]);
        }
      }
    };

    void loadOrganizations();
    return () => {
      cancelled = true;
    };
  }, [enableOrganizationSelection, isOpen, renderAsPage]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(defaultDepartmentId, existingTemplate),
  });

  const { fields: sectionFields, append: appendSection, remove: removeSection, move: moveSection } = useFieldArray({
    control: form.control,
    name: 'sections',
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(toFormValues(defaultDepartmentId, existingTemplate));
    }
  }, [defaultDepartmentId, isOpen, existingTemplate, form]);

  useEffect(() => {
    if (!isOpen || existingTemplate) return;
    if (availableDepartments.length === 0) return;

    const currentDepartmentId = form.getValues('departmentId');
    if (!currentDepartmentId) {
      form.setValue('departmentId', availableDepartments[0].id, { shouldValidate: true });
    }
  }, [availableDepartments, existingTemplate, form, isOpen]);

  const onSubmit = async (values: FormValues) => {
    try {
      const dataToSave = {
        ...values,
        organizationId: enableOrganizationSelection
          ? values.companyId === 'internal'
            ? null
            : values.companyId
          : existingTemplate?.organizationId || null,
        sections: values.sections.map((section) => ({
          ...section,
          items: section.items.map((item) => ({
            id: item.id || crypto.randomUUID(),
            text: item.text,
            type: item.type,
            regulationReference: item.regulationReference,
            companyReference: item.companyReference,
            responsibleManagerId: item.responsibleManagerId,
            nextAuditDate: item.nextAuditDate,
          })),
        })),
      };

      const template = existingTemplate
        ? { ...existingTemplate, ...dataToSave }
        : {
            ...dataToSave,
            id: crypto.randomUUID(),
            category: departmentOptions.find((d) => d.id === values.departmentId)?.name || 'General',
          };

      const response = await fetch(saveEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      });
      if (!response.ok) {
        throw new Error(`Failed to save ${templateLabel.toLowerCase()} template`);
      }

      toast({
        title: existingTemplate ? successUpdateTitle : successCreateTitle,
        description: successDescription,
      });
      window.dispatchEvent(new Event(saveEndpoint.includes('gap') ? 'safeviate-gap-analysis-templates-updated' : 'safeviate-quality-templates-updated'));
      setIsOpen(false);
      if (renderAsPage) {
        router.push(pageBackHref);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleAiGeneratedSections = (sections: ChecklistSection[]) => {
    form.setValue('sections', sections, { shouldValidate: true });
    toast({ title: generatedToastTitle, description: generatedToastDescription(sections.length) });
  };

  const handleImportFromMatrix = (importedSections: ChecklistSection[]) => {
    form.setValue('sections', [...form.getValues('sections'), ...importedSections]);
    toast({ title: importedToastTitle, description: importedToastDescription(importedSections.length) });
  };

  const handleSectionDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    dragSectionNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleSectionDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragSectionNode.current && e.currentTarget !== dragSectionNode.current) {
      e.currentTarget.classList.add('border-primary', 'border-dashed', 'border-2');
    }
  };

  const handleSectionDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('border-primary', 'border-dashed', 'border-2');
  };

  const handleSectionDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const draggedIndex = Number(e.dataTransfer.getData('text/plain'));
    const targetIndex = Number(e.currentTarget.dataset.index);
    if (!isNaN(draggedIndex) && !isNaN(targetIndex)) {
      moveSection(draggedIndex, targetIndex);
    }
    e.currentTarget.classList.remove('border-primary', 'border-dashed', 'border-2');
    dragSectionNode.current = null;
  };

  const SectionItems = ({ sectionIndex }: { sectionIndex: number }) => {
    const { fields, append, remove, move } = useFieldArray({
      control: form.control,
      name: `sections.${sectionIndex}.items`,
    });

    const dragItemNode = useRef<HTMLDivElement | null>(null);

    const addItem = (type: AuditChecklistItem['type']) => {
      append({
        id: crypto.randomUUID(),
        text: '',
        type,
        regulationReference: '',
        companyReference: '',
        responsibleManagerId: '',
        nextAuditDate: '',
      });
    };

    const handleItemDragStart = (e: React.DragEvent, index: number) => {
      dragItemNode.current = e.currentTarget as HTMLDivElement;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    };

    const handleItemDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragItemNode.current && e.currentTarget !== dragItemNode.current) {
        (e.currentTarget as HTMLDivElement).classList.add('border-primary', 'border-dashed', 'border-2');
      }
    };

    const handleItemDragLeave = (e: React.DragEvent) => {
      (e.currentTarget as HTMLDivElement).classList.remove('border-primary', 'border-dashed', 'border-2');
    };

    const handleItemDrop = (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      const draggedIndex = Number(e.dataTransfer.getData('text/plain'));
      if (!isNaN(draggedIndex) && !isNaN(targetIndex)) {
        move(draggedIndex, targetIndex);
      }
      (e.currentTarget as HTMLDivElement).classList.remove('border-primary', 'border-dashed', 'border-2');
      dragItemNode.current = null;
    };

    return (
      <div className="pl-4 border-l-2 ml-2 space-y-3">
        {fields.map((item, itemIndex) => (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => handleItemDragStart(e, itemIndex)}
            onDragOver={(e) => handleItemDragOver(e, itemIndex)}
            onDragLeave={handleItemDragLeave}
            onDrop={(e) => handleItemDrop(e, itemIndex)}
            className="flex items-start gap-2 p-3 border rounded-lg bg-background transition-shadow"
          >
            <GripVertical className="h-5 w-5 mt-8 text-muted-foreground cursor-grab" />
            <div className="grid grid-cols-1 gap-4 flex-1">
              <FormField
                control={form.control}
                name={`sections.${sectionIndex}.items.${itemIndex}.text`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Text (Type: {item.type})</FormLabel>
                    <FormControl><Textarea className="min-h-24" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`sections.${sectionIndex}.items.${itemIndex}.regulationReference`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Regulation Ref.</FormLabel>
                    <FormControl><Input placeholder="e.g., EASA.ORO.FC.115" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(itemIndex)} className="mt-6 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addItem('Checkbox')}><PlusCircle className="mr-2 h-4 w-4" />Checkbox</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addItem('Textbox')}><PlusCircle className="mr-2 h-4 w-4" />Textbox</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addItem('Number')}><PlusCircle className="mr-2 h-4 w-4" />Number</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addItem('Date')}><PlusCircle className="mr-2 h-4 w-4" />Date</Button>
        </div>
      </div>
    );
  };

  const editorForm = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <ScrollArea className="h-[70vh] pr-6">
          <div className="space-y-6 p-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Title</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="departmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger disabled={departmentOptions.length === 0}>
                          <SelectValue placeholder="Select a department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departmentOptions.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {enableOrganizationSelection ? (
                <FormField
                  control={form.control}
                  name="companyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Selected Company</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a company" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="internal">Internal Company</SelectItem>
                          {organizations.map((organization) => (
                            <SelectItem key={organization.id} value={organization.id}>
                              {organization.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </div>

            <Separator />

            <div>
              <div className="mb-4 rounded-xl border bg-muted/20 p-4">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.16em] text-foreground">Create / Import</h3>
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Add sections manually or import from the matrix, gap analyses, or AI.
                    </p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    4 actions
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => appendSection({ id: crypto.randomUUID(), title: '', items: [] })}
                    className="h-10 justify-start gap-2 border-[hsl(var(--header-button-border))] bg-[hsl(var(--header-button-background))] px-3 text-[10px] font-black uppercase shadow-none hover:bg-[hsl(var(--header-button-hover))]"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Manual Creation
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    {renderSectionActions({
                      complianceItems,
                      onAiGeneratedSections: handleAiGeneratedSections,
                      onImportFromMatrix: handleImportFromMatrix,
                    })}
                  </div>
                </div>
              </div>
              {sectionFields.map((section, index) => (
                <div
                  key={section.id}
                  data-index={index}
                  draggable
                  onDragStart={(e) => handleSectionDragStart(e, index)}
                  onDragOver={handleSectionDragOver}
                  onDragLeave={handleSectionDragLeave}
                  onDrop={handleSectionDrop}
                >
                  <Card className="mb-4 bg-muted/30 transition-shadow">
                    <CardHeader>
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-5 w-5 mt-2 text-muted-foreground cursor-grab" />
                        <div className="flex-1">
                          <FormField
                            control={form.control}
                            name={`sections.${index}.title`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Section Title</FormLabel>
                                <FormControl><Input {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeSection(index)} className="mt-6 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <SectionItems sectionIndex={index} />
                    </CardContent>
                  </Card>
                </div>
              ))}
              {sectionFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No sections yet. Add one to get started.</p>}
              <FormField control={form.control} name="sections" render={() => <FormMessage />} />
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          {renderAsPage ? (
            <Button asChild type="button" variant="outline">
              <Link href={pageBackHref}>Cancel</Link>
            </Button>
          ) : (
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
          )}
          <Button type="submit">Save Template</Button>
        </DialogFooter>
      </form>
    </Form>
  );

  if (renderAsPage) {
    return (
      <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-4 px-1 pt-4">
        <Card className="border shadow-none overflow-hidden">
          <CardControlHeader
            className="main-page-header flex w-full shrink-0 flex-col bg-[hsl(var(--card-header-band-background))]"
            isMobile={false}
            context={(
              <div className="flex min-w-0 flex-col gap-1">
                <p className="main-page-header__description text-[10px] font-medium text-muted-foreground sm:text-xs">
                  {dialogDescription}
                </p>
              </div>
            )}
            actions={<BackNavButton href={pageBackHref} text={pageBackText} />}
          />
          <CardContent className="p-4 md:p-6 bg-muted/5">
            {editorForm}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button
            variant={isMobile ? 'outline' : 'default'}
            className={isMobile ? HEADER_MOBILE_ACTION_BUTTON_CLASS : HEADER_ACTION_BUTTON_CLASS}
          >
            <span className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              {`New ${templateLabel} Template`}
            </span>
            {isMobile ? <Library className="h-3.5 w-3.5 text-muted-foreground" /> : null}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="w-full sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{existingTemplate ? 'Edit' : 'New'} {templateLabel} Template</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        {editorForm}
      </DialogContent>
    </Dialog>
  );
}
