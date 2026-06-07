'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import Image from 'next/image';
import { ClipboardPaste, Copy, Edit, Layers, Loader2, PlusCircle, Trash2, WandSparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CardControlHeader, HEADER_COMPACT_CONTROL_CLASS, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import { OrganizationTabsRow, ResponsiveTabRow } from '@/components/responsive-tab-row';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { useOrganizationScope } from '@/hooks/use-organization-scope';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { ComplianceItemForm } from './item-form';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import type { ComplianceRequirement, ExternalOrganization } from '@/types/quality';
import type { SummarizeDocumentInput, SummarizeDocumentOutput } from '@/ai/flows/summarize-document-flow';
import { callAiFlow } from '@/lib/ai-client';
import { extractClipboardText } from '@/lib/clipboard';
import { getPersonnelDisplayName } from '@/lib/personnel-label';
import { cn } from '@/lib/utils';
import { normalizeIndentationArray, normalizeRegulationCode, sanitizeComplianceMatrixEntry } from '@/lib/regulation-code';

const REGULATION_TABS = [
  { value: 'sacaa-cars', label: 'SACAA CARs' },
  { value: 'sacaa-cats', label: 'SACAA CATs' },
  { value: 'ohs', label: 'OHS' },
] as const;

const AI_TEXT_IMPORT_MAX_REQUIREMENTS = 80;
const AI_IMPORT_MAX_TECHNICAL_STANDARD_LENGTH = 4000;

type RegulationFamily = (typeof REGULATION_TABS)[number]['value'];
type MatrixPreviewRequirement = SummarizeDocumentOutput['requirements'][number] & {
  technicalStandardIndentation?: number[];
};

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function formatParentOptionLabel(option: { code: string; label: string }) {
  const code = option.code.trim();
  const label = option.label.trim();
  return label && label !== code ? `${code} - ${label}` : code;
}

function getItemFamily(item: ComplianceRequirement): RegulationFamily {
  if (item.regulationFamily === 'sacaa-cats' || item.regulationFamily === 'ohs') {
    return item.regulationFamily;
  }
  return 'sacaa-cars';
}

function formatAuditDate(value?: string | null) {
  if (!value?.trim()) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, 'dd MMM yyyy');
}

