'use client';

import { Card, CardContent } from '@/components/ui/card';

type TenantLayoutDisabledStateProps = {
  message?: string;
};

const DEFAULT_MESSAGE = 'This page is disabled for the current tenant layout.';

export function TenantLayoutDisabledState({
  message = DEFAULT_MESSAGE,
}: TenantLayoutDisabledStateProps) {
  return (
    <div className="max-w-[1100px] mx-auto w-full px-1 pt-4">
      <Card className="border shadow-none">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          {message}
        </CardContent>
      </Card>
    </div>
  );
}
