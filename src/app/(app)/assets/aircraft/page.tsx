'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AircraftList } from './aircraft-list';
import type { Aircraft } from '@/types/aircraft';
import { CardControlHeader, HEADER_COMPACT_CONTROL_CLASS } from '@/components/page-header';
import { AddAircraftDialog } from './add-aircraft-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserProfile } from '@/hooks/use-user-profile';

export default function AircraftFleetPage() {
  const { hasPermission } = usePermissions();
  const { tenantId } = useUserProfile();
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const canManageAssets = hasPermission('assets-create') || hasPermission('assets-edit');

  const loadAircrafts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/aircraft', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ aircraft: [] }));
      setAircrafts(Array.isArray(payload.aircraft) ? payload.aircraft : []);
    } catch (e) {
      console.error('Failed to load aircrafts', e);
      setAircrafts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAircrafts();
    window.addEventListener('safeviate-aircrafts-updated', loadAircrafts);
    return () => window.removeEventListener('safeviate-aircrafts-updated', loadAircrafts);
  }, [loadAircrafts]);

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
                Manage all aircraft in your organization's inventory.
              </p>
            </div>
          )}
          actions={canManageAssets ? (
            <div className="flex flex-wrap items-center gap-2">
              <AddAircraftDialog tenantId={tenantId || ''} />
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
          <AircraftList data={aircrafts || []} tenantId={tenantId || ''} canEdit={canManageAssets} />
        </CardContent>
      </Card>
    </div>
  );
}
