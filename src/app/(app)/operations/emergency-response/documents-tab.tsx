
'use client';

import { useMemo, useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, FileCheck, ShieldAlert, User } from 'lucide-react';
import type { ERPEvent, ERPCollectedDocument, ERPLogEntry } from '@/types/erp';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';

interface DocumentsTabProps {
  tenantId: string;
}

const REQUIRED_DOCUMENTS = [
  { id: 'doc-1', name: 'Pilot Logbook' },
  { id: 'doc-2', name: 'Medical Certificate' },
  { id: 'doc-3', name: 'Aircraft Flight Log (Technical Log)' },
  { id: 'doc-4', name: 'Aircraft Maintenance Logbooks' },
  { id: 'doc-5', name: 'Weight & Balance Sheet' },
  { id: 'doc-6', name: 'Flight Plan (filed copy)' },
  { id: 'doc-7', name: 'Weather Briefing Documents' },
  { id: 'doc-8', name: 'Fuel Receipts / Upload Records' },
  { id: 'doc-9', name: 'Student Training Records' },
  { id: 'doc-10', name: 'NOTAMs / ATC Flight Strip copies' },
];

export function DocumentsTab({ tenantId }: DocumentsTabProps) {
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  const [events, setEvents] = useState<ERPEvent[]>([]);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const response = await fetch('/api/erp-state?category=events', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const parsed = (payload.data || []) as ERPEvent[];
        setEvents(parsed.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
      } catch {
        // ignore load errors
      }
    };
    loadEvents();
  }, []);

  const persistEvents = async (nextEvents: ERPEvent[]) => {
    setEvents(nextEvents);
    await fetch('/api/erp-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'events', data: nextEvents }),
    }).catch(() => null);
  };

  const activeEvent = useMemo(() => events?.find(e => e.status !== 'Closed'), [events]);

  const handleToggleDocument = (docId: string, docName: string) => {
    if (!activeEvent) return;

    const currentDocs = activeEvent.collectedDocuments || [];
    const existingIndex = currentDocs.findIndex(d => d.id === docId);

    let updatedDocs: ERPCollectedDocument[];
    let logEntry: ERPLogEntry | null = null;

    if (existingIndex > -1) {
      // If it was secured, we're un-securing it
      updatedDocs = currentDocs.filter(d => d.id !== docId);
    } else {
      // Securing it
      const newDoc: ERPCollectedDocument = {
        id: docId,
        name: docName,
        securedAt: new Date().toISOString(),
        securedBy: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'System',
        status: 'Secured'
      };
      updatedDocs = [...currentDocs, newDoc];
      
      logEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        description: `EVIDENCE SECURED: ${docName}`,
        loggedBy: userProfile?.id || 'System',
        userName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'System',
        isMilestone: true
      };
    }

    const updates: Partial<ERPEvent> = { collectedDocuments: updatedDocs };
    if (logEntry) {
      const currentLog = activeEvent.log || [];
      updates.log = [...currentLog, logEntry];
    }
    const nextEvents = events.map(e => e.id === activeEvent.id ? { ...e, ...updates } : e);
    void persistEvents(nextEvents as ERPEvent[]);
    toast({ title: existingIndex > -1 ? 'Status reset' : 'Document Secured' });
  };

  return (
    <div className="space-y-6">
      <div className="px-6 py-6">
        <div className="flex items-center gap-2">
          {activeEvent ? <ShieldAlert className="h-5 w-5 text-destructive" /> : <FileCheck className="h-5 w-5 text-primary" />}
          <h2 className="font-headline text-2xl font-semibold">
            {activeEvent ? 'Document Collection Tracker' : 'Evidence & Docs'}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeEvent
            ? `Tracking evidence collection for ${activeEvent.title}.`
            : 'A guide to the critical documents that should be secured immediately following an incident.'}
        </p>
      </div>

      <section className="overflow-hidden border-y border-card-border">
        <div className="border-b px-6 py-5">
          <h4 className="font-headline text-lg font-semibold">Required Evidence & Documentation</h4>
        </div>
        <div className="p-0">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead>Document Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Secured By</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {REQUIRED_DOCUMENTS.map((doc) => {
                const securedInfo = activeEvent?.collectedDocuments?.find(d => d.id === doc.id);
                const isSecured = !!securedInfo;

                return (
                  <TableRow key={doc.id} className={cn(isSecured && "bg-emerald-50/30")}>
                    <TableCell className="min-w-0 font-medium">
                      <span className="block truncate" title={doc.name}>{doc.name}</span>
                    </TableCell>
                    <TableCell>
                      {isSecured ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 h-5 px-2">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Secured
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground opacity-50 h-5 px-2 gap-1">
                          <Circle className="h-2.5 w-2.5" /> Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="min-w-0 text-xs text-muted-foreground">
                      {isSecured ? (
                        <div className="flex min-w-0 items-center gap-1">
                          <User className="h-3 w-3 shrink-0" />
                          <span className="min-w-0 truncate" title={securedInfo.securedBy}>{securedInfo.securedBy}</span>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {isSecured && securedInfo.securedAt ? format(new Date(securedInfo.securedAt), 'HH:mm:ss') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {activeEvent ? (
                        <Button 
                          size="sm" 
                          variant={isSecured ? "ghost" : "default"} 
                          className={cn("h-7 text-[10px] uppercase font-bold", isSecured && "text-destructive hover:bg-destructive/10")}
                          onClick={() => handleToggleDocument(doc.id, doc.name)}
                        >
                          {isSecured ? 'Reset Status' : 'Mark Secured'}
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">Start session to track</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {!activeEvent && (
        <section className="border border-primary/20 bg-primary/5 px-6 py-5">
          <h4 className="text-base font-semibold">Why is document collection critical?</h4>
          <div className="mt-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>Following an aviation incident, investigators (CAA/TSB) will require immediate access to original records to determine operating margins, crew currency, and aircraft airworthiness at the time of the event.</p>
            <p><span className="font-bold text-foreground">Action:</span> Ensure all physical logbooks are removed from the aircraft and secured in a fire-proof safe. Digital records should be exported or frozen to prevent post-incident modification.</p>
          </div>
        </section>
      )}
    </div>
  );
}
