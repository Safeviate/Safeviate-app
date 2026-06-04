'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { AlertTriangle, ArrowLeft, Clock, Loader2, MapPin, Plane, Save, User } from 'lucide-react';
import { BackNavButton } from '@/components/back-nav-button';
import { MainPageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { dispatchSafeviateEvent, SAFEVIATE_TECHNICAL_REPORTS_UPDATED } from '@/lib/client-events';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import type { QuickReportWorkflowStatus, TechnicalQuickReport } from '@/types/quick-reports';

type TechnicalReportAssigneeOption = {
  id: string;
  name: string;
};

type TechnicalReportDraft = {
  assignedToId: string;
  workflowStatus: QuickReportWorkflowStatus;
  managementNotes: string;
};

const TECHNICAL_REPORT_WORKFLOW_STATUSES: QuickReportWorkflowStatus[] = [
  'Preliminary',
  'Under Review',
  'Assigned',
  'Closed',
  'Classified',
];

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date(value);
  return new Date(year, month - 1, day, 12);
};

export default function TechnicalReportDetailPage() {
  const params = useParams<{ reportId?: string }>();
  const reportId = typeof params?.reportId === 'string' ? params.reportId : '';
  const { toast } = useToast();

  const [report, setReport] = useState<TechnicalQuickReport | null>(null);
  const [draft, setDraft] = useState<TechnicalReportDraft | null>(null);
  const [assignees, setAssignees] = useState<TechnicalReportAssigneeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const [reportsResponse, personnelResponse] = await Promise.all([
          fetch('/api/technical-reports', { cache: 'no-store' }),
          fetch('/api/personnel', { cache: 'no-store' }),
        ]);
        const [reportsPayload, personnelPayload] = await Promise.all([
          reportsResponse.json().catch(() => ({ reports: [] })),
          personnelResponse.json().catch(() => ({ personnel: [] })),
        ]);

        if (cancelled) return;

        const reports = Array.isArray(reportsPayload?.reports)
          ? (reportsPayload.reports as TechnicalQuickReport[])
          : [];
        const currentReport = reports.find((entry) => entry.id === reportId) || null;
        const personnel = Array.isArray(personnelPayload?.personnel)
          ? (personnelPayload.personnel as Personnel[])
          : [];

        setReport(currentReport);
        setAssignees(
          personnel
            .map((person) => ({
              id: person.id,
              name: `${person.firstName || ''} ${person.lastName || ''}`.trim(),
            }))
            .filter((person) => person.id && person.name),
        );
        setDraft(
          currentReport
            ? {
                assignedToId: currentReport.assignedToId || '',
                workflowStatus: currentReport.workflowStatus || 'Preliminary',
                managementNotes: currentReport.managementNotes || '',
              }
            : null,
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    if (reportId) {
      void load();
    } else {
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const assignedPerson = useMemo(
    () => assignees.find((person) => person.id === (draft?.assignedToId || '')) || null,
    [assignees, draft?.assignedToId],
  );

  const handleSave = async () => {
    if (!report || !draft) return;

    setIsSaving(true);
    try {
      const nextReport: TechnicalQuickReport = {
        ...report,
        assignedToId: draft.assignedToId || null,
        assignedToName: assignedPerson?.name || null,
        workflowStatus: draft.workflowStatus,
        managementNotes: draft.managementNotes.trim() || null,
        status: draft.workflowStatus === 'Closed' ? 'Closed' : 'Open',
      };

      const response = await fetch('/api/technical-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: nextReport }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update technical report.');
      }

      const updatedReport = payload.report as TechnicalQuickReport;
      setReport(updatedReport);
      setDraft({
        assignedToId: updatedReport.assignedToId || '',
        workflowStatus: updatedReport.workflowStatus || 'Preliminary',
        managementNotes: updatedReport.managementNotes || '',
      });

      if (typeof window !== 'undefined') {
        const updateStamp = JSON.stringify({ at: Date.now() });
        window.localStorage.setItem('safeviate-technical-reports-updated', updateStamp);
        dispatchSafeviateEvent(SAFEVIATE_TECHNICAL_REPORTS_UPDATED);
      }

      toast({
        title: 'Technical Report Updated',
        description: `${updatedReport.reportNumber} has been saved.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update technical report.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1100px] space-y-6 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  if (!report || !draft) {
    return (
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 p-4">
        <Card className="overflow-hidden border shadow-none">
          <MainPageHeader
            title="Technical Report Not Found"
            description="The preliminary technical report could not be loaded for this tenant."
            actions={<BackNavButton href="/safety/safety-reports" text="Back to Safety Reports" />}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 p-4">
      <Card className="overflow-hidden border shadow-none">
        <MainPageHeader
          title={report.reportNumber}
          description="Review and manage this preliminary technical report."
          actions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <BackNavButton href="/safety/safety-reports" text="Back to Safety Reports" />
              {report.aircraftId ? (
                <Button asChild variant="outline" className="h-8 px-3 text-[10px] font-black uppercase tracking-widest border-slate-300">
                  <Link href={`/assets/aircraft/${report.aircraftId}#technical-report-notifications`}>
                    <Plane className="mr-1.5 h-3.5 w-3.5" />
                    Open Aircraft
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        />

        <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <Card className="overflow-hidden border shadow-none">
              <CardHeader className="border-b bg-muted/5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={report.status === 'Closed' ? 'default' : 'destructive'} className="text-[10px] font-black uppercase tracking-widest">
                    {report.status}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest">
                    {draft.workflowStatus}
                  </Badge>
                  {report.urgency ? (
                    <Badge variant={report.urgency === 'High' ? 'destructive' : report.urgency === 'Medium' ? 'secondary' : 'outline'} className="text-[10px] font-black uppercase tracking-widest">
                      {report.urgency}
                    </Badge>
                  ) : null}
                  {report.grounded ? (
                    <Badge variant="destructive" className="text-[10px] font-black uppercase tracking-widest">
                      Grounding recommended
                    </Badge>
                  ) : null}
                </div>
                <CardTitle className="text-base font-black uppercase tracking-tight">
                  {report.title || report.summary}
                </CardTitle>
                <CardDescription className="text-sm">
                  Preliminary technical intake for engineering and management follow-up.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Filed</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-black">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {format(parseLocalDate(report.eventDate), 'dd MMM yyyy')} at {report.eventTime}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Location</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-black">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {report.location}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Filed By</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-black">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {report.submittedByName}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Aircraft</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-black">
                      <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                      {report.aircraftLabel || 'Not linked to an aircraft'}
                    </p>
                  </div>
                </div>

                {report.systemOrComponent ? (
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">System / Component</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{report.systemOrComponent}</p>
                  </div>
                ) : null}

                <div className="rounded-lg border bg-background px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Summary</p>
                  <p className="mt-1 text-sm font-medium text-foreground whitespace-pre-wrap">{report.summary}</p>
                </div>

                {report.immediateAction ? (
                  <div className="rounded-lg border bg-muted/5 px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Immediate Action</p>
                    <p className="mt-1 text-sm font-medium text-foreground whitespace-pre-wrap">{report.immediateAction}</p>
                  </div>
                ) : null}

                {report.photoAttachments?.length ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Attached Photos</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {report.photoAttachments.map((photo) => (
                        <a
                          key={photo.id}
                          href={photo.dataUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="overflow-hidden rounded-lg border bg-background"
                        >
                          <img src={photo.dataUrl} alt={photo.name} className="h-40 w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="overflow-hidden border shadow-none">
              <CardHeader className="border-b bg-muted/5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-black uppercase tracking-tight">Management Review</CardTitle>
                </div>
                <CardDescription className="text-sm">
                  Assign ownership, set workflow state, and capture engineering management notes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Assigned To</label>
                  <Select
                    value={draft.assignedToId || 'unassigned'}
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current
                          ? { ...current, assignedToId: value === 'unassigned' ? '' : value }
                          : current,
                      )
                    }
                  >
                    <SelectTrigger className="h-10 font-bold">
                      <SelectValue placeholder="Assign report" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {assignees.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Workflow Status</label>
                  <Select
                    value={draft.workflowStatus}
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current ? { ...current, workflowStatus: value as QuickReportWorkflowStatus } : current,
                      )
                    }
                  >
                    <SelectTrigger className="h-10 font-bold">
                      <SelectValue placeholder="Select workflow status" />
                    </SelectTrigger>
                    <SelectContent>
                      {TECHNICAL_REPORT_WORKFLOW_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Management Notes</label>
                  <Textarea
                    value={draft.managementNotes}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, managementNotes: event.target.value } : current,
                      )
                    }
                    className="min-h-[120px] p-3"
                    placeholder="Capture assignment notes, engineering direction, or follow-up actions."
                  />
                </div>

                <Button
                  type="button"
                  className="h-10 w-full text-[10px] font-black uppercase tracking-widest"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {isSaving ? 'Saving...' : 'Save Management Update'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
