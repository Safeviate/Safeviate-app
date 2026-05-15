'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MainPageHeader } from "@/components/page-header";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { FileSpreadsheet, Eye, Printer, X, Calculator, Receipt, ListFilter, ChevronDown, MoreHorizontal } from 'lucide-react';
import { BillingTable } from './billing-table';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Booking } from '@/types/booking';
import type { Aircraft } from '@/types/aircraft';
import type { Personnel, PilotProfile } from '@/app/(app)/users/personnel/page';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { useIsMobile } from '@/hooks/use-mobile';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';

export default function AccountingPage() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { tenantId } = useUserProfile();
  const { hasPermission } = usePermissions();
  const canViewAccounting = hasPermission('accounting-view') || hasPermission('accounting-manage') || hasPermission('admin-view');
  const canExportAccounting = hasPermission('accounting-export') || hasPermission('accounting-manage') || hasPermission('admin-view');

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [instructors, setInstructors] = useState<PilotProfile[]>([]);
  const [students, setStudents] = useState<PilotProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(() => {
    void (async () => {
      setIsLoading(true);
      try {
          const response = await fetch('/api/dashboard-summary', { cache: 'no-store' });
          const payload = await response.json().catch(() => ({ bookings: [], aircrafts: [], personnel: [], instructors: [], students: [] }));
          setBookings(Array.isArray(payload.bookings) ? payload.bookings : []);
          setAircrafts(Array.isArray(payload.aircrafts) ? payload.aircrafts : []);
          setPersonnel(Array.isArray(payload.personnel) ? payload.personnel : []);
          setInstructors(Array.isArray(payload.instructors) ? payload.instructors : []);
          setStudents(Array.isArray(payload.students) ? payload.students : []);
      } catch (e) {
          console.error("Failed to load accounting data", e);
      } finally {
          setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('safeviate-bookings-updated', loadData);
    window.addEventListener('safeviate-aircrafts-updated', loadData);
    window.addEventListener('safeviate-personnel-updated', loadData);
    return () => {
        window.removeEventListener('safeviate-bookings-updated', loadData);
        window.removeEventListener('safeviate-aircrafts-updated', loadData);
        window.removeEventListener('safeviate-personnel-updated', loadData);
    };
  }, [loadData]);

  const allUsers = useMemo(() => [
    ...(personnel || []),
    ...(instructors || []),
    ...(students || [])
  ], [personnel, instructors, students]);

  // --- State ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('unbilled');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // --- Client-Side Processing ---
  const enrichedData = useMemo(() => {
    if (!bookings) return { unbilled: [], exported: [] };

    // Filter for completed flights with tech logs
    const completed = bookings.filter(b => b.status === 'Completed' && b.postFlightData && b.preFlightData);

    // Sort by date (latest first)
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

  const previewData = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const selectedBookings = enrichedData.unbilled.filter(b => selectedIds.has(b.id));
    const aircraftMap = new Map(aircrafts?.map(a => [a.id, a]));
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    return selectedBookings.map(b => {
      const ac = aircraftMap.get(b.aircraftId);
      const user = userMap.get(b.studentId || '');
      const duration = (b.postFlightData?.hobbs || 0) - (b.preFlightData?.hobbs || 0);
      const rate = ac?.hourlyRate || 0;
      
      return {
        reference: b.bookingNumber,
        date: b.date,
        customerId: user?.userNumber || "CASH",
        customerName: user ? `${user.firstName} ${user.lastName}` : "CASH_CLIENT",
        description: `Flight: ${ac?.tailNumber || b.aircraftId} (${b.type})`,
        duration: duration.toFixed(1),
        rate: rate.toFixed(2),
        total: (duration * rate).toFixed(2),
        nominalCode: "4000",
        id: b.id
      };
    });
  }, [selectedIds, enrichedData.unbilled, aircrafts, allUsers]);

  const handleSageExport = async () => {
    if (selectedIds.size === 0) return;
    if (!canExportAccounting) {
      toast({ variant: 'destructive', title: 'Permission Denied', description: 'You do not have permission to export accounting records.' });
      return;
    }

    try {
      const selectedBookings = enrichedData.unbilled.filter((booking) => selectedIds.has(booking.id));
      const headers = ["Reference", "Date", "Customer ID", "Customer Name", "Description", "Duration", "Rate", "Total", "Nominal Code"];
      const rows = previewData.map(d => [
        d.reference,
        d.date,
        d.customerId,
        d.customerName,
        d.description,
        d.duration,
        d.rate,
        d.total,
        d.nominalCode
      ].join(","));

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
      setIsPreviewOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Export Failed', description: e.message });
    }
  };

  const totalBillable = useMemo(() => {
    return enrichedData.unbilled.reduce((sum, b) => {
      const ac = aircrafts?.find(a => a.id === b.aircraftId);
      const duration = (b.postFlightData?.hobbs || 0) - (b.preFlightData?.hobbs || 0);
      return sum + (duration * (ac?.hourlyRate || 0));
    }, 0);
  }, [enrichedData.unbilled, aircrafts]);

  if (isLoading) return <div className="p-8 space-y-6 px-1"><Skeleton className="h-14 w-full" /><Skeleton className="h-[400px] w-full" /></div>;

  if (!canViewAccounting) {
    return (
      <div className="max-w-[1100px] mx-auto w-full px-1 pt-4">
        <Card className="shadow-none border">
          <CardContent className="flex min-h-[320px] items-center justify-center p-8 text-center">
            <div className="space-y-2">
              <p className="text-lg font-black uppercase tracking-tight">Access Denied</p>
              <p className="text-sm text-muted-foreground">You do not have permission to view accounting records.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full px-1 pt-4 overflow-hidden">
      <Card className="flex-grow flex flex-col shadow-none border overflow-hidden">
        <Tabs defaultValue="unbilled" onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
          <MainPageHeader 
            title="Flight Billing (Admin)"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 lg:p-6 border-b bg-muted/5 shrink-0">
            <div className="flex items-center gap-4 bg-background p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Calculator className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground/75">Pending Revenue</p>
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

          <div className="border-b bg-muted/5 shrink-0">
            <ResponsiveTabRow
              value={activeTab}
              onValueChange={setActiveTab}
              placeholder="Filter View"
              className="px-3 py-2"
              options={[
                { value: 'unbilled', label: `Unbilled Flights (${enrichedData.unbilled.length})`, icon: ListFilter },
                { value: 'exported', label: `Export History (${enrichedData.exported.length})`, icon: ListFilter },
              ]}
            />
            <div className="flex flex-wrap justify-end gap-2 px-6 pb-3">
              {isMobile ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectedIds.size === 0 || activeTab !== 'unbilled' || !canExportAccounting}
                      className="h-9 w-full justify-between border-border bg-background px-3 text-[10px] font-bold uppercase text-foreground shadow-sm hover:bg-muted/40"
                    >
                      <span className="flex items-center gap-2">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                        Actions
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                    <DropdownMenuItem onClick={() => setIsPreviewOpen(true)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Preview ({selectedIds.size})
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSageExport}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Export to Sage
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button 
                      variant="outline"
                      className="gap-2 font-black h-9 px-4 text-[10px] uppercase shrink-0 border-slate-300" 
                      onClick={() => setIsPreviewOpen(true)} 
                      disabled={selectedIds.size === 0 || activeTab !== 'unbilled' || !canExportAccounting}
                  >
                      <Eye className="h-3.5 w-3.5 text-primary" /> Preview ({selectedIds.size})
                  </Button>
                  <Button 
                      className="gap-2 font-black shadow-md h-9 px-6 text-[10px] uppercase tracking-tight shrink-0" 
                      onClick={handleSageExport} 
                      disabled={selectedIds.size === 0 || activeTab !== 'unbilled'}
                  >
                      <FileSpreadsheet className="h-4 w-4" /> Export to Sage
                  </Button>
                </>
              )}
            </div>
          </div>

          <CardContent className="flex-1 p-0 overflow-hidden">
            <TabsContent value="unbilled" className="m-0 h-full overflow-auto">
              <BillingTable 
                bookings={enrichedData.unbilled} 
                aircrafts={aircrafts || []} 
                personnel={allUsers}
                selectedIds={selectedIds}
                onToggleSelection={toggleSelection}
                onToggleAll={toggleAll}
              />
            </TabsContent>

            <TabsContent value="exported" className="m-0 h-full overflow-auto">
              <BillingTable 
                bookings={enrichedData.exported} 
                aircrafts={aircrafts || []} 
                personnel={allUsers}
                selectedIds={new Set()}
                onToggleSelection={() => {}}
                onToggleAll={() => {}}
              />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* --- Sage Export Preview Dialog --- */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 md:p-6 overflow-hidden">
            <DialogHeader className="shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between border-b pb-4 px-6 pt-6 md:px-0 md:pt-0">
                <div className="space-y-1">
                    <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-primary" />
                        Sage Export Preview
                    </DialogTitle>
                    <DialogDescription className="text-[10px] font-bold uppercase text-muted-foreground italic">Review the raw data structure generated for Sage Accounting.</DialogDescription>
                </div>
                <div className="flex items-center gap-2 no-print mt-4 md:mt-0">
                    <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 text-[10px] font-black uppercase px-4 border-slate-300">
                        <Printer className="mr-2 h-4 w-4" /> Print Preview
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setIsPreviewOpen(false)} className="hidden md:flex h-8 w-8">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </DialogHeader>
            
            <ScrollArea className="flex-1">
                <div className="p-4 md:p-1 overflow-x-auto">
                    <Table className="min-w-[800px]">
                        <TableHeader className="bg-muted/30">
                            <TableRow>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Reference</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Date</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Cust ID</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Customer Name</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Description</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider text-right">Hrs</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider text-right">Rate</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider text-right">Total</TableHead>
                                <TableHead className="text-[10px] uppercase font-bold tracking-wider text-center">Nominal</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {previewData.map((row, idx) => (
                                <TableRow key={idx} className="hover:bg-muted/5 transition-colors">
                                    <TableCell className="font-mono text-[11px] font-black text-primary uppercase">{row.reference}</TableCell>
                                    <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">{row.date}</TableCell>
                                    <TableCell className="font-black text-sm text-foreground uppercase">{row.customerId}</TableCell>
                                    <TableCell className="text-sm font-bold text-foreground truncate max-w-[120px]">{row.customerName}</TableCell>
                                    <TableCell className="text-sm font-medium text-muted-foreground truncate max-w-[200px]">{row.description}</TableCell>
                                    <TableCell className="text-right font-black text-sm text-foreground">{row.duration}</TableCell>
                                    <TableCell className="text-right text-sm font-medium text-muted-foreground">${row.rate}</TableCell>
                                    <TableCell className="text-right font-black text-sm text-primary">${row.total}</TableCell>
                                    <TableCell className="text-center font-mono text-[11px] text-muted-foreground uppercase">{row.nominalCode}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </ScrollArea>

            <DialogFooter className="shrink-0 border-t p-4 md:p-0 md:pt-4 no-print flex flex-col md:flex-row gap-2">
                <DialogClose asChild><Button variant="outline" className="w-full md:w-auto h-10 text-[10px] font-black uppercase border-slate-300">Close</Button></DialogClose>
                <Button onClick={handleSageExport} className="gap-2 w-full md:w-auto h-10 text-[10px] font-black uppercase shadow-md" disabled={!canExportAccounting}>
                    <FileSpreadsheet className="h-4 w-4" /> Download CSV & Update Status
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
