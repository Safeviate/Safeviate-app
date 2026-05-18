'use client';

import { Fragment, useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CardControlHeader,
  HEADER_ACTION_BUTTON_CLASS,
  HEADER_COMPACT_CONTROL_CLASS,
  HEADER_SECONDARY_BUTTON_CLASS,
} from "@/components/page-header";
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Trash2, ChevronDown, WandSparkles, Loader2, ClipboardPaste, Layers, MoreHorizontal, Copy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { callAiFlow } from '@/lib/ai-client';
import { format } from 'date-fns';

import type { ComplianceRequirement, ExternalOrganization } from '@/types/quality';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { ComplianceItemForm } from './item-form';
import type { SummarizeDocumentInput, SummarizeDocumentOutput } from '@/ai/flows/summarize-document-flow';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { Switch } from '@/components/ui/switch';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { useOrganizationScope } from '@/hooks/use-organization-scope';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@/components/theme-provider';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { OrganizationTabsRow, ResponsiveTabRow } from '@/components/responsive-tab-row';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { CalendarIcon } from 'lucide-react';
import { getPersonnelDisplayName } from '@/lib/personnel-label';
import type { CorrectiveActionPlan, GapStatus, QualityAudit, QualityAuditChecklistTemplate, QualityFinding } from '@/types/quality';
import { List } from 'lucide-react';

const REGULATION_TABS = [
    { value: 'sacaa-cars', label: 'SACAA CARs' },
    { value: 'sacaa-cats', label: 'SACAA CATs' },
    { value: 'ohs', label: 'OHS' },
] as const;
type RegulationFamily = (typeof REGULATION_TABS)[number]['value'];

function regulationTabToUiValue(value: RegulationFamily) {
    return value.replace(/[^a-z0-9_-]/gi, '_');
}

function uiValueToRegulationTab(value: string): RegulationFamily {
    const match = REGULATION_TABS.find((tab) => regulationTabToUiValue(tab.value) === value);
    return match?.value ?? 'sacaa-cars';
}

function formatParentOptionLabel(option: { code: string; label: string }) {
    const code = option.code.trim();
    const label = option.label.trim();
    return label && label !== code
        ? `${code} - ${label}`
        : code;
}

function shouldShowSingleLineLabel(item: ComplianceRequirement) {
    return item.regulationStatement?.trim() === item.regulationCode.trim();
}

function normalizeRegulationCode(value?: string | null) {
    return value?.trim() || '';
}

function getInlineMarker(parentCode: string, childCode: string) {
    const normalizedParent = normalizeRegulationCode(parentCode);
    const normalizedChild = normalizeRegulationCode(childCode);

    if (!normalizedParent || !normalizedChild.startsWith(`${normalizedParent}.`)) {
        return null;
    }

    const suffix = normalizedChild.slice(normalizedParent.length + 1);
    if (!suffix || suffix.includes('.')) return null;

    return `(${suffix})`;
}

function formatAuditDate(value?: string | null) {
    if (!value?.trim()) return '';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value.trim();

    return format(parsed, 'dd MMM yyyy');
}

function getTechnicalExcerpt(value?: string | null) {
    const lines = getStructuredTechnicalLines(value);
    if (lines.length > 0) {
        return lines[0].content;
    }

    return value?.trim() || '';
}

const GAP_STATUS_OPTIONS: { value: GapStatus; label: string }[] = [
    { value: 'Open gap', label: 'Open gap' },
    { value: 'Partial coverage', label: 'Partial coverage' },
    { value: 'Covered', label: 'Covered' },
    { value: 'Unassessed', label: 'Unassessed' },
    { value: 'Not applicable', label: 'Not applicable' },
];

function formatStructuredTechnicalStandard(value?: string | null) {
    const text = value?.trim() || '';
    if (!text) return '';

    return text
        .replace(/\s+\((\d+)\)\s+/g, '\n($1) ')
        .replace(/\s+\(([a-z])\)\s+/gi, '\n($1) ')
        .replace(/\s+(Note:)\s+/gi, '\n$1 ')
        .trim();
}

function getStructuredTechnicalLines(value?: string | null) {
    return formatStructuredTechnicalStandard(value)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const markerMatch = line.match(/^(\(\d+\)|\([a-z]\)|Note:)\s*(.*)$/i);
            const marker = markerMatch?.[1] || '';
            const content = markerMatch?.[2] || line;

            if (/^\([a-z]\)/i.test(line)) {
                return { marker, content, className: 'pl-10', markerClassName: 'w-8' };
            }

            if (/^Note:/i.test(line)) {
                return { marker, content, className: 'pl-10 italic', markerClassName: 'w-12' };
            }

            if (/^\(\d+\)/.test(line)) {
                return { marker, content, className: 'pl-3', markerClassName: 'w-8' };
            }

            return { marker: '', content: line, className: '', markerClassName: 'w-0' };
        });
}

function getItemFamily(item: ComplianceRequirement): RegulationFamily {
    return item.regulationFamily || 'sacaa-cars';
}

