'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusCircle, Clock, MapPin, User, ArrowRight, Loader2, WandSparkles } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { useOrganizationScope } from '@/hooks/use-organization-scope';
import { useToast } from '@/hooks/use-toast';
import { callAiFlow } from '@/lib/ai-client';
import type { SafetyReport } from '@/types/safety-report';
import type { ExternalOrganization } from '@/types/quality';
import type { QuickSafetyReport } from '@/types/quick-reports';
import { EditReportDialog } from './edit-report-dialog';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import type { GenerateSafetyProtocolRecommendationsOutput } from '@/ai/flows/generate-safety-protocol-recommendations';
import { CARD_HEADER_BAND_CLASS, HEADER_COMPACT_CONTROL_CLASS, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-mobile';
import { OrganizationTabsRow } from '@/components/responsive-tab-row';
import { DeleteActionButton, ViewActionButton } from '@/components/record-action-buttons';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';

const parseLocalDate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return new Date(value);
    return new Date(year, month - 1, day, 12);
};

const getStatusBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
        case 'Closed': return 'default';
        case 'Open': return 'destructive';
        case 'Under Review': return 'secondary';
        default: return 'outline';
    }
};

function DeleteReportButton({ reportId, reportNumber }: { reportId: string, reportNumber: string }) {
    const { toast } = useToast();
    const { hasPermission } = usePermissions();

    const canDelete = hasPermission('safety-reports-manage');

    if (!canDelete) return null;

    const handleDelete = async () => {
        const response = await fetch('/api/safety-reports', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportId }),
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || 'Unable to delete this report right now.');
        }
        toast({ title: 'Report Deleted', description: `Safety Report #${reportNumber} is being deleted.` });
    };

    return (
        <DeleteActionButton
            description={`This will permanently delete safety report #${reportNumber}. This action cannot be undone.`}
            onDelete={handleDelete}
            srLabel="Delete report"
        />
    );
}

interface ReportsTableProps {
    reports: SafetyReport[];
    tenantId: string;
    canManage: boolean;
}

interface QuickSafetyInboxProps {
    reports: QuickSafetyReport[];
    canManage: boolean;
    classifyingReportId: string | null;
    onClassify: (report: QuickSafetyReport) => Promise<void>;
}

function ReportsTable({ reports, tenantId, canManage }: ReportsTableProps) {
    return (
        <ResponsiveCardGrid
            items={reports}
            isLoading={false}
            className="p-4"
            gridClassName="sm:grid-cols-2 xl:grid-cols-3"
            renderItem={(report) => (
                <Card key={report.id} className="shadow-none border-slate-200 overflow-hidden">
                    <CardHeader className="p-4 pb-2 border-b bg-muted/5 flex flex-row items-center justify-between space-y-0">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">{report.reportNumber}</span>
                            <span className="text-sm font-black mt-1">{report.reportType}</span>
                        </div>
                        <Badge variant={getStatusBadgeVariant(report.status)} className="h-5 text-[9px] font-black uppercase">
                            {report.status}
                        </Badge>
                    </CardHeader>
                    <CardContent className="p-4 py-3 space-y-3">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                                <Clock className="h-3.5 w-3.5" />
                                {format(parseLocalDate(report.eventDate), 'dd MMM yyyy')}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                                <MapPin className="h-3.5 w-3.5" />
                                {report.location}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            Filed by: {report.submittedByName}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 italic font-medium">&quot;{report.description}&quot;</p>
                    </CardContent>
                    <div className="p-2 border-t bg-muted/5 flex gap-2">
                        <Button asChild variant="ghost" size="sm" className="flex-1 justify-between text-xs font-black uppercase h-8 px-4">
                            <Link href={`/safety/safety-reports/${report.id}`}>
                                View Detailed Investigation
                                <ArrowRight className="h-3.5 w-3.5 ml-2" />
                            </Link>
                        </Button>
                        {canManage && (
                            <div className="flex gap-1">
                                <EditReportDialog report={report} tenantId={tenantId} />
                                <DeleteReportButton reportId={report.id} reportNumber={report.reportNumber} />
                            </div>
                        )}
                    </div>
                </Card>
            )}
            emptyState={<div className="text-center p-12 text-muted-foreground text-sm italic">No safety reports found for this context.</div>}
        />
    );
}

