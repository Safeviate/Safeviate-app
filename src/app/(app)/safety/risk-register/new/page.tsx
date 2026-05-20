'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { RiskForm } from '../risk-form';
import { usePermissions } from '@/hooks/use-permissions';

export default function NewRiskPage() {
  const { hasPermission } = usePermissions();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [isLoadingPersonnel, setIsLoadingPersonnel] = useState(true);
  const canManageRiskRegister = hasPermission('risk-register-manage-definitions');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/personnel', { cache: 'no-store' });
        const payload = await response.json();
        if (!cancelled) setPersonnel(payload?.personnel ?? []);
      } catch {
        if (!cancelled) setPersonnel([]);
      } finally {
        if (!cancelled) setIsLoadingPersonnel(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoadingPersonnel) {
    return <Skeleton className="h-[500px] w-full" />;
  }

  if (!canManageRiskRegister) {
    return (
      <div className="max-w-[1100px] mx-auto w-full px-1 pt-4">
        <Card className="border shadow-none">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Access restricted for this tenant view.
          </CardContent>
        </Card>
      </div>
    );
  }

  return <RiskForm personnel={personnel || []} />;
}
