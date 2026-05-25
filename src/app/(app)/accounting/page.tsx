'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MainPageHeader } from "@/components/page-header";
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { FileSpreadsheet, Calculator, Receipt, ListFilter, ChevronsUpDown, TrendingUp } from 'lucide-react';
import { BillingTable } from './billing-table';
import { CostPredictor } from './cost-predictor';
import { format } from 'date-fns';
import type { Booking } from '@/types/booking';
import type { Aircraft } from '@/types/aircraft';
import type { Personnel, PilotProfile } from '../users/personnel/page';
import { useIsMobile } from '@/hooks/use-mobile';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { useUserProfile } from '@/hooks/use-user-profile';
import { PAGE_FORMAT_MOBILE_MUTED_BUTTON_CLASS } from '@/lib/page-format-buttons';

export default function AccountingPage() {
  const { toast } = useToast();
  const { tenantId } = useUserProfile();
  const isMobile = useIsMobile();

  // --- Data States ---
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [allUsers, setAllUsers] = useState<(Personnel | PilotProfile)[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(() => {
    void (async () => {
      setIsLoading(true);
      try {
          const response = await fetch('/api/dashboard-summary', { cache: 'no-store' });
          const payload = await response.json().catch(() => ({ bookings: [], aircrafts: [], personnel: [], instructors: [], students: [] }));
          setBookings(Array.isArray(payload.bookings) ? payload.bookings : []);
          setAircrafts(Array.isArray(payload.aircrafts) ? payload.aircrafts : []);
          setAllUsers([
            ...(Array.isArray(payload.personnel) ? payload.personnel : []),
            ...(Array.isArray(payload.instructors) ? payload.instructors : []),
            ...(Array.isArray(payload.students) ? payload.students : []),
          ]);
      } catch (e) {
          console.error("Failed to load accounting data", e);
      } finally {
          setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    loadData();
    const events = ['safeviate-bookings-updated', 'safeviate-aircrafts-updated', 'safeviate-personnel-updated'];
    events.forEach(e => window.addEventListener(e, loadData));
    return () => events.forEach(e => window.removeEventListener(e, loadData));
  }, [loadData]);

  // --- State ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('unbilled');

  // --- Client-Side Processing ---
  const enrichedData = useMemo(() => {
    const completed = bookings.filter(b => b.status === 'Completed' && b.postFlightData && b.preFlightData);
    const sorted = [...completed].sort((a, b) => b.date.localeCompare(a.date));

    return {
      unbilled: sorted.filter(b => !b.accountingStatus || b.accountingStatus === 'Unbilled'),
      exported: sorted.filter(b => b.accountingStatus === 'Exported' || b.accountingStatus === 'Paid')
    };
  }, [bookings]);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const toggleAll = (ids: string[]) => {
    if (selectedIds.size === ids.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(ids));
  };

  const handleSageExport = async () => {
    if (selectedIds.size === 0) return;

    try {
      const selectedBookings = enrichedData.unbilled.filter(b => selectedIds.has(b.id));
      const aircraftMap = new Map(aircrafts.map(a => [a.id, a]));
      const userMap = new Map(allUsers.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

      const headers = ["Reference", "Date", "Customer", "Description", "Duration", "Rate", "Total", "Nominal Code"];
      const rows = selectedBookings.map(b => {
        const ac = aircraftMap.get(b.aircraftId);
        const duration = (b.postFlightData?.hobbs || 0) - (b.preFlightData?.hobbs || 0);
        const rate = ac?.hourlyRate || 0;
        return [
          b.bookingNumber,
          b.date,
          userMap.get(b.studentId || '') || "CASH_CLIENT",
          `Flight: ${ac?.tailNumber || b.aircraftId} (${b.type})`,
          duration.toFixed(1),
          rate.toFixed(2),
          (duration * rate).toFixed(2),
          "4000"
        ].join(",");
      });

      const csvContent = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `sage_export_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      await Promise.all(selectedBookings.map((booking) => fetch('/api/bookings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: { ...booking, accountingStatus: 'Exported' as const } }),
      })));

      window.dispatchEvent(new Event('safeviate-bookings-updated'));
      toast({ title: 'Export Successful', description: `${selectedIds.size} records prepared for Sage.` });
      setSelectedIds(new Set());
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Failed to export accounting records.',
      });
    }
  };

  const totalBillable = useMemo(() => {
    return enrichedData.unbilled.reduce((sum, b) => {
      const ac = aircrafts.find(a => a.id === b.aircraftId);
      const duration = (b.postFlightData?.hobbs || 0) - (b.preFlightData?.hobbs || 0);
      return sum + (duration * (ac?.hourlyRate || 0));
    }, 0);
  }, [enrichedData.unbilled, aircrafts]);

  if (isLoading) return <div className="p-8 space-y-6 px-1"><Skeleton className="h-14 w-full" /><Skeleton className="h-[400px] w-full" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full px-1 overflow-hidden">
      <Card className="flex-grow flex flex-col shadow-none border overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
          <MainPageHeader 
            title="Flight Billing"
            actions={
              <Button 
                size="sm"
                variant={isMobile ? "outline" : "default"}
                className={isMobile ? PAGE_FORMAT_MOBILE_MUTED_BUTTON_CLASS : "h-9 px-6 text-[10px] font-black uppercase tracking-tight shadow-md gap-2 shrink-0"} 
                onClick={handleSageExport} 
                disabled={selectedIds.size === 0 || activeTab !== 'unbilled'}
              >
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className={isMobile ? "h-3.5 w-3.5" : "h-4 w-4"} />
                  {isMobile ? `Export (${selectedIds.size})` : `Export to Sage (${selectedIds.size})`}
                </span>
                {isMobile ? <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
              </Button>
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 lg:p-6 border-b bg-muted/5 shrink-0">
            <div className="flex items-center gap-4 bg-background p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Calculator className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground/75">Pending Billing</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-foreground">${totalBillable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span className="text-[10px] font-bold uppercase text-foreground/75">{enrichedData.unbilled.length} FLIGHTS</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-background p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                <Receipt className="h-5 w-5 text-green-600" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground/75">Sync History</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-foreground">{enrichedData.exported.length}</span>
                  <span className="text-[10px] font-bold uppercase text-foreground/75">SUCCESSFUL</span>
                </div>
              </div>
            </div>
          </div>

          <ResponsiveTabRow
            value={activeTab}
            onValueChange={setActiveTab}
            placeholder="Filter View"
            className="border-b bg-muted/5 px-3 py-2 shrink-0"
            options={[
              { value: 'unbilled', label: `Unbilled Flights (${enrichedData.unbilled.length})`, icon: ListFilter },
              { value: 'exported', label: `Export History (${enrichedData.exported.length})`, icon: ListFilter },
              { value: 'predictor', label: `Usage Estimator`, icon: TrendingUp },
            ]}
          />

          <CardContent className="flex-1 p-0 overflow-hidden">
            <TabsContent value="unbilled" className="m-0 h-full overflow-auto">
              <BillingTable 
                bookings={enrichedData.unbilled} 
                aircrafts={aircrafts} 
                personnel={allUsers}
                selectedIds={selectedIds}
                onToggleSelection={toggleSelection}
                onToggleAll={toggleAll}
              />
            </TabsContent>

            <TabsContent value="exported" className="m-0 h-full overflow-auto">
              <BillingTable 
                bookings={enrichedData.exported} 
                aircrafts={aircrafts} 
                personnel={allUsers}
                selectedIds={new Set()}
                onToggleSelection={() => {}}
                onToggleAll={() => {}}
              />
            </TabsContent>

            <TabsContent value="predictor" className="m-0 h-full overflow-auto">
              <CostPredictor />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
