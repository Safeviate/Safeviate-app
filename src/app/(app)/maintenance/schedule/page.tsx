'use client';

import { Card, CardContent } from '@/components/ui/card';
import { MainPageHeader } from '@/components/page-header';
import { Wrench } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

export default function MaintenanceSchedulePage() {
  const { hasPermission } = usePermissions();
  const canViewSchedule = hasPermission('maintenance-schedule-view') || hasPermission('admin-view');

  if (!canViewSchedule) {
    return (
      <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden p-4">
        <Card className="flex-1 flex flex-col overflow-hidden shadow-none border">
          <CardContent className="flex-1 flex items-center justify-center p-12 text-center">
            <div className="space-y-2">
              <p className="text-lg font-black uppercase tracking-tight">Access Denied</p>
              <p className="text-sm text-muted-foreground">You do not have permission to view the maintenance schedule.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden p-4">
      <Card className="flex-1 flex flex-col overflow-hidden shadow-none border">
        <MainPageHeader
          title="Maintenance Schedule"
          description="Track upcoming aircraft maintenance events, inspections, and time-limited components. (Under development)"
        />
        <CardContent className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground gap-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center border animate-pulse">
                <Wrench className="h-8 w-8 text-primary/50" />
            </div>
            <div className="text-center">
                <p className="font-bold text-lg uppercase tracking-tight text-foreground">Maintenance Schedule System</p>
                <p className="text-sm">This module is currently being built to handle dynamic aircraft hours and cycle tracking. (Under development)</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
