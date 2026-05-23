'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Library, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import type { ChecklistSection, QualityAudit, QualityAuditChecklistTemplate } from '@/types/quality';
import { v4 as uuidv4 } from 'uuid';

interface ImportFromGapAnalysesDialogProps {
    onImport: (sections: ChecklistSection[]) => void;
}

type GapAnalysisSource = QualityAudit & {
    template?: QualityAuditChecklistTemplate | null;
    templateTitle?: string;
    itemCount: number;
};

const parseLocalDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
};

export function ImportFromGapAnalysesDialog({ onImport }: ImportFromGapAnalysesDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
    const [search, setSearch] = useState('');
    const [sources, setSources] = useState<GapAnalysisSource[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            try {
                const response = await fetch('/api/quality-gap-analyses', { cache: 'no-store' });
                const payload = await response.json().catch(() => ({ audits: [], templates: [] }));
                const audits = Array.isArray(payload.audits) ? (payload.audits as QualityAudit[]) : [];
                const templates = Array.isArray(payload.templates) ? (payload.templates as QualityAuditChecklistTemplate[]) : [];
                const templateMap = new Map(templates.map((template) => [template.id, template]));

                if (!cancelled) {
                    setSources(
                        audits.map((audit) => ({
                            ...audit,
                            template: templateMap.get(audit.templateId) || null,
                            templateTitle: templateMap.get(audit.templateId)?.title || 'Gap Analysis Template',
                            itemCount: audit.findings?.length || 0,
                        }))
                    );
                }
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to load gap analyses for import', error);
                    setSources([]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    const filteredSources = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return sources;
        return sources.filter((source) => {
            const haystack = [
                source.auditNumber,
                source.title,
                source.templateTitle || '',
                source.status,
                source.auditeeId,
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(query);
        });
    }, [search, sources]);

    const selectedSources = useMemo(
        () => sources.filter((source) => !!selectedItems[source.id]),
        [selectedItems, sources]
    );

    const buildSectionsFromSource = (source: GapAnalysisSource): ChecklistSection[] => {
        if (!source.template) {
            return [];
        }

        return source.template.sections.flatMap((section) => {
            const items = Array.isArray(section.items) && section.items.length > 0
                ? section.items
                : [{
                    id: `${section.id}-fallback`,
                    text: section.title,
                    type: 'Checkbox' as const,
                }];

            return [{
                id: uuidv4(),
                title: `${source.auditNumber} - ${section.title}`,
                items: items.map((item) => ({
                    id: `${source.id}-${section.id}-${item.id}-${uuidv4()}`,
                    text: item.text,
                    type: item.type,
                    regulationReference: item.regulationReference,
                    companyReference: item.companyReference?.trim() || undefined,
                    nextAuditDate: item.nextAuditDate?.trim() || undefined,
                })),
            }];
        });
    };

    const handleImport = () => {
        const importedSections = selectedSources.flatMap((source) => buildSectionsFromSource(source));
        onImport(importedSections);
        setIsOpen(false);
        setSelectedItems({});
        setSearch('');
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Library className="mr-2 h-4 w-4" />
                    Import from Gap Analyses
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Import from Gap Analyses</DialogTitle>
                    <DialogDescription>
                        Select one or more existing gap analyses to turn into reusable gap checklist sections.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search gap analyses..."
                        className="h-9"
                    />
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                        <span>{selectedSources.length} selected</span>
                        <span>{filteredSources.length} available</span>
                    </div>
                </div>

                <ScrollArea className="h-[60vh] pr-4">
                    <div className="space-y-3">
                        {isLoading ? (
                            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                                Loading gap analyses...
                            </div>
                        ) : filteredSources.length > 0 ? (
                            filteredSources.map((source) => {
                                const isSelected = !!selectedItems[source.id];
                                const analysisDate = parseLocalDate(source.auditDate);
                                const sourceTemplate = source.templateTitle || 'Gap Analysis Template';

                                return (
                                    <Card
                                        key={source.id}
                                        className={isSelected ? 'border-primary bg-primary/5 shadow-none' : 'border shadow-none'}
                                    >
                                        <div className="flex items-start gap-3 p-4">
                                            <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={(checked) => {
                                                    setSelectedItems((current) => ({
                                                        ...current,
                                                        [source.id]: checked === true,
                                                    }));
                                                }}
                                                aria-label={`Select ${source.auditNumber}`}
                                                className="mt-1"
                                            />
                                            <div className="min-w-0 flex-1 space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="truncate text-sm font-black uppercase tracking-tight">
                                                        {source.auditNumber}
                                                    </p>
                                                    <Badge variant="outline" className="h-5 text-[9px] font-black uppercase">
                                                        {source.status}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm font-semibold">{source.title}</p>
                                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                                    <span className="inline-flex items-center gap-1">
                                                        <CalendarDays className="h-3.5 w-3.5" />
                                                        {analysisDate ? format(analysisDate, 'dd MMM yyyy') : 'No date'}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{sourceTemplate}</span>
                                                    <span>•</span>
                                                    <span>{source.itemCount} items</span>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })
                        ) : (
                            <div className="rounded-xl border border-dashed p-8 text-center text-sm italic uppercase tracking-widest text-muted-foreground">
                                No matching gap analyses found.
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleImport} disabled={selectedSources.length === 0}>
                        Import Selected
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
