'use client';

import { Plane } from 'lucide-react';
import type { Aircraft } from '@/types/aircraft';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AircraftActions } from './aircraft-actions';
import { ViewActionButton } from '@/components/record-action-buttons';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';

interface AircraftListProps {
  data: Aircraft[];
  tenantId: string;
  canEdit: boolean;
}

export function AircraftList({ data, tenantId, canEdit }: AircraftListProps) {
  if (data.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center border-b bg-muted/5 p-8 text-center text-muted-foreground">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border bg-background">
            <Plane className="h-6 w-6 text-muted-foreground/60" />
        </div>
        <div className="space-y-1 text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-foreground">Hangar Empty</p>
            <p className="text-[10px] font-bold uppercase tracking-widest italic">No aviation assets have been registered yet.</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-0">
        <ResponsiveCardGrid
          items={data}
          isLoading={false}
          className="p-4"
          gridClassName="sm:grid-cols-2 xl:grid-cols-3"
          renderItem={(ac) => (
            <Card key={ac.id} className="overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">{ac.tailNumber}</p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {ac.make} {ac.model}
                  </p>
                </div>
                <div className="rounded-lg border bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">
                  Airworthy
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Category</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{ac.type || 'Single-Engine'}</p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Configuration</p>
                    <p className="mt-1 text-sm font-semibold text-foreground uppercase">OEM Specification</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Hobbs</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{ac.currentHobbs?.toFixed(1) || '0.0'}h</p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Tacho</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{ac.currentTacho?.toFixed(1) || '0.0'}h</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <ViewActionButton href={`/assets/aircraft/${ac.id}`} label="Open" />
                  <AircraftActions tenantId={tenantId} aircraft={ac} canEdit={canEdit} />
                </div>
              </CardContent>
            </Card>
          )}
          emptyState={(
            <div className="flex min-h-[360px] flex-col items-center justify-center border-b bg-muted/5 p-8 text-center text-muted-foreground">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border bg-background">
                <Plane className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-bold uppercase tracking-wider text-foreground">Hangar Empty</p>
                <p className="text-[10px] font-bold uppercase tracking-widest italic">No aviation assets have been registered yet.</p>
              </div>
            </div>
          )}
        />
      </div>
    </ScrollArea>
  );
}
