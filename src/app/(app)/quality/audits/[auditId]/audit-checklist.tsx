'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { QualityAudit, QualityAuditChecklistTemplate, AuditChecklistItem, CorrectiveActionPlan, ExternalOrganization } from '@/types/quality';
import { DocumentUploader } from '../../../users/personnel/[id]/document-uploader';
import { FileUp, Camera, Trash2, ZoomIn, Edit, Save, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import type { FindingLevel } from '@/app/(app)/admin/features/page';
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
import type { Aircraft } from '@/types/aircraft';

type EnrichedAudit = QualityAudit & { template: QualityAuditChecklistTemplate };
type EnrichedCorrectiveActionPlan = CorrectiveActionPlan & {
  auditNumber: string;
  findingDescription: string;
};

type AuditFindingValue = FormValues['findings'][number]['finding'];

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

const defaultFindingLevels: FindingLevel[] = [
    { id: 'obs', name: 'Observation', color: '#3b82f6', foregroundColor: '#ffffff' },
    { id: 'lvl1', name: 'Level 1', color: '#ef4444', foregroundColor: '#ffffff' },
    { id: 'lvl2', name: 'Level 2', color: '#f97316', foregroundColor: '#ffffff' },
    { id: 'lvl3', name: 'Level 3', color: '#facc15', foregroundColor: '#000000' },
];

interface AuditChecklistProps {
  audit: EnrichedAudit;
  tenantId: string;
  findingLevels: FindingLevel[];
  caps: CorrectiveActionPlan[];
  personnel: Personnel[];
  organizations: ExternalOrganization[];
  aircraft?: Aircraft[];
}

const evidenceSchema = z.object({
  url: z.string(),
  description: z.string().min(1, 'Description is required.'),
});

const findingSchema = z.object({
  checklistItemId: z.string(),
  finding: z.enum(['Compliant', 'Non Compliant', 'Not Applicable']),
  comment: z.string().optional(),
  suggestedImprovements: z.string().optional(),
  level: z.string().optional(),
  evidence: z.array(evidenceSchema).optional(),
});

const formSchema = z.object({
  findings: z.array(findingSchema),
});

type FormValues = z.infer<typeof formSchema>;

export function AuditChecklist({ audit, tenantId, findingLevels, caps, personnel, organizations, aircraft = [] }: AuditChecklistProps) {
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
    const effectiveFindingLevels = findingLevels.length > 0 ? findingLevels : defaultFindingLevels;
    const currentPersonnelProfile = userProfile?.email
        ? personnel.find((person) => (person.email || '').trim().toLowerCase() === userProfile.email.trim().toLowerCase()) || null
        : null;
    const activeAuditorId = currentPersonnelProfile?.id || userProfile?.id || '';
    const canAuditorSign = !!activeAuditorId && activeAuditorId === audit.auditorId;
    const auditeePerson = personnel.find((person) => person.id === audit.auditeeId) || null;
    const canAuditeeSign = !!userProfile?.id && !!auditeePerson && userProfile.id === audit.auditeeId;
    const auditorDisplayName =
        getPersonnelDisplayName(personnel, audit.auditorId)
        || (currentPersonnelProfile && currentPersonnelProfile.email?.trim().toLowerCase() === userProfile?.email?.trim().toLowerCase()
            ? `${currentPersonnelProfile.firstName || ''} ${currentPersonnelProfile.lastName || ''}`.trim() || currentPersonnelProfile.email || ''
            : '')
        || (userProfile?.id === audit.auditorId
            ? `${userProfile.firstName} ${userProfile.lastName}`.trim() || userProfile.email
            : '')
        || audit.auditorId;
    const targetOrganization = audit.organizationId
        ? organizations.find((organization) => organization.id === audit.organizationId) || null
        : null;
    const assetLabel = aircraft.find((item) => item.id === audit.assetId)?.tailNumber || '';
    const targetLabel = targetOrganization?.name
        || audit.targetId
        || 'Internal Company';

    const getSectionGate = (sectionItems: AuditChecklistItem[], findings: FormValues['findings']) => {
        if (sectionItems.length < 2) return null;

        const gateItem = sectionItems[0];
        const gateFinding = findings.find((finding) => finding.checklistItemId === gateItem.id)?.finding;

        if (gateFinding !== 'Non Compliant' && gateFinding !== 'Not Applicable') {
            return null;
        }

        return {
            gateItemId: gateItem.id,
            inheritedFinding: gateFinding as Exclude<AuditFindingValue, 'Compliant'>,
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
                    finding: gate.inheritedFinding,
                    level: undefined,
                };
            });
        });

        return cascadedFindings;
    };

    const persistAudit = async (nextAudit: Partial<QualityAudit>, toastMessage?: { title: string; description: string }) => {
        const response = await fetch('/api/quality-audits', {
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
            throw new Error(payload?.error || 'Failed to save audit');
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
                description: 'Only the assigned auditor can sign this audit.',
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
                        signedById: activeAuditorId,
                        signedByName: `${userProfile.firstName} ${userProfile.lastName}`.trim(),
                        signatureUrl: auditorSignatureDataUrl,
                        signedAt: new Date().toISOString(),
                    },
                },
                { title: 'Auditor Signed', description: 'The assigned auditor sign-off has been recorded.' }
            );
            setAuditorSignatureDataUrl('');
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Auditor Sign-off Failed',
                description: error instanceof Error ? error.message : 'Failed to sign this audit.',
            });
        }
    };

    const handleAuditeeSignoff = async () => {
        if (!canAuditeeSign || !userProfile) {
            toast({
                variant: 'destructive',
                title: 'Permission Denied',
                description: 'Only the assigned auditee can sign this audit.',
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
                { title: 'Auditee Signed', description: 'The assigned auditee sign-off has been recorded.' }
            );
            setAuditeeSignatureDataUrl('');
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Auditee Sign-off Failed',
                description: error instanceof Error ? error.message : 'Failed to sign this audit.',
            });
        }
    };

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            findings: allChecklistItems.map(item => {
                const existingFinding = audit.findings.find(f => f.checklistItemId === item.id);
                return existingFinding || { 
                    checklistItemId: item.id, 
                    finding: 'Compliant', 
                    comment: '',
                    suggestedImprovements: '',
                    level: '',
                    evidence: [] 
                };
            })
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
                description: 'A corrective action plan has not been generated for this finding yet. Finalize the audit to create it.',
            });
        }
    };


    const onSubmit = async (values: FormValues) => {
        try {
            const filledFindings = cascadeSectionDependencies(values.findings).map(f => {
                if (f.finding === 'Not Applicable') {
                     return { ...f, level: undefined };
                }
                return f;
            });

            await persistAudit(
                { findings: filledFindings },
                { title: 'Findings Saved', description: 'Your audit progress has been recorded.' }
            );
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to save audit.',
            });
        }
    };

    const handleFinalizeAudit = async () => {
        const values = form.getValues();
        const cascadedFindings = cascadeSectionDependencies(values.findings);
        const applicableItems = cascadedFindings.filter(f => f.finding !== 'Not Applicable');
        const compliantItems = applicableItems.filter(f => f.finding === 'Compliant');
        const nonCompliantFindings = cascadedFindings.filter(f => f.finding === 'Non Compliant');
        
        const complianceScore = applicableItems.length > 0
            ? Math.round((compliantItems.length / applicableItems.length) * 100)
            : 100;

        try {
            await persistAudit({
                findings: cascadedFindings,
                status: 'Finalized' as const,
                complianceScore,
            });

            const newCaps = nonCompliantFindings.map(finding => ({
                id: crypto.randomUUID(),
                auditId: audit.id,
                findingId: finding.checklistItemId,
                rootCauseAnalysis: '',
                status: 'Open',
                actions: [],
            }));
            await Promise.all(newCaps.map((cap) => fetch('/api/corrective-action-plans', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cap }),
            })));

            window.dispatchEvent(new Event('safeviate-quality-updated'));
            toast({
                title: "Audit Finalized",
                description: `Score: ${complianceScore}%. ${nonCompliantFindings.length} CAPs created.`
            });

        } catch (error) {
             toast({
                variant: "destructive",
                title: "Finalization Failed",
                description: error instanceof Error ? error.message : 'Failed to finalize audit.',
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
        const inheritedFinding = sectionGate?.inheritedFinding;

        const findingType = form.watch(`findings.${itemIndex}.finding`);
        const effectiveFindingType = isInheritedFinding && inheritedFinding ? inheritedFinding : findingType;
        const evidence = form.watch(`findings.${itemIndex}.evidence`) || [];
        
        const selectedLevelName = form.watch(`findings.${itemIndex}.level`);
        const effectiveLevelName = isInheritedFinding ? '' : selectedLevelName;
        const selectedLevel = effectiveFindingLevels.find(l => l.name === effectiveLevelName);
        const observationLevel = effectiveFindingLevels.find(l => l.name === 'Observation');
        const otherLevels = effectiveFindingLevels.filter(l => l.name !== 'Observation');
        
        const cap = caps.find(c => c.findingId === item.id);
        const openActionsCount = cap?.actions?.filter(a => a.status === 'Open' || a.status === 'In Progress').length || 0;
        const responsibleLabel = item.responsibleManagerId
            ? getPersonnelDisplayName(personnel, item.responsibleManagerId)
            : '';
        const metadataChips = [
            item.companyReference ? { label: 'Manual ref', value: item.companyReference } : null,
            responsibleLabel ? { label: 'Responsible', value: responsibleLabel } : null,
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
                     <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                        <div className="flex flex-wrap items-center gap-6">
                            <FormField
                                control={form.control}
                                name={`findings.${itemIndex}.finding`}
                                render={({ field }) => (
                                    <FormItem className="space-y-0">
                                        <FormControl>
                                            <RadioGroup
                                            onValueChange={(value) => {
                                                field.onChange(value);
                                                form.setValue(`findings.${itemIndex}.level`, '');
                                            }}
                                            value={effectiveFindingType}
                                            className="flex flex-wrap gap-4"
                                            disabled={isReadOnly || isInheritedFinding}
                                            >
                                                {(['Compliant', 'Non Compliant', 'Not Applicable'] as const).map(value => (
                                                    <FormItem key={value} className="flex items-center space-x-2 space-y-0">
                                                        <FormControl><RadioGroupItem value={value} /></FormControl>
                                                        <FormLabel className="font-bold text-[10px] uppercase tracking-wider cursor-pointer">{value}</FormLabel>
                                                    </FormItem>
                                                ))}
                                            </RadioGroup>
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            {(effectiveFindingType === 'Compliant' || effectiveFindingType === 'Non Compliant') && (
                                <FormField
                                    control={form.control}
                                    name={`findings.${itemIndex}.level`}
                                    render={({ field }) => (
                                        <FormItem className="space-y-0 flex items-center gap-3">
                                            <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest whitespace-nowrap">Classification:</FormLabel>
                                            <Select onValueChange={field.onChange} value={isInheritedFinding ? '' : (field.value || '')} disabled={isReadOnly || isInheritedFinding}>
                                                <FormControl>
                                                    <SelectTrigger
                                                        style={{
                                                            backgroundColor: field.value ? selectedLevel?.color : undefined,
                                                            color: field.value ? selectedLevel?.foregroundColor : undefined,
                                                        }}
                                                        className={cn("h-8 w-[160px] text-[10px] font-black uppercase border-slate-300", !field.value && 'text-muted-foreground')}
                                                    >
                                                        <SelectValue placeholder="Select level..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {effectiveFindingType === 'Compliant' && observationLevel && (
                                                        <SelectItem value={observationLevel.name} className="text-[10px] font-black uppercase">{observationLevel.name}</SelectItem>
                                                    )}
                                                    {effectiveFindingType === 'Non Compliant' && otherLevels.map(level => (
                                                        <SelectItem key={level.id} value={level.name} className="text-[10px] font-black uppercase">
                                                            {level.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>

                        {effectiveFindingType === 'Non Compliant' && !isInheritedFinding && audit.status !== 'Scheduled' && audit.status !== 'In Progress' && (
                            <div className='flex items-center gap-2'>
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
                     </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                         <FormField control={form.control} name={`findings.${itemIndex}.comment`} render={({ field }) => (
                             <FormItem>
                                 <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Notes / Observations</FormLabel>
                                 <FormControl><Textarea placeholder="Details about compliance status..." {...field} disabled={isReadOnly} className="min-h-[80px] text-sm font-medium bg-muted/5 border-slate-200" /></FormControl>
                             </FormItem>
                         )} />
                         <FormField control={form.control} name={`findings.${itemIndex}.suggestedImprovements`} render={({ field }) => (
                             <FormItem>
                                 <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Suggested Improvements</FormLabel>
                                 <FormControl><Textarea placeholder="Recommendations for performance..." {...field} disabled={isReadOnly} className="min-h-[80px] text-sm font-medium bg-muted/5 border-slate-200" /></FormControl>
                             </FormItem>
                         )} />
                    </div>

                    {(effectiveFindingType === 'Compliant' || effectiveFindingType === 'Non Compliant') && (
                        <div className="pt-2 border-t">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Supporting Evidence</FormLabel>
                                    {!isReadOnly && (
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
                                                <img src={ev.url} alt="Evidence" className="h-full w-full rounded object-cover" />
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
                        <div className="p-0">
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
                        </div>

                        <div className="border-t bg-background p-4 no-print">
                            <Card className="border shadow-none">
                                <CardHeader className="border-b bg-muted/10">
                                    <CardTitle className="text-sm font-black uppercase tracking-tight">Assigned Sign-off</CardTitle>
                                </CardHeader>
                                <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
                                    <div className="space-y-3 rounded-xl border bg-muted/5 p-4 md:col-span-2">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Audit Target</p>
                                                <p className="text-sm font-semibold">{targetLabel}</p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Asset</p>
                                                <p className="text-sm font-semibold">{assetLabel || 'Not linked to an asset'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3 rounded-xl border bg-muted/5 p-4">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Assigned Auditor</p>
                                            <p className="text-sm font-semibold">{auditorDisplayName}</p>
                                        </div>
                                        {audit.auditorSignoff ? (
                                            <div className="rounded-lg border bg-background p-3 space-y-2">
                                                <p className="text-sm font-semibold">{audit.auditorSignoff.signedByName}</p>
                                                <img src={audit.auditorSignoff.signatureUrl} alt="Auditor signature" className="max-h-16 rounded border bg-white p-1" />
                                                <p className="text-xs text-muted-foreground">Signed on {format(new Date(audit.auditorSignoff.signedAt), 'PPP p')}</p>
                                            </div>
                                        ) : (
                                            <>
                                                <SignaturePad onSignatureEnd={setAuditorSignatureDataUrl} initialDataUrl={auditorSignatureDataUrl} height={140} isReadOnly={!canAuditorSign} />
                                                {!canAuditorSign && <p className="text-xs text-muted-foreground">Only the assigned auditor can sign here.</p>}
                                                <div className="flex justify-end">
                                                    <Button type="button" onClick={handleAuditorSignoff} disabled={!canAuditorSign || !auditorSignatureDataUrl}>
                                                        Sign as Auditor
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="space-y-3 rounded-xl border bg-muted/5 p-4">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Assigned Auditee</p>
                                            <p className="text-sm font-semibold">{auditeePerson ? `${auditeePerson.firstName} ${auditeePerson.lastName}` : 'Department or external company'}</p>
                                        </div>
                                        {audit.auditeeSignoff ? (
                                            <div className="rounded-lg border bg-background p-3 space-y-2">
                                                <p className="text-sm font-semibold">{audit.auditeeSignoff.signedByName}</p>
                                                <img src={audit.auditeeSignoff.signatureUrl} alt="Auditee signature" className="max-h-16 rounded border bg-white p-1" />
                                                <p className="text-xs text-muted-foreground">Signed on {format(new Date(audit.auditeeSignoff.signedAt), 'PPP p')}</p>
                                            </div>
                                        ) : auditeePerson ? (
                                            <>
                                                <SignaturePad onSignatureEnd={setAuditeeSignatureDataUrl} initialDataUrl={auditeeSignatureDataUrl} height={140} isReadOnly={!canAuditeeSign} />
                                                {!canAuditeeSign && <p className="text-xs text-muted-foreground">Only the assigned auditee can sign here.</p>}
                                                <div className="flex justify-end">
                                                    <Button type="button" onClick={handleAuditeeSignoff} disabled={!canAuditeeSign || !auditeeSignatureDataUrl}>
                                                        Sign as Auditee
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">This audit target is a department or external company, so a person-specific auditee signature is not required on this screen.</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </ScrollArea>
                    
                    {!isReadOnly && (
                        <div className="shrink-0 flex items-center justify-between p-4 border-t bg-muted/5 no-print">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground italic">
                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                <span>Audit in progress. All changes are saved locally.</span>
                            </div>
                            <div className="flex gap-3">
                                <Button type="submit" variant="outline" size="sm" className="h-10 px-8 gap-2 font-black uppercase border-slate-300 shadow-sm">
                                    <Save className="h-4 w-4" /> Save Draft
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="default" size="sm" className="h-10 px-8 font-black uppercase bg-emerald-700 hover:bg-emerald-800 shadow-md">Finalize Audit</Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Finalize Audit Record?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will lock all checklist responses, calculate the final compliance score, and generate corrective action plans for any non-compliant items.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleFinalizeAudit} className="bg-emerald-700 hover:bg-emerald-800">Finalize Audit</AlertDialogAction>
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
