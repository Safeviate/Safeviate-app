'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Copy, Edit, GripVertical, Loader2, Plus, Trash2, Layers3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MainPageHeader } from '@/components/page-header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type {
  AssetInspectionAssetType,
  AssetInspectionScope,
  AssetInspectionTemplate,
  AssetInspectionTemplateSection,
  AssetInspectionTemplateItem,
} from '@/types/inspection';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type TemplateSectionDraft = AssetInspectionTemplateSection;

const ASSET_TYPE_OPTIONS: { value: AssetInspectionAssetType | 'all'; label: string }[] = [
  { value: 'aircraft', label: 'Aircraft' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'all', label: 'All Assets' },
];

const SCOPE_OPTIONS: { value: AssetInspectionScope; label: string }[] = [
  { value: 'Exterior', label: 'Exterior' },
  { value: 'Interior', label: 'Interior' },
  { value: 'Both', label: 'Both' },
];

function createEmptySection(): TemplateSectionDraft {
  return {
    id: crypto.randomUUID(),
    title: '',
    items: [
        {
          id: crypto.randomUUID(),
          label: '',
          outcome: 'Pass',
          scope: 'Both',
          minPhotos: 4,
        },
    ],
  };
}

function hydrateTemplate(template: AssetInspectionTemplate) {
  return {
    id: template.id,
    title: template.title,
    assetType: template.assetType,
    sections: template.sections.length > 0 ? template.sections : [createEmptySection()],
  };
}

export default function AssetInspectionTemplatesPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [templates, setTemplates] = useState<AssetInspectionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateTitle, setTemplateTitle] = useState('');
  const [assetType, setAssetType] = useState<AssetInspectionAssetType | 'all'>('aircraft');
  const [sections, setSections] = useState<TemplateSectionDraft[]>([createEmptySection()]);
  const [copySourceTitle, setCopySourceTitle] = useState('');
  const [isCopyDraft, setIsCopyDraft] = useState(false);
  const sectionDragRef = useRef<HTMLDivElement | null>(null);
  const itemDragRef = useRef<HTMLDivElement | null>(null);
  const copiedTemplateRef = useRef<string | null>(null);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/asset-inspection-templates', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ templates: [] }));
      const nextTemplates = Array.isArray(payload.templates) ? payload.templates : [];
      setTemplates(nextTemplates);
      if (!selectedTemplateId && nextTemplates[0]) {
        const first = nextTemplates[0] as AssetInspectionTemplate;
        setSelectedTemplateId(first.id);
        setTemplateTitle(first.title);
        setAssetType(first.assetType);
        setSections(first.sections.length > 0 ? first.sections : [createEmptySection()]);
      }
    } catch {
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    const copyFrom = searchParams?.get('copyFrom')?.trim() || '';
    if (!copyFrom || templates.length === 0 || copiedTemplateRef.current === copyFrom) return;
    const source = templates.find((template) => template.id === copyFrom);
    if (!source) return;
    copiedTemplateRef.current = copyFrom;
    setCopySourceTitle(source.title);
    setIsCopyDraft(true);
    duplicateTemplate(source);
  }, [searchParams, templates]);

  const sortedTemplates = useMemo(
    () =>
      [...templates].sort((a, b) => a.title.localeCompare(b.title)),
    [templates],
  );

  const selectTemplate = (template: AssetInspectionTemplate) => {
    const hydrated = hydrateTemplate(template);
    setSelectedTemplateId(hydrated.id);
    setTemplateTitle(hydrated.title);
    setAssetType(hydrated.assetType);
    setSections(hydrated.sections);
    setCopySourceTitle('');
    setIsCopyDraft(false);
  };

  const duplicateTemplate = (template: AssetInspectionTemplate) => {
    const copyTitle = `${template.title} Copy`;
    setSelectedTemplateId('');
    setTemplateTitle(copyTitle);
    setAssetType(template.assetType);
    setIsCopyDraft(true);
    setSections(hydrateTemplate(template).sections.map((section) => ({
      ...section,
      id: crypto.randomUUID(),
      items: section.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      })),
    })));
  };

  const deleteTemplate = async (template: AssetInspectionTemplate) => {
    const confirmed = window.confirm(`Delete template \"${template.title}\"?`);
    if (!confirmed) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/asset-inspection-templates?id=${encodeURIComponent(template.id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to delete template.');
      }

      toast({ title: 'Template deleted', description: `${template.title} was removed.` });
      window.dispatchEvent(new Event('safeviate-asset-inspection-templates-updated'));
      await loadTemplates();
      if (selectedTemplateId === template.id) {
        resetForm();
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete template.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getInspectionHref = (template: AssetInspectionTemplate) => {
    const assetTypeParam = template.assetType === 'all' ? 'aircraft' : template.assetType;
    return `/assets/inspections/new?assetType=${encodeURIComponent(assetTypeParam)}&template=${encodeURIComponent(template.id)}`;
  };

  const resetForm = () => {
    setSelectedTemplateId('');
    setTemplateTitle('');
    setAssetType('aircraft');
    setSections([createEmptySection()]);
    setCopySourceTitle('');
    setIsCopyDraft(false);
    copiedTemplateRef.current = null;
  };

  const updateSection = (sectionIndex: number, updates: Partial<TemplateSectionDraft>) => {
    setSections((current) =>
      current.map((section, index) => (index === sectionIndex ? { ...section, ...updates } : section)),
    );
  };

  const updateItem = (sectionIndex: number, itemIndex: number, updates: Partial<AssetInspectionTemplateItem>) => {
    setSections((current) =>
      current.map((section, index) => {
        if (index !== sectionIndex) return section;
        return {
          ...section,
          items: section.items.map((item, currentItemIndex) =>
            currentItemIndex === itemIndex ? { ...item, ...updates } : item,
          ),
        };
      }),
    );
  };

  const addSection = () => setSections((current) => [...current, createEmptySection()]);

  const moveSection = (fromIndex: number, toIndex: number) => {
    setSections((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const addItem = (sectionIndex: number) => {
    setSections((current) =>
      current.map((section, index) => {
        if (index !== sectionIndex) return section;
        return {
          ...section,
          items: [
            ...section.items,
              {
                id: crypto.randomUUID(),
                label: '',
                outcome: 'Pass',
                scope: 'Both',
                minPhotos: 4,
              },
            ],
        };
      }),
    );
  };

  const moveItem = (sectionIndex: number, fromIndex: number, toIndex: number) => {
    setSections((current) =>
      current.map((section, index) => {
        if (index !== sectionIndex) return section;
        const nextItems = [...section.items];
        const [moved] = nextItems.splice(fromIndex, 1);
        nextItems.splice(toIndex, 0, moved);
        return { ...section, items: nextItems };
      }),
    );
  };

  const removeSection = (sectionIndex: number) => {
    setSections((current) => current.filter((_, index) => index !== sectionIndex));
  };

  const removeItem = (sectionIndex: number, itemIndex: number) => {
    setSections((current) =>
      current.map((section, index) => {
        if (index !== sectionIndex) return section;
        return {
          ...section,
          items: section.items.filter((_, currentIndex) => currentIndex !== itemIndex),
        };
      }),
    );
  };

  const handleSave = async () => {
    if (!templateTitle.trim()) {
      toast({ variant: 'destructive', title: 'Template title required', description: 'Please give the template a name.' });
      return;
    }

    const cleanedSections = sections
      .map((section) => ({
        ...section,
        title: section.title.trim(),
        items: section.items
          .map((item) => ({
            ...item,
            label: item.label.trim(),
            minPhotos: Math.max(4, Number(item.minPhotos || 0)),
          }))
          .filter((item) => item.label.length > 0),
      }))
      .filter((section) => section.title.length > 0 && section.items.length > 0);

    if (cleanedSections.length === 0) {
      toast({ variant: 'destructive', title: 'Add sections and questions', description: 'At least one section with one question is required.' });
      return;
    }

    setIsSaving(true);
    try {
      const template: AssetInspectionTemplate = {
        id: isCopyDraft ? crypto.randomUUID() : (selectedTemplateId || crypto.randomUUID()),
        title: templateTitle.trim(),
        assetType,
        sections: cleanedSections,
      };

      const response = await fetch('/api/asset-inspection-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to save template.');
      }

      toast({ title: 'Template saved', description: `${template.title} is ready for inspections.` });
      window.dispatchEvent(new Event('safeviate-asset-inspection-templates-updated'));
      await loadTemplates();
      setSelectedTemplateId(template.id);
      setCopySourceTitle('');
      setIsCopyDraft(false);
      copiedTemplateRef.current = null;
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save template.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-1 pt-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <Skeleton className="h-[760px] w-full" />
          <Skeleton className="h-[760px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-1 pt-4">
      <Card className="overflow-hidden border shadow-none">
        <MainPageHeader
          title="Inspection Templates"
          description="Build reusable checklists for aircraft, vehicles, or any other asset type."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="compact" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                <Link href="/assets/inspections/new?assetType=aircraft">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Inspections
                </Link>
              </Button>
              <Button type="button" variant="outline" size="compact" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]" onClick={resetForm}>
                <Layers3 className="h-3.5 w-3.5" />
                New Template
              </Button>
            </div>
          )}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
        <Card className="overflow-hidden border shadow-none">
          <CardContent className="space-y-5 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Template Title</Label>
                <Input value={templateTitle} onChange={(event) => setTemplateTitle(event.target.value)} placeholder="e.g. Aircraft Exterior Inspection" />
                {copySourceTitle ? (
                  <p className="text-[10px] font-medium text-muted-foreground">
                    Creating a copy of <span className="font-semibold text-foreground">{copySourceTitle}</span>.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Asset Type</Label>
                <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetInspectionAssetType | 'all')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Sections</p>
                  <p className="mt-1 text-sm text-muted-foreground">Group questions into logical parts like Exterior, Interior, or anything else your operation needs.</p>
                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">Drag the grip icon to reorder sections and questions.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]" onClick={addSection}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add Section
                </Button>
              </div>

              <div className="space-y-4">
                {sections.map((section, sectionIndex) => (
                  <div
                    key={section.id}
                    data-index={sectionIndex}
                    ref={(node) => {
                      if (sectionIndex === 0) sectionDragRef.current = node;
                    }}
                    draggable
                    onDragStart={(event) => {
                      sectionDragRef.current = event.currentTarget as HTMLDivElement;
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', String(sectionIndex));
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const draggedIndex = Number(event.dataTransfer.getData('text/plain'));
                      if (!Number.isNaN(draggedIndex) && draggedIndex !== sectionIndex) {
                        moveSection(draggedIndex, sectionIndex);
                      }
                      sectionDragRef.current = null;
                    }}
                    className="rounded-lg border border-card-border bg-muted/15 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-md border bg-background text-muted-foreground active:cursor-grabbing">
                        <GripVertical className="h-5 w-5" />
                      </div>
                      <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Section Title</Label>
                          <Input value={section.title} onChange={(event) => updateSection(sectionIndex, { title: event.target.value })} placeholder="e.g. Exterior" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Items</Label>
                          <div className="flex h-10 items-center rounded-md border bg-background px-3 text-sm font-semibold text-foreground">
                            {section.items.length}
                          </div>
                        </div>
                      </div>
                      <Button type="button" variant="destructive" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeSection(sectionIndex)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {section.items.map((item, itemIndex) => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(event) => {
                            itemDragRef.current = event.currentTarget as HTMLDivElement;
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', JSON.stringify({ sectionIndex, itemIndex }));
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const payload = event.dataTransfer.getData('text/plain');
                            if (!payload) return;
                            const parsed = JSON.parse(payload) as { sectionIndex: number; itemIndex: number };
                            if (
                              Number.isInteger(parsed.sectionIndex)
                              && Number.isInteger(parsed.itemIndex)
                              && (parsed.sectionIndex !== sectionIndex || parsed.itemIndex !== itemIndex)
                            ) {
                              if (parsed.sectionIndex === sectionIndex) {
                                moveItem(sectionIndex, parsed.itemIndex, itemIndex);
                              }
                            }
                            itemDragRef.current = null;
                          }}
                          className="rounded-md border bg-background/70 p-3"
                        >
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_140px_120px_120px_auto]">
                            <div className="flex items-start pt-2 text-muted-foreground">
                              <div className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md border bg-background active:cursor-grabbing">
                                <GripVertical className="h-4 w-4" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Question</Label>
                              <Textarea
                                value={item.label}
                                onChange={(event) => updateItem(sectionIndex, itemIndex, { label: event.target.value })}
                                placeholder="Describe the inspection point"
                                className="min-h-16"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Scope</Label>
                              <Select value={item.scope || 'Both'} onValueChange={(value) => updateItem(sectionIndex, itemIndex, { scope: value as AssetInspectionScope })}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Scope" />
                                </SelectTrigger>
                                <SelectContent>
                                  {SCOPE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Min Photos</Label>
                              <Input
                                type="number"
                                min={0}
                                value={item.minPhotos ?? 0}
                                onChange={(event) => updateItem(sectionIndex, itemIndex, { minPhotos: Number(event.target.value || 0) })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Default Result</Label>
                              <Select value={item.outcome} onValueChange={(value) => updateItem(sectionIndex, itemIndex, { outcome: value as AssetInspectionTemplateItem['outcome'] })}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Result" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Pass">Pass</SelectItem>
                                  <SelectItem value="Fail">Fail</SelectItem>
                                  <SelectItem value="N/A">N/A</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end justify-end">
                              <Button type="button" variant="destructive" size="icon" className="h-9 w-9" onClick={() => removeItem(sectionIndex, itemIndex)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]" onClick={() => addItem(sectionIndex)}>
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Add Question
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button asChild variant="outline" size="compact" className="h-9 border-slate-300">
                <Link href="/assets/inspections/new?assetType=aircraft">Cancel</Link>
              </Button>
              <Button type="button" size="compact" disabled={isSaving} onClick={() => void handleSave()}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  isCopyDraft ? 'Save As New Template' : 'Save Template'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border shadow-none">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Existing Templates</p>
                <p className="mt-1 text-sm text-muted-foreground">Select a template to edit it or create a fresh one for a different workflow.</p>
              </div>
              <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                {sortedTemplates.length}
              </Badge>
            </div>

            <ScrollArea className="h-[760px]">
              <div className="space-y-3 pr-1">
                {sortedTemplates.length > 0 ? (
                  sortedTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => selectTemplate(template)}
                      className={cn(
                        'relative w-full rounded-lg border border-card-border bg-muted/10 p-3 text-left transition-colors hover:border-primary/30',
                        selectedTemplateId === template.id && 'border-primary/70 bg-primary/10 shadow-sm ring-1 ring-primary/20',
                        isCopyDraft && selectedTemplateId === '' && templateTitle === `${template.title} Copy` && 'border-amber-400/80 bg-amber-50/60 ring-1 ring-amber-200/60',
                      )}
                    >
                      {isCopyDraft && selectedTemplateId === '' && templateTitle === `${template.title} Copy` ? (
                        <span className="absolute right-2 top-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-amber-900">
                          Draft
                        </span>
                      ) : null}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80">{template.assetType}</p>
                          <p className="mt-1 break-words text-sm font-semibold text-foreground">{template.title}</p>
                          {isCopyDraft && selectedTemplateId === '' && templateTitle === `${template.title} Copy` ? (
                            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Copy Draft</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {isCopyDraft && selectedTemplateId === '' && templateTitle === `${template.title} Copy` ? (
                            <Badge className="border-amber-300 bg-amber-100 text-[10px] font-black uppercase tracking-[0.08em] text-amber-900">
                              Copy Draft
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                            {template.sections.length} section{template.sections.length === 1 ? '' : 's'}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        {template.sections.reduce((count, section) => count + section.items.length, 0)} questions
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild type="button" variant="outline" size="sm" className="h-7 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                          <Link href={getInspectionHref(template)}>
                            Start Inspection
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            selectTemplate(template);
                          }}
                        >
                          <Edit className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            duplicateTemplate(template);
                          }}
                        >
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          Duplicate
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void deleteTemplate(template);
                          }}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-card-border bg-muted/10 px-4 text-center text-muted-foreground">
                    <Layers3 className="mb-3 h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm font-black uppercase tracking-widest text-foreground/85">No templates yet</p>
                    <p className="mt-2 text-sm">Create the first template to start reusing inspections across assets.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
