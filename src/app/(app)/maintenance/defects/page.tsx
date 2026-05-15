'use client';

import { Card, CardContent } from '@/components/ui/card';
import { MainPageHeader } from '@/components/page-header';
import { ShieldAlert } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

export default function defectsPage() {
  const { hasPermission } = usePermissions();
  const canViewDefects = hasPermission('maintenance-defects-view') || hasPermission('admin-view');

  if (!canViewDefects) {
    return (
      <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden p-4">
        <Card className="flex-1 flex flex-col overflow-hidden shadow-none border">
          <CardContent className="flex-1 flex items-center justify-center p-12 text-center">
            <div className="space-y-2">
              <p className="text-lg font-black uppercase tracking-tight">Access Denied</p>
              <p className="text-sm text-muted-foreground">You do not have permission to view maintenance defects.</p>
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
          title="Defect Reports (Snags)"
          description="Report aircraft defects, track deferred items, and clear snags after maintenance action. (Under development)"
        />
        <CardContent className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground gap-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center border animate-pulse">
                <ShieldAlert className="h-8 w-8 text-amber-500/50" />
            </div>
            <div className="text-center">
                <p className="font-bold text-lg uppercase tracking-tight text-foreground">Defect Tracking Console</p>
                <p className="text-sm">The digital tech-log integration for reporting and resolving aircraft snags is under construction. (Under development)</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
