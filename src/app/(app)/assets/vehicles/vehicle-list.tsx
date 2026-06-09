'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Car, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { Vehicle } from '@/types/vehicle';
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

export function VehicleList({ data }: { data: Vehicle[] }) {
  const { toast } = useToast();
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);

  const handleDeleteVehicle = async () => {
    if (!vehicleToDelete) return;

    try {
      const response = await fetch(`/api/vehicles/${vehicleToDelete.id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'The vehicle could not be removed.');
      }
      window.dispatchEvent(new Event('safeviate-vehicles-updated'));
      toast({
        title: 'Vehicle Deleted',
        description: `${vehicleToDelete.registrationNumber} has been removed from the fleet.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: 'The vehicle could not be removed.',
      });
    } finally {
      setVehicleToDelete(null);
    }
  };

  if (data.length === 0) {
    return (
      <div className="text-center h-48 flex flex-col items-center justify-center text-muted-foreground bg-background m-6 rounded-xl border-2 border-dashed">
        <Car className="h-10 w-10 mb-2 opacity-20" />
        <p className="text-foreground">No vehicles found in the inventory.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <ResponsiveCardGrid
        items={data}
        isLoading={false}
        className="p-4 pb-20"
        gridClassName="sm:grid-cols-2 xl:grid-cols-3"
        renderItem={(vehicle) => (
          <Card key={vehicle.id} className="overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">{vehicle.registrationNumber}</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {vehicle.make} {vehicle.model}
                </p>
              </div>
              <span className="rounded-lg border bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">
                Active
              </span>
            </CardHeader>
            <CardContent className="space-y-4 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-background px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Type</p>
                  <p className="mt-1 text-sm font-semibold text-foreground uppercase">{vehicle.type || 'Car'}</p>
                </div>
                <div className="rounded-lg border bg-background px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Odometer</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{vehicle.currentOdometer?.toFixed(0) || '0'} km</p>
                </div>
              </div>
              <div className="rounded-lg border bg-background px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Next Service</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {vehicle.nextServiceDueDate ? format(parseLocalDate(vehicle.nextServiceDueDate) || new Date(vehicle.nextServiceDueDate), 'dd MMM yyyy') : 'Not scheduled'}
                  {vehicle.nextServiceDueOdometer != null ? ` | ${vehicle.nextServiceDueOdometer.toFixed(0)} km` : ''}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                  <Link href={`/assets/vehicles/${vehicle.id}`} aria-label={`View ${vehicle.registrationNumber} details`}>
                    <Eye className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setVehicleToDelete(vehicle)}
                  aria-label={`Delete ${vehicle.registrationNumber}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        emptyState={(
          <div className="text-center h-48 flex flex-col items-center justify-center text-muted-foreground bg-background m-6 rounded-xl border-2 border-dashed">
            <Car className="h-10 w-10 mb-2 opacity-20" />
            <p className="text-foreground">No vehicles found in the inventory.</p>
          </div>
        )}
      />

      <AlertDialog open={!!vehicleToDelete} onOpenChange={(open) => !open && setVehicleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {vehicleToDelete?.registrationNumber || 'this vehicle'} from the fleet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVehicle}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  );
}
