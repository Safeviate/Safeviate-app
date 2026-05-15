'use client';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { PlusCircle, Edit, Settings2, Trash2, Plus, LayoutGrid, MoreHorizontal, ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { Risk, Mitigation } from '@/types/risk';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import type { ExternalOrganization } from '@/types/quality';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { RiskForm } from './risk-form';
import { getRiskScoreStyle, getAlphanumericRisk } from './utils';
import { cn } from '@/lib/utils';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { useOrganizationScope } from '@/hooks/use-organization-scope';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CardControlHeader, HEADER_COMPACT_CONTROL_CLASS, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-mobile';
import { OrganizationTabsRow, ResponsiveTabRow } from '@/components/responsive-tab-row';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTabVisibility } from '@/hooks/use-tab-visibility';

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, 12);
};

function ManageAreasDialog({ settings, trigger, onAreasChange }: { settings: string[]; trigger?: ReactNode; onAreasChange?: (areas: string[]) => void }) {
  const { toast } = useToast();
  const [newArea, setNewArea] = useState('');
  const [areas, setAreas] = useState<string[]>(settings);

  useEffect(() => {
    setAreas(settings);
  }, [settings]);

  const save = async (updatedAreas: string[]) => {
    await fetch('/api/risk-register/areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ areas: updatedAreas }),
    });
    onAreasChange?.(updatedAreas);
    window.dispatchEvent(new Event('safeviate-risk-register-updated'));
    toast({ title: 'Hazard Areas Updated' });
  };

  const handleAdd = () => {
    if (newArea.trim() && !areas.includes(newArea.trim())) {
      const updated = [...areas, newArea.trim()];
      setAreas(updated);
      save(updated);
      setNewArea('');
    }
  };

  const handleRemove = (areaToRemove: string) => {
    const updated = areas.filter((a) => a !== areaToRemove);
    setAreas(updated);
    save(updated);
  };

  return (
    <Dialog>
        <DialogTrigger asChild>
          {trigger || (
            <Button
              variant="outline"
              size="sm"
              className={cn(HEADER_SECONDARY_BUTTON_CLASS, HEADER_COMPACT_CONTROL_CLASS, 'min-w-[160px] justify-between px-3')}
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Manage Areas</span>
            </Button>
          )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Risk Register Categories</DialogTitle>
          <DialogDescription>Add or remove the menu tabs used to organize your hazard register.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="New area name..."
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <Button size="icon" onClick={handleAdd} disabled={!newArea.trim()} className="bg-emerald-700">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {areas.map((area) => (
              <div key={area} className="flex items-center justify-between p-2 rounded-md bg-muted/50 border">
                <span className="text-sm font-medium">{area}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemove(area)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RiskRegisterPage() {
  const { tenantId } = useUserProfile();
  const { hasPermission } = usePermissions();
  const { scopedOrganizationId, shouldShowOrganizationTabs } = useOrganizationScope({ viewAllPermissionId: 'risk-register-view' });
  const { isPageEnabled, isSectionEnabled } = usePageLayout('risk-register');
  const isMobile = useIsMobile();

  const [activeOrgTab, setActiveOrgTab] = useState('internal');
  const [activeAreaTab, setActiveAreaTab] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [allRisks, setAllRisks] = useState<Risk[]>([]);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [hazardAreas, setHazardAreas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const canManageAreas = hasPermission('risk-register-manage-definitions');

  useEffect(() => {
    let cancelled = false;
    const loadAreas = async () => {
      try {
        const response = await fetch('/api/risk-register/areas', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ areas: [] }));
        if (!cancelled) setHazardAreas(Array.isArray(payload.areas) ? payload.areas : []);
      } catch {
        if (!cancelled) setHazardAreas([]);
      }
    };
    void loadAreas();
    const handleAreasUpdated = () => {
      void loadAreas();
    };
    window.addEventListener('safeviate-risk-register-updated', handleAreasUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-risk-register-updated', handleAreasUpdated);
    };
  }, []);

  useEffect(() => {
    if (!hazardAreas.length) {
      if (activeAreaTab) setActiveAreaTab('');
      return;
    }
    if (!hazardAreas.includes(activeAreaTab)) {
      setActiveAreaTab(hazardAreas[0]);
    }
  }, [hazardAreas, activeAreaTab]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [personnelResponse, riskResponse, orgResponse] = await Promise.all([
          fetch('/api/personnel', { cache: 'no-store' }),
          fetch('/api/risk-register', { cache: 'no-store' }),
          fetch('/api/external-organizations', { cache: 'no-store' }),
        ]);
        const [personnelPayload, riskPayload, orgPayload] = await Promise.all([
          personnelResponse.json().catch(() => ({ personnel: [] })),
          riskResponse.json().catch(() => ({ risks: [] })),
          orgResponse.json().catch(() => ({ organizations: [] })),
        ]);
        if (!cancelled) {
          setPersonnel(personnelPayload?.personnel ?? []);
          setOrganizations(orgPayload?.organizations ?? []);
          setAllRisks(riskPayload?.risks ?? []);
        }
      } catch {
        if (!cancelled) {
          setPersonnel([]);
          setAllRisks([]);
          setOrganizations([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const personnelMap = useMemo(() => {
    if (!personnel) return new Map<string, string>();
    return new Map(personnel.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  }, [personnel]);

  const handleEditClick = (risk: Risk) => setEditingRisk(risk);
  const showTabs = useTabVisibility('risk-register', shouldShowOrganizationTabs) && isSectionEnabled('organization-scope');
  const showHazardAreaTabs = isSectionEnabled('hazard-areas');

  const renderRiskTable = (risks: Risk[], emptyMessage: string) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/30 sticky top-0 z-10">
          <TableRow>
            <TableHead className="w-[15%] text-[10px] uppercase font-bold tracking-wider">Hazard</TableHead>
            <TableHead className="w-[15%] text-[10px] uppercase font-bold tracking-wider">Risk</TableHead>
            <TableHead className="text-[10px] uppercase font-bold tracking-wider">Initial</TableHead>
            <TableHead className="w-[20%] text-[10px] uppercase font-bold tracking-wider">Mitigation</TableHead>
            <TableHead className="text-[10px] uppercase font-bold tracking-wider">Residual</TableHead>
            <TableHead className={cn('text-[10px] uppercase font-bold tracking-wider', isMobile && 'hidden')}>Responsible</TableHead>
            <TableHead className={cn('text-[10px] uppercase font-bold tracking-wider', isMobile && 'hidden')}>Review</TableHead>
            <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
          </TableRow>
        </TableHeader>
        {risks.length > 0 ? (
          risks.map((hazard) => (
            <tbody key={hazard.id} className="border-b">
              <RiskGroup hazard={hazard} personnelMap={personnelMap} onEditClick={handleEditClick} isMobile={isMobile} />
            </tbody>
          ))
        ) : (
          <tbody>
            <TableRow>
              <TableCell colSpan={isMobile ? 6 : 8} className="h-48 text-center text-muted-foreground italic text-sm">
                {emptyMessage}
              </TableCell>
            </TableRow>
          </tbody>
        )}
      </Table>
    </div>
  );

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

  const renderOrgCard = (orgId: string | 'internal') => {
    const orgRisks = (allRisks || []).filter((r) => (orgId === 'internal' ? !r.organizationId : r.organizationId === orgId));
    const uncategorizedRisks = orgRisks.filter((r) => !hazardAreas.includes(r.hazardArea) && r.status === 'Open');
    const displayAreas = uncategorizedRisks.length > 0 ? [...hazardAreas, 'Uncategorized'] : hazardAreas;

    return (
        <Card className="flex-1 flex flex-col overflow-hidden shadow-none border rounded-xl max-w-[1100px] w-full mx-auto">
        <CardControlHeader
          isMobile={isMobile}
          context={showTabs ? (
            <div className="space-y-2">
              <OrganizationTabsRow
                organizations={organizations || []}
                activeTab={activeOrgTab}
                onTabChange={setActiveOrgTab}
                className="border-0 bg-transparent px-0 py-0"
              />
            </div>
          ) : undefined}
          mobileContext={showTabs ? (
            <div className="space-y-2">
              <OrganizationTabsRow
                organizations={organizations || []}
                activeTab={activeOrgTab}
                onTabChange={setActiveOrgTab}
                className="border-0 bg-transparent px-0 py-0"
              />
            </div>
          ) : undefined}
          actions={
            isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(HEADER_SECONDARY_BUTTON_CLASS, HEADER_COMPACT_CONTROL_CLASS, 'w-full justify-between px-3')}
                  >
                    <span className="flex items-center gap-2">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                      Actions
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]"
                >
                  {canManageAreas && <ManageAreasDialog settings={hazardAreas} onAreasChange={setHazardAreas} trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><Settings2 className="mr-2 h-4 w-4" />Manage Areas</DropdownMenuItem>} />}
                  <DropdownMenuItem asChild>
                    <Link href={`/safety/risk-register/new?orgId=${orgId}`}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add Hazard
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex w-full items-center gap-3 sm:w-auto">
                {canManageAreas && <ManageAreasDialog settings={hazardAreas} onAreasChange={setHazardAreas} />}
                <Button asChild size="sm" className={cn(HEADER_SECONDARY_BUTTON_CLASS, HEADER_COMPACT_CONTROL_CLASS)}>
                  <Link href={`/safety/risk-register/new?orgId=${orgId}`}>
                    <PlusCircle className="h-4 w-4" />
                    Add Hazard
                  </Link>
                </Button>
              </div>
            )
          }
          navigation={
            <p className="text-[10px] font-medium text-muted-foreground">
              Central log for identifying, assessing, and mitigating operational hazards.
            </p>
          }
        />
        <CardContent className="flex-1 p-0 overflow-hidden bg-background">
          {showHazardAreaTabs ? (
            <Tabs value={activeAreaTab} onValueChange={setActiveAreaTab} className="h-full flex flex-col">
              {displayAreas.length > 0 ? (
                <ResponsiveTabRow
                  value={activeAreaTab}
                  onValueChange={setActiveAreaTab}
                  placeholder="Select Area"
                  className="border-b bg-muted/5 px-3 py-2 shrink-0"
                  options={displayAreas.map((area) => ({ value: area, label: area, icon: LayoutGrid }))}
                />
              ) : (
                <div className="bg-muted/5 px-3 py-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">No Risk Areas Configured</p>
                  <p className="mt-1 text-sm text-muted-foreground">Use Manage Areas to add the tabs you want for this register.</p>
                </div>
              )}
              <div className="flex-1 overflow-auto">
                {displayAreas.map((area) => {
                  const areaRisks = area === 'Uncategorized' ? uncategorizedRisks : orgRisks.filter((r) => r.hazardArea === area && r.status === 'Open');
                  return (
                    <TabsContent key={area} value={area} className="mt-0 h-full">
                      {renderRiskTable(areaRisks, 'No open risks in this area.')}
                    </TabsContent>
                  );
                })}
              </div>
            </Tabs>
          ) : (
            <div className="h-full overflow-auto">
              {renderRiskTable(orgRisks.filter((risk) => risk.status === 'Open'), 'No open risks found for this organization.')}
            </div>
          )}
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

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden pt-4 px-1">
      {!showTabs ? (
        renderOrgCard(scopedOrganizationId)
      ) : (
        <Tabs value={activeOrgTab} onValueChange={setActiveOrgTab} className="w-full flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            <TabsContent value="internal" className="mt-0 h-full">{renderOrgCard('internal')}</TabsContent>
            {(organizations || []).map((org) => (
              <TabsContent key={org.id} value={org.id} className="mt-0 h-full">{renderOrgCard(org.id)}</TabsContent>
            ))}
          </div>
        </Tabs>
      )}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 shrink-0 border-b bg-muted/5">
            <DialogTitle>Edit Hazard Details</DialogTitle>
            <DialogDescription>Update hazard descriptions and reassess associated risks.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
            <div className="py-4">
              <RiskForm hideHeader existingRisk={editingRisk} personnel={personnel || []} onCancel={() => setIsDialogOpen(false)} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RiskGroup({ hazard, personnelMap, onEditClick, isMobile }: { hazard: Risk; personnelMap: Map<string, string>; onEditClick: (risk: Risk) => void; isMobile?: boolean }) {
  const hazardRisks = hazard.risks || [];
  const totalRowsForHazard = hazardRisks.reduce((acc, r) => acc + Math.max(1, (r.mitigations || []).length), 0);

  if (hazardRisks.length === 0) {
    return (
      <TableRow>
        <TableCell className="font-bold text-sm text-primary whitespace-normal align-top">{hazard.hazard}</TableCell>
        <TableCell colSpan={isMobile ? 4 : 6} className="text-center text-muted-foreground text-xs italic">No risks defined.</TableCell>
        <TableCell className="text-right align-top">
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted" onClick={() => onEditClick(hazard)}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  let isFirstRowOfHazard = true;
  return hazardRisks.flatMap((risk, riskIndex) => {
    const mitigations = (risk.mitigations && risk.mitigations.length > 0) ? risk.mitigations : [{} as Mitigation];
    const riskRowSpan = mitigations.length;
    return mitigations.map((mitigation, mitigationIndex) => {
      const showHazardCell = isFirstRowOfHazard;
      if (isFirstRowOfHazard) isFirstRowOfHazard = false;
      const isFirstRowOfRisk = mitigationIndex === 0;
      const isLastRowOfRisk = mitigationIndex === mitigations.length - 1;
      return (
        <TableRow key={`${hazard.id}-${risk.id}-${mitigation.id || mitigationIndex}`} className="border-0">
          {showHazardCell && <TableCell rowSpan={totalRowsForHazard} className="font-bold text-sm text-primary whitespace-normal align-top pt-4">{hazard.hazard}</TableCell>}
          {isFirstRowOfRisk && <TableCell rowSpan={riskRowSpan} className={cn('whitespace-normal align-top text-sm font-medium pt-4', isLastRowOfRisk ? '' : 'border-b')}>{risk.description}</TableCell>}
          {isFirstRowOfRisk && (
            <TableCell rowSpan={riskRowSpan} className={cn('align-top pt-4', isLastRowOfRisk ? '' : 'border-b')}>
              {risk.initialRiskAssessment?.likelihood !== undefined && risk.initialRiskAssessment?.severity !== undefined && (
                <Badge className="text-[10px] h-5 font-black" style={getRiskScoreStyle(risk.initialRiskAssessment.riskScore)}>
                  {getAlphanumericRisk(risk.initialRiskAssessment.likelihood, risk.initialRiskAssessment.severity)}
                </Badge>
              )}
            </TableCell>
          )}
          <TableCell className="text-xs font-medium py-4">{mitigation.description}</TableCell>
          <TableCell className="py-4">
            {mitigation.residualRiskAssessment?.likelihood !== undefined && mitigation.residualRiskAssessment?.severity !== undefined ? (
              <Badge className="text-[10px] h-5 font-black" style={getRiskScoreStyle(mitigation.residualRiskAssessment.riskScore)}>
                {getAlphanumericRisk(mitigation.residualRiskAssessment.likelihood, mitigation.residualRiskAssessment.severity)}
              </Badge>
            ) : <Badge variant="outline" className="text-[10px] h-5 opacity-50 font-black">N/A</Badge>}
          </TableCell>
          <TableCell className={cn('text-xs font-bold whitespace-nowrap py-4', isMobile && 'hidden')}>{personnelMap.get(mitigation.responsiblePersonId) || 'N/A'}</TableCell>
          <TableCell className={cn('text-xs font-bold whitespace-nowrap py-4', isMobile && 'hidden')}>{mitigation.reviewDate ? format(parseLocalDate(mitigation.reviewDate), 'dd MMM yy') : 'N/A'}</TableCell>
          {showHazardCell && (
            <TableCell rowSpan={totalRowsForHazard} className="text-right align-top pt-4">
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted" onClick={() => onEditClick(hazard)}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
            </TableCell>
          )}
        </TableRow>
      );
    });
  });
}
