'use client';

import { use, useMemo, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import type { QualityAudit, QualityAuditChecklistTemplate, CorrectiveActionPlan } from '@/types/quality';
import { AuditChecklist } from './audit-checklist';
import type { FindingLevelsSettings } from '@/app/(app)/admin/features/page';
import { Progress } from '@/components/ui/progress';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { Badge } from '@/components/ui/badge';
import { BackNavButton } from '@/components/back-nav-button';
import { usePageLayout } from '@/hooks/use-page-layout';

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, 12);
};

interface AuditDetailPageProps {
  params: Promise<{ auditId: string }>;
}

export default function AuditDetailPage({ params }: AuditDetailPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { tenantId, userProfile } = useUserProfile();
  const { hasPermission } = usePermissions();
  const { isPageEnabled } = usePageLayout('audits');
  const auditId = resolvedParams.auditId;

  const [audit, setAudit] = useState<QualityAudit | null>(null);
  const [template, setTemplate] = useState<QualityAuditChecklistTemplate | null>(null);
  const [findingLevelsSettings, setFindingLevelsSettings] = useState<FindingLevelsSettings | null>(null);
  const [caps, setCaps] = useState<CorrectiveActionPlan[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/quality-audits', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ audits: [], templates: [], caps: [], personnel: [], findingLevels: [] }));
        const foundAudit = (payload.audits as QualityAudit[] | undefined)?.find(a => a.id === auditId);
        if (!cancelled && foundAudit) {
            setAudit(foundAudit);
            setTemplate((payload.templates as QualityAuditChecklistTemplate[] | undefined)?.find(t => t.id === foundAudit.templateId) || null);
            setCaps((payload.caps as CorrectiveActionPlan[] | undefined)?.filter(c => c.auditId === auditId) || []);
        }
        if (!cancelled) {
          setPersonnel(Array.isArray(payload.personnel) ? payload.personnel : []);
          setFindingLevelsSettings(Array.isArray(payload.findingLevels) ? payload.findingLevels : null);
        }
      } catch (e) {
        console.error('Failed to load audit details', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [auditId]);

  // SECURITY: Scoped visibility guard
  useEffect(() => {
    if (!isLoading && audit && userProfile) {
        const canViewAll = hasPermission('quality-audits-view-all');
        const userOrgId = userProfile.organizationId;
        
        if (!canViewAll && userOrgId && audit.organizationId !== userOrgId) {
            router.push('/quality/audits');
        }
    }
  }, [isLoading, audit, userProfile, hasPermission, router]);

  const enrichedAudit = useMemo(() => {
    if (!audit || !template) return null;
    return { ...audit, template };
  }, [audit, template]);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-[1100px] mx-auto w-full pt-4 px-1">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[600px] w-full" />
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

  if (!audit || !enrichedAudit) {
    return (
      <div className="max-w-[1100px] mx-auto w-full text-center py-20 px-1">
        <p className="text-muted-foreground mb-4">Audit record not found.</p>
        <BackNavButton href="/quality/audits" text="Back to Audits" />
      </div>
    );
  }
  
  const scoreColor = audit.complianceScore && audit.complianceScore >= 80 
    ? "bg-green-500" 
    : audit.complianceScore && audit.complianceScore >= 60
    ? "bg-yellow-500"
    : "bg-red-500";

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col h-full overflow-hidden pt-4 px-1">
      <Card className="flex-1 flex flex-col overflow-hidden shadow-none border rounded-xl">
        <CardHeader className="shrink-0 border-b bg-muted/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl font-black uppercase truncate">Audit {audit.auditNumber}: {audit.title}</CardTitle>
            </div>
            <CardDescription className="text-sm font-medium">
              Performed on {format(parseLocalDate(audit.auditDate), 'PPP')} • Status: <Badge variant="outline" className="text-[10px] h-5 py-0 uppercase font-black border-primary/20 bg-primary/5 text-primary">{audit.status}</Badge>
            </CardDescription>
          </div>

          {typeof audit.complianceScore === 'number' && (
            <div className="text-left md:text-right min-w-[200px]">
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Compliance Score</p>
              <div className="flex items-center gap-3 justify-start md:justify-end">
                <span className="text-3xl font-black text-primary">{audit.complianceScore}%</span>
                <Progress value={audit.complianceScore} className="w-24 h-2" indicatorClassName={scoreColor} />
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 p-0 overflow-hidden bg-background">
          <AuditChecklist 
              audit={enrichedAudit} 
              tenantId={tenantId!}
              findingLevels={findingLevelsSettings?.levels || []}
              caps={caps || []}
              personnel={personnel || []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
