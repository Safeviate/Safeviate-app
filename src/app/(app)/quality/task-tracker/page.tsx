'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useOrganizationScope } from '@/hooks/use-organization-scope';
import { OrganizationTabsRow } from '@/components/responsive-tab-row';
import { ViewActionButton } from '@/components/record-action-buttons';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { CalendarIcon } from 'lucide-react';
import { getPersonnelDisplayName } from '@/lib/personnel-label';

import type { ManagementOfChange } from '@/types/moc';
import type { SafetyReport } from '@/types/safety-report';
import type { CorrectiveActionPlan, QualityAudit, QualityFinding, ExternalOrganization } from '@/types/quality';
import type { Personnel } from '@/app/(app)/users/personnel/page';

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, 12);
};

type UnifiedTask = {
  id: string;
  description: string;
  sourceType: 'MOC' | 'Audit' | 'Gap Analysis' | 'Safety Report';
  sourceIdentifier: string;
  link: string;
  assigneeId: string;
  assigneeName?: string;
  dueDate: string;
  status: 'Open' | 'In Progress' | 'Completed' | 'Closed' | 'Cancelled';
  organizationId?: string | null;
};

type AuditCapEntry = {
  cap: CorrectiveActionPlan;
  audit: QualityAudit;
  observation: string;
  findingLevel: string;
};

const formatCapDueDate = (value?: string) => {
  if (!value) return '';
  return value.length >= 10 ? value.slice(0, 10) : value;
};

const toNoonUtcIso = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString();

const parseCapObservation = (finding?: QualityFinding) =>
  finding?.comment?.trim()
  || finding?.gapDescription?.trim()
  || finding?.actionPlan?.trim()
  || finding?.currentState?.trim()
  || finding?.desiredState?.trim()
  || 'No observation recorded.';

const parseCapFindingLevel = (finding?: QualityFinding) => finding?.level?.trim() || 'Unclassified';

interface AuditCapBoardCardProps {
  cap: CorrectiveActionPlan;
  audit: QualityAudit;
  observation: string;
  findingLevel: string;
  personnel: Personnel[];
}

