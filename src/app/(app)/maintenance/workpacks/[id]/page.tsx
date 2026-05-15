'use client';

import { use, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import type { Workpack, TaskCard } from '@/types/workpack';
import { TaskCardDialog } from './task-card-dialog';
import { TaskCardItem } from './task-card-item';

export default function WorkpackDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { tenantId } = useUserProfile();
  const { hasPermission } = usePermissions();

  const [workpack, setWorkpack] = useState<Workpack | null>(null);
  const [allTaskCards, setAllTaskCards] = useState<TaskCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [workpackRes, taskCardRes] = await Promise.all([
        fetch(`/api/maintenance/workpacks/${resolvedParams.id}`, { cache: 'no-store' }),
        fetch(`/api/maintenance/task-cards?workpackId=${resolvedParams.id}`, { cache: 'no-store' }),
      ]);
      const workpackData = await workpackRes.json();
      const taskCardData = await taskCardRes.json();
      setWorkpack(workpackData.workpack ?? null);
      setAllTaskCards(Array.isArray(taskCardData.taskCards) ? taskCardData.taskCards : []);
    } catch (e) {
      console.error('Failed to load workpack data', e);
    } finally {
      setIsLoading(false);
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    loadData();
    window.addEventListener('safeviate-maintenance-workpacks-updated', loadData);
    window.addEventListener('safeviate-maintenance-task-cards-updated', loadData);
    return () => {
      window.removeEventListener('safeviate-maintenance-workpacks-updated', loadData);
      window.removeEventListener('safeviate-maintenance-task-cards-updated', loadData);
    };
  }, [loadData]);

  const taskCards = useMemo(() => allTaskCards.filter((tc) => tc.workpackId === resolvedParams.id), [allTaskCards, resolvedParams.id]);
  const canCreateTaskCards = hasPermission('maintenance-workpacks-create') || hasPermission('admin-view');
  const canEditTaskCards = hasPermission('maintenance-workpacks-edit') || hasPermission('admin-view');
  const canSignTaskCards = hasPermission('maintenance-workpacks-sign') || hasPermission('admin-view');
  const canApproveWorkpack = hasPermission('maintenance-workpacks-approve') || hasPermission('admin-view');

  const handleCloseWorkpack = async () => {
    if (!workpack) return;
    try {
      const nextWorkpack = { ...workpack, status: 'CLOSED' as const, closedAt: new Date().toISOString() };
      const res = await fetch(`/api/maintenance/workpacks/${workpack.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workpack: nextWorkpack }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to close workpack');
      window.dispatchEvent(new Event('safeviate-maintenance-workpacks-updated'));
    } catch (e) {
      console.error('Failed to close workpack', e);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full space-y-6 px-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!workpack) {
    return <div className="p-8 text-center text-muted-foreground uppercase font-black">Workpack NOT FOUND</div>;
  }

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full p-4 overflow-hidden">
      <Card className="shrink-0 bg-background shadow-md border-b-4 border-b-primary sticky top-0 z-10">
        <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-start gap-4">
            <Button variant="outline" size="icon" className="shrink-0 rounded-full h-10 w-10" onClick={() => router.push('/maintenance/workpacks')}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-[10px] uppercase font-black text-muted-foreground flex items-center gap-1">
                Ref: <span className="text-primary">{workpack.trackingNumber}</span>
              </p>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">{workpack.title}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge className="bg-slate-100 text-slate-800 text-[9px] uppercase font-bold border-slate-200">A/C: {workpack.aircraftId}</Badge>
                <div className="flex items-center text-[10px] text-muted-foreground font-mono">
                  <Clock className="w-3 h-3 mr-1" />
                  {workpack.openedAt ? format(new Date(workpack.openedAt), 'dd MMM yyyy HH:mm') : '-'}
                </div>
              </div>
            </div>
          </div>
          {workpack.status === 'CLOSED' ? (
            <Badge className="h-10 px-6 bg-emerald-600 hover:bg-emerald-600 font-black tracking-widest text-sm uppercase">Released to Service</Badge>
          ) : (
            <div className="flex gap-2">
              {canCreateTaskCards ? (
                <TaskCardDialog workpackId={workpack.id} tenantId={tenantId || ''} canCreateTaskCards={canCreateTaskCards} />
              ) : (
                <Badge variant="outline" className="h-10 px-6 font-black tracking-widest text-[10px] uppercase">Task Cards Locked</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {workpack.status !== 'CLOSED' && taskCards && taskCards.length > 0 && taskCards.every((tc) => tc.isCompleted && (!tc.requiresInspector || tc.isInspected)) && canApproveWorkpack && (
        <Card className="shrink-0 bg-primary/10 border-primary/30 shadow-sm">
          <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-foreground uppercase">Ready for Certificate of Release to Service (CRS)</h3>
              <p className="text-sm text-muted-foreground">All task cards are certified. This workpack is ready for final release.</p>
            </div>
            <Button className="font-black uppercase shadow-md" onClick={handleCloseWorkpack}>Issue CRS & Lock Package</Button>
          </CardContent>
        </Card>
      )}

      <ScrollArea className="flex-1 -mx-4 px-4 h-full pb-24">
        {taskCards && taskCards.length > 0 ? (
          <div className="space-y-4">
            {taskCards.map((tc) => (
              <TaskCardItem
                key={tc.id}
                taskCard={tc}
                workpackId={workpack.id}
                canEditTaskCard={canEditTaskCards}
                canSignTaskCard={canSignTaskCards}
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground gap-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center border">
                <CheckCircle className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-bold text-sm uppercase">No Task Cards Attached</p>
                <p className="text-xs">Add cards to begin building this maintenance package.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </ScrollArea>
    </div>
  );
}
