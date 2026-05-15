'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SafetyReport } from '@/types/safety-report';
import { ArrowLeft, Printer, ShieldAlert, Pencil } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { TriageForm } from './triage-form';
import { useToast } from '@/hooks/use-toast';
import { InvestigationForm } from './investigation-form';
import { HazardIdentificationForm } from './hazard-identification-form';
import { CorrectiveActionsForm } from './corrective-actions-form';
import { FinalReview } from './final-review';
import { ReportForum } from './report-forum';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import type { RiskMatrixSettings } from '@/types/risk';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';
import { EditReportDialog } from '../edit-report-dialog';
import { cn } from '@/lib/utils';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import { usePageLayout } from '@/hooks/use-page-layout';

interface SafetyReportDetailPageProps {
  params: Promise<{ reportId: string }>;
}

export default function SafetyReportDetailPage({ params }: SafetyReportDetailPageProps) {
  const { toast } = useToast();
  const { userProfile, tenantId } = useUserProfile();
  const isMobile = useIsMobile();
  const { isPageEnabled, isSectionEnabled, isTabEnabled } = usePageLayout('safety-reports');
  const resolvedParams = use(params);
  const reportId = resolvedParams.reportId;
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [riskMatrixSettings, setRiskMatrixSettings] = useState<RiskMatrixSettings | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [isLoadingPersonnel, setIsLoadingPersonnel] = useState(true);
  const [isLoadingRiskMatrix, setIsLoadingRiskMatrix] = useState(true);
  const [activeTab, setActiveTab] = useState('triage');
  const showReportViews = isSectionEnabled('report-views');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!reportId || !tenantId) {
        setIsLoadingReport(false);
        setIsLoadingPersonnel(false);
        setIsLoadingRiskMatrix(false);
        return;
      }

      setIsLoadingReport(true);
      setIsLoadingPersonnel(true);
      setIsLoadingRiskMatrix(true);
      try {
        const [reportResponse, personnelResponse] = await Promise.all([
          fetch(`/api/safety-reports/${reportId}`, { cache: 'no-store' }),
          fetch('/api/personnel', { cache: 'no-store' }),
        ]);

        const reportPayload = await reportResponse.json();
        const personnelPayload = await personnelResponse.json();

        if (cancelled) return;
        setReport(reportPayload.report ?? null);
        setPersonnel(personnelPayload.personnel ?? []);
        setRiskMatrixSettings(null);
      } finally {
        if (!cancelled) {
          setIsLoadingReport(false);
          setIsLoadingPersonnel(false);
          setIsLoadingRiskMatrix(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reportId, tenantId]);

  const myMentionsCount = useMemo(() => {
    if (!report?.discussion || !userProfile) return 0;
    return report.discussion.filter(item => item.assignedToId === userProfile.id).length;
  }, [report?.discussion, userProfile]);

  const visibleReportTabs = useMemo(() => {
    const tabs = [
      { value: 'full', label: 'Full Report' },
      { value: 'triage', label: 'Report & Triage' },
      { value: 'hazards', label: 'Hazard & Risk ID' },
      { value: 'investigation', label: 'Investigation' },
      { value: 'cap', label: 'Corrective Actions' },
      { value: 'review', label: 'Final Review' },
      { value: 'discussion', label: myMentionsCount > 0 ? `Discussion (${myMentionsCount})` : 'Discussion' },
    ];
    return tabs.filter((tab) => isTabEnabled(tab.value));
  }, [isTabEnabled, myMentionsCount]);

  useEffect(() => {
    if (!showReportViews || visibleReportTabs.length === 0) return;
    if (!visibleReportTabs.some((tab) => tab.value === activeTab)) {
      setActiveTab(visibleReportTabs[0].value);
    }
  }, [activeTab, showReportViews, visibleReportTabs]);

  const isLoading = isLoadingReport || isLoadingPersonnel || isLoadingRiskMatrix;

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-[1100px] mx-auto w-full pt-4 px-1">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="max-w-[1100px] mx-auto w-full text-center py-20 px-1">
        <p className="text-muted-foreground">Tenant context is required to load this report.</p>
        <Button asChild variant="link" className="mt-4">
          <Link href="/safety/safety-reports">Return to reports list</Link>
        </Button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-[1100px] mx-auto w-full text-center py-20 px-1">
        <p className="text-muted-foreground">Report not found.</p>
        <Button asChild variant="link" className="mt-4">
          <Link href="/safety/safety-reports">Return to reports list</Link>
        </Button>
      </div>
    );
  }

  if (!isPageEnabled) {
    return (
      <div className="max-w-[1100px] mx-auto w-full px-1 pt-4">
        <Card className="border shadow-none">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            This page is disabled for the current tenant layout.
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderFullReportSections = (isStacked = false) => (
    <div className={isStacked ? 'flex flex-col gap-8 p-6 pb-20' : 'p-6 pb-20'}>
      <TriageForm report={report} tenantId={tenantId} isStacked={isStacked} />
      <HazardIdentificationForm
        report={report}
        tenantId={tenantId}
        riskMatrixColors={riskMatrixSettings?.colors}
        isStacked={isStacked}
      />
      <InvestigationForm
        report={report}
        tenantId={tenantId}
        personnel={personnel || []}
        isStacked={isStacked}
      />
      <CorrectiveActionsForm report={report} tenantId={tenantId} personnel={personnel || []} isStacked={isStacked} />
      <FinalReview
        report={report}
        tenantId={tenantId}
        personnel={personnel || []}
        riskMatrixColors={riskMatrixSettings?.colors}
        isStacked={isStacked}
      />
    </div>
  );

  const renderSingleTabContent = (tabValue: string) => {
    switch (tabValue) {
      case 'full':
        return renderFullReportSections(true);
      case 'triage':
        return <TriageForm report={report} tenantId={tenantId} />;
      case 'hazards':
        return <HazardIdentificationForm report={report} tenantId={tenantId} riskMatrixColors={riskMatrixSettings?.colors} />;
      case 'investigation':
        return <InvestigationForm report={report} tenantId={tenantId} personnel={personnel || []} />;
      case 'cap':
        return <CorrectiveActionsForm report={report} tenantId={tenantId} personnel={personnel || []} />;
      case 'review':
        return <FinalReview report={report} tenantId={tenantId} personnel={personnel || []} riskMatrixColors={riskMatrixSettings?.colors} />;
      case 'discussion':
        return <ReportForum report={report} tenantId={tenantId} />;
      default:
        return renderFullReportSections(true);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col h-full overflow-hidden pt-4 px-1">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col overflow-hidden">
        
        {/* --- MAIN CONTENT CARD --- */}
        <div className="flex-1 overflow-hidden pb-10 no-print pt-4">
          <div className="rounded-xl border overflow-hidden flex flex-col bg-card shadow-none h-full">
            <div className="sticky top-0 z-30 bg-card">
              <CardHeader className="bg-muted/5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 md:px-5 md:py-3 shrink-0">
                <div className="flex-1 min-w-0">
                  <CardTitle className="flex items-center gap-2 truncate text-xl font-black uppercase md:text-2xl">
                    <ShieldAlert className="h-5 w-5 shrink-0 text-primary" />
                    Report {report.reportNumber}
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs font-medium">
                    Filed on {format(new Date(report.submittedAt), 'PPP')} by <span className="text-foreground font-semibold">{report.submittedByName}</span>
                  </CardDescription>
                  {report.sourceQuickReportNumber ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="h-6 px-2 text-[10px] font-black uppercase tracking-widest">
                        Quick Intake
                      </Badge>
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        Originated from {report.sourceQuickReportNumber}
                      </span>
                    </div>
                  ) : null}
                  {report.immediateAction ? (
                    <div className="mt-3 rounded-lg border bg-muted/5 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Immediate Action</p>
                      <p className="mt-1 text-sm font-medium text-foreground whitespace-pre-wrap">{report.immediateAction}</p>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <EditReportDialog 
                    report={report} 
                    tenantId={tenantId} 
                    trigger={
                      <Button variant="outline" size="sm" className={`${HEADER_SECONDARY_BUTTON_CLASS} !h-8 !gap-1.5 !px-3 !py-1.5 !text-[9px]`}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit Report
                      </Button>
                    }
                  />
                  <Button onClick={handlePrint} variant="outline" size="sm" className={`${HEADER_SECONDARY_BUTTON_CLASS} !h-8 !gap-1.5 !px-3 !py-1.5 !text-[9px]`}>
                      <Printer className="h-4 w-4" />
                      Print Report
                  </Button>
                </div>
              </CardHeader>

              {/* --- TAB BAR INSIDE CARD WITH HORIZONTAL SCROLL --- */}
              <div className="border-b bg-muted/5 px-6 py-2 shrink-0">
                {showReportViews && visibleReportTabs.length > 1 ? (
                  isMobile ? (
                    <ResponsiveTabRow
                      value={activeTab}
                      onValueChange={setActiveTab}
                      placeholder="Select Section"
                      className="shrink-0"
                      options={visibleReportTabs}
                    />
                  ) : (
                    <TabsList className="bg-transparent h-auto p-0 gap-2 border-b-0 justify-start overflow-x-auto no-scrollbar flex items-center w-full">
                      {visibleReportTabs.map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value} className="rounded-full px-6 py-2 border data-[state=active]:bg-button-primary data-[state=active]:text-button-primary-foreground font-bold text-[10px] uppercase transition-all shrink-0">
                          {tab.value === 'discussion' && myMentionsCount > 0 ? (
                            <span className="inline-flex items-center gap-2">
                              {tab.label}
                              <Badge className="ml-2 h-4 px-1.5 min-w-4 flex items-center justify-center text-[10px]">{myMentionsCount}</Badge>
                            </span>
                          ) : (
                            tab.label
                          )}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  )
                ) : null}
              </div>
            </div>

            <div className="flex-1 min-h-0">
              {!showReportViews || visibleReportTabs.length === 0 ? (
                <div className="m-0 h-full outline-none overflow-y-auto no-scrollbar">
                  {renderFullReportSections()}
                </div>
              ) : visibleReportTabs.length === 1 ? (
                <div className="m-0 h-full outline-none overflow-y-auto no-scrollbar">
                  {renderSingleTabContent(visibleReportTabs[0].value)}
                </div>
              ) : (
                <>
                  <TabsContent value="full" className="m-0 h-full outline-none overflow-y-auto no-scrollbar">
                    {renderFullReportSections(true)}
                  </TabsContent>
                  <TabsContent value="triage" className="m-0 h-full outline-none overflow-hidden h-full"><TriageForm report={report} tenantId={tenantId} /></TabsContent>
                  <TabsContent value="hazards" className="m-0 h-full outline-none overflow-hidden h-full"><HazardIdentificationForm report={report} tenantId={tenantId} riskMatrixColors={riskMatrixSettings?.colors} /></TabsContent>
                  <TabsContent value="investigation" className="m-0 h-full outline-none overflow-hidden h-full"><InvestigationForm report={report} tenantId={tenantId} personnel={personnel || []} /></TabsContent>
                  <TabsContent value="cap" className="m-0 h-full outline-none overflow-hidden h-full"><CorrectiveActionsForm report={report} tenantId={tenantId} personnel={personnel || []} /></TabsContent>
                  <TabsContent value="review" className="m-0 h-full outline-none overflow-hidden h-full"><FinalReview report={report} tenantId={tenantId} personnel={personnel || []} riskMatrixColors={riskMatrixSettings?.colors} /></TabsContent>
                  <TabsContent value="discussion" className="m-0 h-full outline-none overflow-hidden h-full"><ReportForum report={report} tenantId={tenantId} /></TabsContent>
                </>
              )}
            </div>
          </div>
        </div>
      </Tabs>

      {/* --- Dedicated Print Layout (Hidden in UI) --- */}
      <div className="hidden print:block space-y-8 max-w-[1100px] mx-auto w-full">
          <Card className="shadow-none border-none">
            <CardHeader className="p-0 pb-4">
                <CardTitle className="text-2xl">Safety Report {report.reportNumber}</CardTitle>
                <CardDescription>
                Filed on {format(new Date(report.submittedAt), 'PPP')} by {report.submittedByName}
                </CardDescription>
            </CardHeader>
            <CardContent className="p-0 border-t pt-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Original Description</h4>
                <p className="text-sm whitespace-pre-wrap">{report.description}</p>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-10">
              <TriageForm report={report} tenantId={tenantId} isStacked />
              <HazardIdentificationForm report={report} tenantId={tenantId} riskMatrixColors={riskMatrixSettings?.colors} isStacked />
              <InvestigationForm report={report} tenantId={tenantId} personnel={personnel || []} isStacked />
              <CorrectiveActionsForm report={report} tenantId={tenantId} personnel={personnel || []} isStacked />
              <FinalReview report={report} tenantId={tenantId} personnel={personnel || []} riskMatrixColors={riskMatrixSettings?.colors} isStacked />
          </div>
      </div>
    </div>
  );
}