function AuditCapBoardCard({ cap, audit, observation, findingLevel, personnel }: AuditCapBoardCardProps) {
  const { toast } = useToast();
  const correctiveActionRef = useRef<HTMLTextAreaElement | null>(null);
  const [rootCauseAnalysis, setRootCauseAnalysis] = useState(cap.rootCauseAnalysis || '');
  const [responsiblePersonId, setResponsiblePersonId] = useState(cap.responsiblePersonId || '');
  const [dueDate, setDueDate] = useState(formatCapDueDate(cap.dueDate || audit.auditDate));
  const [isSaving, setIsSaving] = useState(false);
  const [isDueDateOpen, setIsDueDateOpen] = useState(false);

  useEffect(() => {
    setRootCauseAnalysis(cap.rootCauseAnalysis || '');
    setResponsiblePersonId(cap.responsiblePersonId || '');
    setDueDate(formatCapDueDate(cap.dueDate || audit.auditDate));
  }, [audit.auditDate, cap.dueDate, cap.id, cap.responsiblePersonId, cap.rootCauseAnalysis]);

  useEffect(() => {
    const textarea = correctiveActionRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 44)}px`;
  }, [rootCauseAnalysis]);

  const saveCap = async () => {
    try {
      setIsSaving(true);
      const response = await fetch('/api/corrective-action-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cap: {
            ...cap,
            rootCauseAnalysis,
            responsiblePersonId,
            dueDate: dueDate ? toNoonUtcIso(parseLocalDate(dueDate)) : '',
          },
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to save corrective action plan.');
      }
      window.dispatchEvent(new Event('safeviate-quality-updated'));
      toast({
        title: 'Corrective Action Plan Saved',
        description: 'The CAP has been updated.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save CAP.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-card-border bg-muted/10 p-3 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="outline" size="sm" className="h-7 px-3 text-[10px] font-black uppercase tracking-[0.08em]">
            <Link href={`/quality/audits/${audit.id}`}>Audit #{audit.auditNumber}</Link>
          </Button>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Observation</p>
            <p className="text-sm font-medium text-foreground">{observation}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <Badge variant="outline" className="h-[22px] rounded-lg border-card-border bg-background px-2 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
            {cap.status}
          </Badge>
          <div className="flex h-[22px] items-center justify-between gap-3 rounded-lg border border-card-border bg-white px-2 text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Finding Level</p>
            <p className="text-[10px] font-semibold leading-none text-foreground">{findingLevel}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 lg:col-span-2">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Corrective Action</p>
          <Textarea
            ref={correctiveActionRef}
            value={rootCauseAnalysis}
            onChange={(event) => setRootCauseAnalysis(event.target.value)}
            rows={1}
            placeholder="Describe the corrective action..."
            className="min-h-11 resize-none overflow-hidden bg-background"
          />
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Responsible Person</p>
          <Select value={responsiblePersonId || ''} onValueChange={(value) => setResponsiblePersonId(value === '__unassigned__' ? '' : value)}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Assign a responsible person..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">Unassigned</SelectItem>
              {personnel.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Due Date</p>
          <Popover open={isDueDateOpen} onOpenChange={setIsDueDateOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between bg-background text-left font-normal"
              >
                <span>{dueDate ? format(parseLocalDate(dueDate), 'dd MMM yy') : 'Pick a date'}</span>
                <CalendarIcon className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <CustomCalendar
                selectedDate={dueDate ? parseLocalDate(dueDate) : undefined}
                onDateSelect={(date) => {
                  setDueDate(format(date, 'yyyy-MM-dd'));
                  setIsDueDateOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={saveCap} disabled={isSaving}>
          Save CAP
        </Button>
      </div>
    </div>
  );
}

export default function TaskTrackerPage() {
  const { tenantId } = useUserProfile();
  const { scopedOrganizationId, shouldShowOrganizationTabs } = useOrganizationScope({ viewAllPermissionId: 'quality-tasks-view' });
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/quality/task-tracker' });
  const isMobile = useIsMobile();
  const [activeOrgTab, setActiveOrgTab] = useState('internal');
  const [capFocusFilter, setCapFocusFilter] = useState<'All' | 'Open' | 'In Progress' | 'Closed' | 'Overdue' | 'Due Soon' | 'Unassigned'>('All');
  const [capSortBy, setCapSortBy] = useState<'Due Date' | 'Owner'>('Due Date');
  const [isCapBoardCollapsed, setIsCapBoardCollapsed] = useState(false);

  const [mocs, setMocs] = useState<ManagementOfChange[]>([]);
  const [safetyReports, setSafetyReports] = useState<SafetyReport[]>([]);
  const [caps, setCaps] = useState<CorrectiveActionPlan[]>([]);
  const [audits, setAudits] = useState<QualityAudit[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(() => {
    setIsLoading(true);
    void (async () => {
      try {
        const [summaryRes, orgsRes] = await Promise.all([
          fetch('/api/dashboard-summary', { cache: 'no-store' }),
          fetch('/api/external-organizations', { cache: 'no-store' }),
        ]);
        const summary = await summaryRes.json().catch(() => ({}));
        const orgsPayload = await orgsRes.json().catch(() => ({}));

        setMocs(Array.isArray(summary.mocs) ? summary.mocs : []);
        setSafetyReports(Array.isArray(summary.reports) ? summary.reports : []);
        setCaps(Array.isArray(summary.caps) ? summary.caps : []);
        setAudits(Array.isArray(summary.audits) ? summary.audits : []);
        setPersonnel(Array.isArray(summary.personnel) ? summary.personnel : []);
        setOrganizations(Array.isArray(orgsPayload.organizations) ? orgsPayload.organizations : []);
      } catch (e) {
        console.error('Failed to load task data', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    loadData();
    const events = [
      'safeviate-moc-updated',
      'safeviate-safety-reports-updated',
      'safeviate-quality-updated',
      'safeviate-personnel-updated',
      'safeviate-external-organizations-updated',
    ];
    events.forEach((event) => window.addEventListener(event, loadData));
    return () => events.forEach((event) => window.removeEventListener(event, loadData));
  }, [loadData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = tenantId ? `safeviate-task-tracker-cap-board-collapsed:${tenantId}` : 'safeviate-task-tracker-cap-board-collapsed';
    const savedState = window.localStorage.getItem(storageKey);
    if (savedState === null) return;
    setIsCapBoardCollapsed(savedState === 'true');
  }, [tenantId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = tenantId ? `safeviate-task-tracker-cap-board-collapsed:${tenantId}` : 'safeviate-task-tracker-cap-board-collapsed';
    window.localStorage.setItem(storageKey, String(isCapBoardCollapsed));
  }, [isCapBoardCollapsed, tenantId]);

  const allTasks = useMemo((): UnifiedTask[] => {
    if (isLoading || !personnel) return [];

    const personnelMap = new Map(personnel.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
    const tasks: UnifiedTask[] = [];

    (mocs || []).forEach((moc) => {
      moc.phases?.forEach((phase) => {
        phase.steps?.forEach((step) => {
          step.hazards?.forEach((hazard) => {
            hazard.risks?.forEach((risk) => {
              risk.mitigations?.forEach((mitigation) => {
                if (mitigation.status !== 'Closed' && mitigation.status !== 'Cancelled') {
                  tasks.push({
                    id: mitigation.id,
                    description: mitigation.description,
                    sourceType: 'MOC',
                    sourceIdentifier: moc.mocNumber,
                    link: `/safety/management-of-change/${moc.id}`,
                    assigneeId: mitigation.responsiblePersonId,
                    assigneeName: personnelMap.get(mitigation.responsiblePersonId) || 'Unassigned',
                    dueDate: mitigation.completionDate,
                    status: mitigation.status,
                    organizationId: moc.organizationId,
                  });
                }
              });
            });
          });
        });
      });
    });

    (safetyReports || []).forEach((report) => {
      (report.investigationTasks || []).forEach((task) => {
        if (task.status !== 'Completed') {
          tasks.push({
            id: task.id,
            description: task.description,
            sourceType: 'Safety Report',
            sourceIdentifier: report.reportNumber,
            link: `/safety/safety-reports/${report.id}`,
            assigneeId: task.assigneeId,
            assigneeName: personnelMap.get(task.assigneeId) || 'Unassigned',
            dueDate: task.dueDate,
            status: task.status,
            organizationId: report.organizationId,
          });
        }
      });
    });

    (audits || []).forEach((audit) => {
      if ((audit as { analysisType?: string } | undefined)?.analysisType !== 'gap-analysis') return;

      (audit.findings || []).forEach((finding) => {
        if (finding.gapStatus !== 'Open gap' && finding.gapStatus !== 'Partial coverage') return;

        const assigneeId = finding.ownerId?.trim() || audit.auditorId;
        const dueDate = finding.targetDate?.trim() || audit.auditDate;

        tasks.push({
          id: `${audit.id}:${finding.checklistItemId}`,
          description:
            finding.actionPlan?.trim()
            || finding.gapDescription?.trim()
            || finding.currentState?.trim()
            || finding.desiredState?.trim()
            || finding.checklistItemId,
          sourceType: 'Gap Analysis',
          sourceIdentifier: audit.auditNumber || 'Unknown Gap Analysis',
          link: `/quality/gap-analyses/${audit.id}`,
          assigneeId,
          assigneeName: personnelMap.get(assigneeId) || 'Unassigned',
          dueDate,
          status: finding.gapStatus === 'Partial coverage' ? 'In Progress' : 'Open',
          organizationId: audit.organizationId,
        });
      });
    });

    return tasks.sort((a, b) => parseLocalDate(a.dueDate).getTime() - parseLocalDate(b.dueDate).getTime());
  }, [mocs, safetyReports, caps, audits, personnel, isLoading]);

  const auditsMap = useMemo(() => new Map((audits || []).map((audit) => [audit.id, audit])), [audits]);
  const auditCapEntries = useMemo<AuditCapEntry[]>(() => {
    if (isLoading) return [];
    return (caps || [])
      .map((cap) => {
        const audit = auditsMap.get(cap.auditId);
        if (!audit || (audit as { analysisType?: string } | undefined)?.analysisType === 'gap-analysis') return null;
        const finding = audit.findings?.find((item) => item.checklistItemId === cap.findingId);
        return {
          cap,
          audit,
          observation: parseCapObservation(finding),
          findingLevel: parseCapFindingLevel(finding),
        };
      })
      .filter((entry): entry is AuditCapEntry => Boolean(entry));
  }, [auditsMap, caps, isLoading]);

  const auditCapSnapshot = useMemo(() => {
    const now = new Date();
    const weekAhead = new Date(now);
    weekAhead.setDate(now.getDate() + 7);

    const overdue = auditCapEntries.filter((entry) => {
      const due = parseLocalDate(formatCapDueDate(entry.cap.dueDate || entry.audit.auditDate));
      return due.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()
        && entry.cap.status !== 'Closed'
        && entry.cap.status !== 'Cancelled';
    }).length;
    const dueSoon = auditCapEntries.filter((entry) => {
      const due = parseLocalDate(formatCapDueDate(entry.cap.dueDate || entry.audit.auditDate));
      return due.getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()
        && due.getTime() <= weekAhead.getTime()
        && entry.cap.status !== 'Closed'
        && entry.cap.status !== 'Cancelled';
    }).length;
    const open = auditCapEntries.filter((entry) => entry.cap.status !== 'Closed' && entry.cap.status !== 'Cancelled').length;

    return { overdue, dueSoon, open };
  }, [auditCapEntries]);
  const auditCapWindow = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  }, []);

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  const getStatusBadgeVariant = (status: UnifiedTask['status']): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'Completed':
      case 'Closed':
        return 'default';
      case 'In Progress':
        return 'secondary';
      case 'Cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getSourceBadgeClassName = (sourceType: UnifiedTask['sourceType']) => {
    switch (sourceType) {
      case 'Gap Analysis':
        return 'border-primary/30 bg-primary/10 text-primary';
      case 'Audit':
        return 'border-slate-300 bg-slate-50 text-slate-700';
      case 'Safety Report':
        return 'border-amber-300 bg-amber-50 text-amber-700';
      case 'MOC':
      default:
        return 'border-input bg-background text-foreground';
    }
  };

  const renderTasksTable = (tasks: UnifiedTask[]) => (
    <ResponsiveCardGrid
      items={tasks}
      isLoading={false}
      className="p-4"
      gridClassName="sm:grid-cols-2 xl:grid-cols-3"
      renderItem={(task) => (
          <Card
            key={task.id}
            className={cn(
              "overflow-hidden border shadow-none transition-shadow hover:shadow-sm",
            )}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">{task.description}</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {task.sourceType} - {task.sourceIdentifier}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Badge variant="outline" className={cn('text-[9px] font-black uppercase py-0.5 px-3', getSourceBadgeClassName(task.sourceType))}>
                  {task.sourceType}
                </Badge>
              <Badge variant={getStatusBadgeVariant(task.status)} className="text-[10px] font-black uppercase py-0.5 px-3">
                {task.status}
              </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-background px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Assignee</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{task.assigneeName}</p>
              </div>
              <div className="rounded-lg border bg-background px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Do by</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{format(parseLocalDate(task.dueDate), 'dd MMM yy')}</p>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <ViewActionButton href={task.link} />
            </div>
          </CardContent>
        </Card>
      )}
      emptyState={(
        <div className="h-24 text-center flex items-center justify-center text-muted-foreground text-[10px] uppercase font-black tracking-widest bg-muted/5">
          No outstanding tasks for this organization.
        </div>
      )}
    />
  );

  const renderCapBoard = (entries: AuditCapEntry[]) => {
    if (entries.length === 0) return null;

    const dueSoonWindow = new Date();
    dueSoonWindow.setDate(dueSoonWindow.getDate() + 7);
    const filteredCapEntries = entries.filter((entry) => {
      if (capFocusFilter === 'All') return true;
      if (capFocusFilter === 'Open') return entry.cap.status === 'Open';
      if (capFocusFilter === 'In Progress') return entry.cap.status === 'In Progress';
      if (capFocusFilter === 'Closed') return entry.cap.status === 'Closed' || entry.cap.status === 'Cancelled';
      const due = parseLocalDate(formatCapDueDate(entry.cap.dueDate || entry.audit.auditDate)).getTime();
      if (capFocusFilter === 'Overdue') {
        return due < auditCapWindow && entry.cap.status !== 'Closed' && entry.cap.status !== 'Cancelled';
      }
      if (capFocusFilter === 'Due Soon') {
        return due >= auditCapWindow && due <= dueSoonWindow.getTime() && entry.cap.status !== 'Closed' && entry.cap.status !== 'Cancelled';
      }
      if (capFocusFilter === 'Unassigned') {
        return !entry.cap.responsiblePersonId?.trim();
      }
      return true;
    });

    const columns: Array<{ label: string; statuses: CorrectiveActionPlan['status'][]; border: string; tone: string }> = [
      { label: 'Open', statuses: ['Open'], border: 'border-amber-200', tone: 'bg-amber-50 text-amber-900' },
    ];
    const sortEntries = (entriesToSort: AuditCapEntry[]) => [...entriesToSort].sort((a, b) => {
      const aOwner = getPersonnelDisplayName(personnel, a.cap.responsiblePersonId || '');
      const bOwner = getPersonnelDisplayName(personnel, b.cap.responsiblePersonId || '');
      const aDue = parseLocalDate(formatCapDueDate(a.cap.dueDate || a.audit.auditDate)).getTime();
      const bDue = parseLocalDate(formatCapDueDate(b.cap.dueDate || b.audit.auditDate)).getTime();
      if (capSortBy === 'Owner') {
        return aOwner.localeCompare(bOwner) || aDue - bDue;
      }
      return aDue - bDue || aOwner.localeCompare(bOwner);
    });

    return (
      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-card-border bg-background/70 overflow-hidden">
          <div className="sticky top-0 z-10 border-b border-card-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Audit Corrective Actions</p>
                <p className="text-sm font-medium text-muted-foreground">Track CAP ownership and movement through the corrective action lifecycle.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCapBoardCollapsed((value) => !value)}
                  className="h-7 px-3 text-[10px] font-black uppercase tracking-[0.08em]"
                >
                  {isCapBoardCollapsed ? 'Expand Board' : 'Collapse Board'}
                </Button>
                <div className="flex items-center gap-2 rounded-lg border border-card-border bg-muted/20 p-1">
                  {(['Due Date', 'Owner'] as const).map((sortMode) => (
                    <Button
                      key={sortMode}
                      type="button"
                      variant={capSortBy === sortMode ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCapSortBy(sortMode)}
                      className="h-7 px-3 text-[10px] font-black uppercase tracking-[0.08em]"
                    >
                      {sortMode}
                    </Button>
                  ))}
                </div>
                {(['All', 'Open', 'In Progress', 'Closed', 'Overdue', 'Due Soon', 'Unassigned'] as const).map((filter) => (
                  <Button
                    key={filter}
                    type="button"
                    variant={capFocusFilter === filter ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCapFocusFilter(filter)}
                    className="h-7 px-3 text-[10px] font-black uppercase tracking-[0.08em]"
                  >
                    {filter}
                  </Button>
                ))}
                <Badge variant="outline" className="h-6 border-amber-300 bg-amber-50 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">
                  {filteredCapEntries.length} Tasks
                </Badge>
              </div>
            </div>
          </div>
          <div className={cn('grid gap-3 p-4', columns.length > 1 ? 'lg:grid-cols-3' : 'grid-cols-1')}>
            {columns.map((column) => {
              const columnEntries = sortEntries(filteredCapEntries.filter((entry) => column.statuses.includes(entry.cap.status)));
              return (
                <div key={column.label} className={cn('w-full rounded-lg border bg-background/80 p-3', column.border)}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{column.label}</p>
                  </div>
                  {!isCapBoardCollapsed ? (
                    <div className="mt-3 space-y-3">
                      {columnEntries.length > 0 ? (
                        columnEntries.map((entry) => (
                        <AuditCapBoardCard
                          key={entry.cap.id}
                          cap={entry.cap}
                          audit={entry.audit}
                          observation={entry.observation}
                          findingLevel={entry.findingLevel}
                          personnel={personnel}
                          />
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-card-border bg-muted/5 px-3 py-6 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          No items
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-card-border bg-muted/5 px-3 py-6 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Board collapsed
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderOrgCard = (orgId: string | 'internal') => {
    const filteredTasks = allTasks.filter((task) => (orgId === 'internal' ? !task.organizationId : task.organizationId === orgId));
    const filteredAuditCaps = auditCapEntries.filter((entry) => (orgId === 'internal' ? !entry.audit.organizationId : entry.audit.organizationId === orgId));
    const remainingTasks = filteredTasks;
    const headerBandBorderStyle = { borderBottomColor: 'hsl(var(--card-border))' };

    return (
      <Card className="min-h-[400px] flex h-full flex-1 flex-col overflow-hidden shadow-none border">
        {shouldShowOrganizationTabs && (
          <div className="w-full border-b border-border px-4 py-3" style={headerBandBorderStyle}>
            <OrganizationTabsRow
              organizations={organizations || []}
              activeTab={activeOrgTab}
              onTabChange={setActiveOrgTab}
              className="border-0 bg-transparent px-0 py-0 shrink-0"
            />
          </div>
        )}
        <CardContent className="flex-1 min-h-0 p-0 bg-muted/5 overflow-hidden">
          <div className={cn('flex h-full min-h-0 flex-col overflow-y-auto', isMobile ? 'touch-pan-y' : '')}>
            {filteredAuditCaps.length > 0 ? renderCapBoard(filteredAuditCaps) : null}
            {remainingTasks.length > 0 ? (
              <div className="space-y-4 p-4">
                <div className="rounded-lg border border-card-border bg-background/70 overflow-hidden">
                  <div className="border-b border-card-border bg-muted/20 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Other Tasks</p>
                        <p className="text-sm font-medium text-muted-foreground">Supporting work that sits alongside the audit corrective actions.</p>
                      </div>
                      <Badge variant="outline" className="h-6 border-slate-300 bg-slate-50 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700">
                        {remainingTasks.length} Tasks
                      </Badge>
                    </div>
                  </div>
                  {renderTasksTable(remainingTasks)}
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full space-y-6 px-1 pt-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const showTabs = shouldShowOrganizationTabs;

  return (
    <div className={cn(
      'max-w-[1100px] mx-auto w-full flex flex-col gap-6 px-1 pt-4 pb-6 min-h-0',
      isMobile ? 'min-h-0 overflow-y-auto' : 'h-full overflow-hidden'
    )}>
      <Card className="border shadow-none overflow-hidden">
        <CardHeader className="border-b bg-muted/20 px-4 py-3">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Corrective Action Snapshot</p>
            <p className="text-sm font-medium text-muted-foreground">A project-style view of audit CAP ownership and deadlines.</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 py-4 sm:grid-cols-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Open CAPs</p>
            <p className="mt-1 text-2xl font-black text-amber-950">{auditCapSnapshot.open}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Due Soon</p>
            <p className="mt-1 text-2xl font-black text-amber-950">{auditCapSnapshot.dueSoon}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-700">Overdue</p>
            <p className="mt-1 text-2xl font-black text-red-950">{auditCapSnapshot.overdue}</p>
          </div>
        </CardContent>
      </Card>
      {!showTabs ? (
        renderOrgCard(scopedOrganizationId)
      ) : (
        <Tabs value={activeOrgTab} onValueChange={setActiveOrgTab} className={cn('w-full flex-1 min-h-0 flex flex-col', isMobile ? 'overflow-visible' : 'overflow-hidden')}>
          <div className={cn('flex-1 min-h-0', isMobile ? 'overflow-visible' : 'overflow-hidden')}>
            <TabsContent value="internal" className={cn('m-0 h-full flex min-h-0 flex-col p-0', isMobile ? 'min-h-0' : 'min-h-0')}>
              {renderOrgCard('internal')}
            </TabsContent>

            {(organizations || []).map((org) => (
              <TabsContent key={org.id} value={org.id} className={cn('m-0 h-full flex min-h-0 flex-col p-0', isMobile ? 'min-h-0' : 'min-h-0')}>
                {renderOrgCard(org.id)}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      )}
    </div>
  );
}
