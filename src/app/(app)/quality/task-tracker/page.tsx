'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

import type { ManagementOfChange } from '@/types/moc';
import type { SafetyReport } from '@/types/safety-report';
import type { CorrectiveActionPlan, QualityAudit, ExternalOrganization } from '@/types/quality';
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
  sourceType: 'MOC' | 'Audit' | 'Safety Report';
  sourceIdentifier: string;
  link: string;
  assigneeId: string;
  assigneeName?: string;
  dueDate: string;
  status: 'Open' | 'In Progress' | 'Completed' | 'Closed' | 'Cancelled';
  organizationId?: string | null;
};

export default function TaskTrackerPage() {
  const { tenantId } = useUserProfile();
  const { scopedOrganizationId, shouldShowOrganizationTabs } = useOrganizationScope({ viewAllPermissionId: 'quality-tasks-view' });
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/quality/task-tracker' });
  const isMobile = useIsMobile();
  const [activeOrgTab, setActiveOrgTab] = useState('internal');

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

    const auditsMap = new Map((audits || []).map((a) => [a.id, a]));
    (caps || []).forEach((cap) => {
      const audit = auditsMap.get(cap.auditId);
      (cap.actions || []).forEach((action) => {
        if (action.status !== 'Closed' && action.status !== 'Cancelled') {
          tasks.push({
            id: action.id,
            description: action.description,
            sourceType: 'Audit',
            sourceIdentifier: audit?.auditNumber || 'Unknown Audit',
            link: `/quality/audits/${cap.auditId}`,
            assigneeId: action.responsiblePersonId,
            assigneeName: personnelMap.get(action.responsiblePersonId) || 'Unassigned',
            dueDate: action.deadline,
            status: action.status,
            organizationId: audit?.organizationId,
          });
        }
      });
    });

    return tasks.sort((a, b) => parseLocalDate(a.dueDate).getTime() - parseLocalDate(b.dueDate).getTime());
  }, [mocs, safetyReports, caps, audits, personnel, isLoading]);

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

  const renderTasksTable = (tasks: UnifiedTask[]) => (
    <ResponsiveCardGrid
      items={tasks}
      isLoading={false}
      className="p-4"
      gridClassName="sm:grid-cols-2 xl:grid-cols-3"
      renderItem={(task) => (
        <Card key={task.id} className="overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">{task.description}</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{task.sourceType} - {task.sourceIdentifier}</p>
            </div>
            <Badge variant={getStatusBadgeVariant(task.status)} className="text-[10px] font-black uppercase py-0.5 px-3">
              {task.status}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-background px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Assignee</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{task.assigneeName}</p>
              </div>
              <div className="rounded-lg border bg-background px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Due Date</p>
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

  const renderOrgCard = (orgId: string | 'internal') => {
    const filteredTasks = allTasks.filter((task) => (orgId === 'internal' ? !task.organizationId : task.organizationId === orgId));
    const headerBandBorderStyle = { borderBottomColor: 'hsl(var(--card-border))' };

    return (
      <Card className="min-h-[400px] flex flex-col shadow-none border">
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
        <CardContent className={cn('p-0', isMobile ? 'overflow-y-auto' : 'overflow-auto')}>
          {renderTasksTable(filteredTasks)}
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
    <div className={cn('max-w-[1100px] mx-auto w-full flex flex-col gap-6 px-1 pt-4', isMobile ? 'min-h-0 overflow-y-auto' : 'h-full')}>
      {!showTabs ? (
        renderOrgCard(scopedOrganizationId)
      ) : (
        <Tabs value={activeOrgTab} onValueChange={setActiveOrgTab} className={cn('w-full flex-1 flex flex-col', isMobile ? 'overflow-visible' : 'overflow-hidden')}>
          <div className={cn('flex-1 min-h-0', isMobile ? 'overflow-visible' : 'overflow-hidden')}>
            <TabsContent value="internal" className={cn('m-0 p-0', isMobile ? 'min-h-0' : 'h-full')}>
              {renderOrgCard('internal')}
            </TabsContent>

            {(organizations || []).map((org) => (
              <TabsContent key={org.id} value={org.id} className={cn('m-0 p-0', isMobile ? 'min-h-0' : 'h-full')}>
                {renderOrgCard(org.id)}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      )}
    </div>
  );
}
