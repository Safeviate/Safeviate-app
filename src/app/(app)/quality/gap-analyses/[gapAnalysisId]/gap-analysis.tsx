'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { QualityAudit, QualityAuditChecklistTemplate, AuditChecklistItem, CorrectiveActionPlan, GapStatus, ComplianceRequirement } from '@/types/quality';
import type { CorrectiveAction } from '@/types/safety-report';
import { DocumentUploader } from '../../../users/personnel/[id]/document-uploader';
import { FileUp, Camera, Trash2, ZoomIn, Edit, Save, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getPersonnelDisplayName } from '@/lib/personnel-label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { ManageCapDialog } from '../../cap-tracker/manage-cap-dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserProfile } from '@/hooks/use-user-profile';
import { SignaturePad } from '@/components/ui/signature-pad';

type EnrichedAudit = QualityAudit & { template: QualityAuditChecklistTemplate };
type EnrichedCorrectiveActionPlan = CorrectiveActionPlan & {
  auditNumber: string;
  findingDescription: string;
};

type GapFindingValue = FormValues['findings'][number]['gapStatus'];

const formatAuditDate = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
};

interface GapAnalysisChecklistProps {
  audit: EnrichedAudit;
  tenantId: string;
  caps: CorrectiveActionPlan[];
  personnel: Personnel[];
}

const evidenceSchema = z.object({
  url: z.string(),
  description: z.string().min(1, 'Description is required.'),
});

const gapFindingSchema = z.object({
  checklistItemId: z.string(),
  gapStatus: z.enum(['Open gap', 'Partial coverage', 'Covered', 'Unassessed', 'Not applicable']),
  companyReference: z.string().optional(),
  regulationReference: z.string().optional(),
  currentState: z.string().optional(),
  desiredState: z.string().optional(),
  gapDescription: z.string().optional(),
  actionPlan: z.string().optional(),
  ownerId: z.string().optional(),
  targetDate: z.string().optional(),
  notes: z.string().optional(),
  evidence: z.array(evidenceSchema).optional(),
});

const formSchema = z.object({
  findings: z.array(gapFindingSchema),
});

type FormValues = z.infer<typeof formSchema>;