function renderTechnicalText(value?: string | null) {
  if (!value?.trim()) return null;
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-card-border/70 bg-background/70 px-3 py-3">
      {lines.map((line, index) => (
        <p key={`${index}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80">
          {line}
        </p>
      ))}
    </div>
  );
}

function looksLikeRegulationBodyText(value?: string | null) {
  const text = value?.trim() || '';
  if (!text) return false;

  return (
    text.length > 90 ||
    /\(\d+\)/.test(text) ||
    /\([a-z]{1,2}\)/i.test(text) ||
    text.includes('\n') ||
    /(?:shall|must|may|applies to|provided that)/i.test(text)
  );
}

function getBrowserRegulationTitle(item: ComplianceRequirement) {
  const heading = item.documentHeading?.trim();
  if (heading) return heading;

  const statement = item.regulationStatement?.trim() || '';
  if (!statement || looksLikeRegulationBodyText(statement)) {
    return 'Missing regulation title';
  }

  return statement;
}

function buildComplianceItemIdentityKey(item: ComplianceRequirement) {
  return [
    item.regulationFamily || '',
    item.organizationId || '',
    item.structureType || '',
    normalizeRegulationCode(item.parentRegulationCode) || '',
    normalizeRegulationCode(item.regulationCode) || '',
  ].join('|');
}

function scoreComplianceItem(item: ComplianceRequirement) {
  let score = 0;
  if (normalizeRegulationCode(item.regulationCode)) score += 2;
  if (item.regulationStatement?.trim()) score += 4;
  if (item.documentHeading?.trim()) score += 2;
  if (item.technicalStandard?.trim()) score += 5;
  if (item.companyReference?.trim()) score += 1;
  if (item.responsibleManagerId?.trim()) score += 1;
  return score;
}

function mergeComplianceItems(base: ComplianceRequirement, incoming: ComplianceRequirement) {
  const merged = { ...base, ...incoming };
  for (const [key, value] of Object.entries(base) as [keyof ComplianceRequirement, ComplianceRequirement[keyof ComplianceRequirement]][]) {
    const incomingValue = merged[key];
    if (
      (incomingValue === null || incomingValue === undefined || incomingValue === '') &&
      value !== null &&
      value !== undefined &&
      value !== ''
    ) {
      merged[key] = value as never;
    }
  }
  merged.id = incoming.id || base.id;
  return merged;
}

function dedupeComplianceItems(items: ComplianceRequirement[]) {
  const deduped = new Map<string, ComplianceRequirement>();
  for (const item of items) {
    const key = buildComplianceItemIdentityKey(item);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, item);
      continue;
    }

    const preferredBase = scoreComplianceItem(existing) >= scoreComplianceItem(item) ? existing : item;
    const preferredIncoming = preferredBase === existing ? item : existing;
    deduped.set(key, mergeComplianceItems(preferredBase, preferredIncoming));
  }
  return Array.from(deduped.values());
}

function isStructuralBrowserNode(item: ComplianceRequirement) {
  if (item.structureType === 'header' || item.structureType === 'subheader') {
    return true;
  }
  if (item.structureType === 'item') {
    return false;
  }
  return !item.technicalStandard?.trim() && !item.companyReference?.trim() && !item.nextAuditDate?.trim();
}

function sanitizeAiPreviewRequirements(
  requirements: MatrixPreviewRequirement[],
  targetHeader: string,
  sourceKind: 'text' | 'image' | 'file',
) {
  const normalizedTargetHeader = normalizeRegulationCode(targetHeader);
  const seenKeys = new Set<string>();

  const cleaned = requirements
    .map((req) => {
      const regulationCode = normalizeRegulationCode(req.regulationCode);
      const parentRegulationCode = normalizeRegulationCode(req.parentRegulationCode) || normalizedTargetHeader;
      const rawHeading = req.documentHeading?.trim() || '';
      const rawStatement = req.regulationStatement?.trim() || '';
      let regulationStatement = rawStatement || regulationCode;
      let technicalStandard = (req.technicalStandard || '').trim();
      let documentHeading = rawHeading;

      if (looksLikeRegulationBodyText(regulationStatement) && rawHeading) {
        regulationStatement = rawHeading;
        documentHeading = '';
        technicalStandard = technicalStandard
          ? `${rawStatement}\n${technicalStandard}`.trim()
          : rawStatement;
      }

      technicalStandard = technicalStandard.slice(0, AI_IMPORT_MAX_TECHNICAL_STANDARD_LENGTH);

      if (!regulationCode || !parentRegulationCode) return null;
      if (regulationCode.toLowerCase() === parentRegulationCode.toLowerCase()) return null;

      const dedupeKey = `${parentRegulationCode.toLowerCase()}|${regulationCode.toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) return null;
      seenKeys.add(dedupeKey);

      return {
        ...req,
        regulationCode,
        parentRegulationCode,
        documentHeading,
        regulationStatement,
        technicalStandard,
        technicalStandardIndentation: normalizeIndentationArray(req.technicalStandardIndentation),
      };
    })
    .filter(Boolean) as MatrixPreviewRequirement[];

  const limited =
    sourceKind === 'text' && cleaned.length > AI_TEXT_IMPORT_MAX_REQUIREMENTS
      ? cleaned.slice(0, AI_TEXT_IMPORT_MAX_REQUIREMENTS)
      : cleaned;

  return {
    requirements: limited,
    droppedCount: requirements.length - limited.length,
    wasTrimmed: sourceKind === 'text' && cleaned.length > AI_TEXT_IMPORT_MAX_REQUIREMENTS,
  };
}

function UploadRegulationsDialog({
  tenantId,
  organizationId,
  regulationFamily,
  availableParentHeaders,
  trigger,
}: {
  tenantId: string;
  organizationId: string | null;
  regulationFamily: RegulationFamily;
  availableParentHeaders: { code: string; label: string }[];
  trigger?: React.ReactNode;
}) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sourceTab, setSourceTab] = useState<'image' | 'text' | 'file'>('image');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [stagedImages, setStagedImages] = useState<string[]>([]);
  const [isMultiImageMode, setIsMultiImageMode] = useState(false);
  const [targetFamily, setTargetFamily] = useState<RegulationFamily>(regulationFamily);
  const [targetHeader, setTargetHeader] = useState('');
  const [previewRequirements, setPreviewRequirements] = useState<MatrixPreviewRequirement[] | null>(null);
  const [previewInput, setPreviewInput] = useState<SummarizeDocumentInput | null>(null);
  const dialogBodyRef = useRef<HTMLDivElement | null>(null);

  const resetDialog = useCallback(() => {
    setSourceTab('image');
    setFile(null);
    setPastedText('');
    setStagedImages([]);
    setIsMultiImageMode(false);
    setTargetFamily(regulationFamily);
    setTargetHeader('');
    setPreviewRequirements(null);
    setPreviewInput(null);
  }, [regulationFamily]);

  const handlePaste = useCallback(async (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
            reader.onload = (e) => {
              const nextImage = e.target?.result as string;
              setSourceTab('image');
              setStagedImages((current) => [...current, nextImage]);
              toast({ title: 'Image Added', description: 'The image has been staged for processing.' });
            };
          reader.readAsDataURL(blob);
        }
        return;
      }
    }

    const clipboardText = extractClipboardText(event.clipboardData);
    if (clipboardText) {
      event.preventDefault();
      setSourceTab('text');
      setPastedText(clipboardText);
      toast({ title: 'Text Pasted', description: 'The text has been loaded and is ready to be processed.' });
    }
  }, [toast]);

  const canProcess = !!targetHeader.trim() && (Boolean(file) || Boolean(pastedText.trim()) || stagedImages.length > 0);
  const hasPreviewRows = (previewRequirements?.length || 0) > 0;

  const handleProcess = async () => {
    if (!targetHeader.trim()) {
      toast({
        variant: 'destructive',
        title: 'Select a sub-regulation first',
        description: 'Create the header and sub-regulation manually, then choose the sub-regulation before running AI import.',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const input: SummarizeDocumentInput = { targetParentCode: targetHeader, document: {} };

      let sourceKind: 'text' | 'image' | 'file' = 'text';
      if (file) {
        input.document.text = await file.text();
        sourceKind = 'file';
      } else if (pastedText.trim()) {
        input.document.text = pastedText;
        sourceKind = 'text';
      } else if (stagedImages.length > 0) {
        input.document.images = stagedImages;
        input.isMultiPage = isMultiImageMode;
        sourceKind = 'image';
      }

      const preview = await callAiFlow<SummarizeDocumentInput, SummarizeDocumentOutput>('summarizeDocument', input);
      const normalizedPreview = sanitizeAiPreviewRequirements(preview.requirements || [], targetHeader, sourceKind);
      setPreviewInput(input);
      setPreviewRequirements(normalizedPreview.requirements);

      if (normalizedPreview.requirements.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Valid Regulations Found',
          description: 'The extraction finished, but it did not produce any valid child regulations for the selected sub-regulation. Check the source text or choose a different target.',
        });
        return;
      }

      if (normalizedPreview.wasTrimmed) {
        toast({
          title: 'Preview trimmed',
          description: `Pasted-text imports are limited to the first ${AI_TEXT_IMPORT_MAX_REQUIREMENTS} valid child items to keep the matrix responsive.`,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Processing Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSavePreview = async () => {
    if (!previewInput || !previewRequirements?.length) {
      toast({
        variant: 'destructive',
        title: 'No Preview To Save',
        description: 'Run Preview Extraction first and confirm that at least one valid regulation was extracted.',
      });
      return;
    }

    setIsSaving(true);
    setIsProcessing(true);
    try {
      const sourceKind: 'text' | 'image' | 'file' = previewInput.document.images?.length
        ? 'image'
        : previewInput.document.text
          ? (file ? 'file' : 'text')
          : 'text';

      const normalizedPreview = sanitizeAiPreviewRequirements(previewRequirements, targetHeader, sourceKind);
      if (normalizedPreview.requirements.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Valid Regulations',
          description: 'The AI output did not contain any valid child regulations to save under the selected sub-regulation.',
        });
        return;
      }

      const newItems = normalizedPreview.requirements.map((req) => ({
        ...req,
        id: crypto.randomUUID(),
        structureType: 'item' as const,
        organizationId,
        regulationFamily: targetFamily,
        regulationCode: req.regulationCode,
        parentRegulationCode: req.parentRegulationCode,
        documentHeading: req.documentHeading?.trim() || '',
        regulationStatement: req.regulationStatement,
        technicalStandard: req.technicalStandard,
        technicalStandardIndentation: req.technicalStandardIndentation,
      }));

      const responses = await Promise.all(
        newItems.map((item) =>
          fetch(`/api/compliance-matrix?tenantId=${encodeURIComponent(tenantId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item }),
          }),
        ),
      );

      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        const payload = await failedResponse.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to save AI-generated compliance items.');
      }

      window.dispatchEvent(new Event('safeviate-compliance-updated'));
      toast({
        title: 'Matrix Populated',
        description: normalizedPreview.wasTrimmed
          ? `${newItems.length} compliance requirements were added. Text imports are limited to the first ${AI_TEXT_IMPORT_MAX_REQUIREMENTS} valid items.`
          : normalizedPreview.droppedCount > 0
            ? `${newItems.length} compliance requirements were added after filtering invalid or duplicate rows.`
            : `${newItems.length} compliance requirements have been added to the matrix.`,
      });
      setIsOpen(false);
      resetDialog();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Processing Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setIsSaving(false);
      setIsProcessing(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          resetDialog();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="compact" className={cn(HEADER_COMPACT_CONTROL_CLASS, 'text-foreground hover:bg-accent/40')}>
            <WandSparkles className="h-3.5 w-3.5 text-primary" />
            {isMobile ? 'AI Populate' : 'AI Populate'}
          </Button>
        )}
      </DialogTrigger>
      {isOpen ? (
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <div ref={dialogBodyRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
            <DialogHeader>
              <DialogTitle>Populate Matrix with AI</DialogTitle>
              <DialogDescription>
                Create the header and sub-regulation manually first, then choose the sub-regulation below so AI only adds the paragraph cards beneath it.
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

            <Tabs value={sourceTab} onValueChange={(value) => setSourceTab(value as 'image' | 'text' | 'file')}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="image">Paste Images</TabsTrigger>
                <TabsTrigger value="text">Paste Text</TabsTrigger>
                <TabsTrigger value="file">Upload File</TabsTrigger>
              </TabsList>
              <TabsContent value="image" className="pt-4">
                <div onPaste={handlePaste} className="h-44 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground mb-4">
                  <div className="text-center">
                    <ClipboardPaste className="mx-auto h-8 w-8" />
                    <p className="text-foreground/90">Click here and paste image(s) (Ctrl+V)</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 my-4">
                  <Switch id="multi-image-mode" checked={isMultiImageMode} onCheckedChange={setIsMultiImageMode} />
                  <Label htmlFor="multi-image-mode">Treat images as a single document</Label>
                </div>
                {isMultiImageMode ? (
                  <p className="text-xs text-foreground/80 p-2 bg-muted rounded-md">
                    Instruction to AI: treat the supplied images as pages of a single document in the order provided.
                  </p>
                ) : null}
                <ScrollArea className="h-40 mt-4">
                  <div className="grid grid-cols-3 gap-4">
                    {stagedImages.map((imageSrc, index) => (
                      <div key={imageSrc + index} className="relative group">
                        <Image src={imageSrc} alt={`Staged image ${index + 1}`} width={150} height={150} className="rounded-md object-cover aspect-square" />
                        <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => setStagedImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>
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
                    onChange={(event) => {
                      setSourceTab('text');
                      setPastedText(event.target.value);
                    }}
                    onPaste={handlePaste}
                  />
                </ScrollArea>
              </TabsContent>
              <TabsContent value="file" className="pt-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-file">Regulation File (.txt)</Label>
                  <Input
                    id="reg-file"
                    type="file"
                    accept=".txt"
                    onChange={(event) => {
                      setSourceTab('file');
                      setFile(event.target.files?.[0] || null);
                    }}
                  />
                  {file ? <p className="text-sm text-muted-foreground">Selected: {file.name}</p> : null}
                </div>
              </TabsContent>
            </Tabs>

            {hasPreviewRows ? (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">AI Preview</p>
                    <p className="text-xs text-muted-foreground">Review the extracted requirements before saving them to the matrix.</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const payload = JSON.stringify({ requirements: previewRequirements }, null, 2);
                      await navigator.clipboard.writeText(payload);
                      toast({ title: 'Copied', description: 'The raw AI preview JSON was copied to the clipboard.' });
                    }}
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Copy JSON
                  </Button>
                </div>
                <ScrollArea className="max-h-[24rem] rounded-md border bg-white">
                  <div className="space-y-3 p-3">
                    {previewRequirements!.map((requirement, index) => (
                      <div key={`${requirement.regulationCode}-${index}`} className="space-y-2 rounded-md border border-card-border/70 bg-card/40 p-3">
                        {requirement.documentHeading?.trim() ? (
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80">
                            {requirement.documentHeading}
                          </p>
                        ) : null}
                        <p className="text-[11px] font-black tracking-wide text-foreground/65">{requirement.regulationCode}</p>
                        <p className="text-sm font-semibold leading-5 text-foreground">{requirement.regulationStatement}</p>
                        {requirement.technicalStandard?.trim() ? (
                          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80">{requirement.technicalStandard}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="compact" disabled={isProcessing || isSaving}>Cancel</Button>
            </DialogClose>
                    {!hasPreviewRows ? (
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
      ) : null}
    </Dialog>
  );
}

export default function CoherenceMatrixPage() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { userProfile, isLoading: isProfileLoading, tenantId: profileTenantId } = useUserProfile();
  const { hasPermission, isLoading: isPermissionsLoading } = usePermissions();
  const { shouldShowOrganizationTabs, scopedOrganizationId } = useOrganizationScope({ viewAllPermissionId: 'quality-matrix-view-all' });
  const { isAllowed, isLoading: isAccessLoading } = useTenantRouteAccess({ href: '/quality/coherence-matrix' });

  const tenantId = profileTenantId || 'safeviate';
  const resolvedTenantId = tenantId || 'safeviate';
  const canViewMatrix = hasPermission('quality-matrix-view') || hasPermission('quality-matrix-manage');
  const canManageMatrix = hasPermission('quality-matrix-manage');

  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [complianceItems, setComplianceItems] = useState<ComplianceRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeOrgTab, setActiveOrgTab] = useState<string>('internal');
  const [activeRegulationTab, setActiveRegulationTab] = useState<RegulationFamily>('sacaa-cars');
  const [matrixSearchQuery, setMatrixSearchQuery] = useState('');
  const [editingItem, setEditingItem] = useState<ComplianceRequirement | null>(null);
  const [formMode, setFormMode] = useState<'item' | 'header' | 'subheader'>('item');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [openNodeIds, setOpenNodeIds] = useState<Record<string, boolean>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [matrixResponse, personnelResponse, orgResponse] = await Promise.all([
        fetch(`/api/compliance-matrix?tenantId=${encodeURIComponent(resolvedTenantId)}`, { cache: 'no-store' }),
        fetch('/api/personnel', { cache: 'no-store' }),
        fetch('/api/external-organizations', { cache: 'no-store' }),
      ]);

      const [matrixPayload, personnelPayload, orgPayload] = await Promise.all([
        matrixResponse.json().catch(() => ({ items: [] })),
        personnelResponse.json().catch(() => ({ personnel: [] })),
        orgResponse.json().catch(() => ({ organizations: [] })),
      ]);

      setComplianceItems(
        Array.isArray(matrixPayload.items)
          ? dedupeComplianceItems(matrixPayload.items.map((item: ComplianceRequirement) => sanitizeComplianceMatrixEntry(item)))
          : [],
      );
      setPersonnel(Array.isArray(personnelPayload.personnel) ? personnelPayload.personnel : []);
      setOrganizations(Array.isArray(orgPayload.organizations) ? orgPayload.organizations : []);
    } catch (error) {
      console.error('Failed to load matrix data', error);
    } finally {
      setIsLoading(false);
    }
  }, [resolvedTenantId]);

  useEffect(() => {
    void loadData();
    window.addEventListener('safeviate-compliance-updated', loadData);
    window.addEventListener('safeviate-personnel-updated', loadData);
    window.addEventListener('safeviate-external-organizations-updated', loadData);
    return () => {
      window.removeEventListener('safeviate-compliance-updated', loadData);
      window.removeEventListener('safeviate-personnel-updated', loadData);
      window.removeEventListener('safeviate-external-organizations-updated', loadData);
    };
  }, [loadData]);

  useEffect(() => {
    setOpenNodeIds({});
    setSelectedItemId(null);
  }, [activeOrgTab, activeRegulationTab]);

  const currentOrgId = shouldShowOrganizationTabs
    ? activeOrgTab === 'internal'
      ? null
      : activeOrgTab
    : scopedOrganizationId === 'internal'
      ? null
      : scopedOrganizationId;

  const currentOrgItems = useMemo(
    () =>
      complianceItems.filter((item) =>
        currentOrgId ? item.organizationId === currentOrgId : !item.organizationId,
      ),
    [complianceItems, currentOrgId],
  );

  const activeFamilyItems = useMemo(
    () => currentOrgItems.filter((item) => getItemFamily(item) === activeRegulationTab),
    [activeRegulationTab, currentOrgItems],
  );

  const groupedItems = useMemo(() => {
    const map = new Map<string, ComplianceRequirement[]>();
    for (const item of activeFamilyItems) {
      const parentCode = normalizeRegulationCode(item.parentRegulationCode);
      const itemCode = normalizeRegulationCode(item.regulationCode);
      if (parentCode && parentCode !== itemCode) {
        const current = map.get(parentCode) || [];
        current.push(item);
        map.set(parentCode, current);
      }
    }
    for (const [key, list] of map.entries()) {
      list.sort((a, b) => naturalSort(a.regulationCode, b.regulationCode));
      map.set(key, list);
    }
    return map;
  }, [activeFamilyItems]);

  const availableItemCodes = useMemo(
    () => new Set(activeFamilyItems.map((item) => normalizeRegulationCode(item.regulationCode)).filter(Boolean)),
    [activeFamilyItems],
  );

  const topLevelItems = useMemo(
    () =>
      activeFamilyItems
        .filter((item) => {
          const itemCode = normalizeRegulationCode(item.regulationCode);
          const parentCode = normalizeRegulationCode(item.parentRegulationCode);
          return !parentCode || parentCode === itemCode || !availableItemCodes.has(parentCode);
        })
        .sort((a, b) => naturalSort(a.regulationCode, b.regulationCode)),
    [activeFamilyItems, availableItemCodes],
  );

  const availablePartHeaders = useMemo(
    () =>
      topLevelItems.reduce((acc, item) => {
        const code = normalizeRegulationCode(item.regulationCode);
        if (!code || acc.some((entry) => entry.code === code)) return acc;
        acc.push({ code, label: (item.regulationStatement || item.regulationCode).trim() });
        return acc;
      }, [] as { code: string; label: string }[]),
    [topLevelItems],
  );

  const searchableTextForItem = useCallback(
    (item: ComplianceRequirement) =>
      [
        item.regulationCode,
        item.regulationStatement,
        item.documentHeading,
        item.technicalStandard,
        item.companyReference,
        item.responsibleManagerId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    [],
  );

  const normalizedSearchQuery = matrixSearchQuery.trim().toLowerCase();

  const branchMatchesSearch = useCallback((item: ComplianceRequirement, visited = new Set<string>()): boolean => {
    if (!normalizedSearchQuery) return true;
    const normalizedCode = normalizeRegulationCode(item.regulationCode);
    if (normalizedCode && visited.has(normalizedCode)) return false;
    const nextVisited = new Set(visited);
    if (normalizedCode) nextVisited.add(normalizedCode);
    if (searchableTextForItem(item).includes(normalizedSearchQuery)) return true;
    const children = groupedItems.get(normalizedCode) || [];
    return children.some((child) => branchMatchesSearch(child, nextVisited));
  }, [groupedItems, normalizedSearchQuery, searchableTextForItem]);

  const availableParentHeaders = useMemo(
    () =>
      activeFamilyItems
        .filter((item) => !item.technicalStandard?.trim())
        .sort((a, b) => naturalSort(a.regulationCode, b.regulationCode))
        .reduce((acc, item) => {
          const code = normalizeRegulationCode(item.regulationCode);
          if (!code || acc.some((entry) => entry.code === code)) return acc;
          acc.push({ code, label: (item.regulationStatement || item.regulationCode).trim() });
          return acc;
        }, [] as { code: string; label: string }[]),
    [activeFamilyItems],
  );

  const availableSubRegulationHeaders = useMemo(
    () =>
      activeFamilyItems
        .filter((item) => !item.technicalStandard?.trim())
        .filter((item) => !!normalizeRegulationCode(item.parentRegulationCode))
        .sort((a, b) => naturalSort(a.regulationCode, b.regulationCode))
        .reduce((acc, item) => {
          const code = normalizeRegulationCode(item.regulationCode);
          if (!code || acc.some((entry) => entry.code === code)) return acc;
          acc.push({ code, label: (item.regulationStatement || item.regulationCode).trim() });
          return acc;
        }, [] as { code: string; label: string }[]),
    [activeFamilyItems],
  );

  const browserItems = useMemo(() => {
    const rows: ComplianceRequirement[] = [];

    const walk = (items: ComplianceRequirement[], ancestors: string[] = []) => {
      for (const item of items) {
        const code = normalizeRegulationCode(item.regulationCode);
        if (ancestors.includes(code)) continue;
        if (normalizedSearchQuery && !branchMatchesSearch(item)) continue;
        rows.push(item);
        const children = groupedItems.get(code) || [];
        const childSubheaders = children.filter((child) => isStructuralBrowserNode(child));
        const childRegulations = children.filter((child) => !isStructuralBrowserNode(child));
        if (childSubheaders.length > 0) {
          walk(childSubheaders, [...ancestors, code]);
        }
        for (const regulation of childRegulations) {
          if (ancestors.includes(normalizeRegulationCode(regulation.regulationCode))) continue;
          if (normalizedSearchQuery && !branchMatchesSearch(regulation)) continue;
          rows.push(regulation);
        }
      }
    };

    walk(topLevelItems);
    return rows;
  }, [branchMatchesSearch, groupedItems, normalizedSearchQuery, topLevelItems]);

  useEffect(() => {
    if (!browserItems.length) {
      setSelectedItemId(null);
      return;
    }

    setSelectedItemId((current) => {
      if (current && browserItems.some((item) => item.id === current)) {
        return current;
      }

      const firstSubheader = browserItems.find((item) => normalizeRegulationCode(item.parentRegulationCode));
      return firstSubheader?.id || browserItems[0]?.id || null;
    });
  }, [browserItems]);

  const selectedItem = useMemo(
    () => browserItems.find((item) => item.id === selectedItemId) || null,
    [browserItems, selectedItemId],
  );

  const selectedItemChildren = useMemo(
    () => (selectedItem ? groupedItems.get(normalizeRegulationCode(selectedItem.regulationCode)) || [] : []),
    [groupedItems, selectedItem],
  );

  const selectedItemRole: 'header' | 'subheader' | 'item' | null = useMemo(() => {
    if (!selectedItem) return null;
    if (selectedItem.structureType) return selectedItem.structureType;
    if (selectedItemChildren.length > 0) {
      return normalizeRegulationCode(selectedItem.parentRegulationCode) ? 'subheader' : 'header';
    }
    return 'item';
  }, [selectedItem, selectedItemChildren.length]);

  const selectedSubheaderRegulations = useMemo(() => {
    if (!selectedItem || selectedItemRole !== 'subheader') return [] as ComplianceRequirement[];
    return (groupedItems.get(normalizeRegulationCode(selectedItem.regulationCode)) || [])
      .filter((item) => !isStructuralBrowserNode(item))
      .filter((item) => {
        const childCode = normalizeRegulationCode(item.regulationCode);
        return !normalizedSearchQuery || branchMatchesSearch(item) || childCode.includes(normalizedSearchQuery);
      })
      .sort((a, b) => naturalSort(a.regulationCode, b.regulationCode));
  }, [branchMatchesSearch, groupedItems, normalizedSearchQuery, selectedItem, selectedItemRole]);

  const activeRegulationItem = useMemo(() => {
    if (selectedItemRole === 'item') return selectedItem;
    if (selectedItemRole === 'subheader' && selectedSubheaderRegulations.length > 0) {
      return selectedSubheaderRegulations[0];
    }
    return null;
  }, [selectedItem, selectedItemRole, selectedSubheaderRegulations]);

  const handleOpenForm = (item: ComplianceRequirement | null = null, mode: 'item' | 'header' | 'subheader' = 'item') => {
    setEditingItem(item);
    setFormMode(mode);
    setIsFormOpen(true);
  };

  const handleDelete = async (item: ComplianceRequirement) => {
    try {
      const params = new URLSearchParams({
        id: item.id,
        code: item.regulationCode,
        regulationFamily: item.regulationFamily || activeRegulationTab,
      });
      params.set('organizationId', item.organizationId || '');
      const response = await fetch(`/api/compliance-matrix?${params.toString()}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to delete coherence matrix item.');
      }
      window.dispatchEvent(new Event('safeviate-compliance-updated'));
      toast({ title: 'Deleted', description: `${item.regulationCode} was removed.` });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete coherence matrix item.',
      });
    }
  };

  const renderNode = useCallback((item: ComplianceRequirement, depth = 0, ancestors: string[] = []): React.ReactNode => {
    const itemCode = normalizeRegulationCode(item.regulationCode);
    if (ancestors.includes(itemCode)) return null;
    if (normalizedSearchQuery && !branchMatchesSearch(item)) return null;

    const children = groupedItems.get(itemCode) || [];
    const childSubheaders = children.filter((child) => isStructuralBrowserNode(child));
    const childRegulations = children.filter((child) => !isStructuralBrowserNode(child));
    const isOpen = !!openNodeIds[item.id] || !!normalizedSearchQuery;
    const hasChildren = childSubheaders.length > 0 || childRegulations.length > 0;
    const isSelected = selectedItemId === item.id;
    const roleMode = item.structureType || (depth === 0 ? 'header' : childSubheaders.length > 0 ? 'subheader' : 'item');

    return (
      <div key={item.id} className="space-y-2">
        <div
          className={cn(
            'rounded-lg border p-4 shadow-none transition-colors',
            depth === 0 ? 'bg-muted/20' : 'bg-card/90',
            isSelected ? 'border-primary/40 bg-primary/5' : 'border-card-border',
          )}
          style={{ marginLeft: depth === 0 ? 0 : `${Math.min(depth * 0.75, 2.25)}rem` }}
        >
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
              onClick={() => {
                setSelectedItemId(item.id);
                setOpenNodeIds((current) => ({ ...current, [item.id]: !isOpen }));
              }}
            >
              {hasChildren ? (
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-card-border bg-background/80 text-foreground/55">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>
              ) : (
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-card-border bg-background/80 text-[10px] font-black text-foreground/55">
                  •
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                {item.documentHeading?.trim() ? (
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-foreground/55">{item.documentHeading}</p>
                ) : null}
                  {depth === 0 ? (
                    <>
                      <p className="text-[11px] font-black tracking-wide text-foreground/65">{item.regulationCode}</p>
                      <p className="break-words text-sm font-semibold leading-5 text-foreground">{item.regulationStatement}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/75">SUBPART</p>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-[11px] font-black tracking-wide text-primary/85">{item.regulationCode}</span>
                        <span className="text-sm font-semibold leading-5 text-foreground">{item.regulationStatement}</span>
                      </div>
                    </>
                  )}
                </div>
              </button>
            {canManageMatrix ? (
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300" onClick={() => handleOpenForm(item, roleMode)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDelete(item)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
          </div>

          {item.companyReference?.trim() || item.nextAuditDate?.trim() || item.responsibleManagerId?.trim() ? (
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/55">
              {item.companyReference?.trim() ? (
                <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                  {item.companyReference.trim()}
                </Badge>
              ) : null}
              {item.responsibleManagerId?.trim() ? (
                <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                  Responsible {getPersonnelDisplayName(personnel, item.responsibleManagerId) || item.responsibleManagerId}
                </Badge>
              ) : null}
              {item.nextAuditDate?.trim() ? (
                <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                  Next audit {formatAuditDate(item.nextAuditDate)}
                </Badge>
              ) : null}
            </div>
          ) : null}

          {isOpen && (childSubheaders.length > 0 || childRegulations.length > 0) ? (
            <div className="mt-4 space-y-2 border-t border-card-border/70 pt-3">
              {childSubheaders.map((child) => renderNode(child, depth + 1, [...ancestors, itemCode]))}
              {depth > 0 && childRegulations.length > 0 ? (
                <div className="space-y-1">
                  {childRegulations
                    .filter((child) => {
                      const childCode = normalizeRegulationCode(child.regulationCode);
                      return !normalizedSearchQuery || branchMatchesSearch(child) || childCode.includes(normalizedSearchQuery);
                    })
                    .sort((a, b) => naturalSort(a.regulationCode, b.regulationCode))
                    .map((child) => {
                      const childSelected = selectedItemId === child.id;
                      const childTitle = getBrowserRegulationTitle(child);
                      return (
                        <button
                          key={child.id}
                          type="button"
                          className={cn(
                            'w-full rounded-md border px-3 py-2 text-left transition-colors',
                            childSelected ? 'border-primary/40 bg-primary/5' : 'border-card-border/70 bg-background/70 hover:bg-accent/30',
                          )}
                          onClick={() => setSelectedItemId(child.id)}
                        >
                          <div className="space-y-0.5">
                            <p className="text-[11px] font-black tracking-wide text-primary/85">{child.regulationCode}</p>
                            {childTitle ? (
                              <p className="text-sm font-medium leading-5 text-foreground">{childTitle}</p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }, [branchMatchesSearch, canManageMatrix, groupedItems, normalizedSearchQuery, openNodeIds, personnel, selectedItemId]);

  if ((!canViewMatrix && isPermissionsLoading) || isAccessLoading || isProfileLoading || !userProfile || isLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full space-y-6 pt-4 px-1">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!isAllowed) {
    return <TenantLayoutDisabledState />;
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

  const regulationTabValue = activeRegulationTab;
  const actions = canManageMatrix ? (
    <div className="flex flex-wrap items-center gap-2">
      <div className={cn(isMobile ? 'w-full' : 'w-[170px] max-w-full')}>
        <Input
          value={matrixSearchQuery}
          onChange={(event) => setMatrixSearchQuery(event.target.value)}
          placeholder="Search regulations..."
          className="h-8 w-full border-input bg-background text-sm"
        />
      </div>
      <UploadRegulationsDialog tenantId={tenantId} organizationId={currentOrgId} regulationFamily={activeRegulationTab} availableParentHeaders={availableSubRegulationHeaders} />
      <Button variant="outline" className={cn(HEADER_COMPACT_CONTROL_CLASS, 'text-foreground hover:bg-accent/40')} onClick={() => handleOpenForm(null, 'header')}>
        <Layers className="h-4 w-4" />
        Add Header
      </Button>
      <Button variant="outline" className={cn(HEADER_COMPACT_CONTROL_CLASS, 'text-foreground hover:bg-accent/40')} onClick={() => handleOpenForm(null, 'subheader')}>
        <Layers className="h-4 w-4" />
        Add Subheader
      </Button>
      <Button className={cn(HEADER_COMPACT_CONTROL_CLASS, 'border-[hsl(var(--button-primary-border))] bg-[hsl(var(--button-primary-background))] text-[hsl(var(--button-primary-foreground))] hover:bg-[hsl(var(--button-primary-accent))] hover:text-[hsl(var(--button-primary-accent-foreground))]')} onClick={() => handleOpenForm()}>
        <PlusCircle className="h-4 w-4" />
        Add Item
      </Button>
    </div>
  ) : (
    <div className={cn(isMobile ? 'w-full' : 'w-[170px] max-w-full')}>
      <Input
        value={matrixSearchQuery}
        onChange={(event) => setMatrixSearchQuery(event.target.value)}
        placeholder="Search regulations..."
        className="h-8 w-full border-input bg-background text-sm"
      />
    </div>
  );

  return (
    <div className={cn('max-w-[1100px] mx-auto w-full flex flex-col pt-4 px-1', isMobile ? 'min-h-0 overflow-y-auto' : 'h-full overflow-hidden')}>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-xl border border-card-border bg-card shadow-none">
        <Card className="h-full min-h-0 flex flex-col overflow-hidden border-0 shadow-none">
          <CardControlHeader
            isMobile={isMobile}
            context={shouldShowOrganizationTabs ? (
              <OrganizationTabsRow organizations={organizations || []} activeTab={activeOrgTab} onTabChange={setActiveOrgTab} className="border-0 bg-transparent px-0 py-0" />
            ) : undefined}
            mobileContext={shouldShowOrganizationTabs ? (
              <OrganizationTabsRow organizations={organizations || []} activeTab={activeOrgTab} onTabChange={setActiveOrgTab} className="border-0 bg-transparent px-0 py-0" />
            ) : undefined}
            actions={actions}
            mobileActions={canManageMatrix ? (
              <div className="space-y-2">
                <div className="w-full">
                  <Input
                    value={matrixSearchQuery}
                    onChange={(event) => setMatrixSearchQuery(event.target.value)}
                    placeholder="Search regulations..."
                    className="h-8 w-full border-input bg-background text-sm"
                  />
                </div>
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
                        <WandSparkles className="h-3.5 w-3.5" />
                        Actions
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                    <UploadRegulationsDialog
                      tenantId={tenantId}
                      organizationId={currentOrgId}
                      regulationFamily={activeRegulationTab}
                      availableParentHeaders={availableSubRegulationHeaders}
                      trigger={
                        <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
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
              <div className="w-full">
                <Input
                  value={matrixSearchQuery}
                  onChange={(event) => setMatrixSearchQuery(event.target.value)}
                  placeholder="Search regulations..."
                  className="h-8 w-full border-input bg-background text-sm"
                />
              </div>
            )}
            navigation={
              <ResponsiveTabRow
                value={regulationTabValue}
                onValueChange={(value) => setActiveRegulationTab(value as RegulationFamily)}
                placeholder="Select Regulation Family"
                centerTabs
                className="border-0 bg-transparent px-0 py-0"
                options={REGULATION_TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
              />
            }
          />
          <CardContent className="flex-1 min-h-0 overflow-auto p-6 pt-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.25fr)]">
              <Card className="border border-card-border shadow-none">
                <CardContent className="p-4">
                  <div className="mb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-foreground/50">Regulation Browser</p>
                      <p className="mt-1 text-sm text-foreground/70">Select a Part, Subheader, or Regulation on the left. Choosing a regulation reveals the full regulation text on the right.</p>
                  </div>
                  <div className="space-y-4">
                    {topLevelItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-24 text-center opacity-40">
                        <Layers className="h-16 w-16 mb-4" />
                        <p className="text-sm font-black uppercase tracking-widest text-foreground/90">Coherence Matrix Empty</p>
                        <p className="text-xs font-medium text-foreground/80 max-w-xs mt-2">Add a header, then a subheader, then regulation items to start building the regulation browser.</p>
                      </div>
                    ) : (
                      topLevelItems.map((item) => renderNode(item))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-card-border shadow-none">
                <CardContent className="p-4">
                  {activeRegulationItem ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-card-border bg-card/60 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {activeRegulationItem.documentHeading?.trim() ? (
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-foreground/55">{activeRegulationItem.documentHeading}</p>
                            ) : null}
                            <p className="mt-1 text-[11px] font-black tracking-wide text-primary/85">{activeRegulationItem.regulationCode}</p>
                            <h4 className="mt-1 break-words text-base font-semibold leading-6 text-foreground">{activeRegulationItem.regulationStatement}</h4>
                          </div>
                          {canManageMatrix ? (
                            <div className="flex shrink-0 items-center gap-2">
                              <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300" onClick={() => handleOpenForm(activeRegulationItem, 'item')}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDelete(activeRegulationItem)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        {activeRegulationItem.companyReference?.trim() || activeRegulationItem.nextAuditDate?.trim() || activeRegulationItem.responsibleManagerId?.trim() ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/55">
                            {activeRegulationItem.companyReference?.trim() ? (
                              <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                                {activeRegulationItem.companyReference.trim()}
                              </Badge>
                            ) : null}
                            {activeRegulationItem.responsibleManagerId?.trim() ? (
                              <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                                Responsible {getPersonnelDisplayName(personnel, activeRegulationItem.responsibleManagerId) || activeRegulationItem.responsibleManagerId}
                              </Badge>
                            ) : null}
                            {activeRegulationItem.nextAuditDate?.trim() ? (
                              <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                                Next audit {formatAuditDate(activeRegulationItem.nextAuditDate)}
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-3 rounded-lg border border-card-border bg-background/70 p-4">
                          {renderTechnicalText(activeRegulationItem.technicalStandard) || (
                            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80">
                              {activeRegulationItem.regulationStatement}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[360px] flex-col items-center justify-center text-center opacity-45">
                      <Layers className="mb-4 h-14 w-14" />
                      <p className="text-sm font-black uppercase tracking-widest text-foreground/90">
                        {selectedItemRole === 'header' ? 'Select a Subheader' : selectedItemRole === 'subheader' ? 'Select a Regulation' : 'Select a Regulation'}
                      </p>
                      <p className="mt-2 max-w-sm text-sm text-foreground/75">
                        {selectedItemRole === 'header'
                          ? 'Choose a subheader from the left browser, then select a regulation beneath it to reveal the full regulation text here.'
                          : selectedItemRole === 'subheader'
                            ? 'Choose a regulation from the selected subheader in the left browser to reveal the full regulation text here.'
                            : 'Choose a regulation from the left browser to reveal the full regulation text here.'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        {isFormOpen ? (
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-black uppercase tracking-tight">
                {formMode === 'header' ? 'Add Header' : formMode === 'subheader' ? 'Add Subheader' : 'Compliance Requirement'}
              </DialogTitle>
              <DialogDescription>
                {formMode === 'header'
                  ? 'Create the header first, for example Part 43.'
                  : formMode === 'subheader'
                    ? 'Create the subheader beneath an existing header, for example SUBPART 1.'
                    : 'Add or update the regulation clause beneath the selected subheader, for example 43.01.1 Applicability.'}
              </DialogDescription>
            </DialogHeader>
              <ComplianceItemForm
                personnel={personnel}
                existingItem={editingItem}
                onFormSubmit={() => setIsFormOpen(false)}
                tenantId={tenantId}
                defaultRegulationFamily={activeRegulationTab}
                availableParentHeaders={availableSubRegulationHeaders}
                availablePartHeaders={availablePartHeaders}
                mode={formMode}
              />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
