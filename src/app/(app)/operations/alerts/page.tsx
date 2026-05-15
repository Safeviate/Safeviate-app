'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Alert } from '@/types/alert';
import { AlertForm } from './alert-form';
import { AlertCard } from './alert-card';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserProfile } from '@/hooks/use-user-profile';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ListFilter } from 'lucide-react';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';

export default function AlertsPage() {
  const { userProfile } = useUserProfile();
  const [activeTab, setActiveTab] = useState('red-tags');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { hasPermission } = usePermissions();
  const canCreateAlerts = hasPermission('operations-alerts-create');
  const canEditAlerts = hasPermission('operations-alerts-edit');
  const canDeleteAlerts = hasPermission('operations-alerts-delete');
  const organizationId = userProfile?.organizationId || 'default';

  useEffect(() => {
    let cancelled = false;
    const loadAlerts = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/alerts', { cache: 'no-store' });
        const payload = await res.json().catch(() => ({}));
        if (!cancelled) {
          const next = Array.isArray(payload.alerts) ? payload.alerts : [];
          setAlerts(
            next.filter((alert: Alert & { organizationId?: string | null }) => {
              const alertOrg = (alert as any).organizationId;
              return alertOrg == null || alertOrg === organizationId;
            })
          );
        }
      } catch {
        if (!cancelled) setAlerts([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadAlerts();
    window.addEventListener('safeviate-alerts-updated', loadAlerts);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-alerts-updated', loadAlerts);
    };
  }, [organizationId]);

  const persistAlert = async (alert: Alert & { organizationId?: string | null }) => {
    const isExisting = alerts.some((item) => item.id === alert.id);
    const url = isExisting ? `/api/alerts/${alert.id}` : '/api/alerts';
    const method = isExisting ? 'PATCH' : 'POST';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to save alert.');
    }
    window.dispatchEvent(new Event('safeviate-alerts-updated'));
  };

  const handleCreateAlert = (payload: {
    type: Alert['type'];
    title: string;
    content: string;
    signatureUrl?: string;
    mustRead?: boolean;
    createdBy: string;
  }) => {
    void persistAlert({
      id: crypto.randomUUID(),
      type: payload.type,
      title: payload.title,
      content: payload.content,
      createdAt: new Date().toISOString(),
      createdBy: payload.createdBy,
      status: 'Active',
      signatureUrl: payload.signatureUrl,
      mustRead: payload.mustRead,
      readBy: [],
      organizationId,
    } as Alert & { organizationId?: string | null });
  };

  const handleArchiveAlert = (alertId: string) => {
    const next = alerts.map((alert) => alert.id === alertId ? { ...alert, status: 'Archived' as const } : alert);
    const updated = next.find((alert) => alert.id === alertId);
    if (updated) void persistAlert(updated as Alert & { organizationId?: string | null });
    setAlerts(next);
  };

  const activeAlerts = useMemo(() => alerts.filter((alert) => alert.status === 'Active'), [alerts]);

  const redTags = useMemo(() => activeAlerts.filter(a => a.type === 'Red Tag'), [activeAlerts]);
  const yellowTags = useMemo(() => activeAlerts.filter(a => a.type === 'Yellow Tag'), [activeAlerts]);
  const companyNotices = useMemo(() => activeAlerts.filter(a => a.type === 'Company Notice'), [activeAlerts]);

  const tabs = [
    { value: 'red-tags', label: 'Red Tags', count: redTags.length },
    { value: 'yellow-tags', label: 'Yellow Tags', count: yellowTags.length },
    { value: 'company-notices', label: 'Company Notices', count: companyNotices.length },
  ];

  if (isLoading) {
    return (
      <div className="lg:max-w-[1100px] mx-auto w-full px-1 pt-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full mt-6" />
      </div>
    );
  }

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col h-full overflow-hidden px-1 pt-4">
      <Card className="w-full flex-1 flex flex-col min-h-0 overflow-hidden shadow-none border">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
          <ResponsiveTabRow
            value={activeTab}
            onValueChange={setActiveTab}
            placeholder="Select Filter"
            className="border-b bg-muted/5 px-3 py-2 shrink-0"
            centerTabs
            options={tabs.map((tab) => ({
              value: tab.value,
              label: `${tab.label} (${tab.count})`,
              icon: ListFilter,
            }))}
          />

          {canCreateAlerts ? (
            <div className="border-b bg-muted/5 px-3 py-2 shrink-0 flex justify-center">
              <AlertForm onCreate={handleCreateAlert} />
            </div>
          ) : null}

          <CardContent className="flex-1 min-h-0 overflow-hidden p-0 bg-muted/5">
            <TabsContent value="red-tags" className="mt-0 h-full min-h-0 overflow-y-auto no-scrollbar">
              <div className="space-y-4 px-4 py-4 sm:px-6 sm:pb-20">
                {redTags.length > 0 ? (
                  redTags.map(alert => <AlertCard key={alert.id} alert={alert} canManage={canEditAlerts} canDelete={canDeleteAlerts} onArchive={handleArchiveAlert} />)
                ) : (
                  <Card className="flex h-64 items-center justify-center shadow-none border bg-background">
                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest italic opacity-40">No active red tags.</p>
                  </Card>
                )}
              </div>
            </TabsContent>
            <TabsContent value="yellow-tags" className="mt-0 h-full min-h-0 overflow-y-auto no-scrollbar">
              <div className="space-y-4 px-4 py-4 sm:px-6 sm:pb-20">
                {yellowTags.length > 0 ? (
                  yellowTags.map(alert => <AlertCard key={alert.id} alert={alert} canManage={canEditAlerts} canDelete={canDeleteAlerts} onArchive={handleArchiveAlert} />)
                ) : (
                  <Card className="flex h-64 items-center justify-center shadow-none border bg-background">
                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest italic opacity-40">No active yellow tags.</p>
                  </Card>
                )}
              </div>
            </TabsContent>
            <TabsContent value="company-notices" className="mt-0 h-full min-h-0 overflow-y-auto no-scrollbar">
              <div className="space-y-4 px-4 py-4 sm:px-6 sm:pb-20">
                {companyNotices.length > 0 ? (
                  companyNotices.map(alert => <AlertCard key={alert.id} alert={alert} canManage={canEditAlerts} canDelete={canDeleteAlerts} onArchive={handleArchiveAlert} />)
                ) : (
                  <Card className="flex h-64 items-center justify-center shadow-none border bg-background">
                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest italic opacity-40">No active company notices.</p>
                  </Card>
                )}
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