export function GapAnalysisChecklist({ audit, tenantId, caps, personnel }: GapAnalysisChecklistProps) {
    const { toast } = useToast();
    const { hasPermission } = usePermissions();
    const { userProfile } = useUserProfile();
    const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
    const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
    const [auditorSignatureDataUrl, setAuditorSignatureDataUrl] = useState('');
    const [auditeeSignatureDataUrl, setAuditeeSignatureDataUrl] = useState('');

    const [isCapDialogOpen, setIsCapDialogOpen] = useState(false);
    const [selectedCap, setSelectedCap] = useState<EnrichedCorrectiveActionPlan | null>(null);
    const isReadOnly = audit.status === 'Finalized' || audit.status === 'Closed' || audit.status === 'Archived';
    const canViewCaps = hasPermission('quality-caps-view') || hasPermission('quality-audits-manage') || hasPermission('admin-view');

    const normalizedSections = useMemo(() => {
        return audit.template.sections.map((section) => {
            const hasItems = Array.isArray(section.items) && section.items.length > 0;

            return {
                ...section,
                items: hasItems
                    ? section.items
                    : [{
                        id: `section-fallback-${section.id}`,
                        text: section.title,
                        type: 'Checkbox' as const,
                      }],
                usesTitleAsItem: !hasItems,
            };
        });
    }, [audit.template.sections]);

    const allChecklistItems = normalizedSections.flatMap(section => section.items);
    const defaultOpenSections = useMemo(
        () => normalizedSections.length > 0 ? [normalizedSections[0].id] : [],
        [normalizedSections]
    );
    const canAuditorSign = !!userProfile?.id && userProfile.id === audit.auditorId;
    const auditeePerson = personnel.find((person) => person.id === audit.auditeeId) || null;
    const canAuditeeSign = !!userProfile?.id && !!auditeePerson && userProfile.id === audit.auditeeId;
    const mapLegacyFindingToGapStatus = (finding?: string | null): GapStatus => {
        switch (finding) {
            case 'Compliant':
                return 'Covered';
            case 'Non Compliant':
                return 'Open gap';
            case 'Not Applicable':
                return 'Not applicable';
            default:
                return 'Unassessed';
        }
    };

    const getSectionGate = (sectionItems: AuditChecklistItem[], findings: FormValues['findings']) => {
        if (sectionItems.length < 2) return null;

        const gateItem = sectionItems[0];
        const gateStatus = findings.find((finding) => finding.checklistItemId === gateItem.id)?.gapStatus;

        if (gateStatus === 'Not applicable') {
            return {
                gateItemId: gateItem.id,
                inheritedGapStatus: gateStatus,
            };
        }

        if (gateStatus !== 'Open gap' && gateStatus !== 'Partial coverage') {
            return null;
        }

        return {
            gateItemId: gateItem.id,
            inheritedGapStatus: 'Open gap' as Exclude<GapFindingValue, 'Covered' | 'Unassessed' | 'Not applicable'>,
        };
    };

    const cascadeSectionDependencies = (findings: FormValues['findings']) => {
        const cascadedFindings = findings.map((finding) => ({ ...finding }));

        normalizedSections.forEach((section) => {
            const gate = getSectionGate(section.items, cascadedFindings);
            if (!gate) return;

            section.items.slice(1).forEach((item) => {
                const itemIndex = cascadedFindings.findIndex((finding) => finding.checklistItemId === item.id);
                if (itemIndex === -1) return;

                cascadedFindings[itemIndex] = {
                    ...cascadedFindings[itemIndex],
                    gapStatus: gate.inheritedGapStatus,
                };
            });
        });

        return cascadedFindings;
    };

    const syncCompanyReferencesToMatrix = async (findings: FormValues['findings']) => {
        const response = await fetch('/api/compliance-matrix', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Failed to load coherence matrix for reference sync.');
        }

        const payload = await response.json().catch(() => ({ items: [] }));
        const matrixItems = Array.isArray(payload.items) ? (payload.items as ComplianceRequirement[]) : [];
        const byRegulationCode = new Map<string, ComplianceRequirement>(
            matrixItems
                .map((item) => [String(item?.regulationCode || '').trim(), item] as const)
                .filter(([code]) => !!code)
        );

        const updates = findings
            .map((finding) => {
                const regulationCode = finding.regulationReference?.trim() || '';
                const companyReference = finding.companyReference?.trim() || '';
                if (!regulationCode || !companyReference) return null;

                const matrixItem = byRegulationCode.get(regulationCode);
                if (!matrixItem) return null;

                if ((matrixItem.companyReference || '').trim() === companyReference) {
                    return null;
                }

                return {
                    ...matrixItem,
                    companyReference,
                };
            })
            .filter((item): item is ComplianceRequirement => !!item);

        if (updates.length === 0) return;

        await Promise.all(
            updates.map((item) =>
                fetch('/api/compliance-matrix', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ item }),
                })
            )
        );
    };

    const persistAudit = async (nextAudit: Partial<QualityAudit>, toastMessage?: { title: string; description: string }) => {
        const response = await fetch('/api/quality-gap-analyses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audit: {
              ...audit,
              ...nextAudit,
            },
          }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(payload?.error || 'Failed to save gap analysis');
        }

        window.dispatchEvent(new Event('safeviate-quality-updated'));

        if (toastMessage) {
            toast(toastMessage);
        }
    };

    const handleAuditorSignoff = async () => {
        if (!canAuditorSign || !userProfile) {
            toast({
                variant: 'destructive',
                title: 'Permission Denied',
                description: 'Only the assigned analyst can sign this gap analysis.',
            });
            return;
        }

        if (!auditorSignatureDataUrl) {
            toast({
                variant: 'destructive',
                title: 'Signature Required',
                description: 'Please provide the auditor signature first.',
            });
            return;
        }

        try {
            await persistAudit(
                {
                    auditorSignoff: {
                        signedById: userProfile.id,
                        signedByName: `${userProfile.firstName} ${userProfile.lastName}`.trim(),
                        signatureUrl: auditorSignatureDataUrl,
                        signedAt: new Date().toISOString(),
                    },
                },
                { title: 'Analyst Signed', description: 'The assigned analyst sign-off has been recorded.' }
            );
            setAuditorSignatureDataUrl('');
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Auditor Sign-off Failed',
                description: error instanceof Error ? error.message : 'Failed to sign this gap analysis.',
            });
        }
    };

    const handleAuditeeSignoff = async () => {
        if (!canAuditeeSign || !userProfile) {
            toast({
                variant: 'destructive',
                title: 'Permission Denied',
                description: 'Only the assigned review owner can sign this gap analysis.',
            });
            return;
        }

        if (!auditeeSignatureDataUrl) {
            toast({
                variant: 'destructive',
                title: 'Signature Required',
                description: 'Please provide the auditee signature first.',
            });
            return;
        }

        try {
            await persistAudit(
                {
                    auditeeSignoff: {
                        signedById: userProfile.id,
                        signedByName: `${userProfile.firstName} ${userProfile.lastName}`.trim(),
                        signatureUrl: auditeeSignatureDataUrl,
                        signedAt: new Date().toISOString(),
                    },
                },
                { title: 'Review Owner Signed', description: 'The assigned review owner sign-off has been recorded.' }
            );
            setAuditeeSignatureDataUrl('');
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Auditee Sign-off Failed',
                description: error instanceof Error ? error.message : 'Failed to sign this gap analysis.',
            });
        }
    };

    const normalizedFindings: FormValues['findings'] = allChecklistItems.map((item) => {
        const existingFinding = audit.findings.find((f) => f.checklistItemId === item.id);
        const legacyFinding = existingFinding as {
            finding?: string;
            comment?: string;
            suggestedImprovements?: string;
        } | undefined;

        return {
            checklistItemId: item.id,
            gapStatus: (existingFinding?.gapStatus as GapStatus | undefined) || mapLegacyFindingToGapStatus(legacyFinding?.finding),
            companyReference: existingFinding?.companyReference ?? item.companyReference ?? '',
            regulationReference: existingFinding?.regulationReference ?? item.regulationReference ?? '',
            currentState: existingFinding?.currentState ?? legacyFinding?.comment ?? '',
            desiredState: existingFinding?.desiredState ?? legacyFinding?.suggestedImprovements ?? '',
            gapDescription: existingFinding?.gapDescription ?? '',
            actionPlan: existingFinding?.actionPlan ?? '',
            ownerId: existingFinding?.ownerId ?? '',
            targetDate: existingFinding?.targetDate ?? '',
            notes: existingFinding?.notes ?? '',
            evidence: existingFinding?.evidence ?? [],
        };
    });

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            findings: normalizedFindings,
        },
    });

    const handleOpenCapDialog = (findingId: string, findingDescription: string) => {
        const capForFinding = caps.find(c => c.findingId === findingId);
        if (capForFinding) {
            if (!canViewCaps) {
                toast({
                    variant: 'destructive',
                    title: 'Permission Denied',
                    description: 'You do not have permission to manage corrective action plans.',
                });
                return;
            }
            setSelectedCap({
                ...capForFinding,
                auditNumber: audit.auditNumber,
                findingDescription: findingDescription
            });
            setIsCapDialogOpen(true);
        } else {
            toast({
                variant: 'destructive',
                title: 'CAP Not Found',
                description: 'A corrective action plan has not been generated for this finding yet. Finalize the gap analysis to create it.',
            });
        }
    };


    const onSubmit = async (values: FormValues) => {
        try {
            const cascadedFindings = cascadeSectionDependencies(values.findings);
            await persistAudit(
                { findings: cascadedFindings },
                { title: 'Findings Saved', description: 'Your gap analysis progress has been recorded.' }
            );
            try {
                await syncCompanyReferencesToMatrix(cascadedFindings);
            } catch (syncError) {
                console.warn('Failed to sync gap company references to matrix', syncError);
                toast({
                    title: 'Saved with Matrix Sync Warning',
                    description: 'The gap analysis was saved, but the coherence matrix references could not be updated.',
                });
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to save gap analysis.',
            });
        }
    };

    const handleFinalizeAudit = async () => {
        const values = form.getValues();
        const cascadedFindings = cascadeSectionDependencies(values.findings);
        const resolvedItems = cascadedFindings.filter(f => f.gapStatus === 'Covered' || f.gapStatus === 'Not applicable');
        const actionableItems = cascadedFindings.filter(f => f.gapStatus === 'Open gap' || f.gapStatus === 'Partial coverage');
        
        const coverageScore = values.findings.length > 0
            ? Math.round((resolvedItems.length / values.findings.length) * 100)
            : 100;

        try {
            await persistAudit({
                findings: cascadedFindings,
                status: 'Finalized' as const,
                complianceScore: coverageScore,
            });
            try {
                await syncCompanyReferencesToMatrix(cascadedFindings);
            } catch (syncError) {
                console.warn('Failed to sync gap company references to matrix', syncError);
                toast({
                    title: 'Finalized with Matrix Sync Warning',
                    description: 'The gap analysis was finalized, but some coherence matrix references could not be updated.',
                });
            }

            const newCaps = actionableItems.map((finding) => {
                const actionDescription = finding.actionPlan?.trim()
                  || finding.gapDescription?.trim()
                  || finding.currentState?.trim()
                  || finding.desiredState?.trim()
                  || 'Gap analysis action';
                const dueDate = finding.targetDate?.trim() || audit.auditDate;
                const responsiblePersonId = finding.ownerId?.trim() || audit.auditorId;
                const actions: CorrectiveAction[] = [
                  {
                    id: crypto.randomUUID(),
                    description: actionDescription,
                    responsiblePersonId,
                    deadline: dueDate,
                    status: 'Open',
                  },
                ];

                return {
                  id: crypto.randomUUID(),
                  auditId: audit.id,
                  findingId: finding.checklistItemId,
                  rootCauseAnalysis: finding.gapDescription?.trim() || finding.currentState?.trim() || '',
                  status: 'Open',
                  actions,
                  responsiblePersonId,
                };
            });
            await Promise.all(newCaps.map((cap) => fetch('/api/corrective-action-plans', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cap }),
            })));

            window.dispatchEvent(new Event('safeviate-quality-updated'));
            toast({
                title: "Gap Analysis Finalized",
                description: `Resolution: ${coverageScore}%. ${actionableItems.length} CAPs created.`
            });

        } catch (error) {
             toast({
                variant: "destructive",
                title: "Finalization Failed",
                description: error instanceof Error ? error.message : 'Failed to finalize gap analysis.',
            });
        }
    };

    const handleViewImage = (url: string) => {
        setViewingImageUrl(url);
        setIsImageViewerOpen(true);
    };

    const handleEvidenceUploaded = (checklistItemId: string, docDetails: { name: string; url: string; uploadDate: string; expirationDate: string | null }) => {
        const itemIndex = form.getValues('findings').findIndex(f => f.checklistItemId === checklistItemId);
        if (itemIndex === -1) return;

        const currentEvidence = form.getValues(`findings.${itemIndex}.evidence`) || [];
        const nextEvidence = [...currentEvidence, { url: docDetails.url, description: docDetails.name }];
        const nextFindings = form.getValues('findings').map((finding, index) => (
            index === itemIndex
                ? { ...finding, evidence: nextEvidence }
                : finding
        ));

        form.setValue(`findings.${itemIndex}.evidence`, nextEvidence);
        void persistAudit({ findings: nextFindings }).catch((error) => {
            toast({
                variant: 'destructive',
                title: 'Evidence Save Failed',
                description: error instanceof Error ? error.message : 'Failed to save evidence.',
            });
        });
    };

    const renderChecklistItem = (item: AuditChecklistItem, options?: { hideTitle?: boolean; sectionItems?: AuditChecklistItem[] }) => {
        const itemIndex = form.getValues('findings').findIndex(f => f.checklistItemId === item.id);
        if (itemIndex === -1) return null;
        const hideTitle = options?.hideTitle ?? false;
        const showHeader = !hideTitle || !!item.regulationReference;
        const sectionGate = options?.sectionItems ? getSectionGate(options.sectionItems, form.getValues('findings')) : null;
        const isInheritedFinding = !!sectionGate && item.id !== sectionGate.gateItemId;
        const inheritedGapStatus = sectionGate?.inheritedGapStatus;

        const gapStatus = form.watch(`findings.${itemIndex}.gapStatus`);
        const effectiveGapStatus = isInheritedFinding && inheritedGapStatus ? inheritedGapStatus : gapStatus;
        const evidence = form.watch(`findings.${itemIndex}.evidence`) || [];
        const cap = caps.find(c => c.findingId === item.id);
        const openActionsCount = cap?.actions?.filter(a => a.status === 'Open' || a.status === 'In Progress').length || 0;
        const metadataChips = [
            item.nextAuditDate ? { label: 'Next audit date', value: formatAuditDate(item.nextAuditDate) } : null,
        ].filter((chip): chip is { label: string; value: string } => !!chip && !!chip.value);

        return (
            <Card
                key={item.id}
                className={cn(
                    "mb-4 shadow-sm border-muted transition-colors hover:border-primary/20",
                    isInheritedFinding && "border-dashed bg-muted/20 opacity-80 hover:border-muted"
                )}
            >
                {showHeader && (
                    <CardHeader className="py-3 px-4 flex flex-row items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                            {!hideTitle ? <CardTitle className="text-sm font-bold uppercase tracking-tight">{item.text}</CardTitle> : <div />}
                            {isInheritedFinding && (
                                <Badge variant="outline" className="w-fit border-amber-300 bg-amber-50 text-[9px] font-black uppercase text-amber-700">
                                    Inherited from prerequisite
                                </Badge>
                            )}
                        </div>
                        {item.regulationReference && <Badge variant="outline" className="text-[9px] h-5 py-0 shrink-0 font-mono border-primary/20 bg-primary/5 text-primary">{item.regulationReference}</Badge>}
                    </CardHeader>
                )}
                <CardContent className={cn("space-y-4 px-4 pb-4", !showHeader && "pt-4")}>
                    {metadataChips.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {metadataChips.map((chip) => (
                                <Badge
                                    key={`${item.id}-${chip.label}`}
                                    variant="outline"
                                    className="h-6 max-w-full border-slate-300 bg-muted/20 px-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700"
                                >
                                    <span className="mr-1.5 text-slate-500">{chip.label}</span>
                                    <span className="truncate normal-case tracking-normal text-slate-900">{chip.value}</span>
                                </Badge>
                            ))}
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField
                            control={form.control}
                            name={`findings.${itemIndex}.companyReference`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Reference for Matrix</FormLabel>
                                    <FormControl><Input placeholder="Reference or reason to sync back to the matrix..." {...field} disabled={isReadOnly} className="h-9 text-sm font-medium bg-muted/5 border-slate-200" /></FormControl>
                                    <p className="text-[10px] text-muted-foreground">This value updates the coherence matrix reference for the matching regulation.</p>
                                </FormItem>
                            )}
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-4 pt-4 border-t md:grid-cols-2">
                        <FormField
                            control={form.control}
                            name={`findings.${itemIndex}.gapStatus`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Gap Status</FormLabel>
                                    <Select onValueChange={field.onChange} value={effectiveGapStatus} disabled={isReadOnly || isInheritedFinding}>
                                        <FormControl>
                                            <SelectTrigger className="h-9 text-[10px] font-black uppercase border-slate-300">
                                                <SelectValue placeholder="Select status..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {(['Open gap', 'Partial coverage', 'Covered', 'Unassessed', 'Not applicable'] as GapStatus[]).map((value) => (
                                                <SelectItem key={value} value={value} className="text-[10px] font-black uppercase">
                                                    {value}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name={`findings.${itemIndex}.ownerId`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Owner</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly || isInheritedFinding}>
                                        <FormControl>
                                            <SelectTrigger className="h-9 text-[10px] font-black uppercase border-slate-300">
                                                <SelectValue placeholder="Assign owner..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {personnel.map((person) => (
                                                <SelectItem key={person.id} value={person.id} className="text-[10px] font-black uppercase">
                                                    {getPersonnelDisplayName(personnel, person.id)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField
                            control={form.control}
                            name={`findings.${itemIndex}.currentState`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Current State</FormLabel>
                                    <FormControl><Textarea placeholder="What exists now?" {...field} disabled={isReadOnly || isInheritedFinding} className="min-h-[88px] text-sm font-medium bg-muted/5 border-slate-200" /></FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name={`findings.${itemIndex}.desiredState`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Desired State</FormLabel>
                                    <FormControl><Textarea placeholder="What should exist?" {...field} disabled={isReadOnly || isInheritedFinding} className="min-h-[88px] text-sm font-medium bg-muted/5 border-slate-200" /></FormControl>
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField
                            control={form.control}
                            name={`findings.${itemIndex}.gapDescription`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Gap Description</FormLabel>
                                    <FormControl><Textarea placeholder="Describe the gap or shortfall..." {...field} disabled={isReadOnly || isInheritedFinding} className="min-h-[88px] text-sm font-medium bg-muted/5 border-slate-200" /></FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name={`findings.${itemIndex}.actionPlan`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Action Plan</FormLabel>
                                    <FormControl><Textarea placeholder="What will close the gap?" {...field} disabled={isReadOnly || isInheritedFinding} className="min-h-[88px] text-sm font-medium bg-muted/5 border-slate-200" /></FormControl>
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField
                            control={form.control}
                            name={`findings.${itemIndex}.targetDate`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Target Date</FormLabel>
                                    <FormControl><Input type="date" {...field} disabled={isReadOnly || isInheritedFinding} className="h-9 text-sm font-medium bg-muted/5 border-slate-200" /></FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name={`findings.${itemIndex}.notes`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Notes / References</FormLabel>
                                    <FormControl><Textarea placeholder="Add context, references, or rationale..." {...field} disabled={isReadOnly || isInheritedFinding} className="min-h-[88px] text-sm font-medium bg-muted/5 border-slate-200" /></FormControl>
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="pt-2 border-t">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Supporting Evidence / References</FormLabel>
                                {!isReadOnly && !isInheritedFinding && (
                                    <div className="flex gap-2">
                                        <DocumentUploader
                                            restrictedMode="file"
                                            onDocumentUploaded={(docDetails) => handleEvidenceUploaded(item.id, docDetails)}
                                            trigger={(openDialog) => (
                                                <Button type="button" variant="outline" size="sm" className="h-7 px-3 text-[10px] font-black uppercase border-slate-300" onClick={() => openDialog('file')}>
                                                    <FileUp className="mr-1.5 h-3.5 w-3.5" /> File
                                                </Button>
                                            )}
                                        />
                                        <DocumentUploader
                                            restrictedMode="camera"
                                            onDocumentUploaded={(docDetails) => handleEvidenceUploaded(item.id, docDetails)}
                                            trigger={(openDialog) => (
                                                <Button type="button" variant="outline" size="sm" className="h-7 px-3 text-[10px] font-black uppercase border-slate-300" onClick={() => openDialog('camera')}>
                                                    <Camera className="mr-1.5 h-3.5 w-3.5" /> Photo
                                                </Button>
                                            )}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                                {evidence.map((ev, evidenceIndex) => (
                                    <div key={evidenceIndex} className="flex items-center gap-3 p-2 border rounded-lg bg-muted/20 group">
                                        <div className="relative h-10 w-10 flex-shrink-0">
                                            <Image src={ev.url} alt="Evidence" fill className="rounded object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer rounded" onClick={() => handleViewImage(ev.url)}>
                                                <ZoomIn className="h-4 w-4 text-white" />
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-[100px] text-[10px] font-bold uppercase tracking-tight truncate">
                                            {ev.description}
                                        </div>
                                        {!isReadOnly && (
                                            <Button 
                                                type="button" 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100" 
                                                onClick={() => {
                                                    const newEvidence = [...evidence];
                                                    newEvidence.splice(evidenceIndex, 1);
                                                    form.setValue(`findings.${itemIndex}.evidence`, newEvidence);
                                                }}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                {evidence.length === 0 && <p className="text-[10px] font-medium text-muted-foreground italic py-2">No evidence attached.</p>}
                            </div>
                        </div>
                    </div>
                    {effectiveGapStatus !== 'Covered' && effectiveGapStatus !== 'Not applicable' && !isInheritedFinding && audit.status !== 'Scheduled' && audit.status !== 'In Progress' && (
                        <div className='flex items-center justify-end gap-2 pt-2 border-t'>
                            {cap ? (
                                <Badge variant={openActionsCount > 0 ? 'destructive' : 'default'} className="text-[9px] h-5 font-black uppercase">
                                    {openActionsCount} Open Actions
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-[9px] h-5 font-black uppercase border-amber-300 bg-amber-50 text-amber-700">CAP Pending</Badge>
                            )}
                            {canViewCaps ? (
                                <Button variant="outline" size="sm" onClick={() => handleOpenCapDialog(item.id, item.text)} className="h-7 text-[10px] font-black uppercase px-3 gap-1.5 border-slate-300">
                                    <Edit className="h-3 w-3" />
                                    Manage CAP
                                </Button>
                            ) : (
                                <Badge variant="outline" className="text-[9px] h-5 font-black uppercase border-slate-300 bg-slate-50 text-slate-600">CAP Access Required</Badge>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
                    <ScrollArea className="flex-1 no-scrollbar">
                        <div className="p-0 pb-6">
                            <Accordion type="multiple" defaultValue={defaultOpenSections} className="w-full">
                                {normalizedSections.map((section) => (
                                    <AccordionItem key={section.id} value={section.id} className="border-b border-slate-200 last:border-b-0">
                                        <AccordionTrigger className="px-6 py-5 text-left text-sm font-black uppercase tracking-widest text-primary hover:no-underline">
                                            <div className="flex flex-1 items-center justify-between gap-4 pr-3">
                                                <span>{section.title}</span>
                                                <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/5 text-[9px] font-black uppercase text-primary">
                                                    {section.items.length} item{section.items.length === 1 ? '' : 's'}
                                                </Badge>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="px-6 pb-6">
                                            <div className="space-y-4 pt-2">
                                                {section.items.map((item) => renderChecklistItem(item, { hideTitle: section.usesTitleAsItem && item.text === section.title, sectionItems: section.items }))}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>

                            <div className="mt-4 border-t bg-background p-4">
                                <Card className="border shadow-none">
                                    <CardHeader className="border-b bg-muted/10">
                                        <CardTitle className="text-sm font-black uppercase tracking-tight">Assigned Sign-off</CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
                                        <div className="space-y-3 rounded-xl border bg-muted/5 p-4">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Assigned Analyst</p>
                                                    <p className="text-sm font-semibold">{getPersonnelDisplayName(personnel, audit.auditorId) || audit.auditorId}</p>
                                            </div>
                                            {audit.auditorSignoff ? (
                                                <div className="rounded-lg border bg-background p-3 space-y-2">
                                                    <p className="text-sm font-semibold">{audit.auditorSignoff.signedByName}</p>
                                                    <img src={audit.auditorSignoff.signatureUrl} alt="Analyst signature" className="max-h-16 rounded border bg-white p-1" />
                                                    <p className="text-xs text-muted-foreground">Signed on {format(new Date(audit.auditorSignoff.signedAt), 'PPP p')}</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <SignaturePad onSignatureEnd={setAuditorSignatureDataUrl} initialDataUrl={auditorSignatureDataUrl} height={140} isReadOnly={!canAuditorSign} />
                                                    {!canAuditorSign && <p className="text-xs text-muted-foreground">Only the assigned analyst can sign here.</p>}
                                                    <div className="flex justify-end">
                                                        <Button type="button" onClick={handleAuditorSignoff} disabled={!canAuditorSign || !auditorSignatureDataUrl}>
                                                            Sign as Analyst
                                                        </Button>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="space-y-3 rounded-xl border bg-muted/5 p-4">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Assigned Review Owner</p>
                                                <p className="text-sm font-semibold">{auditeePerson ? `${auditeePerson.firstName} ${auditeePerson.lastName}` : 'Department or external organization'}</p>
                                            </div>
                                            {audit.auditeeSignoff ? (
                                                <div className="rounded-lg border bg-background p-3 space-y-2">
                                                    <p className="text-sm font-semibold">{audit.auditeeSignoff.signedByName}</p>
                                                    <img src={audit.auditeeSignoff.signatureUrl} alt="Review owner signature" className="max-h-16 rounded border bg-white p-1" />
                                                    <p className="text-xs text-muted-foreground">Signed on {format(new Date(audit.auditeeSignoff.signedAt), 'PPP p')}</p>
                                                </div>
                                            ) : auditeePerson ? (
                                                <>
                                                    <SignaturePad onSignatureEnd={setAuditeeSignatureDataUrl} initialDataUrl={auditeeSignatureDataUrl} height={140} isReadOnly={!canAuditeeSign} />
                                                    {!canAuditeeSign && <p className="text-xs text-muted-foreground">Only the assigned review owner can sign here.</p>}
                                                    <div className="flex justify-end">
                                                        <Button type="button" onClick={handleAuditeeSignoff} disabled={!canAuditeeSign || !auditeeSignatureDataUrl}>
                                                            Sign as Review Owner
                                                        </Button>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">This gap analysis target is a department or external organization, so a person-specific review owner signature is not required on this screen.</p>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </ScrollArea>
                    
                    {!isReadOnly && (
                        <div className="shrink-0 flex items-center justify-between p-4 border-t bg-muted/5 no-print">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground italic">
                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                <span>Gap analysis in progress. All changes are saved locally.</span>
                            </div>
                            <div className="flex gap-3">
                                <Button type="submit" variant="outline" size="sm" className="h-10 px-8 gap-2 font-black uppercase border-slate-300 shadow-sm">
                                    <Save className="h-4 w-4" /> Save Draft
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="default" size="sm" className="h-10 px-8 font-black uppercase bg-emerald-700 hover:bg-emerald-800 shadow-md">Finalize Gap Analysis</Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Finalize Gap Analysis Record?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will lock all gap analysis responses, calculate the final compliance score, and generate corrective action plans for any non-compliant items.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleFinalizeAudit} className="bg-emerald-700 hover:bg-emerald-800">Finalize Gap Analysis</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    )}

                    
                </form>
            </Form>

            <Dialog open={isImageViewerOpen} onOpenChange={setIsImageViewerOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                    <DialogHeader className="shrink-0 border-b pb-4">
                        <DialogTitle className="font-black uppercase tracking-tight">Evidence Detail</DialogTitle>
                    </DialogHeader>
                    {viewingImageUrl && (
                        <div className="flex-1 relative min-h-[60vh] mt-4">
                            <Image src={viewingImageUrl} alt="Evidence" fill className="object-contain" unoptimized/>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {selectedCap && (
                <ManageCapDialog
                    isOpen={isCapDialogOpen}
                    onClose={() => setIsCapDialogOpen(false)}
                    cap={selectedCap}
                    tenantId={tenantId}
                    personnel={personnel}
                />
            )}
        </div>
    );
}
