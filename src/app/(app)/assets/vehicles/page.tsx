'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CardControlHeader, HEADER_COMPACT_CONTROL_CLASS } from '@/components/page-header';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserProfile } from '@/hooks/use-user-profile';
import { AddVehicleDialog } from './add-vehicle-dialog';
import { VehicleList } from './vehicle-list';
import type { Vehicle } from '@/types/vehicle';

export default function VehiclesPage() {
  const { hasPermission } = usePermissions();
  const { tenantId } = useUserProfile();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const canManageAssets = hasPermission('assets-create') || hasPermission('assets-edit');

  const loadVehicles = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/vehicles', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ vehicles: [] }));
      setVehicles(Array.isArray(payload.vehicles) ? payload.vehicles : []);
    } catch (e) {
      console.error('Failed to load vehicles', e);
      setVehicles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
    const handleVehiclesUpdated = () => {
      void loadVehicles();
    };
    window.addEventListener('safeviate-vehicles-updated', handleVehiclesUpdated);
    return () => window.removeEventListener('safeviate-vehicles-updated', handleVehiclesUpdated);
  }, [loadVehicles]);

  if (isLoading) {
    return (
      <div className="lg:max-w-[1100px] mx-auto w-full space-y-6 px-1 pt-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden px-1 pt-4">
      <Card className="flex-1 flex flex-col overflow-hidden shadow-none border">
        <CardControlHeader
          context={(
            <div className="flex min-w-0 flex-col gap-1">
              <p className="main-page-header__description text-[10px] font-medium text-muted-foreground sm:text-xs">
                Manage company vehicles and supporting ground assets.
              </p>
            </div>
          )}
          actions={canManageAssets ? (
            <div className="flex flex-wrap items-center gap-2">
              <AddVehicleDialog tenantId={tenantId || ''} />
            </div>
          ) : undefined}
          navigation={(
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild variant="outline" className={HEADER_COMPACT_CONTROL_CLASS}>
                <Link href="/assets/checklists">Checklists</Link>
              </Button>
              <Button asChild variant="default" className={HEADER_COMPACT_CONTROL_CLASS}>
                <Link href="/assets/inspections">Inspections</Link>
              </Button>
            </div>
          )}
        />
        <CardContent className="flex-1 p-0 overflow-hidden bg-background">
          <VehicleList data={vehicles || []} />
        </CardContent>
      </Card>
    </div>
  );
}
