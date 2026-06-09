'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Car, Eye, Pencil, PlusCircle, Trash2, ArrowLeft, Info, Calendar, Gauge } from 'lucide-react';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { DocumentUploader } from '@/components/document-uploader';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { MainPageHeader } from '@/components/page-header';
import { BackNavButton } from '@/components/back-nav-button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { DocumentExpirySettings } from '@/app/(app)/admin/document-dates/page';
import { getDocumentExpiryBadgeStyle } from '@/lib/document-expiry';
import { cn } from '@/lib/utils';
import type { Vehicle, VehicleDocument } from '@/types/vehicle';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

interface VehicleDetailPageProps {
  params: Promise<{ id: string }>;
}

const vehicleSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  registrationNumber: z.string().min(1),
  type: z.enum(['Car', 'Truck', 'Van', 'Bus', 'Utility', 'Other']),
  vin: z.string().optional(),
  currentOdometer: z.coerce.number().min(0),
  nextServiceDueDate: z.string().optional(),
  nextServiceDueOdometer: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
});

export default function VehicleDetailPage({ params }: VehicleDetailPageProps) {
  const resolvedParams = use(params);
  const isMobile = useIsMobile();
  const { tenantId } = useUserProfile();
  const [activeTab, setActiveTab] = useState('overview');
  const vehicleId = resolvedParams.id;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [expirySettings, setExpirySettings] = useState<DocumentExpirySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
        const vehicleResponse = await fetch(`/api/vehicles/${vehicleId}`, { cache: 'no-store' });
        const vehiclePayload = await vehicleResponse.json().catch(() => ({ vehicle: null }));
        setVehicle((vehiclePayload?.vehicle as Vehicle | null) || null);
        const configResponse = await fetch('/api/tenant-config', { cache: 'no-store' });
        const configPayload = await configResponse.json().catch(() => ({ config: null }));
        setExpirySettings((configPayload?.config?.['document-expiry-settings'] as DocumentExpirySettings | undefined) || null);
    } catch (e) {
        console.error("Failed to load vehicle details", e);
        setVehicle(null);
    } finally {
        setIsLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void loadData();
    window.addEventListener('safeviate-vehicles-updated', loadData);
    return () => window.removeEventListener('safeviate-vehicles-updated', loadData);
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full space-y-6 pt-4 px-1">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="max-w-[1100px] mx-auto w-full text-center py-20 px-1">
        <div className="flex flex-col items-center gap-4 bg-muted/5 p-12 rounded-3xl border-2 border-dashed">
            <Car className="h-16 w-16 text-muted-foreground opacity-20" />
            <div className="space-y-1">
                <p className="text-xl font-black uppercase tracking-tight">Vehicle Not Found</p>
                <p className="text-xs font-bold uppercase tracking-widest text-foreground/80 italic">The requested ground asset could not be located in the fleet inventory.</p>
            </div>
            <div className="mt-4">
                <BackNavButton href="/assets/vehicles" text="Back to Vehicles" />
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('max-w-[1100px] mx-auto w-full flex flex-col pt-4 px-1', isMobile ? 'min-h-0 overflow-y-auto' : 'h-full overflow-hidden')}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className={cn('w-full flex-1 flex flex-col', isMobile ? 'overflow-visible' : 'overflow-hidden')}>
        <div className={cn('flex-1 pb-10', isMobile ? 'overflow-visible' : 'overflow-y-auto no-scrollbar')}>
          <Card className="shadow-none border rounded-xl overflow-hidden flex flex-col">
            <MainPageHeader
              title={vehicle.registrationNumber}
              description={`${vehicle.make} ${vehicle.model}`}
              actions={
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <BackNavButton href="/assets/vehicles" text="Back to Vehicles" />
                  <EditVehicleDialog vehicle={vehicle} tenantId={tenantId || ''} />
                </div>
              }
            />

            <div className="border-b bg-muted/5 px-6 py-2 shrink-0 overflow-hidden">
                <TabsList className="bg-transparent h-auto p-0 gap-2 border-b-0 justify-start overflow-x-auto no-scrollbar w-full flex items-center">
                  <TabsTrigger value="overview" className="rounded-md px-8 py-2 border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-black text-[10px] uppercase transition-all shrink-0 shadow-sm">Overview</TabsTrigger>
                  <TabsTrigger value="documents" className="rounded-md px-8 py-2 border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-black text-[10px] uppercase transition-all shrink-0 shadow-sm">Technical Docs</TabsTrigger>
                </TabsList>
            </div>

            <div className="flex-1 min-h-0">
              <TabsContent value="overview" className={cn('mt-0 outline-none', isMobile ? 'min-h-0' : 'h-full overflow-y-auto no-scrollbar')}>
                <CardContent className="p-8 space-y-12">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    <div className="space-y-6 bg-muted/5 p-6 rounded-2xl border shadow-inner">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                        <Info className="h-3.5 w-3.5" />
                        Vehicle Specs
                      </h3>
                      <div className="grid grid-cols-1 gap-6">
                        <DetailItem label="Make" value={vehicle.make} />
                        <DetailItem label="Model" value={vehicle.model} />
                        <DetailItem label="Type" value={vehicle.type || 'Car'} />
                      </div>
                    </div>
                    <div className="space-y-6 bg-muted/5 p-6 rounded-2xl border shadow-inner">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                        <PlusCircle className="h-3.5 w-3.5" />
                        Registration
                      </h3>
                      <div className="grid grid-cols-1 gap-6">
                        <DetailItem label="Registration" value={vehicle.registrationNumber} />
                        <DetailItem label="VIN / Chassis" value={vehicle.vin || 'N/A'} />
                      </div>
                    </div>
                    <div className="space-y-6 bg-muted/5 p-6 rounded-2xl border shadow-inner">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                        <Gauge className="h-3.5 w-3.5" />
                        Operational Status
                      </h3>
                      <div className="grid grid-cols-1 gap-6">
                        <DetailItem label="Current Odometer" value={`${(vehicle.currentOdometer || 0).toLocaleString()} km`} />
                        <DetailItem label="Next Service Date" value={vehicle.nextServiceDueDate ? format(parseLocalDate(vehicle.nextServiceDueDate) || new Date(vehicle.nextServiceDueDate), 'dd MMM yyyy') : 'NOT SCHEDULED'} />
                        <DetailItem label="Service Odometer" value={vehicle.nextServiceDueOdometer != null ? `${vehicle.nextServiceDueOdometer.toLocaleString()} km` : 'NOT SET'} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-8 p-10 bg-primary/5 rounded-3xl border border-primary/20 shadow-sm items-center justify-between">
                    <div className="space-y-2 text-center md:text-left">
                        <h4 className="text-xl font-black uppercase tracking-tight text-primary">Service Schedule</h4>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground italic">Distance remaining until next mandatory maintenance interval.</p>
                    </div>
                    <div className="flex gap-6">
                        <div className="flex flex-col items-center gap-2 bg-background p-4 rounded-2xl border-2 shadow-sm min-w-[140px]">
                            <p className="text-[9px] font-black uppercase tracking-tighter opacity-50">KMs Remaining</p>
                            <p className="text-2xl font-mono font-black text-primary">
                                {vehicle.nextServiceDueOdometer ? Math.max(0, vehicle.nextServiceDueOdometer - (vehicle.currentOdometer || 0)).toLocaleString() : '---'}
                            </p>
                        </div>
                        <div className="flex flex-col items-center gap-2 bg-background p-4 rounded-2xl border-2 shadow-sm min-w-[140px]">
                            <p className="text-[9px] font-black uppercase tracking-tighter opacity-50">Days Pending</p>
                            <p className="text-2xl font-mono font-black text-primary">
                                {vehicle.nextServiceDueDate ? Math.max(0, Math.ceil(((parseLocalDate(vehicle.nextServiceDueDate) || new Date(vehicle.nextServiceDueDate)).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : '---'}
                            </p>
                        </div>
                    </div>
                  </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="documents" className={cn('mt-0 outline-none', isMobile ? 'min-h-0' : 'h-full overflow-y-auto no-scrollbar')}>
                <VehicleDocumentsTab vehicle={vehicle} tenantId={tenantId || ''} expirySettings={expirySettings} />
              </TabsContent>
            </div>
          </Card>
        </div>
      </Tabs>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground opacity-70">{label}</p>
      <p className="text-sm font-black text-foreground uppercase">{value}</p>
    </div>
  );
}

function VehicleDocumentsTab({ vehicle, tenantId, expirySettings }: { vehicle: Vehicle; tenantId: string; expirySettings: DocumentExpirySettings | null }) {
  const { toast } = useToast();
  const [viewingDoc, setViewingDoc] = useState<{ name: string; url: string } | null>(null);

  const handleDocUpload = async (newDoc: VehicleDocument) => {
    try {
        const response = await fetch(`/api/vehicles/${vehicle.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle: {
              ...vehicle,
              documents: [...(vehicle.documents || []), newDoc],
            },
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || 'Failed to update vehicle documents.');
        }
        window.dispatchEvent(new Event('safeviate-vehicles-updated'));
        toast({ title: 'Document Added', description: `"${newDoc.name}" has been uploaded.` });
      } catch (e) {
        toast({ variant: 'destructive', title: 'Upload Failed', description: 'Failed to update vehicle documents.' });
      }
  };

  const handleDeleteDoc = async (docName: string) => {
    try {
      const response = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle: {
            ...vehicle,
            documents: (vehicle.documents || []).filter((d) => d.name !== docName),
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete technical document.');
      }
      window.dispatchEvent(new Event('safeviate-vehicles-updated'));
      toast({ title: 'Document Removed' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete technical document.' });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-muted/5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-8 shrink-0">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight">Compliance Library</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-75">Registration papers, insurance certificates, and ground asset compliance records.</p>
        </div>
        <DocumentUploader
          onDocumentUploaded={handleDocUpload}
          trigger={(open) => (
            <Button size="sm" onClick={() => open()} variant="outline" className="gap-2 h-10 px-8 text-[10px] font-black uppercase border-slate-300 shadow-sm bg-background">
              <PlusCircle className="h-4 w-4" /> Add Document
            </Button>
          )}
        />
      </div>
      <div className="flex-1 overflow-auto bg-background">
        <ResponsiveCardGrid
          items={vehicle.documents || []}
          isLoading={false}
          className="p-4"
          gridClassName="sm:grid-cols-2 xl:grid-cols-3"
          renderItem={(docItem) => {
            const expiryStyle = getDocumentExpiryBadgeStyle(docItem.expirationDate, expirySettings);
            return (
              <Card key={docItem.name} className="overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">
                      {docItem.name}
                    </CardTitle>
                    <CardDescription className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Uploaded {format(new Date(docItem.uploadDate), 'dd MMM yyyy')}
                    </CardDescription>
                  </div>
                  <div className="rounded-lg border bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-primary">
                    Document
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Upload Date</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{format(new Date(docItem.uploadDate), 'dd MMM yyyy')}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Expiration</p>
                      <p className={cn("mt-1 text-sm font-semibold", !docItem.expirationDate && "text-muted-foreground italic")}>
                        {docItem.expirationDate ? format(parseLocalDate(docItem.expirationDate) || new Date(docItem.expirationDate), 'dd MMM yyyy') : 'No expiry set'}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Expiry Status</p>
                      <Badge variant="outline" className="mt-1 h-8 px-4 border-2 shadow-sm uppercase text-[10px]" style={expiryStyle || undefined}>
                        {docItem.expirationDate ? format(parseLocalDate(docItem.expirationDate) || new Date(docItem.expirationDate), 'dd MMM yyyy') : 'No Expiry Date'}
                      </Badge>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="icon" className="h-10 w-10 hover:bg-primary hover:text-primary-foreground border-slate-300 shadow-sm transition-all" onClick={() => setViewingDoc({ name: docItem.name, url: docItem.url })}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-10 w-10 text-destructive hover:bg-destructive hover:text-destructive-foreground border-slate-300 shadow-sm transition-all" onClick={() => handleDeleteDoc(docItem.name)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }}
          emptyState={(
            <div className="flex flex-col items-center gap-3 opacity-30 py-16">
              <PlusCircle className="h-10 w-10" />
              <p className="text-[10px] font-black uppercase tracking-widest">No ground asset documentation uploaded.</p>
            </div>
          )}
        />
      </div>

      <Dialog open={!!viewingDoc} onOpenChange={(open) => !open && setViewingDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight">{viewingDoc?.name}</DialogTitle>
            <DialogDescription className="text-xs uppercase tracking-widest">Document Preview</DialogDescription>
          </DialogHeader>
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border bg-muted/20">
            {viewingDoc ? <img src={viewingDoc.url} alt={viewingDoc.name} className="h-full w-full object-contain" /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditVehicleDialog({ vehicle, tenantId }: { vehicle: Vehicle; tenantId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof vehicleSchema>>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      make: vehicle.make || '',
      model: vehicle.model || '',
      registrationNumber: vehicle.registrationNumber || '',
      type: vehicle.type || 'Car',
      vin: vehicle.vin || '',
      currentOdometer: vehicle.currentOdometer || 0,
      nextServiceDueDate: vehicle.nextServiceDueDate || '',
      nextServiceDueOdometer: vehicle.nextServiceDueOdometer ?? '',
    },
  });

  const onSubmit = async (values: z.infer<typeof vehicleSchema>) => {
    try {
      const response = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle: {
            ...vehicle,
            ...values,
            nextServiceDueDate: values.nextServiceDueDate || null,
            nextServiceDueOdometer: values.nextServiceDueOdometer === '' ? null : Number(values.nextServiceDueOdometer),
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save vehicle configuration.');
      }
      window.dispatchEvent(new Event('safeviate-vehicles-updated'));
      toast({ title: 'Vehicle Updated', description: 'Operational specifications have been saved to the database.' });
      setIsOpen(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Update Failed', description: 'Failed to save vehicle configuration.' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-10 px-8 text-[10px] font-black uppercase border-slate-300 shadow-sm bg-background">
          <Pencil className="h-3.5 w-3.5" /> Edit Specs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl rounded-3xl p-8 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight">Edit Ground Asset Specifications</DialogTitle>
          <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Update the technical details and service intervals for this vehicle.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pt-6">
            <div className="grid grid-cols-2 gap-6">
              <FormField control={form.control} name="registrationNumber" render={({ field }) => (<FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Registration</FormLabel><FormControl><Input className="h-11 font-black uppercase" {...field} /></FormControl></FormItem>)} />
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Asset Category</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Car">Car</SelectItem><SelectItem value="Truck">Truck</SelectItem><SelectItem value="Van">Van</SelectItem><SelectItem value="Bus">Bus</SelectItem><SelectItem value="Utility">Utility</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></FormItem>
              )} />
              <FormField control={form.control} name="make" render={({ field }) => (<FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Manufacturer</FormLabel><FormControl><Input className="h-11 font-bold" {...field} /></FormControl></FormItem>)} />
              <FormField control={form.control} name="model" render={({ field }) => (<FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Model</FormLabel><FormControl><Input className="h-11 font-bold" {...field} /></FormControl></FormItem>)} />
              <FormField control={form.control} name="vin" render={({ field }) => (<FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">VIN / Chassis #</FormLabel><FormControl><Input className="h-11 font-mono font-bold uppercase" {...field} /></FormControl></FormItem>)} />
              <FormField control={form.control} name="currentOdometer" render={({ field }) => (<FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Current Odometer (km)</FormLabel><FormControl><Input type="number" step="1" className="h-11 font-mono font-black" {...field} /></FormControl></FormItem>)} />
            </div>
            
            <Separator />

            <div className="grid grid-cols-2 gap-8 bg-muted/5 p-6 rounded-2xl border-2 shadow-inner">
                <FormField control={form.control} name="nextServiceDueDate" render={({ field }) => (<FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Next Service Due (Date)</FormLabel><FormControl><Input type="date" className="h-11 font-bold" {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="nextServiceDueOdometer" render={({ field }) => (<FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Next Service Due (Odo)</FormLabel><FormControl><Input type="number" step="1" className="h-11 font-mono font-bold" value={field.value} onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))} /></FormControl></FormItem>)} />
            </div>

            <DialogFooter className="pt-4">
              <DialogClose asChild><Button variant="outline" className="h-11 px-10 text-[10px] font-black uppercase border-slate-300 shadow-sm">Cancel</Button></DialogClose>
              <Button type="submit" className="h-11 px-10 text-[10px] font-black uppercase shadow-lg">Save Changes</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
