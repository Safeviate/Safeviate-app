'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EditSpiForm } from './edit-spi-form';
import type { SafetyReport } from '@/types/safety-report';
import type { Booking } from '@/types/booking';
import { SPICard } from './spi-card';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import type { SpiConfig, SpiConfigurations } from '@/types/spi';
import type { ExternalOrganization } from '@/types/quality';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { useOrganizationScope } from '@/hooks/use-organization-scope';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { HEADER_ACTION_BUTTON_CLASS, HEADER_COMPACT_CONTROL_CLASS, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-mobile';
import { OrganizationTabsRow } from '@/components/responsive-tab-row';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

const settingsDocId = 'spi-configurations';

export default function SafetyIndicatorsPage() {
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/safety/safety-indicators' });
  const [spiConfig, setSpiConfig] = useState<SpiConfig[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSpi, setSelectedSpi] = useState<SpiConfig | null>(null);
  const [activeOrgTab, setActiveOrgTab] = useState('internal');
  const isMobile = useIsMobile();

  const { tenantId } = useUserProfile();
  const { hasPermission } = usePermissions();
  const { scopedOrganizationId, shouldShowOrganizationTabs } = useOrganizationScope({ viewAllPermissionId: 'safety-indicators-view' });
  const { tenant } = useTenantConfig();

  const isAviation = tenant?.industry?.startsWith('Aviation') ?? true;

  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
        const [reportsRes, bookingsRes, orgsRes, spiRes] = await Promise.all([
          fetch('/api/safety-reports', { cache: 'no-store' }),
          fetch('/api/bookings', { cache: 'no-store' }),
          fetch('/api/external-organizations', { cache: 'no-store' }),
          fetch('/api/spi-configurations', { cache: 'no-store' }),
        ]);

        const [reportsPayload, bookingsPayload, orgsPayload, spiPayload] = await Promise.all([
          reportsRes.json().catch(() => ({ reports: [] })),
          bookingsRes.json().catch(() => ({ bookings: [] })),
          orgsRes.json().catch(() => ({ organizations: [] })),
          spiRes.json().catch(() => ({ configurations: [] })),
        ]);

        setReports(Array.isArray(reportsPayload.reports) ? reportsPayload.reports : []);
        setBookings(Array.isArray(bookingsPayload.bookings) ? bookingsPayload.bookings : []);
        setOrganizations(Array.isArray(orgsPayload.organizations) ? orgsPayload.organizations : []);
        setSpiConfig(Array.isArray(spiPayload.configurations) ? spiPayload.configurations : []);
    } catch (e) {
        console.error('Failed to load safety data', e);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const events = ['safeviate-safety-reports-updated', 'safeviate-bookings-updated', 'safeviate-external-organizations-updated', 'safeviate-spi-configurations-updated'];
    events.forEach(event => window.addEventListener(event, loadData));
    return () => events.forEach(event => window.removeEventListener(event, loadData));
  }, [loadData]);
  
  const saveConfigToLocal = useCallback(async (updatedConfig: SpiConfig[]) => {
    const configToSave: SpiConfigurations = {
        id: settingsDocId,
        configurations: JSON.parse(JSON.stringify(updatedConfig))
    };
    await fetch('/api/spi-configurations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configToSave),
    });
    window.dispatchEvent(new Event('safeviate-spi-configurations-updated'));
  }, []);

  const handleEdit = (spi: SpiConfig) => { setSelectedSpi(spi); setIsEditDialogOpen(true); };

  const handleSave = async (spiToSave: SpiConfig) => {
    const newConfig = spiToSave.id === 'new-spi' ? [...spiConfig, { ...spiToSave, id: `spi-${Date.now()}` }] : spiConfig.map(s => s.id === spiToSave.id ? spiToSave : s);
    setSpiConfig(newConfig);
    await saveConfigToLocal(newConfig);
    setIsEditDialogOpen(false);
    setSelectedSpi(null);
  };

  const handleMonthDataSave = async (spiId: string, monthIndex: number, newValue: number) => {
      const newConfig = spiConfig.map(spi => {
          if (spi.id === spiId) {
              const newMonthlyData = [...(spi.monthlyData || Array(12).fill(0))];
              newMonthlyData[monthIndex] = newValue;
              return { ...spi, monthlyData: newMonthlyData };
          }
          return spi;
      });
      setSpiConfig(newConfig);
      await saveConfigToLocal(newConfig);
  };

  const renderOrgCard = (orgId: string | 'internal') => {
    const contextOrgId = orgId === 'internal' ? null : orgId;
    const addIndicatorButton = (
      <Button
        size="sm"
        variant={isMobile ? 'outline' : 'default'}
        className={
          isMobile
            ? cn(HEADER_SECONDARY_BUTTON_CLASS, HEADER_COMPACT_CONTROL_CLASS, 'w-full justify-center px-2')
            : cn(HEADER_SECONDARY_BUTTON_CLASS, HEADER_COMPACT_CONTROL_CLASS, 'min-w-[160px] justify-center px-3')
        }
        onClick={() => {
          setSelectedSpi({
            id: 'new-spi',
            name: '',
            comparison: 'lower-is-better',
            unit: 'Count',
            periodLabel: 'Month',
            description: '',
            target: 0,
            levels: { acceptable: 0, monitor: 1, actionRequired: 2, urgentAction: 3 },
            monthlyData: Array(12).fill(0),
          });
          setIsEditDialogOpen(true);
        }}
        aria-label={isMobile ? 'Add indicator' : undefined}
      >
        <PlusCircle className={isMobile ? 'h-3.5 w-3.5' : 'mr-2 h-4 w-4'} />
        {!isMobile ? 'Add New Indicator' : null}
      </Button>
    );
    return (
      <Card className="flex-1 flex flex-col overflow-hidden shadow-none border rounded-xl h-full">
        <div className="sticky top-0 z-30 bg-card">
          <div className="border-b bg-muted/5 px-3 py-2">
            <p className="text-[10px] font-medium text-muted-foreground">
              {isAviation
                ? 'Track and monitor key safety metrics against organizational targets.'
                : 'Monitor critical occupational safety KPIs and target levels.'}
            </p>
          </div>
          {isMobile ? (
            <div className="border-b bg-muted/5 px-3 py-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                {shouldShowOrganizationTabs ? (
                  <div className="min-w-0">
                    <OrganizationTabsRow
                      organizations={organizations}
                      activeTab={activeOrgTab}
                      onTabChange={setActiveOrgTab}
                      className="border-0 bg-transparent px-0 py-0"
                    />
                  </div>
                ) : null}
                <div className="min-w-[88px]">
                  {addIndicatorButton}
                </div>
              </div>
            </div>
          ) : (
            <div className="border-b bg-muted/5 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                {shouldShowOrganizationTabs ? (
                  <OrganizationTabsRow organizations={organizations} activeTab={activeOrgTab} onTabChange={setActiveOrgTab} className="border-0 bg-transparent px-0 py-0" />
                ) : null}
                {addIndicatorButton}
              </div>
            </div>
          )}
        </div>
        <CardContent className="flex-1 p-6 overflow-y-auto no-scrollbar bg-background min-h-0">
          {spiConfig.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 pb-20 max-w-[1100px] mx-auto w-full">
              {spiConfig.map(spi => (
                <SPICard
                  key={spi.id}
                  spi={spi}
                  onEdit={handleEdit}
                  onDelete={async (id) => {
                    if (window.confirm('Delete this indicator?')) {
                      const nc = spiConfig.filter(s => s.id !== id);
                      setSpiConfig(nc);
                      await saveConfigToLocal(nc);
                    }
                  }}
                  reports={reports.filter(r => r.organizationId === contextOrgId) || []}
                  bookings={bookings.filter(b => b.organizationId === contextOrgId) || []}
                  onMonthDataSave={handleMonthDataSave}
                />
              ))}
            </div>
          ) : (
            <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-muted/10 px-6 py-16 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">No Indicators Configured</p>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Add your first safety indicator to start tracking month-by-month performance against your thresholds.
              </p>
              <Button
                size="sm"
                className={`mt-5 ${HEADER_ACTION_BUTTON_CLASS}`}
                onClick={() => {
                  setSelectedSpi({
                    id: 'new-spi',
                    name: '',
                    comparison: 'lower-is-better',
                    unit: 'Count',
                    periodLabel: 'Month',
                    description: '',
                    target: 0,
                    levels: { acceptable: 0, monitor: 1, actionRequired: 2, urgentAction: 3 },
                    monthlyData: Array(12).fill(0),
                  });
                  setIsEditDialogOpen(true);
                }}
              >
                <PlusCircle className="h-4 w-4" />
                Add First Indicator
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (isLoading) return <div className="max-w-[1100px] mx-auto w-full space-y-6 pt-4 px-1 h-full overflow-hidden"><Skeleton className="h-20 w-full" /><Skeleton className="flex-1 w-full" /></div>;
  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }
  const showTabs = shouldShowOrganizationTabs;

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col h-full overflow-hidden pt-4 px-1">
      {!showTabs ? renderOrgCard(scopedOrganizationId) : <Tabs value={activeOrgTab} onValueChange={setActiveOrgTab} className="w-full flex-1 flex flex-col overflow-hidden"><div className="flex-1 min-h-0 overflow-hidden flex flex-col"><TabsContent value="internal" className="mt-0 h-full flex flex-col flex-1 overflow-hidden">{renderOrgCard('internal')}</TabsContent>{organizations.map(org => (<TabsContent key={org.id} value={org.id} className="mt-0 h-full flex flex-col flex-1 overflow-hidden">{renderOrgCard(org.id)}</TabsContent>))}</div></Tabs>}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{selectedSpi?.id === 'new-spi' ? 'Create New Indicator' : `Edit Indicator: ${selectedSpi?.name}`}</DialogTitle><DialogDescription>Define targets and alert thresholds for this performance indicator.</DialogDescription></DialogHeader>{selectedSpi && <EditSpiForm spi={selectedSpi} onSave={handleSave} onCancel={() => setIsEditDialogOpen(false)} />}</DialogContent></Dialog>
    </div>
  );
}
