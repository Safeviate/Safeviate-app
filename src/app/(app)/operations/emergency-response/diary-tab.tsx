'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StopCircle, PlusCircle, Clock, User, Flag, ShieldAlert, CheckCircle2, ArrowLeft, History } from 'lucide-react';
import type { ERPEvent, ERPLogEntry, ERPEventStatus, ERPTrigger } from '@/types/erp';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import { v4 as uuidv4 } from 'uuid';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { HEADER_ACTION_BUTTON_CLASS, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import type { Personnel, PilotProfile } from '../../users/personnel/page';
import { usePermissions } from '@/hooks/use-permissions';

interface DiaryTabProps {
  tenantId: string;
  startOpen: boolean;
  onStartOpenChange: (open: boolean) => void;
}

export function DiaryTab({ tenantId, startOpen, onStartOpenChange }: DiaryTabProps) {
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  
  const canManage = hasPermission('operations-erp-manage');

  const [isCloseOpen, setIsCloseOpen] = useState(false);
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null);
  const [newLogEntry, setNewLogEntry] = useState('');
  const [isMilestone, setIsMilestone] = useState(false);
  const [closingSummary, setClosingSummary] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newLogEntry]);

  const [triggers, setTriggers] = useState<ERPTrigger[]>([]);
  const [events, setEvents] = useState<ERPEvent[]>([]);
  const personnel: Personnel[] = [];
  const instructors: PilotProfile[] = [];
  const students: PilotProfile[] = [];
  const privatePilots: PilotProfile[] = [];

  useEffect(() => {
    const loadState = async () => {
      try {
        const [triggersResponse, eventsResponse] = await Promise.all([
          fetch('/api/erp-state?category=triggers', { cache: 'no-store' }),
          fetch('/api/erp-state?category=events', { cache: 'no-store' }),
        ]);

        if (triggersResponse.ok) {
          const payload = await triggersResponse.json();
          setTriggers((payload.data || []) as ERPTrigger[]);
        }

        if (eventsResponse.ok) {
          const payload = await eventsResponse.json();
          const parsedEvents = (payload.data || []) as ERPEvent[];
          setEvents(parsedEvents.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
        }
      } catch {
        // ignore load errors
      }
    };
    loadState();
  }, []);

  const persistEvents = async (nextEvents: ERPEvent[]) => {
    setEvents(nextEvents);
    await fetch('/api/erp-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'events', data: nextEvents }),
    }).catch(() => null);
  };

  const allUsers = useMemo(() => {
    return [
      ...(personnel || []), 
      ...(instructors || []), 
      ...(students || []), 
      ...(privatePilots || [])
    ];
  }, [personnel, instructors, students, privatePilots]);

  const incerfaContacts = useMemo(() => {
    return allUsers
      .filter(u => u.isErpIncerfaContact)
      .map(u => `${u.firstName} ${u.lastName}`)
      .join(', ');
  }, [allUsers]);

  const alerfaContacts = useMemo(() => {
    return allUsers
      .filter(u => u.isErpAlerfaContact)
      .map(u => `${u.firstName} ${u.lastName}`)
      .join(', ');
  }, [allUsers]);

  const dynamicPhaseChecklists = useMemo(() => [
    {
      phase: 'INCERFA (Uncertainty)',
      tasks: [
        { id: 'inc-1', label: 'Verify flight plan details' },
        { id: 'inc-2', label: 'Start communication search (all frequencies)' },
        { id: 'inc-3', label: 'Contact alternate airfields' },
        { id: 'inc-4', label: 'Check with last known ATC unit' },
        { id: 'inc-5', label: 'Directly contact crew on mobile devices' },
        { id: 'inc-6', label: `Contact designated INCERFA response person${incerfaContacts ? `: ${incerfaContacts}` : ''}` },
      ]
    },
    {
      phase: 'ALERFA (Alert)',
      tasks: [
        { id: 'ale-1', label: 'Notify Search and Rescue Center (RCC)' },
        { id: 'ale-2', label: 'Ground support teams on standby' },
        { id: 'ale-3', label: 'Internal management team alerted' },
        { id: 'ale-4', label: 'Secondary communication search expanded' },
        { id: 'ale-5', label: `Contact designated ALERFA response team${alerfaContacts ? `: ${alerfaContacts}` : ''}` },
      ]
    },
    {
      phase: 'DETRESFA (Distress)',
      tasks: [
        { id: 'det-1', label: 'Full ERP protocol activated' },
        { id: 'det-2', label: 'Dispatch emergency services to scene' },
        { id: 'det-3', label: 'Contact Next of Kin (NOK)' },
        { id: 'det-4', label: 'Issue media holding statement' },
        { id: 'det-5', label: 'Documents secured' },
      ]
    }
  ], [incerfaContacts, alerfaContacts]);

  const activeEvent = useMemo(() => events?.find(e => e.status !== 'Closed'), [events]);
  const viewingEvent = useMemo(() => events?.find(e => e.id === selectedEventId), [events, selectedEventId]);

  const handleStartERP = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canManage) return;

    const formData = new FormData(e.currentTarget);
    const isMock = formData.get('isMock') === 'on';
    const triggerId = selectedTriggerId || '';
    const trigger = triggers?.find(t => t.id === triggerId);
    
    const title = formData.get('title') as string || (trigger ? `ERP: ${trigger.eventType}` : 'Emergency Response');

    const initialLog: ERPLogEntry[] = [{
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      description: `ERP ${isMock ? 'Mock Exercise' : 'Response'} Initialized: ${title}`,
      loggedBy: userProfile?.id || 'System',
      userName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'System',
      isMilestone: true
    }];

    if (trigger) {
      initialLog.push({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        description: `INTERNAL TRIGGER IDENTIFIED: ${trigger.eventType}. Criteria: ${trigger.criteria}`,
        loggedBy: userProfile?.id || 'System',
        userName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'System',
        isMilestone: true
      });
    }

    const newEvent: ERPEvent = {
      id: crypto.randomUUID(),
      title,
      status: isMock ? 'Mock' : 'Active' as ERPEventStatus,
      startedAt: new Date().toISOString(),
      completedTasks: [],
      log: initialLog,
      collectedDocuments: []
    };

    const nextEvents = [newEvent, ...events];
    void persistEvents(nextEvents);
    onStartOpenChange(false);
    setSelectedTriggerId(null);
    toast({ title: isMock ? 'Mock Started' : 'ERP ACTIVATED', variant: isMock ? 'default' : 'destructive' });
  };

  const handleAddLog = (customDesc?: string, milestoneOverride?: boolean) => {
    const desc = customDesc || newLogEntry.trim();
    if (!desc || !activeEvent || !canManage) return;

    const entry: ERPLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      description: desc,
      loggedBy: userProfile?.id || 'Unknown',
      userName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'Unknown',
      isMilestone: milestoneOverride !== undefined ? milestoneOverride : isMilestone
    };

    const nextEvents = events.map(e => {
      if (e.id === activeEvent.id) {
        return {
          ...e,
          log: [...(e.log || []), entry]
        };
      }
      return e;
    });

    void persistEvents(nextEvents);

    if (!customDesc) {
      setNewLogEntry('');
      setIsMilestone(false);
      toast({ title: 'Logged' });
    }
  };

  const handleToggleTask = (taskId: string, label: string) => {
    if (!activeEvent || !canManage) return;

    const isCompleted = activeEvent.completedTasks?.includes(taskId);

    if (!isCompleted) {
      const entry: ERPLogEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        description: `ACTION COMPLETED: ${label}`,
        loggedBy: userProfile?.id || 'System',
        userName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'System',
        isMilestone: true
      };

      const nextEvents = events.map(e => {
        if (e.id === activeEvent.id) {
          return {
            ...e,
            completedTasks: [...(e.completedTasks || []), taskId],
            log: [...(e.log || []), entry]
          };
        }
        return e;
      });
      void persistEvents(nextEvents);
      toast({ title: "Timeline updated" });
    } else {
      const updatedTasks = (activeEvent.completedTasks || []).filter(id => id !== taskId);
      const nextEvents = events.map(e => e.id === activeEvent.id ? { ...e, completedTasks: updatedTasks } : e);
      void persistEvents(nextEvents);
    }
  };

  const handleCloseERP = () => {
    if (!activeEvent || !canManage) return;

    const finalLog: ERPLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      description: `SESSION CLOSED. Final Summary: ${closingSummary || 'No closing notes provided.'}`,
      loggedBy: userProfile?.id || 'System',
      userName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'System',
      isMilestone: true
    };

    const nextEvents = events.map(e => {
      if (e.id === activeEvent.id) {
        return {
          ...e,
          status: 'Closed' as ERPEventStatus,
          endedAt: new Date().toISOString(),
          summary: closingSummary,
          log: [...(e.log || []), finalLog]
        };
      }
      return e;
    });

    void persistEvents(nextEvents);

    setIsCloseOpen(false);
    setClosingSummary('');
    toast({ title: 'ERP Session Finalized' });
  };

  const currentActiveOrViewing = activeEvent || viewingEvent;

  return (
    <div className="flex flex-col h-full gap-6">
      <Dialog open={startOpen} onOpenChange={onStartOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={handleStartERP}>
            <input type="hidden" name="triggerId" value={selectedTriggerId || ''} />
            <DialogHeader>
              <DialogTitle>Start ERP Session</DialogTitle>
              <DialogDescription>
                Create a new live response or mock exercise entry before switching into the active diary view.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="erp-title">Session Title</Label>
                <Input
                  id="erp-title"
                  name="title"
                  placeholder="e.g. Aircraft overdue, VFR return, runway excursion"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="erp-trigger">Trigger</Label>
                <Select value={selectedTriggerId || ''} onValueChange={setSelectedTriggerId}>
                  <SelectTrigger id="erp-trigger">
                    <SelectValue placeholder="Select a trigger or leave blank" />
                  </SelectTrigger>
                  <SelectContent>
                    {(triggers || []).map((trigger) => (
                      <SelectItem key={trigger.id} value={trigger.id}>
                        {trigger.eventType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-3">
                <Checkbox id="erp-mock" name="isMock" />
                <div className="space-y-0.5">
                  <Label htmlFor="erp-mock" className="cursor-pointer">
                    Mock Exercise
                  </Label>
                  <p className="text-xs text-muted-foreground">Use this when starting a practice session instead of a live response.</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className={HEADER_SECONDARY_BUTTON_CLASS}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive" className={HEADER_ACTION_BUTTON_CLASS}>
                Start ERP
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Conditionally render header row only if active/viewing session */}
      {currentActiveOrViewing && (
        <div className="flex justify-between items-center px-1">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold flex items-center gap-2 font-headline">
              {activeEvent ? (
                <span className="flex items-center gap-2 text-red-600 animate-pulse">
                  <ShieldAlert className="h-5 w-5" /> Active Session
                </span>
              ) : viewingEvent ? (
                <span className="flex items-center gap-2">
                  <History className="h-5 w-5 text-muted-foreground" /> Session Archive
                </span>
              ) : null}
            </h2>
            {viewingEvent && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedEventId(null)} className={HEADER_SECONDARY_BUTTON_CLASS}>
                <ArrowLeft className="h-4 w-4" /> Return to History
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeEvent && canManage && (
              <Dialog open={isCloseOpen} onOpenChange={setIsCloseOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className={HEADER_SECONDARY_BUTTON_CLASS}><StopCircle className="mr-2 h-4 w-4" /> Close Session</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Finalize ERP Session</DialogTitle>
                    <DialogDescription>Provide a summary of the response outcomes and any critical observations before closing the diary.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="close-summary">Response Summary / Closing Notes</Label>
                      <Textarea 
                        id="close-summary"
                        placeholder="e.g., Aircraft located safely. All personnel accounted for. Coordination with RCC was successful."
                        value={closingSummary}
                        onChange={(e) => setClosingSummary(e.target.value)}
                        className="min-h-[150px]"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button variant="destructive" onClick={handleCloseERP}>Close & Save Session</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      )}

      {currentActiveOrViewing ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 flex-1 min-h-0">
          <Card className={cn(
            "flex flex-col h-full overflow-hidden shadow-none border",
            activeEvent ? "border-red-200" : "border-slate-200"
          )}>
            <CardHeader className={cn(
              "border-b",
              activeEvent ? "bg-red-50/50" : "bg-muted/30"
            )}>
              <CardTitle className="flex items-center justify-between text-lg">
                <span>{currentActiveOrViewing.title}</span>
                <Badge variant={currentActiveOrViewing.status === 'Active' ? 'destructive' : 'secondary'}>{currentActiveOrViewing.status}</Badge>
              </CardTitle>
              <CardDescription>
                Started: {format(new Date(currentActiveOrViewing.startedAt), 'PPP p')}
                {currentActiveOrViewing.endedAt && ` • Closed: ${format(new Date(currentActiveOrViewing.endedAt), 'PPP p')}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden bg-background">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-6">
                  {currentActiveOrViewing.summary && (
                    <div className="p-4 bg-primary/5 border rounded-lg space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-widest text-primary">Response Summary</h4>
                      <p className="text-sm font-medium leading-relaxed italic">&quot;{currentActiveOrViewing.summary}&quot;</p>
                    </div>
                  )}
                  {currentActiveOrViewing.log.map((entry) => (
                    <div key={entry.id} className={cn("flex min-w-0 gap-4 p-3 rounded-lg border transition-colors", entry.isMilestone ? "bg-primary/5 border-primary/20" : "bg-muted/5")}>
                      <div className="shrink-0 flex flex-col items-center gap-1 pt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] font-bold font-mono">{format(new Date(entry.timestamp), 'HH:mm:ss')}</span>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className={cn("truncate text-sm", entry.isMilestone && "font-bold text-primary")} title={entry.description}>
                          {entry.description}
                        </p>
                        <div className="flex min-w-0 items-center gap-2 text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
                          <User className="h-2.5 w-2.5" /> {entry.userName}
                          {entry.isMilestone && <Badge variant="secondary" className="h-4 text-[8px] bg-primary/10 text-primary border-none"><Flag className="h-2 w-2 mr-1" /> Milestone</Badge>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
            {activeEvent && canManage && (
              <CardFooter className="border-t p-4 bg-muted/10 gap-3">
                <div className="flex-1 space-y-3">
                  <Textarea 
                    ref={textareaRef}
                    placeholder="Manual diary entry..." 
                    value={newLogEntry}
                    onChange={(e) => setNewLogEntry(e.target.value)}
                    className="min-h-[40px] h-auto bg-background resize-none overflow-hidden py-2"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={isMilestone} onCheckedChange={setIsMilestone} id="milestone-sw" />
                      <Label htmlFor="milestone-sw" className="text-xs cursor-pointer">Mark as Milestone</Label>
                    </div>
                    <Button onClick={() => handleAddLog()} disabled={!newLogEntry.trim()} className={HEADER_ACTION_BUTTON_CLASS}><PlusCircle className="mr-2 h-4 w-4" /> Log Event</Button>
                  </div>
                </div>
              </CardFooter>
            )}
          </Card>

          <div className="space-y-6 overflow-y-auto no-scrollbar">
            <Card className="shadow-none border">
              <CardHeader className="bg-muted/10 py-3">
                <CardTitle className="text-sm flex items-center gap-2 font-headline">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Phase Checklists
                </CardTitle>
              </CardHeader>
              <CardContent className={cn("p-4 space-y-6", !activeEvent && "opacity-70 pointer-events-none")}>
                {dynamicPhaseChecklists.map((phase) => (
                  <div key={phase.phase} className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest border-b pb-1">{phase.phase}</h4>
                    <div className="space-y-2 pt-1">
                      {phase.tasks.map((task) => {
                        const isChecked = currentActiveOrViewing.completedTasks?.includes(task.id);
                        return (
                          <div key={task.id} className="flex items-start space-x-2">
                            <Checkbox 
                              id={task.id} 
                              checked={isChecked}
                              onCheckedChange={() => activeEvent && canManage && handleToggleTask(task.id, task.label)}
                              className="mt-0.5"
                              disabled={!activeEvent || !canManage}
                            />
                            <Label 
                              htmlFor={task.id} 
                              className={cn("text-xs leading-relaxed cursor-pointer", isChecked && "text-muted-foreground line-through")}
                            >
                              {task.label}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-none border">
              <CardHeader className="bg-muted/10 py-3">
                <CardTitle className="text-sm font-headline">ERP Quick Reference</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-[11px] font-medium leading-relaxed">
                  <p className="font-bold text-emerald-800 mb-1">Standard Announcement:</p>
                  "Safeviate Flight Center is responding to a reported incident. Our emergency team has been activated. No further details are confirmed at this time."
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Critical Reminders</p>
                  <ul className="text-xs space-y-2 list-disc pl-4">
                    <li>Direct all media inquiries to the Media Officer.</li>
                    <li>Do not speculate on aircraft or personnel identity.</li>
                    <li>Ensure all actions are timestamped in this diary.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="h-full min-h-0 overflow-y-auto no-scrollbar">
          <div className="border-b px-3 py-1.5">
            <div className="flex h-8 items-center justify-center gap-2 text-center">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">Past Sessions</h4>
            </div>
          </div>
          <div className="space-y-4 p-6">
            {(events || []).filter(e => e.status === 'Closed').map(event => (
              <div
                key={event.id}
                onClick={() => setSelectedEventId(event.id)}
                className="group flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/10"
              >
                <div className="space-y-1">
                  <p className="font-bold">{event.title}</p>
                  <p className="text-xs text-muted-foreground">Started: {format(new Date(event.startedAt), 'PPP p')}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">Closed</Badge>
              </div>
            ))}
            {(!events || events.filter(e => e.status === 'Closed').length === 0) && (
              <p className="py-10 text-center italic text-muted-foreground">No archived sessions.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