function QuickSafetyInbox({ reports, canManage, classifyingReportId, onClassify }: QuickSafetyInboxProps) {
    return (
        <div className="border-b bg-muted/5 p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Quick Safety Intake</p>
                    <p className="text-xs font-medium text-muted-foreground">
                        Preliminary safety reports can be classified here into the formal safety register.
                    </p>
                </div>
                <Badge variant="outline" className="h-6 px-2 text-[10px] font-black uppercase tracking-widest">
                    {reports.length} awaiting review
                </Badge>
            </div>

            {reports.length > 0 ? (
                <ResponsiveCardGrid
                    items={reports}
                    isLoading={false}
                    gridClassName="sm:grid-cols-2 xl:grid-cols-3"
                    renderItem={(report) => (
                        <Card key={report.id} className="overflow-hidden border-slate-200 shadow-none">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b bg-background px-4 py-3">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{report.reportNumber}</span>
                                    <span className="mt-1 text-sm font-black">{report.reportType}</span>
                                </div>
                                <Badge variant={report.workflowStatus === 'Classified' ? 'default' : 'outline'} className="text-[9px] font-black uppercase">
                                    {report.workflowStatus}
                                </Badge>
                            </CardHeader>
                            <CardContent className="space-y-3 p-4">
                                <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
                                    <span className="flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5" />
                                        {format(parseLocalDate(report.eventDate), 'dd MMM yyyy')}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <MapPin className="h-3.5 w-3.5" />
                                        {report.location}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs font-bold">
                                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                                    Filed by: {report.submittedByName}
                                </div>
                                {report.aircraftLabel ? (
                                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                        Aircraft {report.aircraftLabel}
                                    </div>
                                ) : null}
                                {report.recommendedClassification ? (
                                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                        Recommended {report.recommendedClassification}
                                    </div>
                                ) : null}
                                <p className="text-sm font-medium text-foreground">{report.summary}</p>
                                {report.immediateAction ? (
                                    <div className="rounded-lg border bg-muted/5 px-3 py-2">
                                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Immediate Action</p>
                                        <p className="mt-1 text-xs font-medium text-foreground">{report.immediateAction}</p>
                                    </div>
                                ) : null}
                            </CardContent>
                            <div className="flex flex-wrap gap-2 border-t bg-muted/5 p-2">
                                {report.linkedSafetyReportId ? (
                                    <Button asChild variant="outline" size="sm" className="h-8 flex-1 justify-between px-3 text-[10px] font-black uppercase">
                                        <Link href={`/safety/safety-reports/${report.linkedSafetyReportId}`}>
                                            View {report.linkedSafetyReportNumber || 'Safety Report'}
                                            <ArrowRight className="ml-2 h-3.5 w-3.5" />
                                        </Link>
                                    </Button>
                                ) : canManage ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-8 flex-1 justify-between px-3 text-[10px] font-black uppercase"
                                        disabled={classifyingReportId === report.id}
                                        onClick={() => void onClassify(report)}
                                    >
                                        {classifyingReportId === report.id ? 'Classifying...' : 'Classify into Safety'}
                                        <ArrowRight className="ml-2 h-3.5 w-3.5" />
                                    </Button>
                                ) : (
                                    <div className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                        Awaiting management classification
                                    </div>
                                )}
                            </div>
                        </Card>
                    )}
                    emptyState={null}
                />
            ) : (
                <div className="rounded-xl border border-dashed bg-background px-4 py-8 text-center">
                    <p className="text-sm font-bold uppercase tracking-wider text-foreground">No quick safety reports waiting</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] italic text-muted-foreground">
                        New preliminary safety reports will appear here for classification.
                    </p>
                </div>
            )}
        </div>
    );
}

