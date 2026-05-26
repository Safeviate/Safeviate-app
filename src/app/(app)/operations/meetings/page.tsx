'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, isSameDay, parse } from 'date-fns';
import { CalendarDays, CheckCircle2, Mail, Plus, Save, Users } from 'lucide-react';
import { MainPageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs } from '@/components/ui/tabs';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import Link from 'next/link';
import type { MeetingActionItem, MeetingAgendaItem, MeetingRecordData, MeetingStatus, MeetingType } from '@/types/meeting';

type PersonnelLite = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type MeetingFormState = MeetingRecordData;

const MEETING_TYPE_OPTIONS: Array<{ value: MeetingType; label: string }> = [
  { value: 'Operations', label: 'Operations' },
  { value: 'Safety', label: 'Safety' },
  { value: 'Quality', label: 'Quality' },
  { value: 'Training', label: 'Training' },
  { value: 'General', label: 'General' },
  { value: 'Board', label: 'Board' },
  { value: 'Other', label: 'Other' },
];

const MEETING_STATUS_OPTIONS: Array<{ value: MeetingStatus; label: string }> = [
  { value: 'Scheduled', label: 'Scheduled' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
];

const ACTION_STATUS_OPTIONS: Array<MeetingActionItem['status']> = ['Open', 'In Progress', 'Completed', 'Cancelled'];

const parseLocalDate = (value: string) => {
  const parsed = parse(value, 'yyyy-MM-dd', new Date());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const toDateInput = (value?: string | null) => {
  if (!value) return format(new Date(), 'yyyy-MM-dd');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? format(new Date(), 'yyyy-MM-dd') : format(date, 'yyyy-MM-dd');
};

const getPersonName = (person?: PersonnelLite) => {
  if (!person) return 'Unassigned';
  return `${person.firstName || ''} ${person.lastName || ''}`.trim() || person.email || person.id;
};

const createAgendaItem = (item?: Partial<MeetingAgendaItem>): MeetingAgendaItem => ({
  id: item?.id || crypto.randomUUID(),
  title: item?.title || '',
  notes: item?.notes || '',
});

const createActionItem = (item?: Partial<MeetingActionItem>): MeetingActionItem => ({
  id: item?.id || crypto.randomUUID(),
  description: item?.description || '',
  assigneeId: item?.assigneeId || '',
  assigneeName: item?.assigneeName || '',
  dueDate: item?.dueDate || format(new Date(), 'yyyy-MM-dd'),
  status: item?.status || 'Open',
});

const createBlankMeeting = (meetingNumber: string): MeetingFormState => ({
  id: crypto.randomUUID(),
  meetingNumber,
  title: '',
  meetingType: 'Operations',
  meetingDate: format(new Date(), 'yyyy-MM-dd'),
  startTime: '09:00',
  endTime: '10:00',
  location: 'Main Board Room',
  description: '',
  inviteeIds: [],
  agendaItems: [createAgendaItem()],
  agendaNotes: '',
  agendaSentAt: null,
  minutes: '',
  minutesSentAt: null,
  actionItems: [createActionItem()],
  status: 'Scheduled',
});

function MeetingFormDialog({
  isOpen,
  onOpenChange,
  meeting,
  meetingNumber,
  personnel,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: MeetingFormState | null;
  meetingNumber: string;
  personnel: PersonnelLite[];
  onSave: (meeting: MeetingFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<MeetingFormState | null>(meeting);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(meeting);
  }, [meeting]);

  const updateField = <K extends keyof MeetingFormState>(field: K, value: MeetingFormState[K]) => {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  };

  const save = async () => {
    if (!form) return;
    setIsSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!form) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black uppercase tracking-tight">
            {meeting?.id ? 'Edit Meeting' : 'New Meeting'}
          </DialogTitle>
          <DialogDescription>
            Capture the agenda now, then publish minutes and action items after the meeting finishes.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[72vh] pr-4">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Meeting Number</Label>
                <Input value={form.meetingNumber || meetingNumber} readOnly className="h-11 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Status</Label>
                <Select value={form.status} onValueChange={(value) => updateField('status', value as MeetingStatus)}>
                  <SelectTrigger className="h-11 font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Title</Label>
                <Input value={form.title} onChange={(event) => updateField('title', event.target.value)} className="h-11 font-bold" placeholder="Weekly operations sync" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Type</Label>
                <Select value={form.meetingType} onValueChange={(value) => updateField('meetingType', value as MeetingType)}>
                  <SelectTrigger className="h-11 font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Date</Label>
                <Input type="date" value={form.meetingDate} onChange={(event) => updateField('meetingDate', event.target.value)} className="h-11 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Start Time</Label>
                <Input type="time" value={form.startTime} onChange={(event) => updateField('startTime', event.target.value)} className="h-11 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">End Time</Label>
                <Input type="time" value={form.endTime} onChange={(event) => updateField('endTime', event.target.value)} className="h-11 font-bold" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest">Location</Label>
              <Input value={form.location} onChange={(event) => updateField('location', event.target.value)} className="h-11 font-bold" placeholder="Main board room" />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest">Description</Label>
              <Textarea value={form.description || ''} onChange={(event) => updateField('description', event.target.value)} className="min-h-[80px]" placeholder="Short summary of what this meeting is about." />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Invitees</Label>
                <Badge variant="outline" className="text-[10px] font-black uppercase">
                  {form.inviteeIds.length} invited
                </Badge>
              </div>
              <ScrollArea className="max-h-48 rounded-lg border">
                <div className="grid gap-2 p-3 md:grid-cols-2">
                  {personnel.map((person) => {
                    const fullName = getPersonName(person);
                    const checked = form.inviteeIds.includes(person.id);
                    return (
                      <label key={person.id} className="flex cursor-pointer items-start gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const nextIds = event.target.checked
                              ? [...form.inviteeIds, person.id]
                              : form.inviteeIds.filter((id) => id !== person.id);
                            updateField('inviteeIds', nextIds);
                          }}
                          className="mt-1 h-4 w-4 rounded border-input"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground">{fullName}</span>
                          <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{person.email || person.id}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Agenda</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateField('agendaItems', [...form.agendaItems, createAgendaItem()])}
                  className="text-[10px] font-black uppercase"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Item
                </Button>
              </div>
              <div className="space-y-3">
                {form.agendaItems.map((item, index) => (
                  <div key={item.id} className="rounded-lg border bg-muted/10 p-3">
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest">Item {index + 1}</Label>
                        <Input
                          value={item.title}
                          onChange={(event) => {
                            const next = [...form.agendaItems];
                            next[index] = { ...item, title: event.target.value };
                            updateField('agendaItems', next);
                          }}
                          className="h-11 font-bold"
                          placeholder="Topic title"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest">Notes</Label>
                        <Input
                          value={item.notes || ''}
                          onChange={(event) => {
                            const next = [...form.agendaItems];
                            next[index] = { ...item, notes: event.target.value };
                            updateField('agendaItems', next);
                          }}
                          className="h-11 font-bold"
                          placeholder="Talking points"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-[10px] font-black uppercase"
                          onClick={() => updateField('agendaItems', form.agendaItems.filter((_, itemIndex) => itemIndex !== index))}
                          disabled={form.agendaItems.length === 1}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Agenda Notes</Label>
                <Textarea value={form.agendaNotes || ''} onChange={(event) => updateField('agendaNotes', event.target.value)} className="min-h-[88px]" placeholder="Extra agenda context or notes to send with the invite." />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Minutes & Action Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateField('actionItems', [...form.actionItems, createActionItem()])}
                  className="text-[10px] font-black uppercase"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Action
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Minutes</Label>
                <Textarea value={form.minutes || ''} onChange={(event) => updateField('minutes', event.target.value)} className="min-h-[120px]" placeholder="Record the meeting minutes here." />
              </div>
              <div className="space-y-3">
                {form.actionItems.map((item, index) => (
                  <div key={item.id} className="rounded-lg border bg-muted/10 p-3">
                    <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_0.7fr_auto]">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest">Action {index + 1}</Label>
                        <Input
                          value={item.description}
                          onChange={(event) => {
                            const next = [...form.actionItems];
                            next[index] = { ...item, description: event.target.value };
                            updateField('actionItems', next);
                          }}
                          className="h-11 font-bold"
                          placeholder="Follow-up task"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest">Assignee</Label>
                        <Select
                          value={item.assigneeId}
                          onValueChange={(value) => {
                            const next = [...form.actionItems];
                            const assignee = personnel.find((person) => person.id === value);
                            next[index] = { ...item, assigneeId: value, assigneeName: getPersonName(assignee) };
                            updateField('actionItems', next);
                          }}
                        >
                          <SelectTrigger className="h-11 font-bold">
                            <SelectValue placeholder="Assign to" />
                          </SelectTrigger>
                          <SelectContent>
                            {personnel.map((person) => (
                              <SelectItem key={person.id} value={person.id}>
                                {getPersonName(person)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest">Due</Label>
                        <Input
                          type="date"
                          value={toDateInput(item.dueDate)}
                          onChange={(event) => {
                            const next = [...form.actionItems];
                            next[index] = { ...item, dueDate: event.target.value };
                            updateField('actionItems', next);
                          }}
                          className="h-11 font-bold"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest">Status</Label>
                        <Select
                          value={item.status}
                          onValueChange={(value) => {
                            const next = [...form.actionItems];
                            next[index] = { ...item, status: value as MeetingActionItem['status'] };
                            updateField('actionItems', next);
                          }}
                        >
                          <SelectTrigger className="h-11 font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACTION_STATUS_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-[10px] font-black uppercase"
                          onClick={() => updateField('actionItems', form.actionItems.filter((_, itemIndex) => itemIndex !== index))}
                          disabled={form.actionItems.length === 1}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="font-black uppercase">
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={isSaving} className="font-black uppercase">
            <Save className="mr-2 h-4 w-4" />
            Save Meeting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MeetingsPage() {
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/operations/meetings' });
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const [meetings, setMeetings] = useState<MeetingRecordData[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelLite[]>([]);
  const [viewMode, setViewMode] = useState<'repository' | 'calendar'>('repository');
  const [activeTab, setActiveTab] = useState('scheduled');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<MeetingFormState | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [meetingsResponse, summaryResponse] = await Promise.all([
        fetch('/api/meetings', { cache: 'no-store' }),
        fetch('/api/dashboard-summary', { cache: 'no-store' }),
      ]);
      const meetingsPayload = await meetingsResponse.json().catch(() => ({ meetings: [] }));
      const summaryPayload = await summaryResponse.json().catch(() => ({ personnel: [] }));
      setMeetings(Array.isArray(meetingsPayload.meetings) ? meetingsPayload.meetings : []);
      setPersonnel(Array.isArray(summaryPayload.personnel) ? summaryPayload.personnel : []);
    } catch (error) {
      console.error('[meetings] load failed', error);
      setMeetings([]);
      setPersonnel([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    window.addEventListener('safeviate-meetings-updated', loadData);
    return () => window.removeEventListener('safeviate-meetings-updated', loadData);
  }, []);

  const currentUserName = `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || userProfile?.email || 'User';

  const sortedMeetings = useMemo(() => {
    return [...meetings].sort((a, b) => {
      const left = parseLocalDate(a.meetingDate).getTime();
      const right = parseLocalDate(b.meetingDate).getTime();
      return right - left;
    });
  }, [meetings]);

  const visibleMeetings = useMemo(() => {
    if (activeTab === 'all') return sortedMeetings;
    if (activeTab === 'completed') return sortedMeetings.filter((meeting) => meeting.status === 'Completed');
    return sortedMeetings.filter((meeting) => meeting.status === 'Scheduled');
  }, [activeTab, sortedMeetings]);

  const selectedDayMeetings = useMemo(() => {
    return sortedMeetings.filter((meeting) => isSameDay(parseLocalDate(meeting.meetingDate), selectedCalendarDate));
  }, [selectedCalendarDate, sortedMeetings]);

  const todayMeetings = useMemo(() => {
    return sortedMeetings.filter((meeting) => isSameDay(parseLocalDate(meeting.meetingDate), new Date()));
  }, [sortedMeetings]);

  const currentMonthMeetings = useMemo(() => {
    return sortedMeetings.filter((meeting) => meeting.meetingDate.slice(0, 7) === format(selectedCalendarDate, 'yyyy-MM'));
  }, [selectedCalendarDate, sortedMeetings]);

  const calendarDayCounts = useMemo(() => {
    return sortedMeetings.reduce<Record<string, number>>((acc, meeting) => {
      const key = meeting.meetingDate.slice(0, 10);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [sortedMeetings]);

  const calendarDayMarkers = useMemo(() => {
    return sortedMeetings.reduce<Record<string, { count: number; primaryType?: string }>>((acc, meeting) => {
      const key = meeting.meetingDate.slice(0, 10);
      const existing = acc[key] || { count: 0, primaryType: meeting.meetingType };
      const next = {
        count: existing.count + 1,
        primaryType: existing.count === 0 ? meeting.meetingType : existing.primaryType,
      };

      if (existing.count > 0) {
        const currentPrimary = existing.primaryType || '';
        if (currentPrimary !== meeting.meetingType) {
          const currentPrimaryCount = sortedMeetings.filter((item) => item.meetingDate.slice(0, 10) === key && item.meetingType === currentPrimary).length;
          const nextTypeCount = sortedMeetings.filter((item) => item.meetingDate.slice(0, 10) === key && item.meetingType === meeting.meetingType).length;
          if (nextTypeCount > currentPrimaryCount) {
            next.primaryType = meeting.meetingType;
          }
        }
      }

      acc[key] = next;
      return acc;
    }, {});
  }, [sortedMeetings]);

  const stats = useMemo(() => {
    const openActions = meetings.reduce((count, meeting) => count + meeting.actionItems.filter((item) => item.status !== 'Completed' && item.status !== 'Cancelled').length, 0);
    return {
      scheduled: meetings.filter((meeting) => meeting.status === 'Scheduled').length,
      completed: meetings.filter((meeting) => meeting.status === 'Completed').length,
      agendaSent: meetings.filter((meeting) => Boolean(meeting.agendaSentAt)).length,
      openActions,
    };
  }, [meetings]);

  const tabs = [
    { value: 'scheduled', label: `Scheduled (${stats.scheduled})` },
    { value: 'completed', label: `Completed (${stats.completed})` },
    { value: 'all', label: `All (${meetings.length})` },
  ];

  const viewTabs = [
    { value: 'repository', label: `Repository (${meetings.length})` },
    { value: 'calendar', label: 'Calendar' },
  ];

  const calendarLegend = [
    { label: 'Operations', className: 'bg-sky-600 text-white' },
    { label: 'Safety', className: 'bg-amber-600 text-white' },
    { label: 'Quality', className: 'bg-emerald-600 text-white' },
    { label: 'Training', className: 'bg-violet-600 text-white' },
    { label: 'Board', className: 'bg-slate-700 text-white' },
    { label: 'General', className: 'bg-zinc-600 text-white' },
  ];

  const openCreateDialog = () => {
    const nextNumber = `MTG-${String(meetings.length + 1).padStart(4, '0')}`;
    setActiveMeeting(createBlankMeeting(nextNumber));
    setIsDialogOpen(true);
  };

  const openEditDialog = (meeting: MeetingRecordData) => {
    setActiveMeeting({
      ...meeting,
      meetingDate: toDateInput(meeting.meetingDate),
      agendaItems: meeting.agendaItems.length ? meeting.agendaItems : [createAgendaItem()],
      actionItems: meeting.actionItems.length ? meeting.actionItems : [createActionItem()],
      inviteeIds: meeting.inviteeIds || [],
    });
    setIsDialogOpen(true);
  };

  const persistMeeting = async (meeting: MeetingFormState, action: 'save' | 'sendAgenda' | 'sendMinutes' = 'save') => {
    const payload = {
      ...meeting,
      createdByName: meeting.createdByName || currentUserName,
      meetingDate: toDateInput(meeting.meetingDate),
    };

    const response = await fetch(action === 'save' ? '/api/meetings' : '/api/meetings', {
      method: action === 'save' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting: payload, action }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to save meeting.');
    }

    const result = await response.json().catch(() => ({}));
    const nextMeeting = (result.meeting || payload) as MeetingRecordData;
    setMeetings((current) => {
      const next = current.filter((item) => item.id !== nextMeeting.id);
      return [nextMeeting, ...next];
    });
    window.dispatchEvent(new Event('safeviate-meetings-updated'));
  };

  const handleSendAgenda = async (meeting: MeetingRecordData) => {
    try {
      await persistMeeting(meeting, 'sendAgenda');
      toast({ title: 'Agenda Sent', description: `Agenda for ${meeting.title} has been sent to invitees.` });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Send Failed', description: error instanceof Error ? error.message : 'Could not send agenda.' });
    }
  };

  const handleSendMinutes = async (meeting: MeetingRecordData) => {
    try {
      await persistMeeting(meeting, 'sendMinutes');
      toast({ title: 'Minutes Sent', description: `Minutes for ${meeting.title} have been sent to invitees.` });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Send Failed', description: error instanceof Error ? error.message : 'Could not send minutes.' });
    }
  };

  const handleSaveMeeting = async (meeting: MeetingFormState) => {
    try {
      await persistMeeting(meeting, 'save');
      toast({ title: 'Meeting Saved', description: `${meeting.title || meeting.meetingNumber} has been updated.` });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Save Failed', description: error instanceof Error ? error.message : 'Could not save meeting.' });
      throw error;
    }
  };

  const renderMeetingCard = (meeting: MeetingRecordData) => {
    const invitees = (meeting.inviteeIds || [])
      .map((id) => personnel.find((person) => person.id === id))
      .filter((person): person is PersonnelLite => Boolean(person));
    const activeActions = meeting.actionItems.filter((item) => item.status !== 'Completed' && item.status !== 'Cancelled');

    return (
      <Card key={meeting.id} className="overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">{meeting.title || meeting.meetingNumber}</p>
              <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.08em]">
                {meeting.meetingType}
              </Badge>
            </div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {meeting.meetingNumber} · {format(parseLocalDate(meeting.meetingDate), 'dd MMM yyyy')} · {meeting.startTime} - {meeting.endTime}
            </p>
          </div>
          <Badge variant={meeting.status === 'Completed' ? 'default' : meeting.status === 'Cancelled' ? 'destructive' : 'secondary'} className="text-[10px] font-black uppercase py-0.5 px-3">
            {meeting.status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Location</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{meeting.location}</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Invitees</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{invitees.length} invited</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Agenda</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{meeting.agendaItems.length} items</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Open Actions</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{activeActions.length}</p>
            </div>
          </div>

          {meeting.description ? (
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Description</p>
              <p className="mt-1 text-sm text-foreground">{meeting.description}</p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Agenda Preview</p>
              <div className="mt-2 space-y-1">
                {meeting.agendaItems.map((item) => (
                  <div key={item.id} className="text-sm font-medium text-foreground">
                    {item.title || 'Untitled item'}
                    {item.notes ? <span className="ml-1 text-muted-foreground">- {item.notes}</span> : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Minutes Preview</p>
              <p className="mt-2 text-sm text-foreground line-clamp-4">{meeting.minutes || 'Minutes not captured yet.'}</p>
            </div>
          </div>

          {meeting.actionItems.length > 0 ? (
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Action Items</p>
              <div className="mt-2 space-y-2">
                {meeting.actionItems.map((item) => (
                  <div key={item.id} className="flex flex-col gap-1 rounded-md border bg-muted/10 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{item.description}</p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {item.assigneeName || item.assigneeId || 'Unassigned'} · Due {format(parseLocalDate(item.dueDate), 'dd MMM yy')}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-black uppercase">
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button asChild type="button" variant="outline" size="sm" className="text-[10px] font-black uppercase">
              <Link href={`/operations/meetings/${meeting.id}`}>View</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" className="text-[10px] font-black uppercase" onClick={() => openEditDialog(meeting)}>
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-[10px] font-black uppercase"
              disabled={meeting.inviteeIds.length === 0}
              onClick={() => void handleSendAgenda(meeting)}
            >
              <Mail className="mr-1 h-4 w-4" />
              Send Agenda
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-[10px] font-black uppercase"
              disabled={meeting.status !== 'Completed' || meeting.inviteeIds.length === 0}
              onClick={() => void handleSendMinutes(meeting)}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              Send Minutes
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full space-y-6 px-1 pt-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return (
    <div className="max-w-[1100px] mx-auto w-full space-y-6 px-1 pt-4">
      <Card className="overflow-hidden border shadow-none">
        <MainPageHeader
          title="Meetings"
          description="A repository for agendas, minutes, and follow-up items."
          actions={(
            <Button type="button" onClick={openCreateDialog} className="font-black uppercase text-xs">
              <Plus className="mr-2 h-4 w-4" />
              New Meeting
            </Button>
          )}
        />

        <CardContent className="p-0">
          <div className="border-b bg-muted/20 px-3 py-3">
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'repository' | 'calendar')} className="w-full">
              <ResponsiveTabRow
                value={viewMode}
                onValueChange={(value) => setViewMode(value as 'repository' | 'calendar')}
                placeholder="Select View"
                className="w-full mb-3"
                options={viewTabs.map((tab) => ({
                  value: tab.value,
                  label: tab.label,
                  icon: CalendarDays,
                }))}
              />
            </Tabs>
          </div>

          <div className="grid gap-4 border-b bg-muted/5 px-4 py-4 md:grid-cols-4">
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Scheduled</p>
              <p className="mt-2 text-3xl font-black">{stats.scheduled}</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Completed</p>
              <p className="mt-2 text-3xl font-black">{stats.completed}</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Agenda Sent</p>
              <p className="mt-2 text-3xl font-black">{stats.agendaSent}</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Open Actions</p>
              <p className="mt-2 text-3xl font-black">{stats.openActions}</p>
            </div>
          </div>

          {viewMode === 'calendar' ? (
            <div className="grid gap-4 p-4 lg:grid-cols-[360px_1fr]">
              <Card className="overflow-hidden border shadow-none">
                <CardHeader className="border-b bg-muted/20 px-4 py-3">
                  <p className="text-sm font-black uppercase tracking-tight">Calendar</p>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Today</p>
                      <p className="mt-1 text-2xl font-black">{todayMeetings.length}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Selected Day</p>
                      <p className="mt-1 text-2xl font-black">{selectedDayMeetings.length}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">This Month</p>
                      <p className="mt-1 text-2xl font-black">{currentMonthMeetings.length}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.08em]">
                      Today: {todayMeetings.length}
                    </Badge>
                    <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.08em]">
                      Selected: {selectedDayMeetings.length}
                    </Badge>
                    <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.08em]">
                      Month: {currentMonthMeetings.length}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {calendarLegend.map((item) => (
                      <Badge key={item.label} variant="outline" className={`h-6 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.08em] ${item.className}`}>
                        {item.label}
                      </Badge>
                    ))}
                  </div>
                  <CustomCalendar
                    selectedDate={selectedCalendarDate}
                    onDateSelect={(date) => date && setSelectedCalendarDate(date)}
                    dayCounts={calendarDayCounts}
                    dayMarkers={calendarDayMarkers}
                  />
                </CardContent>
              </Card>

              <Card className="overflow-hidden border shadow-none">
                <CardHeader className="border-b bg-muted/20 px-4 py-3">
                  <p className="text-sm font-black uppercase tracking-tight">
                    {format(selectedCalendarDate, 'dd MMM yyyy')} meetings
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  {selectedDayMeetings.length > 0 ? (
                    selectedDayMeetings.map((meeting) => renderMeetingCard(meeting))
                  ) : (
                    <div className="rounded-lg border bg-background px-6 py-10 text-center text-sm italic text-muted-foreground">
                      No meetings scheduled for this day.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <>
              <div className="border-b bg-muted/20 px-3 py-3">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <ResponsiveTabRow
                  value={activeTab}
                  onValueChange={setActiveTab}
                  placeholder="Select Filter"
                  className="w-full"
                  options={tabs.map((tab) => ({
                    value: tab.value,
                    label: tab.label,
                    icon: CalendarDays,
                  }))}
              />
            </Tabs>
          </div>
              <div className="p-4">
                <ResponsiveCardGrid
                  items={visibleMeetings}
                  isLoading={false}
                  gridClassName="md:grid-cols-2 xl:grid-cols-3"
                  className="gap-4"
                  renderItem={(meeting) => renderMeetingCard(meeting)}
                  emptyState={(
                    <div className="rounded-lg border bg-background px-6 py-10 text-center text-sm italic text-muted-foreground">
                      No meetings match this filter.
                    </div>
                  )}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <MeetingFormDialog
        isOpen={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setActiveMeeting(null);
        }}
        meeting={activeMeeting}
        meetingNumber={activeMeeting?.meetingNumber || `MTG-${String(meetings.length + 1).padStart(4, '0')}`}
        personnel={personnel}
        onSave={handleSaveMeeting}
      />
    </div>
  );
}
