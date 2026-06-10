'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, GripVertical, Loader2, PlusCircle, Trash2, Layers3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MainPageHeader } from '@/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { CardHeader } from '@/components/ui/card';

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

export default function AssetInspectionChecklistsPage() {
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
    const templateId = searchParams?.get('template')?.trim() || '';
    const copyFrom = searchParams?.get('copyFrom')?.trim() || '';
    if (!templateId && !copyFrom) {
      copiedTemplateRef.current = null;
      setCopySourceTitle('');
      setIsCopyDraft(false);
      setSelectedTemplateId('');
      setTemplateTitle('');
      setAssetType('aircraft');
      setSections([createEmptySection()]);
      return;
    }
    if (templateId && templates.length > 0) {
      const source = templates.find((template) => template.id === templateId);
      if (!source) return;
      copiedTemplateRef.current = null;
      setCopySourceTitle('');
      setIsCopyDraft(false);
      setSelectedTemplateId(source.id);
      setTemplateTitle(source.title);
      setAssetType(source.assetType);
      setSections(source.sections.length > 0 ? source.sections : [createEmptySection()]);
      return;
    }
    if (!copyFrom || templates.length === 0 || copiedTemplateRef.current === copyFrom) return;
    const source = templates.find((template) => template.id === copyFrom);
    if (!source) return;
    copiedTemplateRef.current = copyFrom;
    setCopySourceTitle(source.title);
    setIsCopyDraft(true);
    setSelectedTemplateId('');
    setTemplateTitle(`${source.title} Copy`);
    setAssetType(source.assetType);
    setSections((source.sections.length > 0 ? source.sections : [createEmptySection()]).map((section) => ({
      ...section,
      id: crypto.randomUUID(),
      items: section.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      })),
    })));
  }, [searchParams, templates]);

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
        <Skeleton className="h-[760px] w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-1 pt-4">
      <Card className="overflow-hidden border shadow-none">
        <MainPageHeader
          title="New Checklist"
          description="Build a reusable checklist for aircraft, vehicles, or any other asset type."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="compact" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                <Link href="/assets/checklists">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Checklists
                </Link>
              </Button>
            </div>
          )}
        />
      </Card>

      <div className="grid gap-6">
        <Card className="overflow-hidden border shadow-none">
          <CardContent className="space-y-5 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Checklist Title</Label>
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
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.16em] text-foreground">Create / Import</h3>
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Build sections manually before saving the checklist.
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-muted-foreground">Drag the grip icon to reorder sections and questions.</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">1 action</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addSection}
                    className="h-10 justify-start gap-2 border-[hsl(var(--header-button-border))] bg-[hsl(var(--header-button-background))] px-3 text-[10px] font-black uppercase shadow-none hover:bg-[hsl(var(--header-button-hover))]"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Manual Creation
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {sections.map((section, sectionIndex) => (
                  <Card
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
                    className="mb-4 bg-muted/30 transition-shadow"
                  >
                    <CardHeader className="p-3">
                      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_140px_auto] sm:items-start">
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
                        <div className="flex justify-end">
                          <Button type="button" variant="destructive" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeSection(sectionIndex)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 px-3 pb-3 pt-0">
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
                          className="rounded-md border bg-background p-3"
                        >
                          <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1.6fr)_minmax(140px,0.75fr)_120px_120px_auto] lg:items-start">
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
                                className="min-h-24"
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
                        <PlusCircle className="mr-2 h-3.5 w-3.5" />
                        Add Question
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button asChild variant="outline" size="compact" className="h-9 border-slate-300">
                <Link href="/assets/checklists">Cancel</Link>
              </Button>
              <Button type="button" size="compact" disabled={isSaving} onClick={() => void handleSave()}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  isCopyDraft ? 'Save As New Checklist' : 'Save Checklist'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