function UploadRegulationsDialog({ tenantId, organizationId, regulationFamily, availableParentHeaders, trigger }: { tenantId: string, organizationId: string | null, regulationFamily: RegulationFamily; availableParentHeaders: { code: string; label: string }[]; trigger?: React.ReactNode }) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const isMobile = useIsMobile();
    const dialogBodyRef = useRef<HTMLDivElement | null>(null);
    const previewSectionRef = useRef<HTMLDivElement | null>(null);
    
    const [file, setFile] = useState<File | null>(null);
    const [pastedText, setPastedText] = useState('');
    const [stagedImages, setStagedImages] = useState<string[]>([]);
    const [isMultiImageMode, setIsMultiImageMode] = useState(false);
    const [targetFamily, setTargetFamily] = useState<RegulationFamily>(regulationFamily);
    const [targetHeader, setTargetHeader] = useState('');
    const [previewRequirements, setPreviewRequirements] = useState<SummarizeDocumentOutput['requirements'] | null>(null);
    const [previewInput, setPreviewInput] = useState<SummarizeDocumentInput | null>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setFile(event.target.files[0]);
        }
    };
    
    const handlePaste = useCallback(async (event: React.ClipboardEvent) => {
        const items = event.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const newImage = e.target?.result as string;
                        setStagedImages(prev => [...prev, newImage]);
                        toast({ title: 'Image Added', description: 'The image has been staged for processing.' });
                    };
                    reader.readAsDataURL(blob);
                }
                return;
            }
            if (items[i].type.startsWith('text/plain')) {
                event.preventDefault();
                items[i].getAsString((text) => {
                    setPastedText(text);
                     toast({ title: 'Text Pasted', description: 'The text has been loaded and is ready to be processed.' });
                });
                return; 
            }
        }
    }, [toast]);

    const removeStagedImage = (index: number) => {
        setStagedImages(prev => prev.filter((_, i) => i !== index));
    };

    const saveRequirements = async (input: SummarizeDocumentInput, requirements: SummarizeDocumentOutput['requirements']) => {
        setIsSaving(true);
        setIsProcessing(true);
        try {
            if (!requirements || requirements.length === 0) {
                toast({ variant: 'destructive', title: 'No Regulations Found', description: 'The AI could not identify any regulations in the provided content.' });
                return;
            }

            const newItems = requirements.map(req => ({
                ...req,
                id: crypto.randomUUID(),
                organizationId: organizationId,
                regulationFamily: targetFamily,
                regulationCode: normalizeRegulationCode(req.regulationCode),
                parentRegulationCode: normalizeRegulationCode(req.parentRegulationCode) || normalizeRegulationCode(targetHeader),
                regulationStatement: req.regulationStatement?.trim() || normalizeRegulationCode(req.regulationCode),
            }));

            await Promise.all(newItems.map((item) => fetch(`/api/compliance-matrix?tenantId=${encodeURIComponent(tenantId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item }),
            })));
            window.dispatchEvent(new Event('safeviate-compliance-updated'));

            toast({
                title: 'Matrix Populated',
                description: `${requirements.length} compliance requirements have been added to the matrix.`,
            });

        } catch (error) {
            console.error('Error processing document:', error);
            toast({
                variant: 'destructive',
                title: 'Processing Failed',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        } finally {
            setIsSaving(false);
            setIsProcessing(false);
            setFile(null);
            setPastedText('');
            setStagedImages([]);
            setIsMultiImageMode(false);
            setIsOpen(false);
            setTargetFamily(regulationFamily);
            setTargetHeader('');
            setPreviewRequirements(null);
            setPreviewInput(null);
        }
    };

    const handleProcess = async () => {
        if (!targetHeader.trim()) {
            toast({ variant: 'destructive', title: 'Select a sub-regulation first', description: 'Create the header and sub-regulation manually, then choose the sub-regulation before running AI import.' });
            return;
        }

        let input: SummarizeDocumentInput = { targetParentCode: targetHeader, document: {} };
        
        setIsProcessing(true);

        try {
            let extractedInput: SummarizeDocumentInput = input;

            if (file) {
            const reader = new FileReader();
                reader.onload = async (e) => {
                    extractedInput.document.text = e.target?.result as string;
                    const preview = await callAiFlow<SummarizeDocumentInput, SummarizeDocumentOutput>('summarizeDocument', extractedInput);
                    setPreviewInput(extractedInput);
                    setPreviewRequirements(preview.requirements || []);
                    setIsProcessing(false);
                };
                reader.readAsText(file);
            } else if (pastedText) {
                extractedInput.document.text = pastedText;
                const preview = await callAiFlow<SummarizeDocumentInput, SummarizeDocumentOutput>('summarizeDocument', extractedInput);
                setPreviewInput(extractedInput);
                setPreviewRequirements(preview.requirements || []);
                setIsProcessing(false);
            } else if (stagedImages.length > 0) {
                extractedInput.document.images = stagedImages;
                extractedInput.isMultiPage = isMultiImageMode;
                const preview = await callAiFlow<SummarizeDocumentInput, SummarizeDocumentOutput>('summarizeDocument', extractedInput);
                setPreviewInput(extractedInput);
                setPreviewRequirements(preview.requirements || []);
                setIsProcessing(false);
            }
        } catch (error) {
            setIsProcessing(false);
            console.error('Error processing document:', error);
            toast({
                variant: 'destructive',
                title: 'Processing Failed',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
            });
        }
    };

    const handleSavePreview = async () => {
        if (!previewInput || !previewRequirements) return;
        await saveRequirements(previewInput, previewRequirements);
    };

    const resetPreview = () => {
        setPreviewRequirements(null);
        setPreviewInput(null);
    };

    useEffect(() => {
        if (!isOpen || !previewRequirements?.length) return;

        dialogBodyRef.current?.scrollTo({
            top: dialogBodyRef.current.scrollHeight,
            behavior: 'smooth',
        });
        previewSectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });
    }, [isOpen, previewRequirements]);

    const copyPreviewJson = async () => {
        if (!previewRequirements) return;
        const payload = JSON.stringify({ requirements: previewRequirements }, null, 2);
        try {
            await navigator.clipboard.writeText(payload);
            toast({ title: 'Copied', description: 'The raw AI preview JSON was copied to the clipboard.' });
        } catch (error) {
            console.error('Failed to copy preview JSON', error);
            toast({ variant: 'destructive', title: 'Copy Failed', description: 'Could not copy the preview JSON.' });
        }
    };

    const canProcess = !!targetHeader.trim() && (file || pastedText.trim() || stagedImages.length > 0);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (open) setTargetFamily(regulationFamily);
            if (!open) {
                resetPreview();
            }
        }}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button 
                        variant="outline" 
                        size="compact"
                        className={cn(HEADER_COMPACT_CONTROL_CLASS, 'text-foreground hover:bg-accent/40')}
                    >
                        <WandSparkles className="h-3.5 w-3.5 text-primary" /> 
                        {isMobile ? "AI Populate" : "AI Populate"}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div ref={dialogBodyRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
                    <DialogHeader>
                        <DialogTitle>Populate Matrix with AI</DialogTitle>
                        <DialogDescription>
                            Upload a file, paste text, or paste one or more images of regulations. Create the header and sub-regulation manually first, then choose the sub-regulation below so AI only adds the paragraph cards beneath it.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="target-family">Target category</Label>
                        <Select value={targetFamily} onValueChange={(value) => setTargetFamily(value as RegulationFamily)}>
                            <SelectTrigger id="target-family">
                                <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                                {REGULATION_TABS.map((tab) => (
                                    <SelectItem key={tab.value} value={tab.value}>
                                        {tab.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="target-header">Target sub-regulation</Label>
                        <Select value={targetHeader} onValueChange={setTargetHeader}>
                            <SelectTrigger id="target-header">
                                <SelectValue placeholder="Select a sub-regulation" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableParentHeaders.map((header) => (
                                    <SelectItem key={header.code} value={header.code}>
                                        {formatParentOptionLabel(header)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Tabs defaultValue="image">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="image">Paste Images</TabsTrigger>
                            <TabsTrigger value="text">Paste Text</TabsTrigger>
                            <TabsTrigger value="file">Upload File</TabsTrigger>
                        </TabsList>
                        <TabsContent value="image" className="pt-4">
                            <div
                                onPaste={handlePaste}
                                className="h-48 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground mb-4"
                            >
                                <div className="text-center">
                                    <ClipboardPaste className="mx-auto h-8 w-8" />
                                    <p className="text-foreground/90">Click here and paste image(s) (Ctrl+V)</p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2 my-4">
                                <Switch id="multi-image-mode" checked={isMultiImageMode} onCheckedChange={setIsMultiImageMode} />
                                <Label htmlFor="multi-image-mode">Treat images as a single document</Label>
                            </div>
                            {isMultiImageMode && (
                                <p className="text-xs text-foreground/80 p-2 bg-muted rounded-md">
                                    Instruction to AI: &quot;You will be given a sequence of images. Treat them as pages of a single document, in the order they are provided. Text may flow from one image to the next.&quot;
                                </p>
                            )}
                            <ScrollArea className="h-48 mt-4">
                                <div className="grid grid-cols-3 gap-4">
                                    {stagedImages.map((imageSrc, index) => (
                                        <div key={index} className="relative group">
                                            <Image src={imageSrc} alt={`Staged image ${index + 1}`} width={150} height={150} className="rounded-md object-cover aspect-square" />
                                            <Button
                                                variant="destructive"
                                                size="icon"
                                                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                                                onClick={() => removeStagedImage(index)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </TabsContent>
                        <TabsContent value="text" className="pt-4">
                            <ScrollArea className="h-96 rounded-md border">
                                <Textarea
                                    placeholder="Paste the raw text of the regulations here..."
                                    className="h-full min-h-[24rem] border-none focus-visible:ring-0"
                                    value={pastedText}
                                    onChange={(e) => setPastedText(e.target.value)}
                                    onPaste={handlePaste}
                                />
                            </ScrollArea>
                        </TabsContent>
                        <TabsContent value="file" className="pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="reg-file">Regulation File (.txt)</Label>
                                <Input id="reg-file" type="file" onChange={handleFileChange} accept=".txt" />
                                {file && <p className="text-sm text-muted-foreground">Selected: {file.name}</p>}
                            </div>
                        </TabsContent>
                    </Tabs>
                    {previewRequirements && previewRequirements.length > 0 ? (
                        <div ref={previewSectionRef} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 scroll-mt-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">AI Preview</p>
                                    <p className="text-xs text-muted-foreground">Review the extracted JSON before saving it to the matrix.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button type="button" variant="ghost" size="sm" onClick={copyPreviewJson}>
                                        <Copy className="mr-2 h-3.5 w-3.5" />
                                        Copy JSON
                                    </Button>
                                    <Button type="button" variant="ghost" size="sm" onClick={resetPreview}>
                                        Clear Preview
                                    </Button>
                                </div>
                            </div>
                            <ScrollArea className="max-h-72 rounded-md border bg-white">
                                <pre className="p-3 text-[11px] leading-5 whitespace-pre-wrap break-words">
                                    {JSON.stringify({ requirements: previewRequirements }, null, 2)}
                                </pre>
                            </ScrollArea>
                        </div>
                    ) : null}
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline" size="compact" disabled={isProcessing || isSaving}>Cancel</Button></DialogClose>
                    {!previewRequirements ? (
                        <Button onClick={handleProcess} size="compact" disabled={isProcessing || !canProcess}>
                            {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : 'Preview Extraction'}
                        </Button>
                    ) : (
                        <Button onClick={handleSavePreview} size="compact" disabled={isSaving}>
                            {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save to Matrix'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default function CoherenceMatrixPage() {
  const { toast } = useToast();
  const { tenantId, userProfile, isLoading: isProfileLoading } = useUserProfile();
  const { matrixTheme } = useTheme();
  const { hasPermission, isLoading: isPermissionsLoading } = usePermissions();
  const { scopedOrganizationId, shouldShowOrganizationTabs } = useOrganizationScope({ viewAllPermissionId: 'quality-matrix-manage' });
  const isMobile = useIsMobile();
  const [activeOrgTab, setActiveOrgTab] = useState('internal');
  const [activeRegulationTab, setActiveRegulationTab] = useState<RegulationFamily>('sacaa-cars');

  const userRole = ((userProfile as { role?: string } | null)?.role || '').toLowerCase();
  const isDeveloperRole = userRole === 'dev' || userRole === 'developer';
  const canViewMatrix = isDeveloperRole || hasPermission('quality-matrix-view') || hasPermission('quality-matrix-manage');
  const canManageMatrix = isDeveloperRole || hasPermission('quality-matrix-manage');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [matrixSearchQuery, setMatrixSearchQuery] = useState('');
  const [matrixIndexQuery, setMatrixIndexQuery] = useState('');
  const [openGapDateRowId, setOpenGapDateRowId] = useState<string | null>(null);
  const [expandedClauseIds, setExpandedClauseIds] = useState<Record<string, boolean>>({});
  const [editingItem, setEditingItem] = useState<ComplianceRequirement | null>(null);
  const [formMode, setFormMode] = useState<'item' | 'header' | 'subheader'>('item');

  const [complianceItems, setComplianceItems] = useState<ComplianceRequirement[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [qualityAudits, setQualityAudits] = useState<QualityAudit[]>([]);
  const [qualityAuditTemplates, setQualityAuditTemplates] = useState<QualityAuditChecklistTemplate[]>([]);
  const [correctiveActionPlans, setCorrectiveActionPlans] = useState<CorrectiveActionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const resolvedTenantId = tenantId || 'safeviate';

  const loadData = useCallback(async () => {
    try {
        const [matrixResponse, personnelResponse, orgResponse, auditsResponse] = await Promise.all([
          fetch(`/api/compliance-matrix?tenantId=${encodeURIComponent(resolvedTenantId)}`, { cache: 'no-store' }),
          fetch('/api/personnel', { cache: 'no-store' }),
          fetch('/api/external-organizations', { cache: 'no-store' }),
          fetch('/api/quality-audits', { cache: 'no-store' }),
        ]);
        const [matrixPayload, personnelPayload, orgPayload, auditsPayload] = await Promise.all([
          matrixResponse.json().catch(() => ({ items: [] })),
          personnelResponse.json().catch(() => ({ personnel: [] })),
          orgResponse.json().catch(() => ({ organizations: [] })),
          auditsResponse.json().catch(() => ({ audits: [], templates: [], caps: [] })),
        ]);
        setComplianceItems(Array.isArray(matrixPayload.items) ? matrixPayload.items : []);
        setPersonnel(Array.isArray(personnelPayload.personnel) ? personnelPayload.personnel : []);
        setOrganizations(Array.isArray(orgPayload.organizations) ? orgPayload.organizations : []);
        setQualityAudits(Array.isArray(auditsPayload.audits) ? auditsPayload.audits : []);
        setQualityAuditTemplates(Array.isArray(auditsPayload.templates) ? auditsPayload.templates : []);
        setCorrectiveActionPlans(Array.isArray(auditsPayload.caps) ? auditsPayload.caps : []);
    } catch (e) {
        console.error("Failed to load matrix data", e);
    } finally {
        setIsLoading(false);
    }
  }, [resolvedTenantId]);

  const updateGapStatus = useCallback(async (item: ComplianceRequirement, gapStatus: GapStatus) => {
    try {
        const response = await fetch(`/api/compliance-matrix?tenantId=${encodeURIComponent(resolvedTenantId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                item: {
                    ...item,
                    gapStatus,
                    gapStatusDate: new Date().toISOString(),
                },
            }),
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || 'Failed to update gap status.');
        }

        window.dispatchEvent(new Event('safeviate-compliance-updated'));
        toast({
            title: 'Gap status updated',
            description: `${item.regulationCode} marked as ${gapStatus}.`,
        });
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Update Failed',
            description: error instanceof Error ? error.message : 'Failed to update gap status.',
        });
    }
  }, [resolvedTenantId, toast]);

  const updateMatrixItemField = useCallback(async (item: ComplianceRequirement, patch: Partial<ComplianceRequirement>) => {
    try {
        const response = await fetch(`/api/compliance-matrix?tenantId=${encodeURIComponent(resolvedTenantId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                item: {
                    ...item,
                    ...patch,
                },
            }),
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || 'Failed to update matrix item.');
        }

        window.dispatchEvent(new Event('safeviate-compliance-updated'));
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Update Failed',
            description: error instanceof Error ? error.message : 'Failed to update matrix item.',
        });
    }
  }, [resolvedTenantId, toast]);

  const parseLocalDate = (value?: string | null) => {
    if (!value?.trim()) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  };

  const toNoonUtcIso = (date: Date) =>
    new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString();

  const toggleClauseDetails = useCallback((itemId: string) => {
    setExpandedClauseIds((prev) => ({
        ...prev,
        [itemId]: !prev[itemId],
    }));
  }, []);

  useEffect(() => {
    void loadData();
    window.addEventListener('safeviate-compliance-updated', loadData);
    window.addEventListener('safeviate-personnel-updated', loadData);
    window.addEventListener('safeviate-external-organizations-updated', loadData);
    window.addEventListener('safeviate-quality-updated', loadData);
    return () => {
        window.removeEventListener('safeviate-compliance-updated', loadData);
        window.removeEventListener('safeviate-personnel-updated', loadData);
        window.removeEventListener('safeviate-external-organizations-updated', loadData);
        window.removeEventListener('safeviate-quality-updated', loadData);
    }
  }, [loadData]);


  const naturalSort = (a: string, b: string) => {
    const re = /(\d+)/g;
    const aParts = a.split(re);
    const bParts = b.split(re);
    const len = Math.min(aParts.length, bParts.length);

    for (let i = 0; i < len; i++) {
        const aPart = aParts[i];
        const bPart = bParts[i];

        if (i % 2 === 1) {
            const aNum = parseInt(aPart, 10);
            const bNum = parseInt(bPart, 10);
            if (aNum !== bNum) return aNum - bNum;
        } else {
            if (aPart !== bPart) return aPart.localeCompare(bPart);
        }
    }
    return a.length - b.length;
  };

  const handleOpenForm = (item: ComplianceRequirement | null = null, mode: 'item' | 'header' | 'subheader' = 'item') => {
    setEditingItem(item);
    setFormMode(mode);
    setIsFormOpen(true);
  };

  const handleDeleteItem = async (item: ComplianceRequirement) => {
      try {
          const response = await fetch(`/api/compliance-matrix?id=${encodeURIComponent(item.id)}&code=${encodeURIComponent(item.regulationCode)}`, {
            method: 'DELETE',
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || 'Failed to delete compliance item.');
          }
          window.dispatchEvent(new Event('safeviate-compliance-updated'));
          toast({ title: "Success", description: "Compliance item has been deleted." });
      } catch (error) {
          toast({
              variant: 'destructive',
              title: 'Delete Failed',
              description: error instanceof Error ? error.message : 'Failed to delete compliance item.',
          });
      }
    };
    
  const handleDeleteSection = async (parentItem: ComplianceRequirement) => {
        try {
            const response = await fetch(`/api/compliance-matrix?id=${encodeURIComponent(parentItem.id)}&code=${encodeURIComponent(parentItem.regulationCode)}`, {
              method: 'DELETE',
            });
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(payload?.error || 'Failed to delete compliance section.');
            }
            window.dispatchEvent(new Event('safeviate-compliance-updated'));
            toast({ title: "Section Deleted" });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Delete Failed',
                description: error instanceof Error ? error.message : 'Failed to delete compliance section.',
            });
        }
  }

    const currentOrgItems = (complianceItems || []).filter(item =>
    (activeOrgTab === 'internal' ? !item.organizationId : item.organizationId === activeOrgTab)
  );
  const renderSearchControl = (mobile = false) => (
    <div className={cn(
        mobile ? 'w-full' : 'w-[170px] max-w-full'
    )}>
        <Input
            value={matrixSearchQuery}
            onChange={(event) => setMatrixSearchQuery(event.target.value)}
            placeholder="Search regulations..."
            className="h-8 w-full border-input bg-background text-sm"
        />
    </div>
  );
  const currentFamilyHeaders = currentOrgItems
    .filter(item => getItemFamily(item) === activeRegulationTab)
    .filter(item => !item.technicalStandard?.trim())
    .sort((a, b) => naturalSort(a.regulationCode, b.regulationCode))
    .reduce((acc, item) => {
        const normalizedCode = normalizeRegulationCode(item.regulationCode);
        const normalizedLabel = (item.regulationStatement || item.regulationCode).trim();
        if (!acc.some(existing => existing.code === normalizedCode)) {
            acc.push({ code: normalizedCode, label: normalizedLabel });
        }
        return acc;
    }, [] as { code: string; label: string }[]);
  const currentFamilyTopLevelHeaders = currentOrgItems
    .filter(item => getItemFamily(item) === activeRegulationTab)
    .filter(item => !item.technicalStandard?.trim())
    .filter(item => !normalizeRegulationCode(item.parentRegulationCode))
    .sort((a, b) => naturalSort(a.regulationCode, b.regulationCode))
    .reduce((acc, item) => {
        const normalizedCode = normalizeRegulationCode(item.regulationCode);
        const normalizedLabel = (item.regulationStatement || item.regulationCode).trim();
        if (!acc.some(existing => existing.code === normalizedCode)) {
            acc.push({ code: normalizedCode, label: normalizedLabel });
        }
        return acc;
    }, [] as { code: string; label: string }[]);
  const currentFamilySubheaders = currentOrgItems
    .filter(item => getItemFamily(item) === activeRegulationTab)
    .filter(item => !item.technicalStandard?.trim())
    .filter(item => !!normalizeRegulationCode(item.parentRegulationCode))
    .sort((a, b) => naturalSort(a.regulationCode, b.regulationCode))
    .reduce((acc, item) => {
        const normalizedCode = normalizeRegulationCode(item.regulationCode);
        const normalizedLabel = (item.regulationStatement || item.regulationCode).trim();
        if (!acc.some(existing => existing.code === normalizedCode)) {
            acc.push({ code: normalizedCode, label: normalizedLabel });
        }
        return acc;
    }, [] as { code: string; label: string }[]);
  const renderOrgContext = (orgId: string | 'internal') => {
    const contextOrgId = orgId === 'internal' ? null : orgId;
    const activeRegulationTabValue = regulationTabToUiValue(activeRegulationTab);
    const showGapAnalysis = activeRegulationTab === 'sacaa-cats';
    const getManagerLabel = (managerId?: string | null) => {
        const normalizedManagerId = managerId?.trim() || '';
        if (!normalizedManagerId) return '';
        return getPersonnelDisplayName(personnel, normalizedManagerId);
    };

    const renderRequirementMeta = (item: ComplianceRequirement) => {
        const fields = [
            item.companyReference?.trim()
                ? { label: 'Manual ref', value: item.companyReference.trim() }
                : null,
            item.responsibleManagerId?.trim()
                ? { label: 'Responsible', value: getManagerLabel(item.responsibleManagerId) }
                : null,
            item.nextAuditDate?.trim()
                ? { label: 'Next audit date', value: formatAuditDate(item.nextAuditDate) }
                : null,
        ].filter(Boolean) as { label: string; value: string }[];

        if (fields.length === 0) return null;

        return (
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-foreground/55">
                {fields.map((field) => (
                    <div key={`${item.id}-${field.label}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-card-border/70 bg-background/70 px-2.5 py-1">
                        <span className="shrink-0 text-foreground/45">{field.label}</span>
                        <span className="truncate text-foreground/80 normal-case tracking-normal">{field.value}</span>
                    </div>
                ))}
            </div>
        );
    };

    const filteredItems = (complianceItems || []).filter(item => 
        (orgId === 'internal' ? !item.organizationId : item.organizationId === orgId) &&
        getItemFamily(item) === activeRegulationTab
    );
    const sortedItems = [...filteredItems].sort((a, b) => naturalSort(a.regulationCode, b.regulationCode));
    const groupedItems = sortedItems.reduce((acc, item) => {
        const parentCode = normalizeRegulationCode(item.parentRegulationCode);
        if (parentCode) {
            if (!acc[parentCode]) acc[parentCode] = [];
            acc[parentCode].push(item);
        }
        return acc;
    }, {} as Record<string, ComplianceRequirement[]>);
    const topLevelItems = sortedItems.filter(item => !item.parentRegulationCode);
    const renderInlineClauseLines = (parentCode: string, items: ComplianceRequirement[], ancestors: string[]) => {
        return (
            <div className="rounded-md border border-slate-200 bg-background/60">
                {items.map((child) => {
                    const normalizedChildCode = normalizeRegulationCode(child.regulationCode);
                    if (ancestors.includes(normalizedChildCode)) return null;

                    const grandChildren = groupedItems[normalizedChildCode] || [];
                    const marker = getInlineMarker(parentCode, normalizedChildCode);
                    const lineText = child.technicalStandard?.trim() || child.regulationStatement?.trim();

                    return (
                        <div key={child.id} className="border-b border-card-border/70 px-4 py-3 last:border-b-0">
                            <p className="text-sm leading-6 text-foreground">
                                {marker ? <span className="mr-2 font-semibold">{marker}</span> : null}
                                <span>{lineText}</span>
                            </p>
                            {grandChildren.length > 0 ? (
                                <div className="mt-3 space-y-2 border-t pt-3">
                                    {renderInlineClauseLines(normalizedChildCode, grandChildren, [...ancestors, normalizedChildCode])}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderTechnicalStandardText = (value?: string | null) => {
        const lines = getStructuredTechnicalLines(value);
        if (lines.length === 0) return null;

        return (
            <div className="space-y-1.5">
                {lines.map((line, index) => (
                    <div
                        key={`${line.marker}-${line.content}-${index}`}
                        className={cn(
                            'flex items-start text-sm font-medium leading-6 text-foreground/80',
                            line.className
                        )}
                    >
                        {line.marker ? (
                            <span className={cn('shrink-0 font-semibold text-foreground/55', line.markerClassName)}>
                                {line.marker}
                            </span>
                        ) : null}
                        <span className="min-w-0 flex-1 break-words">
                            {line.content}
                        </span>
                    </div>
                ))}
            </div>
        );
    };

    const normalizedSearchQuery = matrixSearchQuery.trim().toLowerCase();
    const searchCache = new Map<string, boolean>();
    const getSearchableText = (item: ComplianceRequirement) => [
        item.regulationCode,
        item.regulationStatement,
        item.technicalStandard,
        item.companyReference,
        getManagerLabel(item.responsibleManagerId),
        item.nextAuditDate ? formatAuditDate(item.nextAuditDate) : '',
        item.gapStatus,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    const itemMatchesSearch = (item: ComplianceRequirement) => {
        if (!normalizedSearchQuery) return true;
        return getSearchableText(item).includes(normalizedSearchQuery);
    };
    const branchMatchesSearch = (item: ComplianceRequirement): boolean => {
        const normalizedCode = normalizeRegulationCode(item.regulationCode);
        if (!normalizedSearchQuery) return true;
        if (searchCache.has(normalizedCode)) {
            return searchCache.get(normalizedCode) || false;
        }
        const childItems = groupedItems[normalizedCode] || [];
        const matches = itemMatchesSearch(item) || childItems.some((child) => branchMatchesSearch(child));
        searchCache.set(normalizedCode, matches);
        return matches;
    };

    type MatrixTableRow = {
        item: ComplianceRequirement;
        depth: number;
        hasChildren: boolean;
        anchorId: string;
    };

    const buildTableRows = (items: ComplianceRequirement[], depth = 0, ancestors: string[] = []): MatrixTableRow[] => {
        return items.flatMap((item) => {
            const normalizedCode = normalizeRegulationCode(item.regulationCode);
            if (ancestors.includes(normalizedCode)) return [];

            const childItems = groupedItems[normalizedCode] || [];
            if (normalizedSearchQuery && !branchMatchesSearch(item)) {
                return [];
            }

            const nextChildItems = normalizedSearchQuery && !itemMatchesSearch(item)
                ? childItems.filter((child) => branchMatchesSearch(child))
                : childItems;

            return [
                {
                    item,
                    depth,
                    hasChildren: nextChildItems.length > 0,
                    anchorId: `matrix-row-${item.id}`,
                },
                ...buildTableRows(nextChildItems, depth + 1, [...ancestors, normalizedCode]),
            ];
        });
    };

    const scrollToTableRow = (anchorId: string) => {
        if (typeof document === 'undefined') return;
        const target = document.getElementById(anchorId);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const buildTableIndex = (rows: MatrixTableRow[]) =>
        rows.filter(({ depth, hasChildren }) => depth === 0 || hasChildren);

    const normalizedIndexQuery = matrixIndexQuery.trim().toLowerCase();
    const matrixIndexEntries = buildTableIndex(buildTableRows(topLevelItems));
    const filteredMatrixIndexEntries = normalizedIndexQuery
        ? matrixIndexEntries.filter(({ item }) =>
            [item.regulationCode, item.regulationStatement]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(normalizedIndexQuery)
        )
        : matrixIndexEntries;

    const renderMatrixIndexContent = () => (
        <>
            <div className="mb-3 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/50">Regulation index</p>
                <p className="text-xs text-foreground/70">
                    Jump to a header or subheader in the current table. {filteredMatrixIndexEntries.length} entries.
                </p>
            </div>
            <div className="mb-3">
                <Input
                    value={matrixIndexQuery}
                    onChange={(event) => setMatrixIndexQuery(event.target.value)}
                    placeholder="Filter index..."
                    className="h-8 w-full border-input bg-background text-sm"
                />
            </div>
            <ScrollArea className="max-h-[calc(100vh-300px)] pr-2">
                {filteredMatrixIndexEntries.length > 0 ? (
                    <div className="space-y-2.5">
                        <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-foreground/45">Headers</p>
                                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-foreground/40">
                                    {filteredMatrixIndexEntries.filter(({ depth }) => depth === 0).length}
                                </span>
                            </div>
                            <div className="space-y-1">
                                {filteredMatrixIndexEntries
                                    .filter(({ depth }) => depth === 0)
                                    .map(({ item, anchorId }) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => scrollToTableRow(anchorId)}
                                            className="flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1 text-left transition hover:border-border hover:bg-muted/40"
                                        >
                                            <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-primary/15 bg-primary/5 px-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-primary">
                                                Header
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[10px] font-black tracking-wide text-foreground/60">
                                                    {item.regulationCode}
                                                </span>
                                                <span className="block truncate text-sm font-medium text-foreground">
                                                    {item.regulationStatement}
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-foreground/45">Subheaders</p>
                                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-foreground/40">
                                    {filteredMatrixIndexEntries.filter(({ depth }) => depth > 0).length}
                                </span>
                            </div>
                            <div className="space-y-1">
                                {filteredMatrixIndexEntries
                                    .filter(({ depth }) => depth > 0)
                                    .map(({ item, depth, anchorId }) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => scrollToTableRow(anchorId)}
                                            className="flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1 text-left transition hover:border-border hover:bg-muted/40"
                                        >
                                            <span
                                                className={cn(
                                                    'mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full border border-primary/15 bg-primary/5 px-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-primary',
                                                    depth > 0 ? 'ml-4' : ''
                                                )}
                                            >
                                                Subheader
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[10px] font-black tracking-wide text-foreground/60">
                                                    {item.regulationCode}
                                                </span>
                                                <span className="block truncate text-sm font-medium text-foreground">
                                                    {item.regulationStatement}
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-md border border-dashed border-card-border/70 px-3 py-4 text-xs text-foreground/60">
                        No matching regulations in the current view.
                    </div>
                )}
            </ScrollArea>
        </>
    );

    const renderMatrixIndexPanel = () => (
        <div className="sticky top-0 rounded-lg border border-card-border bg-card/90 p-2.5 shadow-none backdrop-blur-sm">
            {renderMatrixIndexContent()}
        </div>
    );

    const renderMatrixTable = () => {
        const enableGapAnalysis = showGapAnalysis;
        const tableRows = buildTableRows(topLevelItems);
        const auditsSorted = [...qualityAudits].sort((a, b) => {
            const aDate = new Date(a.auditDate || '').getTime() || 0;
            const bDate = new Date(b.auditDate || '').getTime() || 0;
            return bDate - aDate;
        });

        const templateItemLookup = new Map<string, { regulationReference: string; templateTitle: string }>();
        qualityAuditTemplates.forEach((template) => {
            template.sections.forEach((section) => {
                section.items.forEach((item) => {
                    const regulationReference = normalizeRegulationCode(item.regulationReference);
                    if (!regulationReference) return;
                    templateItemLookup.set(item.id, {
                        regulationReference,
                        templateTitle: template.title,
                    });
                });
            });
        });

        type AuditFindingSummary = {
            finding: QualityFinding['finding'];
            auditNumber: string;
            auditDate: string;
            auditStatus: QualityAudit['status'];
            templateTitle: string;
            checklistItemId: string;
        };

        const latestFindingByItemId = new Map<string, AuditFindingSummary>();

        auditsSorted.forEach((audit) => {
            const template = qualityAuditTemplates.find((entry) => entry.id === audit.templateId);
            if (!template) return;

            const itemIdsForTemplate = new Map<string, { regulationReference: string }>();
            template.sections.forEach((section) => {
                section.items.forEach((item) => {
                    const regulationReference = normalizeRegulationCode(item.regulationReference);
                    if (!regulationReference) return;
                    itemIdsForTemplate.set(item.id, { regulationReference });
                });
            });

            (audit.findings || []).forEach((finding) => {
                const templateItem = itemIdsForTemplate.get(finding.checklistItemId);
                if (!templateItem) return;
                if (latestFindingByItemId.has(finding.checklistItemId)) return;

                latestFindingByItemId.set(finding.checklistItemId, {
                    finding: finding.finding,
                    auditNumber: audit.auditNumber,
                    auditDate: audit.auditDate,
                    auditStatus: audit.status,
                    templateTitle: template.title,
                    checklistItemId: finding.checklistItemId,
                });
            });
        });

        const getGapSummary = (row: Pick<MatrixTableRow, 'item' | 'depth' | 'hasChildren'>) => {
            const normalizedCode = normalizeRegulationCode(row.item.regulationCode);
            const mappedItemIds = Array.from(templateItemLookup.entries())
                .filter(([, value]) => value.regulationReference === normalizedCode)
                .map(([itemId]) => itemId);

            const latestFindings = mappedItemIds
                .map((itemId) => latestFindingByItemId.get(itemId))
                .filter((finding): finding is AuditFindingSummary => Boolean(finding));

            const assessedCount = latestFindings.length;
            const openCapCount = correctiveActionPlans.filter((cap) => {
                const isOpen = cap.status !== 'Closed' && cap.status !== 'Cancelled';
                return isOpen && mappedItemIds.includes(cap.findingId);
            }).length;

            const nonCompliantCount = latestFindings.filter((finding) => finding.finding === 'Non Compliant').length;
            const compliantCount = latestFindings.filter((finding) => finding.finding === 'Compliant').length;
            const notApplicableCount = latestFindings.filter((finding) => finding.finding === 'Not Applicable').length;
            const latestFinding = [...latestFindings].sort((a, b) => new Date(b.auditDate).getTime() - new Date(a.auditDate).getTime())[0];

            let gapStatus: 'Open gap' | 'Partial coverage' | 'Covered' | 'Unassessed' | 'Not applicable' = 'Unassessed';
            if (mappedItemIds.length === 0) {
                gapStatus = 'Open gap';
            } else if (assessedCount === 0) {
                gapStatus = 'Unassessed';
            } else if (nonCompliantCount > 0) {
                gapStatus = 'Open gap';
            } else if (compliantCount > 0 && compliantCount + notApplicableCount === assessedCount) {
                gapStatus = notApplicableCount === assessedCount ? 'Not applicable' : 'Covered';
            } else {
                gapStatus = 'Partial coverage';
            }

            if (openCapCount > 0 && gapStatus === 'Covered') {
                gapStatus = 'Partial coverage';
            }

            return {
                mappedCount: mappedItemIds.length,
                assessedCount,
                openCapCount,
                latestFinding,
                gapStatus,
            };
        };

        const gapStatusVariant = (status: 'Open gap' | 'Partial coverage' | 'Covered' | 'Unassessed' | 'Not applicable') => {
            switch (status) {
                case 'Covered':
                    return 'default';
                case 'Not applicable':
                    return 'secondary';
                case 'Partial coverage':
                    return 'outline';
                case 'Open gap':
                    return 'destructive';
                default:
                    return 'secondary';
            }
        };

        if (tableRows.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-24 text-center opacity-30">
                    <Layers className="h-16 w-16 mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest text-foreground/90">Coherence Matrix Empty</p>
                    <p className="text-xs font-medium text-foreground/80 max-w-xs mt-2">Populate your matrix using the AI upload tool or by seeding standard Part 141 regulations.</p>
                </div>
            );
        }

        return (
            <div className="grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                <div className="xl:hidden">
                    <details className="rounded-lg border border-card-border bg-card/90 p-3 shadow-none">
                        <summary className="cursor-pointer list-none text-[10px] font-black uppercase tracking-[0.14em] text-foreground/50">
                            Regulation index
                        </summary>
                        <div className="mt-3">
                            {renderMatrixIndexContent()}
                        </div>
                    </details>
                </div>
                <div className="hidden xl:block">
                    {renderMatrixIndexPanel()}
                </div>
                <div className="min-w-0">
                    <div className="overflow-x-auto rounded-lg border border-card-border bg-background">
                <Table className="min-w-[1180px] table-fixed">
                    <colgroup>
                        <col className="w-[38%]" />
                        <col className="w-[12%]" />
                        <col className="w-[18%]" />
                        <col className="w-[10%]" />
                        <col className="w-[12%]" />
                    </colgroup>
                    <TableHeader className="sticky top-0 z-10 bg-muted/30">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Clause</TableHead>
                            <TableHead className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Gap status</TableHead>
                            <TableHead className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Reference / reason</TableHead>
                            <TableHead className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Status date</TableHead>
                            <TableHead className="px-2 py-2 text-right text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tableRows.map(({ item, depth, hasChildren, anchorId }: MatrixTableRow) => {
                            const isClauseRow = enableGapAnalysis && depth > 0 && !hasChildren;
                            const gapSummary = isClauseRow ? getGapSummary({ item, depth, hasChildren }) : null;
                            const clauseGapStatus: GapStatus | null = isClauseRow
                                ? item.gapStatus || gapSummary?.gapStatus || 'Unassessed'
                                : null;
                            const rowType = depth === 0 ? 'Header' : hasChildren ? 'Subheader' : 'Clause';
                            const isExpanded = Boolean(expandedClauseIds[item.id]);
                            return (
                                <Fragment key={item.id}>
                                    <TableRow id={anchorId} key={item.id} className={cn(depth === 0 && 'bg-muted/15', 'scroll-mt-24')}>
                                    <TableCell className="align-top px-1.5 py-2">
                                            <div className="space-y-3" style={{ paddingLeft: `${depth * 0.5}rem` }}>
                                                <div className="space-y-1">
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        <Badge variant="outline" className="h-5 border-primary/20 bg-primary/5 px-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-primary">
                                                            {rowType}
                                                        </Badge>
                                                        <span className="text-[10px] font-black tracking-wide text-foreground/65">
                                                            {item.regulationCode}
                                                        </span>
                                                    </div>
                                                    <p className="text-[13px] font-semibold leading-5 text-foreground break-words">
                                                        {item.regulationStatement}
                                                    </p>
                                                </div>
                                                {item.technicalStandard?.trim() ? (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="compact"
                                                                className="h-7 px-2 text-[9px] font-black uppercase tracking-[0.08em] text-foreground/70 hover:bg-accent/30"
                                                                onClick={() => toggleClauseDetails(item.id)}
                                                            >
                                                                <ChevronDown className={cn('mr-1 h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')} />
                                                                {isExpanded ? 'Hide text' : 'Show text'}
                                                            </Button>
                                                            {!isExpanded ? (
                                                                <p className="line-clamp-2 min-w-0 flex-1 text-[12px] leading-5 text-foreground/70">
                                                                    {getTechnicalExcerpt(item.technicalStandard)}
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top px-1.5 py-2">
                                            {isClauseRow ? (
                                                canManageMatrix ? (
                                                    <Select
                                                        value={clauseGapStatus || 'Unassessed'}
                                                        onValueChange={(value) => void updateGapStatus(item, value as GapStatus)}
                                                    >
                                                    <SelectTrigger className="h-8 w-full max-w-[160px]">
                                                            <SelectValue placeholder="Select status" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {GAP_STATUS_OPTIONS.map((option) => (
                                                                <SelectItem key={option.value} value={option.value}>
                                                                    {option.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <Badge variant={gapStatusVariant(clauseGapStatus || 'Unassessed')} className="text-[9px] font-black uppercase tracking-[0.08em]">
                                                        {clauseGapStatus}
                                                    </Badge>
                                                )
                                            ) : (
                                                <span className="text-[12px] text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="align-top px-1.5 py-2">
                                            {isClauseRow ? (
                                                canManageMatrix ? (
                                                    <Input
                                                        defaultValue={item.companyReference || ''}
                                                        placeholder="Reference or reason"
                                                        className="h-8 max-w-[220px]"
                                                        onBlur={(event) => {
                                                            const nextValue = event.target.value.trim();
                                                            if ((item.companyReference || '').trim() === nextValue) return;
                                                            void updateMatrixItemField(item, { companyReference: nextValue });
                                                        }}
                                                    />
                                                ) : (
                                                    <span className="block truncate text-[12px] text-foreground/80">
                                                        {item.companyReference?.trim() || '-'}
                                                    </span>
                                                )
                                            ) : (
                                                <span className="text-[12px] text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="align-top px-1.5 py-2 text-[12px] text-foreground/80 whitespace-nowrap">
                                            {isClauseRow ? (
                                                canManageMatrix ? (
                                                    <Popover
                                                        open={openGapDateRowId === item.id}
                                                        onOpenChange={(open) => setOpenGapDateRowId(open ? item.id : null)}
                                                    >
                                                        <PopoverTrigger asChild>
                                                        <Button type="button" variant="outline" size="compact" className="h-8 w-full max-w-[150px] justify-between px-3">
                                                                <span className={cn('truncate', !item.gapStatusDate?.trim() && 'text-muted-foreground')}>
                                                                    {item.gapStatusDate?.trim() ? formatAuditDate(item.gapStatusDate) : 'Set date'}
                                                                </span>
                                                                <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0" align="start">
                                                            <CustomCalendar
                                                                selectedDate={parseLocalDate(item.gapStatusDate)}
                                                                onDateSelect={(date) => {
                                                                    void updateMatrixItemField(item, { gapStatusDate: toNoonUtcIso(date) });
                                                                    setOpenGapDateRowId(null);
                                                                }}
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                ) : (
                                                    item.gapStatusDate?.trim() ? formatAuditDate(item.gapStatusDate) : '-'
                                                )
                                            ) : (
                                                '-'
                                            )}
                                        </TableCell>
                                        <TableCell className="align-top px-2 py-2">
                                            <div className="flex justify-end gap-1">
                                                {depth === 0 && canManageMatrix ? (
                                                    <>
                                                        <Button variant="outline" size="icon" className="h-7 w-7 border-slate-300" onClick={() => handleOpenForm(item, 'header')}>
                                                            <Edit className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteSection(item)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </>
                                                ) : depth !== 0 && canManageMatrix ? (
                                                    <>
                                                        <Button variant="outline" size="icon" className="h-7 w-7 border-slate-300" onClick={() => handleOpenForm(item)}>
                                                            <Edit className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteItem(item)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    {isClauseRow && isExpanded ? (
                                        <TableRow key={`${item.id}-detail`} className="bg-muted/10">
                                            <TableCell colSpan={5} className="px-1.5 pb-3 pt-0">
                                                <div className="w-full rounded-md border border-card-border/70 bg-background pl-6 pr-3 py-2 text-[12px] leading-5 text-foreground/80 break-words">
                                                    <p className="mb-1 text-[9px] font-black uppercase tracking-[0.14em] text-foreground/50">Clause details</p>
                                                    {renderTechnicalStandardText(item.technicalStandard)}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
                    </div>
                </div>
            </div>
        );
    };

    const renderGapAnalysisTable = () => {
        const auditsSorted = [...qualityAudits].sort((a, b) => {
            const aDate = new Date(a.auditDate || '').getTime() || 0;
            const bDate = new Date(b.auditDate || '').getTime() || 0;
            return bDate - aDate;
        });

        const templateItemLookup = new Map<string, { regulationReference: string; templateTitle: string }>();
        qualityAuditTemplates.forEach((template) => {
            template.sections.forEach((section) => {
                section.items.forEach((item) => {
                    const regulationReference = normalizeRegulationCode(item.regulationReference);
                    if (!regulationReference) return;
                    templateItemLookup.set(item.id, {
                        regulationReference,
                        templateTitle: template.title,
                    });
                });
            });
        });

        type AuditFindingSummary = {
            finding: QualityFinding['finding'];
            auditNumber: string;
            auditDate: string;
            auditStatus: QualityAudit['status'];
            templateTitle: string;
            checklistItemId: string;
        };

        const latestFindingByItemId = new Map<string, AuditFindingSummary>();

        auditsSorted.forEach((audit) => {
            const template = qualityAuditTemplates.find((entry) => entry.id === audit.templateId);
            if (!template) return;

            const itemIdsForTemplate = new Map<string, { regulationReference: string }>();
            template.sections.forEach((section) => {
                section.items.forEach((item) => {
                    const regulationReference = normalizeRegulationCode(item.regulationReference);
                    if (!regulationReference) return;
                    itemIdsForTemplate.set(item.id, { regulationReference });
                });
            });

            (audit.findings || []).forEach((finding) => {
                const templateItem = itemIdsForTemplate.get(finding.checklistItemId);
                if (!templateItem) return;
                if (latestFindingByItemId.has(finding.checklistItemId)) return;

                latestFindingByItemId.set(finding.checklistItemId, {
                    finding: finding.finding,
                    auditNumber: audit.auditNumber,
                    auditDate: audit.auditDate,
                    auditStatus: audit.status,
                    templateTitle: template.title,
                    checklistItemId: finding.checklistItemId,
                });
            });
        });

        type GapRow = MatrixTableRow & {
            mappedCount: number;
            assessedCount: number;
            openCapCount: number;
            latestFinding?: AuditFindingSummary;
            gapStatus: 'Open gap' | 'Partial coverage' | 'Covered' | 'Unassessed' | 'Not applicable';
        };

        const rows = buildTableRows(topLevelItems).map<GapRow>((row) => {
            const normalizedCode = normalizeRegulationCode(row.item.regulationCode);
            const mappedItemIds = Array.from(templateItemLookup.entries())
                .filter(([, value]) => value.regulationReference === normalizedCode)
                .map(([itemId]) => itemId);

            const latestFindings = mappedItemIds
                .map((itemId) => latestFindingByItemId.get(itemId))
                .filter((finding): finding is AuditFindingSummary => Boolean(finding));

            const assessedCount = latestFindings.length;
            const openCapCount = correctiveActionPlans.filter((cap) => {
                const isOpen = cap.status !== 'Closed' && cap.status !== 'Cancelled';
                return isOpen && mappedItemIds.includes(cap.findingId);
            }).length;

            const nonCompliantCount = latestFindings.filter((finding) => finding.finding === 'Non Compliant').length;
            const compliantCount = latestFindings.filter((finding) => finding.finding === 'Compliant').length;
            const notApplicableCount = latestFindings.filter((finding) => finding.finding === 'Not Applicable').length;
            const latestFinding = [...latestFindings].sort((a, b) => new Date(b.auditDate).getTime() - new Date(a.auditDate).getTime())[0];

            let gapStatus: GapRow['gapStatus'] = 'Unassessed';
            if (mappedItemIds.length === 0) {
                gapStatus = 'Open gap';
            } else if (assessedCount === 0) {
                gapStatus = 'Unassessed';
            } else if (nonCompliantCount > 0) {
                gapStatus = 'Open gap';
            } else if (compliantCount > 0 && compliantCount + notApplicableCount === assessedCount) {
                gapStatus = notApplicableCount === assessedCount ? 'Not applicable' : 'Covered';
            } else {
                gapStatus = 'Partial coverage';
            }

            if (openCapCount > 0 && gapStatus === 'Covered') {
                gapStatus = 'Partial coverage';
            }

            return {
                ...row,
                mappedCount: mappedItemIds.length,
                assessedCount,
                openCapCount,
                latestFinding,
                gapStatus,
            };
        });

        const statusVariant = (status: GapRow['gapStatus']) => {
            switch (status) {
                case 'Covered':
                    return 'default';
                case 'Not applicable':
                    return 'secondary';
                case 'Partial coverage':
                    return 'outline';
                case 'Open gap':
                    return 'destructive';
                default:
                    return 'secondary';
            }
        };

        if (rows.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-24 text-center opacity-30">
                    <Layers className="h-16 w-16 mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest text-foreground/90">Coherence Matrix Empty</p>
                    <p className="text-xs font-medium text-foreground/80 max-w-xs mt-2">Populate your matrix using the AI upload tool or by seeding standard Part 141 regulations.</p>
                </div>
            );
        }

        return (
            <div className="rounded-lg border border-card-border bg-background">
                <Table className="min-w-[1350px] table-fixed">
                    <colgroup>
                        <col className="w-[17%]" />
                        <col className="w-[40%]" />
                        <col className="w-[13%]" />
                        <col className="w-[12%]" />
                        <col className="w-[10%]" />
                        <col className="w-[8%]" />
                    </colgroup>
                    <TableHeader className="sticky top-0 z-10 bg-muted/30">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Regulation / Clause</TableHead>
                            <TableHead className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Gap summary</TableHead>
                            <TableHead className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Manual ref</TableHead>
                            <TableHead className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Responsible</TableHead>
                            <TableHead className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Next audit date</TableHead>
                            <TableHead className="px-2 py-2 text-right text-[10px] font-black uppercase tracking-[0.12em] text-foreground/70">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map(({ item, depth, hasChildren, mappedCount, assessedCount, openCapCount, latestFinding, gapStatus }) => (
                            <TableRow key={item.id} className={cn(depth === 0 && 'bg-muted/15')}>
                                <TableCell className="align-top px-2 py-2">
                                    <div className="space-y-1" style={{ paddingLeft: `${depth * 0.5}rem` }}>
                                        <div className="flex flex-wrap items-center gap-1">
                                            <Badge variant="outline" className="h-5 border-primary/20 bg-primary/5 px-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-primary">
                                                {depth === 0 ? 'Header' : hasChildren ? 'Subheader' : 'Clause'}
                                            </Badge>
                                            <span className="text-[10px] font-black tracking-wide text-foreground/65">{item.regulationCode}</span>
                                        </div>
                                        <p className="line-clamp-2 text-[12.5px] font-semibold leading-[1.35] text-foreground break-words">
                                            {item.regulationStatement}
                                        </p>
                                    </div>
                                </TableCell>
                                <TableCell className="align-top px-2 py-2">
                                    <div className="space-y-1.5">
                                        <div className="flex flex-wrap gap-1.5">
                                            <Badge variant={statusVariant(gapStatus)} className="text-[9px] font-black uppercase tracking-[0.08em]">
                                                {gapStatus}
                                            </Badge>
                                            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-[0.08em]">
                                                {mappedCount === 0 ? 'No mapping' : `${assessedCount}/${mappedCount} assessed`}
                                            </Badge>
                                            {openCapCount > 0 ? (
                                                <Badge variant="destructive" className="text-[9px] font-black uppercase tracking-[0.08em]">
                                                    {openCapCount} open CAP{openCapCount === 1 ? '' : 's'}
                                                </Badge>
                                            ) : null}
                                        </div>
                                        {latestFinding ? (
                                            <p className="text-[11px] leading-5 text-foreground/75">
                                                Latest: <span className="font-semibold uppercase">{latestFinding.finding}</span> · {latestFinding.auditNumber} · {formatAuditDate(latestFinding.auditDate)}
                                            </p>
                                        ) : (
                                            <p className="text-[11px] leading-5 text-muted-foreground italic">No audit finding linked yet.</p>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="align-top px-2 py-2 text-[12px] text-foreground/80 break-words">
                                    {item.companyReference?.trim() ? (
                                        <Badge variant="outline" className="max-w-full border-card-border bg-background/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-foreground">
                                            <span className="truncate">{item.companyReference.trim()}</span>
                                        </Badge>
                                    ) : '-'}
                                </TableCell>
                                <TableCell className="align-top px-2 py-2 text-[12px] text-foreground/80 break-words">
                                    {item.responsibleManagerId?.trim() ? (
                                        <span className="block truncate">{getManagerLabel(item.responsibleManagerId) || '-'}</span>
                                    ) : '-'}
                                </TableCell>
                                <TableCell className="align-top px-2 py-2 text-[12px] text-foreground/80 whitespace-nowrap">
                                    {item.nextAuditDate?.trim() ? formatAuditDate(item.nextAuditDate) : '-'}
                                </TableCell>
                                <TableCell className="align-top px-2 py-2">
                                    <div className="flex justify-end gap-1">
                                        {depth === 0 && canManageMatrix ? (
                                            <>
                                                <Button variant="outline" size="icon" className="h-7 w-7 border-slate-300" onClick={() => handleOpenForm(item, 'header')}>
                                                    <Edit className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteSection(item)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </>
                                        ) : depth !== 0 && canManageMatrix ? (
                                            <>
                                                <Button variant="outline" size="icon" className="h-7 w-7 border-slate-300" onClick={() => handleOpenForm(item)}>
                                                    <Edit className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteItem(item)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </>
                                        ) : null}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    };

    const renderInlineParagraphChildren = (items: ComplianceRequirement[], ancestors: string[]) => {
        return (
            <div className="space-y-3">
                {items.map((child) => {
                    const normalizedChildCode = normalizeRegulationCode(child.regulationCode);
                    if (ancestors.includes(normalizedChildCode)) return null;
                    const grandChildren = groupedItems[normalizedChildCode] || [];
                    const hasNestedChildren = grandChildren.length > 0;

                    return (
                        <Collapsible key={child.id} className="overflow-hidden rounded-md border bg-background/70" defaultOpen>
                            <div className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <CollapsibleTrigger className="flex min-w-0 flex-1 items-start gap-3 text-left">
                                        <div className="min-w-0 flex-1">
                                            {shouldShowSingleLineLabel(child) ? (
                                                <p className="text-sm font-semibold leading-5 text-foreground">
                                                    {child.regulationCode}
                                                </p>
                                            ) : (
                                                <>
                                                    <p className="text-[11px] font-bold tracking-wide text-foreground/80">
                                                        {child.regulationCode}
                                                    </p>
                                                    <p className="mt-1 text-sm font-medium leading-5 text-foreground">
                                                        {child.regulationStatement}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-background text-muted-foreground">
                                            <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                                        </div>
                                    </CollapsibleTrigger>
                                    <div className="flex shrink-0 items-center gap-2 pt-1">
                                        {canManageMatrix ? (
                                            <>
                                                <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300" onClick={() => handleOpenForm(child)}>
                                                    <Edit className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDeleteItem(child)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                            <CollapsibleContent className="space-y-4 border-t border-card-border/70 bg-muted/5 px-4 pb-4 pt-3">
                                {child.technicalStandard?.trim() ? (
                                    <div className="space-y-2 overflow-hidden">
                                        <div className="rounded-md border border-card-border/70 bg-background/60 px-4 py-3">
                                            {renderTechnicalStandardText(child.technicalStandard)}
                                        </div>
                                    </div>
                                ) : null}
                                {renderRequirementMeta(child)}
                                {hasNestedChildren ? (
                                    <div className="space-y-2 border-t pt-4">
                                        {renderInlineClauseLines(normalizedChildCode, grandChildren, [...ancestors, normalizedChildCode])}
                                    </div>
                                ) : null}
                            </CollapsibleContent>
                        </Collapsible>
                    );
                })}
            </div>
        );
    };

    const renderMatrixNode = (item: ComplianceRequirement, depth = 0, ancestors: string[] = []) => {
        const normalizedItemCode = normalizeRegulationCode(item.regulationCode);
        if (ancestors.includes(normalizedItemCode)) return null;
        const childItems = groupedItems[normalizedItemCode] || [];
        if (normalizedSearchQuery && !branchMatchesSearch(item)) return null;
        const hasChildren = childItems.length > 0;
        const renderChildrenInline = depth === 1;
        const nodeStyle = depth === 0
            ? {
                backgroundColor: matrixTheme['matrix-header-background'],
                color: matrixTheme['matrix-header-foreground'],
            }
            : depth === 1 && hasChildren
                ? {
                    backgroundColor: matrixTheme['matrix-subheader-background'],
                    color: matrixTheme['matrix-subheader-foreground'],
                }
                : undefined;
        const nodeTextClassName = depth === 0 || (depth === 1 && hasChildren) ? 'text-inherit' : 'text-foreground';
        const nodeMutedTextStyle = depth === 0
            ? { color: matrixTheme['matrix-header-foreground'] }
            : depth === 1 && hasChildren
                ? { color: matrixTheme['matrix-subheader-foreground'] }
                : undefined;

        return (
            <Collapsible
                key={item.id}
                className={cn(
                    "border rounded-lg overflow-hidden"
                )}
                defaultOpen
            >
                <div
                    className={cn(
                        "p-4",
                        hasChildren && "border-b border-card-border/70"
                    )}
                    style={nodeStyle}
                >
                    <div className="flex items-center justify-between gap-3">
                        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <div className="min-w-0 flex-1">
                                {depth === 0 ? (
                                    shouldShowSingleLineLabel(item) ? (
                                        <p className={cn("text-[11px] font-black tracking-wide", nodeTextClassName)} style={nodeMutedTextStyle}>
                                            {item.regulationCode}
                                        </p>
                                    ) : (
                                        <p className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold leading-5", nodeTextClassName)}>
                                            <span className="text-[11px] font-black tracking-wide" style={nodeMutedTextStyle}>
                                                {item.regulationCode}
                                            </span>
                                            <span>{item.regulationStatement}</span>
                                        </p>
                                    )
                                ) : (
                                    <>
                                        {shouldShowSingleLineLabel(item) ? (
                                            <p className={cn("text-sm font-semibold leading-5", nodeTextClassName)}>
                                                {item.regulationCode}
                                            </p>
                                        ) : (
                                            <>
                                                <p className={cn("text-[11px] font-bold tracking-wide", nodeTextClassName)} style={nodeMutedTextStyle}>
                                                    {item.regulationCode}
                                                </p>
                                                <p className={cn("mt-1 line-clamp-2 text-sm font-medium leading-5", nodeTextClassName)}>
                                                    {item.regulationStatement}
                                                </p>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-background text-muted-foreground">
                                <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                            </div>
                        </CollapsibleTrigger>
                        <div className="flex shrink-0 items-center gap-2">
                            {depth === 0 && canManageMatrix ? (
                                <>
                                    <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300" onClick={() => handleOpenForm(item, 'header')}>
                                        <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDeleteSection(item)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </>
                            ) : depth !== 0 && canManageMatrix ? (
                                <>
                                    <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300" onClick={() => handleOpenForm(item)}>
                                        <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDeleteItem(item)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
                <CollapsibleContent className={cn(
                    "space-y-4 border-t border-card-border/70 bg-muted/5",
                    depth === 0 ? "p-4" : "px-6 pb-5 pt-3"
                )}>
                    {item.technicalStandard?.trim() ? (
                        <div className="space-y-2 overflow-hidden">
                            {renderTechnicalStandardText(item.technicalStandard)}
                        </div>
                    ) : null}
                    {renderRequirementMeta(item)}
                    {childItems.length > 0 && (
                        <div className="space-y-2">
                            {renderChildrenInline
                                ? renderInlineParagraphChildren(
                                    normalizedSearchQuery && !itemMatchesSearch(item)
                                        ? childItems.filter((child) => branchMatchesSearch(child))
                                        : childItems,
                                    [...ancestors, normalizedItemCode]
                                )
                                : (normalizedSearchQuery && !itemMatchesSearch(item)
                                    ? childItems.filter((child) => branchMatchesSearch(child))
                                    : childItems).map((child) => renderMatrixNode(child, depth + 1, [...ancestors, normalizedItemCode]))}
                        </div>
                    )}
                </CollapsibleContent>
            </Collapsible>
        );
    };

    return (
        <Tabs value={activeRegulationTabValue} onValueChange={(value) => setActiveRegulationTab(uiValueToRegulationTab(value))} className="flex h-full min-h-0 flex-col overflow-hidden">
            <Card className="h-full min-h-0 flex flex-col overflow-hidden border-0 shadow-none">
                <CardControlHeader
                    isMobile={isMobile}
                    context={shouldShowOrganizationTabs ? (
                        <OrganizationTabsRow
                            organizations={organizations || []}
                            activeTab={activeOrgTab}
                            onTabChange={setActiveOrgTab}
                            className="border-0 bg-transparent px-0 py-0"
                        />
                    ) : undefined}
                    mobileContext={shouldShowOrganizationTabs ? (
                        <OrganizationTabsRow
                            organizations={organizations || []}
                            activeTab={activeOrgTab}
                            onTabChange={setActiveOrgTab}
                            className="border-0 bg-transparent px-0 py-0"
                        />
                    ) : undefined}
                    actions={canViewMatrix ? (
                        canManageMatrix ? (
                            <div className="flex flex-wrap items-center gap-2">
                                {renderSearchControl()}
                                <UploadRegulationsDialog tenantId={tenantId!} organizationId={contextOrgId} regulationFamily={activeRegulationTab} availableParentHeaders={currentFamilySubheaders} />
                                <Button
                                    variant="outline"
                                    className={cn(HEADER_COMPACT_CONTROL_CLASS, 'text-foreground hover:bg-accent/40')}
                                    onClick={() => handleOpenForm(null, 'header')}
                                >
                                    <Layers className="h-4 w-4" />
                                    Add Header
                                </Button>
                                <Button
                                    variant="outline"
                                    className={cn(HEADER_COMPACT_CONTROL_CLASS, 'text-foreground hover:bg-accent/40')}
                                    onClick={() => handleOpenForm(null, 'subheader')}
                                >
                                    <Layers className="h-4 w-4" />
                                    Add Subheader
                                </Button>
                                <Button
                                    className={cn(
                                        HEADER_COMPACT_CONTROL_CLASS,
                                        'border-[hsl(var(--button-primary-border))] bg-[hsl(var(--button-primary-background))] text-[hsl(var(--button-primary-foreground))] hover:bg-[hsl(var(--button-primary-accent))] hover:text-[hsl(var(--button-primary-accent-foreground))]'
                                    )}
                                    onClick={() => handleOpenForm()}
                                >
                                    <PlusCircle className="h-4 w-4" /> 
                                    Add Item
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center gap-2">
                                {renderSearchControl()}
                            </div>
                        )
                    ) : undefined}
                    mobileActions={canViewMatrix ? (
                        canManageMatrix ? (
                            <div className="space-y-2">
                                {renderSearchControl(true)}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="outline"
                                            aria-label="Open coherence matrix actions"
                                            className={cn(
                                                HEADER_SECONDARY_BUTTON_CLASS,
                                                HEADER_COMPACT_CONTROL_CLASS,
                                                'w-full justify-between text-foreground hover:bg-accent/40',
                                            )}
                                        >
                                            <span className="flex items-center gap-2">
                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                                Actions
                                            </span>
                                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                                        <UploadRegulationsDialog 
                                            tenantId={tenantId!} 
                                            organizationId={contextOrgId} 
                                            regulationFamily={activeRegulationTab}
                                            availableParentHeaders={currentFamilySubheaders}
                                            trigger={
                                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                    <WandSparkles className="mr-2 h-4 w-4" /> AI Populate
                                                </DropdownMenuItem>
                                            }
                                        />
                                        <DropdownMenuItem onClick={() => handleOpenForm()}>
                                            <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleOpenForm(null, 'header')}>
                                            <Layers className="mr-2 h-4 w-4" /> Add Header
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleOpenForm(null, 'subheader')}>
                                            <Layers className="mr-2 h-4 w-4" /> Add Subheader
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {renderSearchControl(true)}
                            </div>
                        )
                    ) : undefined}
                    navigation={
                        <ResponsiveTabRow
                            value={activeRegulationTabValue}
                            onValueChange={(value) => setActiveRegulationTab(uiValueToRegulationTab(value))}
                            placeholder="Select Regulation Family"
                            centerTabs
                            className="border-0 bg-transparent px-0 py-0"
                            options={REGULATION_TABS.map((tab) => ({
                                value: regulationTabToUiValue(tab.value),
                                label: tab.label,
                            }))}
                        />
                    }
                />
                
                <CardContent className="flex-1 min-h-0 overflow-auto p-6 pt-4">
                    {renderMatrixTable()}
                </CardContent>
            </Card>
        </Tabs>
    );
  };

  if ((!canViewMatrix && isPermissionsLoading) || isProfileLoading || !userProfile || isLoading) {
    return (
        <div className="max-w-[1100px] mx-auto w-full space-y-6 pt-4 px-1">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-[600px] w-full" />
        </div>
    );
  }

  if (!canViewMatrix) {
    return (
        <div className="max-w-[1100px] mx-auto w-full space-y-6 pt-4 px-1">
            <Card className="border shadow-none">
                <CardContent className="py-16 text-center">
                    <p className="text-sm font-black uppercase tracking-widest text-foreground/90">No Access</p>
                    <p className="mt-2 text-sm text-foreground/80">You do not have permission to view the coherence matrix.</p>
                </CardContent>
            </Card>
        </div>
    );
  }

  return (
    <div className={cn("max-w-[1100px] mx-auto w-full flex flex-col pt-4 px-1", isMobile ? "min-h-0 overflow-y-auto" : "h-full overflow-hidden")}>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-xl border border-card-border bg-card shadow-none">
            {!shouldShowOrganizationTabs ? (
                renderOrgContext(scopedOrganizationId)
            ) : (
                <Tabs value={activeOrgTab} onValueChange={setActiveOrgTab} className="w-full flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <TabsContent value="internal" className="m-0 p-0 h-full">
                            {renderOrgContext('internal')}
                        </TabsContent>
                        {(organizations || []).map((org) => (
                            <TabsContent key={org.id} value={org.id} className="m-0 p-0 h-full">
                                {renderOrgContext(org.id)}
                            </TabsContent>
                        ))}
                    </div>
                </Tabs>
            )}
        </div>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                            <DialogTitle className="font-black uppercase tracking-tight">
                                {formMode === 'header' ? 'Add Header' : formMode === 'subheader' ? 'Add Subheader' : 'Compliance Requirement'}
                            </DialogTitle>
                            <DialogDescription>
                                {formMode === 'header'
                                    ? 'Create the top-level regulation header for the selected category.'
                                    : formMode === 'subheader'
                                    ? 'Create a child row under a selected header.'
                                    : 'Add a manual regulation item under an existing header.'}
                            </DialogDescription>
            </DialogHeader>
            <ComplianceItemForm 
                personnel={personnel || []}
                existingItem={editingItem}
                onFormSubmit={() => setIsFormOpen(false)}
                tenantId={tenantId!}
                defaultRegulationFamily={activeRegulationTab}
                availableParentHeaders={formMode === 'subheader' ? currentFamilyTopLevelHeaders : currentFamilyHeaders}
                mode={formMode}
            />
            </DialogContent>
        </Dialog>
    </div>
  );
}