function SafetyRecommendationsDialog({ reports }: { reports: SafetyReport[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [recommendations, setRecommendations] = useState('');

    const canAnalyze = reports.length > 0;

    const handleAnalyze = async () => {
        if (!canAnalyze) return;

        setIsLoading(true);
        try {
            const incidentReports = reports
                .map(report => {
                    const hazards = (report.initialHazards || [])
                        .map(hazard => `Hazard: ${hazard.description}`)
                        .join('\n');

                    return [
                        `Report #: ${report.reportNumber}`,
                        `Type: ${report.reportType}`,
                        `Status: ${report.status}`,
                        `Event Date: ${report.eventDate}`,
                        `Location: ${report.location}`,
                        `Description: ${report.description}`,
                        hazards,
                    ]
                        .filter(Boolean)
                        .join('\n');
                })
                .join('\n\n---\n\n');

            const result = await callAiFlow<
                { incidentReports: string },
                GenerateSafetyProtocolRecommendationsOutput
            >('generateSafetyProtocolRecommendations', { incidentReports });

            setRecommendations(result.recommendations);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-black uppercase gap-2 border-slate-300" disabled={!canAnalyze}>
                    <WandSparkles className="h-3.5 w-3.5 text-primary" />
                    AI Insights
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Safety Protocol Recommendations</DialogTitle>
                    <DialogDescription>
                        Generate AI recommendations based on the reports visible in this tab.
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/20 p-4 text-sm whitespace-pre-wrap font-medium">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating recommendations...
                        </div>
                    ) : recommendations ? (
                        recommendations
                    ) : (
                        'No recommendations generated yet.'
                    )}
                </div>
                <DialogFooter>
                <Button onClick={handleAnalyze} disabled={isLoading || !canAnalyze} className="font-black uppercase text-xs">
                        {isLoading ? 'Generating...' : 'Generate Recommendations'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function SafetyReportsPage() {
  const { tenantId } = useUserProfile();
  const { hasPermission } = usePermissions();
  const { scopedOrganizationId, shouldShowOrganizationTabs } = useOrganizationScope({ viewAllPermissionId: 'safety-reports-manage' });
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [activeOrgTab, setActiveOrgTab] = useState('internal');
  const [allReports, setAllReports] = useState<SafetyReport[]>([]);
  const [quickSafetyReports, setQuickSafetyReports] = useState<QuickSafetyReport[]>([]);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [classifyingQuickReportId, setClassifyingQuickReportId] = useState<string | null>(null);

  const canManageAll = hasPermission('safety-reports-manage');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!tenantId) {
        setIsLoadingReports(false);
        return;
      }

      setIsLoadingReports(true);
      try {
        const [response, quickResponse] = await Promise.all([
            fetch('/api/safety-reports', { cache: 'no-store' }),
            fetch('/api/quick-safety-reports', { cache: 'no-store' }),
        ]);
        const payload = await response.json();
        const quickPayload = await quickResponse.json().catch(() => ({ reports: [] }));
        if (!cancelled) {
          setAllReports(payload.reports ?? []);
          setQuickSafetyReports(Array.isArray(quickPayload?.reports) ? quickPayload.reports : []);
        }
      } finally {
        if (!cancelled) setIsLoadingReports(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        const response = await fetch('/api/external-organizations', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ organizations: [] }));
        setOrganizations(Array.isArray(payload.organizations) ? payload.organizations : []);
      } catch {
        setOrganizations([]);
      }
    };

    void loadOrganizations();
    window.addEventListener('safeviate-external-organizations-updated', loadOrganizations);
    return () => {
      window.removeEventListener('safeviate-external-organizations-updated', loadOrganizations);
    };
  }, []);

  const isLoading = isLoadingReports;

  const handleClassifyQuickReport = async (report: QuickSafetyReport) => {
    setClassifyingQuickReportId(report.id);
    try {
      const newSafetyReportId = crypto.randomUUID();
      const newSafetyReportNumber = `SR-${String(Date.now()).slice(-6)}`;
      const eventClassification =
        report.recommendedClassification && report.recommendedClassification !== 'General Concern'
          ? report.recommendedClassification
          : undefined;
      const description = report.immediateAction
        ? `${report.summary}\n\nImmediate action taken:\n${report.immediateAction}`
        : report.summary;

      const safetyResponse = await fetch('/api/safety-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: {
            id: newSafetyReportId,
            reportNumber: newSafetyReportNumber,
            reportType: report.reportType,
            status: 'Open',
            submittedBy: report.submittedByEmail || report.submittedById || 'quick-safety-report',
            submittedByName: report.submittedByName,
            submittedAt: new Date().toISOString(),
            isAnonymous: false,
            eventDate: report.eventDate,
            eventTime: report.eventTime,
            location: report.location,
            description,
            occurrenceCategory: 'Quick Safety Report',
            eventClassification,
            sourceQuickReportId: report.id,
            sourceQuickReportNumber: report.reportNumber,
          },
        }),
      });
      const safetyPayload = await safetyResponse.json().catch(() => ({}));
      if (!safetyResponse.ok) {
        throw new Error(safetyPayload?.error || 'Failed to create the formal safety report.');
      }

      const quickResponse = await fetch('/api/quick-safety-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: {
            ...report,
            workflowStatus: 'Classified',
            status: 'Closed',
            linkedSafetyReportId: newSafetyReportId,
            linkedSafetyReportNumber: newSafetyReportNumber,
          },
        }),
      });
      const quickPayload = await quickResponse.json().catch(() => ({}));
      if (!quickResponse.ok) {
        throw new Error(quickPayload?.error || 'Failed to link the quick safety report.');
      }

      setAllReports((current) => [safetyPayload.report as SafetyReport, ...current]);
      setQuickSafetyReports((current) =>
        current.map((entry) =>
          entry.id === report.id
            ? {
                ...entry,
                workflowStatus: 'Classified',
                status: 'Closed',
                linkedSafetyReportId: newSafetyReportId,
                linkedSafetyReportNumber: newSafetyReportNumber,
              }
            : entry
        )
      );

      toast({
        title: 'Quick Safety Report Classified',
        description: `${report.reportNumber} is now linked to formal safety report ${newSafetyReportNumber}.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Classification Failed',
        description: error instanceof Error ? error.message : 'Failed to classify the quick safety report.',
      });
    } finally {
      setClassifyingQuickReportId(null);
    }
  };

  const renderOrgCard = (orgId: string | 'internal') => {
    const filteredReports = (allReports || []).filter(r => 
        orgId === 'internal' ? !r.organizationId : r.organizationId === orgId
    );
    const internalQuickSafetyReports = (quickSafetyReports || []).filter((report) => !report.linkedSafetyReportId);
    const headerBandBorderStyle = { borderBottomColor: 'hsl(var(--card-border))' };
    const fileReportButton = (
      <Button
        asChild
        variant={isMobile ? 'outline' : 'default'}
        size="sm"
        className={
          isMobile
            ? cn(
                HEADER_SECONDARY_BUTTON_CLASS,
                HEADER_COMPACT_CONTROL_CLASS,
                'w-full justify-center px-2 text-[9px] font-black uppercase tracking-[0.08em] border-slate-200 bg-white text-slate-900 hover:bg-slate-50 hover:text-slate-900',
              )
            : cn(
                HEADER_SECONDARY_BUTTON_CLASS,
                HEADER_COMPACT_CONTROL_CLASS,
                'w-full sm:w-auto justify-center text-[9px] font-black uppercase tracking-[0.08em] border-slate-200 bg-white text-slate-900 hover:bg-slate-50 hover:text-slate-900',
              )
        }
      >
        <Link href={`/safety/new-report?orgId=${orgId}`} aria-label={isMobile ? 'File new report' : undefined}>
          <PlusCircle className={isMobile ? 'h-3.5 w-3.5' : 'mr-2 h-4 w-4'} />
          {!isMobile ? 'File New Report' : null}
        </Link>
      </Button>
    );

    return (
        <Card className="flex-1 flex flex-col overflow-hidden shadow-none border rounded-xl">
            <div className="flex flex-col bg-muted/5">
                <div className={CARD_HEADER_BAND_CLASS} style={headerBandBorderStyle}>
                    <div className="flex items-center gap-3">
                        {shouldShowOrganizationTabs ? (
                            <div className="min-w-0 flex-1">
                                <OrganizationTabsRow
                                    organizations={organizations || []}
                                    activeTab={activeOrgTab}
                                    onTabChange={setActiveOrgTab}
                                    className="border-0 bg-transparent px-0 py-0 shrink-0"
                                />
                            </div>
                        ) : null}
                        <div className={cn('shrink-0', isMobile ? 'w-[92px]' : 'w-auto')}>
                            {fileReportButton}
                        </div>
                    </div>
                </div>
            </div>
            <CardContent className="flex-1 p-0 bg-background overflow-y-auto">
                {orgId === 'internal' ? (
                    <QuickSafetyInbox
                        reports={internalQuickSafetyReports}
                        canManage={canManageAll}
                        classifyingReportId={classifyingQuickReportId}
                        onClassify={handleClassifyQuickReport}
                    />
                ) : null}
                <ReportsTable reports={filteredReports} tenantId={tenantId || ''} canManage={canManageAll} />
            </CardContent>
        </Card>
    );
  };

  if (isLoading) {
    return (
        <div className="max-w-[1100px] mx-auto w-full space-y-6 pt-4 px-1">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-[500px] w-full" />
        </div>
    );
  }

  const showTabs = shouldShowOrganizationTabs;

    return (
        <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 pt-4 px-1 h-full overflow-hidden">
        {!showTabs ? (
            renderOrgCard(scopedOrganizationId)
        ) : (
            <Tabs value={activeOrgTab} onValueChange={setActiveOrgTab} className="w-full flex flex-col h-full overflow-hidden">
                <div className="flex-1 min-h-0 overflow-hidden">
                    <TabsContent value="internal" className="mt-0 h-full">
                        {renderOrgCard('internal')}
                    </TabsContent>
                    
                    {(organizations || []).map(org => (
                        <TabsContent key={org.id} value={org.id} className="mt-0 h-full">
                            {renderOrgCard(org.id)}
                        </TabsContent>
                    ))}
                </div>
            </Tabs>
        )}
    </div>
  );
}
