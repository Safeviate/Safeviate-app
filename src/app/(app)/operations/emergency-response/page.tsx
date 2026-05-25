'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Phone, AlertCircle, Megaphone, ScrollText, HelpCircle, FileSearch, Calculator } from 'lucide-react';
import { ContactsTab } from './contacts-tab';
import { TriggersTab } from './triggers-tab';
import { MediaTab } from './media-tab';
import { DiaryTab } from './diary-tab';
import { PhasesTab } from './phases-tab';
import { DocumentsTab } from './documents-tab';
import { EstimatorTab } from './estimator-tab';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import type { ExternalOrganization } from '@/types/quality';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Building2, ChevronDown, Play } from 'lucide-react';
import { HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-mobile';
import { CARD_HEADER_BAND_CLASS } from '@/components/page-header';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { PAGE_FORMAT_MOBILE_DARK_BUTTON_CLASS } from '@/lib/page-format-buttons';

export default function EmergencyResponsePage() {
  const { tenantId } = useUserProfile();
  const { hasPermission } = usePermissions();
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/operations/emergency-response' });
  const isMobile = useIsMobile();
  const [activeCompanyTab, setActiveCompanyTab] = useState('internal');
  const [activeTab, setActiveTab] = useState('diary');
  const [isStartOpen, setIsStartOpen] = useState(false);
  
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  useEffect(() => {
    fetch('/api/external-organizations', { cache: 'no-store' })
      .then(async (response) => {
        const payload = response.ok ? await response.json().catch(() => ({ organizations: [] })) : { organizations: [] };
        setOrganizations((payload.organizations || []) as ExternalOrganization[]);
      })
      .catch(() => setOrganizations([]));
  }, []);

  const tabs = [
    { value: 'diary', label: 'Live Diary', icon: ScrollText },
    { value: 'estimator', label: 'Safety Estimator', icon: Calculator },
    { value: 'documents', label: 'Evidence & Docs', icon: FileSearch },
    { value: 'contacts', label: 'Emergency Contacts', icon: Phone },
    { value: 'triggers', label: 'Response Triggers', icon: AlertCircle },
    { value: 'media', label: 'Media Release', icon: Megaphone },
    { value: 'phases', label: 'Phases Guide', icon: HelpCircle },
  ];

  const activeCompanyLabel =
    activeCompanyTab === 'internal'
      ? 'Internal'
      : organizations.find((organization) => organization.id === activeCompanyTab)?.name || 'Select Company';
  const canManageErp = hasPermission('operations-erp-manage');
  const erpDesktopButtonWidth = 'w-[240px]';
  const companySelector = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={
            isMobile
              ? PAGE_FORMAT_MOBILE_DARK_BUTTON_CLASS
              : `${HEADER_SECONDARY_BUTTON_CLASS} h-8 px-3 ${erpDesktopButtonWidth} justify-between`
          }
        >
          <Building2 className="h-4 w-4" />
          <span className="min-w-0 truncate">{activeCompanyLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[7000] min-w-[240px]">
        <DropdownMenuItem onClick={() => setActiveCompanyTab('internal')}>
          Internal
        </DropdownMenuItem>
        {organizations.map((organization) => (
          <DropdownMenuItem
            key={organization.id}
            onClick={() => setActiveCompanyTab(organization.id)}
          >
            {organization.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const startSessionButton = canManageErp ? (
    <Button
      type="button"
      variant="destructive"
      className={
        isMobile
          ? 'h-8 w-full justify-center gap-2 text-[9px] font-black uppercase tracking-[0.08em] shadow-sm'
          : `h-8 px-3 text-[9px] font-black uppercase tracking-[0.08em] shadow-sm ${erpDesktopButtonWidth} justify-center`
      }
      onClick={() => setIsStartOpen(true)}
    >
      <Play className={isMobile ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
      Start ERP Session
    </Button>
  ) : null;

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-3 h-full overflow-hidden px-2 sm:px-4 pt-4">
      <Card className="w-full flex-1 flex flex-col min-h-0 overflow-hidden shadow-none border">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
          {isMobile ? (
            <ResponsiveTabRow
              value={activeTab}
              onValueChange={setActiveTab}
              placeholder="Select Section"
              className="border-b bg-transparent px-2 py-1.5 shrink-0"
              leadingAction={companySelector}
              action={startSessionButton}
              centerTabs
              buttonLikeTabs
              options={tabs}
            />
          ) : (
            <div className="flex flex-col shrink-0">
              <div className={CARD_HEADER_BAND_CLASS}>
                <div className="flex items-center justify-between gap-3">
                  <div className="shrink-0">{companySelector}</div>
                  <div className="shrink-0">{startSessionButton}</div>
                </div>
              </div>
              <ResponsiveTabRow
                value={activeTab}
                onValueChange={setActiveTab}
                placeholder="Select Section"
                className={`${CARD_HEADER_BAND_CLASS} bg-transparent shrink-0`}
                centerTabs
                buttonLikeTabs
                options={tabs}
              />
            </div>
          )}

          <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
            <TabsContent value="diary" className="m-0 h-full min-h-0 overflow-y-auto no-scrollbar pb-10">
              <DiaryTab tenantId={tenantId || ''} startOpen={isStartOpen} onStartOpenChange={setIsStartOpen} />
            </TabsContent>
            <TabsContent value="estimator" className="m-0 h-full min-h-0 overflow-y-auto no-scrollbar pb-10">
              <EstimatorTab />
            </TabsContent>
            <TabsContent value="documents" className="m-0 h-full min-h-0 overflow-y-auto no-scrollbar pb-10">
              <DocumentsTab tenantId={tenantId || ''} />
            </TabsContent>
            <TabsContent value="contacts" className="m-0 h-full min-h-0 overflow-y-auto no-scrollbar pb-10">
              <ContactsTab tenantId={tenantId || ''} />
            </TabsContent>
            <TabsContent value="triggers" className="m-0 h-full min-h-0 overflow-y-auto no-scrollbar pb-10">
              <TriggersTab tenantId={tenantId || ''} />
            </TabsContent>
            <TabsContent value="media" className="m-0 h-full min-h-0 overflow-y-auto no-scrollbar pb-10">
              <MediaTab tenantId={tenantId || ''} />
            </TabsContent>
            <TabsContent value="phases" className="m-0 h-full min-h-0 overflow-y-auto no-scrollbar pb-10">
              <PhasesTab />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
