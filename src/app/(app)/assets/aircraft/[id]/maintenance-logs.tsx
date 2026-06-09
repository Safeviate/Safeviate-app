'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import type { MaintenanceLog } from '@/types/maintenance';
import { Skeleton } from '@/components/ui/skeleton';
import { History, FileText } from 'lucide-react';

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, 12);
};

interface MaintenanceLogsProps {
  aircraftId: string;
  tenantId: string;
}

export function MaintenanceLogs({ aircraftId }: MaintenanceLogsProps) {
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/aircraft/${aircraftId}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ aircraft: null }));
      setLogs(((payload.aircraft?.maintenanceLogs as MaintenanceLog[]) || []).slice().sort((a, b) => b.date.localeCompare(a.date)));
    } catch (e) {
      console.error('Failed to load local maintenance logs', e);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [aircraftId]);

  useEffect(() => {
    loadLogs();
    const eventName = 'safeviate-aircrafts-updated';
    window.addEventListener(eventName, loadLogs);
    return () => window.removeEventListener(eventName, loadLogs);
  }, [loadLogs]);

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }

  return (
    <div className="rounded-3xl border-2 overflow-hidden bg-background shadow-sm">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="text-[10px] font-black uppercase tracking-widest px-6">Certification Date</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">Type / Category</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest">Engineering Details</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest text-right pr-6">Engineer / AMO</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs && logs.length > 0 ? (
            logs.map((log) => (
              <TableRow key={log.id} className="hover:bg-muted/5 transition-colors group">
                <TableCell className="whitespace-nowrap font-bold text-xs px-6">
                  {format(parseLocalDate(log.date), 'dd MMM yyyy')}
                </TableCell>
                <TableCell className="text-center font-black uppercase text-[10px] text-primary tracking-tight">
                  <span className="rounded-lg border border-primary/10 bg-primary/5 px-3 py-1">{log.maintenanceType}</span>
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="flex flex-col gap-1 py-3 group-hover:px-2 transition-all">
                    <p className="text-sm font-medium leading-relaxed">{log.details}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-50 flex items-center gap-1.5">
                      <FileText className="h-3 w-3" /> Ref: {log.reference || 'N/A'}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-right pr-6">
                  <div className="flex flex-col py-3">
                    <p className="text-xs font-black uppercase tracking-tighter text-primary">{log.ameNo || 'UNIDENTIFIED'}</p>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-70">AMO {log.amoNo || 'N/A'}</p>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-48 text-center text-muted-foreground bg-muted/5">
                <div className="flex flex-col items-center justify-center gap-3 opacity-30 grayscale pt-8">
                  <History className="h-10 w-10" />
                  <p className="text-[10px] font-black uppercase tracking-widest italic">No certified maintenance history records found.</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
