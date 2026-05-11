'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MainPageHeader, HEADER_MOBILE_ACTION_BUTTON_CLASS } from "@/components/page-header";
import type { Aircraft } from '@/types/aircraft';
import type { AircraftMaintenanceWindow } from '@/types/aircraft';
import type { PilotProfile, Personnel } from '@/app/(app)/users/personnel/page';
import { format, startOfDay, getHours, getMinutes, differenceInMinutes, isSameDay, setHours, setMinutes, isBefore, addDays, subDays, startOfToday, parse } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon, ChevronDown, Lock, Pencil, Trash2, Wrench } from 'lucide-react';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { BookingForm } from './booking-form';
import { DebriefRoomBookingForm } from './debrief-room-booking-form';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import type { Booking } from '@/types/booking';
import type { Vehicle } from '@/types/vehicle';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getBlockingBookingForTracking, isBookingEligibleForTracking } from '@/lib/booking-tracking';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';

const HOUR_HEIGHT_PX = 60;
const TOTAL_HOURS = 24;
const TIME_COL_WIDTH_CLASS = "w-20";
const LANE_WIDTH_CLASS = "w-[150px]";
const LANE_FLEX_CLASS = "flex-[0_0_150px]";
const ROOM_LANE_WIDTH_CLASS = "w-[190px]";
const ROOM_LANE_FLEX_CLASS = "flex-[0_0_190px]";
const VEHICLE_LANE_WIDTH_CLASS = "w-[220px]";
const VEHICLE_LANE_FLEX_CLASS = "flex-[0_0_220px]";
const BRIEFING_ROOMS = [
    { id: 'briefing-room-1', name: 'Briefing Room 1' },
    { id: 'briefing-room-2', name: 'Briefing Room 2' },
    { id: 'meeting-room', name: 'Meeting Room' },
];
const SCHEDULE_VIEWS = [
    { value: 'aircraft', label: 'Aircraft' },
    { value: 'rooms', label: 'Briefing Rooms' },
    { value: 'vehicles', label: 'Vehicles' },
] as const;
const REQUIRED_CHECK_APPROVAL_KEYS = ['massAndBalance', 'navlog', 'preFlight', 'postFlight', 'photos', 'fuelUplift'] as const;

const combineDateAndTime = (dateStr: string, timeStr: string): Date => {
    if (!dateStr || !timeStr) {
        return new Date('invalid');
    }
    return parse(`${dateStr} ${timeStr}`, 'yyyy-MM-dd HH:mm', new Date());
};

const isDateWithinWindow = (date: string, window: Pick<AircraftMaintenanceWindow, 'fromDate' | 'toDate'>) =>
  date >= window.fromDate && date <= window.toDate;

const formatMaintenanceWindowRange = (window: Pick<AircraftMaintenanceWindow, 'fromDate' | 'toDate'>) => {
  const from = parse(window.fromDate, 'yyyy-MM-dd', new Date());
  const to = parse(window.toDate, 'yyyy-MM-dd', new Date());
  return `${format(from, 'dd MMM')} - ${format(to, 'dd MMM')}`;
};

const BookingItem = ({
    booking,
    onBookingClick,
    onManualApprove,
    canManualApprove,
    isApproving,
    selectedDate,
    peopleMap,
    allBookingsForAircraft,
    compact,
}: {
    booking: Booking;
    onBookingClick: (booking: Booking) => void;
    onManualApprove: (booking: Booking) => void;
    canManualApprove: (booking: Booking) => boolean;
    isApproving: boolean;
    selectedDate: Date;
    peopleMap: Map<string, string>;
    allBookingsForAircraft: Booking[];
    compact?: boolean;
}) => {
    const isNonInstructorBooking = ['Rental', 'Charter', 'Ferry Flight', 'Maintenance'].includes(booking.type);
    const compactCrewLabel = isNonInstructorBooking
        ? `PIC ${booking.studentId ? (peopleMap.get(booking.studentId) || booking.studentId) : 'N/A'}`
        : `Inst ${booking.instructorId ? (peopleMap.get(booking.instructorId) || booking.instructorId) : 'N/A'} · Stud ${booking.studentId ? (peopleMap.get(booking.studentId) || booking.studentId) : 'N/A'}`;
    const segments = [];

    segments.push({
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.isOvernight ? '23:59' : booking.endTime
    });
    
    if (booking.isOvernight && booking.overnightBookingDate && booking.overnightEndTime) {
        segments.push({
            date: booking.overnightBookingDate,
            startTime: '00:00',
            endTime: booking.overnightEndTime
        });
    }

    const formattedSelectedDate = format(selectedDate, 'yyyy-MM-dd');
    return (
      <>
        {segments.map((segment, index) => {
            if (segment.date !== formattedSelectedDate) {
                return null;
            }

            const startTime = combineDateAndTime(segment.date, segment.startTime);
            const endTime = combineDateAndTime(segment.date, segment.endTime);

            if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return null;

            const top = (getHours(startTime) * 60 + getMinutes(startTime)) * (HOUR_HEIGHT_PX / 60);
            const durationMinutes = Math.max(0, differenceInMinutes(endTime, startTime));
            const minBlockMinutes = compact ? 48 : 40;
            const height = Math.max(durationMinutes, minBlockMinutes) * (HOUR_HEIGHT_PX / 60); 
            
            const isCancelled = booking.status === 'Cancelled' || booking.status === 'Cancelled with Reason';
            const statusLabel = booking.status === 'Completed' ? 'Complete' : booking.status;
            const trackEligible = (booking.navlog?.legs?.length || 0) > 0 && isBookingEligibleForTracking(allBookingsForAircraft, booking);
            const blockingBooking = trackEligible ? null : getBlockingBookingForTracking(allBookingsForAircraft, booking);

            return (
                <div
                    key={`${booking.id}-${index}`}
                    className={cn(
                        'absolute left-1 right-1 px-1 py-0.5 text-[9px] leading-none shadow-md flex flex-col justify-between items-stretch z-10 border border-gray-400/50 cursor-pointer hover:opacity-90 transition-opacity rounded overflow-hidden',
                        compact && 'px-0.5 py-0.25',
                        isCancelled && 'bg-muted text-muted-foreground opacity-60',
                        booking.status === 'Completed' && 'bg-muted text-muted-foreground border-slate-300',
                        booking.status === 'Approved' && 'bg-green-600 text-white border-green-700',
                        booking.status === 'Confirmed' && booking.preFlight && !booking.postFlight && 'bg-amber-500 text-primary-foreground',
                        booking.status === 'Confirmed' && !booking.preFlight && 'bg-primary text-primary-foreground'
                    )}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onBookingClick(booking);
                    }}
                >
                    <div className={cn('flex w-full flex-1 flex-col text-center', compact ? 'justify-center gap-0.25' : 'justify-evenly')}>
                        <p className={cn('w-full truncate font-medium leading-tight', compact ? 'text-[6px]' : 'text-[8px]')}>
                            #{booking.bookingNumber} - {booking.type}
                        </p>
                        {compact ? (
                          <p className="w-full truncate text-[7px] font-normal leading-tight opacity-90">
                              {compactCrewLabel}
                          </p>
                        ) : (
                          <>
                            {!isNonInstructorBooking ? (
                                <p className="w-full truncate text-[8px] font-normal leading-tight opacity-90">
                                    Inst: {booking.instructorId ? (peopleMap.get(booking.instructorId) || booking.instructorId) : 'N/A'}
                                </p>
                            ) : null}
                            <p className="w-full truncate text-[8px] font-normal leading-tight opacity-90">
                                {isNonInstructorBooking ? 'PIC' : 'Stud'}: {booking.studentId ? (peopleMap.get(booking.studentId) || booking.studentId) : 'N/A'}
                            </p>
                          </>
                        )}
                    </div>
                    <div className="mt-0.5 flex w-full items-center justify-center">
                        {booking.status !== 'Approved' && booking.status !== 'Completed' && !isCancelled && canManualApprove(booking) ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={cn(
                                  'h-5 w-full rounded-md border-input bg-background px-1.5 text-[7px] font-medium uppercase tracking-[0.18em] text-foreground shadow-sm hover:bg-accent justify-center',
                                  compact && 'px-1'
                                )}
                                disabled={isApproving}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onManualApprove(booking);
                                }}
                            >
                                {isApproving ? <Loader2 className="mr-1 h-2 w-2 animate-spin" /> : <CheckCircle2 className="mr-1 h-2 w-2" />}
                                {compact ? 'Approve' : 'Approve Booking'}
                            </Button>
                        ) : (
                            <div className="flex w-full flex-col items-center justify-center gap-0.5 text-center">
                                {isCancelled && <p className="text-[7px] font-medium uppercase tracking-wide">{compact ? 'Canx' : 'Cancelled'}</p>}
                                {booking.status === 'Completed' && <p className="text-[7px] font-medium uppercase tracking-wide">{compact ? 'Done' : statusLabel}</p>}
                                {booking.status === 'Approved' && (
                                    <p className="text-[7px] font-medium uppercase tracking-wide">
                                        {booking.approvedByName ? `Approved by ${booking.approvedByName}` : 'Approved'}
                                    </p>
                                )}
                                {booking.status === 'Approved' && booking.approvedAt ? (
                                    <p className="text-[7px] font-normal leading-none opacity-80">{format(new Date(booking.approvedAt), 'PPP p')}</p>
                                ) : null}
                                {booking.status !== 'Approved' && booking.status !== 'Completed' && !isCancelled && !canManualApprove(booking) ? (
                                    <p className="text-[7px] font-medium uppercase tracking-wide opacity-80">Awaiting instructor approval</p>
                                ) : null}
                                {blockingBooking ? (
                                    <Badge variant="outline" className="h-4 rounded-md border-amber-200 bg-amber-50 px-1.5 text-[6px] font-black uppercase tracking-[0.12em] text-amber-800">
                                        <Lock className="mr-0.5 h-2 w-2" />
                                        Locked #{blockingBooking.bookingNumber}
                                    </Badge>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>
            )
        })}
      </>
    )
}

const RoomBookingItem = ({
    booking,
    onBookingClick,
    selectedDate,
    peopleMap,
    allBookingsForRoom,
    compact,
}: {
    booking: Booking;
    onBookingClick: (booking: Booking) => void;
    selectedDate: Date;
    peopleMap: Map<string, string>;
    allBookingsForRoom: Booking[];
    compact?: boolean;
}) => {
    const segments = [{
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.isOvernight ? '23:59' : booking.endTime
    }];

    if (booking.isOvernight && booking.overnightBookingDate && booking.overnightEndTime) {
        segments.push({
            date: booking.overnightBookingDate,
            startTime: '00:00',
            endTime: booking.overnightEndTime
        });
    }

    const formattedSelectedDate = format(selectedDate, 'yyyy-MM-dd');
    return (
      <>
        {segments.map((segment, index) => {
            if (segment.date !== formattedSelectedDate) {
                return null;
            }

            const startTime = combineDateAndTime(segment.date, segment.startTime);
            const endTime = combineDateAndTime(segment.date, segment.endTime);

            if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return null;

            const top = (getHours(startTime) * 60 + getMinutes(startTime)) * (HOUR_HEIGHT_PX / 60);
            const durationMinutes = Math.max(0, differenceInMinutes(endTime, startTime));
            const minBlockMinutes = compact ? 48 : 40;
            const height = Math.max(durationMinutes, minBlockMinutes) * (HOUR_HEIGHT_PX / 60);
            const sessionType = booking.sessionType || booking.type || 'Meeting';

            return (
                <div
                    key={`${booking.id}-${index}`}
                    className={cn(
                        'absolute left-1 right-1 px-1 py-0.5 text-[9px] leading-none shadow-md flex flex-col justify-between items-stretch z-10 border border-gray-400/50 cursor-pointer hover:opacity-90 transition-opacity rounded overflow-hidden',
                        compact && 'px-0.5 py-0.25',
                        sessionType === 'Meeting' && 'bg-indigo-600 text-white border-indigo-700',
                        sessionType === 'Ground School' && 'bg-sky-600 text-white border-sky-700',
                        sessionType === 'Student Debrief' && 'bg-emerald-600 text-white border-emerald-700',
                        !['Meeting', 'Ground School', 'Student Debrief'].includes(sessionType) && 'bg-primary text-primary-foreground'
                    )}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onBookingClick(booking);
                    }}
                >
                    <div className={cn('flex w-full flex-1 flex-col text-center', compact ? 'justify-center gap-0.25' : 'justify-evenly')}>
                        <p className={cn('w-full truncate font-medium leading-tight', compact ? 'text-[6px]' : 'text-[8px]')}>
                            #{booking.bookingNumber} - {sessionType}
                        </p>
                        {compact ? (
                          <p className="w-full truncate text-[6px] font-normal leading-tight opacity-90">
                              {booking.sessionType === 'Ground School' && booking.courseName
                                ? booking.courseName
                                : booking.sessionType === 'Meeting' && booking.meetingType
                                  ? booking.meetingType
                                  : `${booking.studentIds?.length || (booking.studentId ? 1 : 0)} students`}
                          </p>
                        ) : (
                          <>
                            <p className="w-full truncate text-[8px] font-normal leading-tight opacity-90">
                                Inst: {booking.instructorId ? (peopleMap.get(booking.instructorId) || booking.instructorId) : 'N/A'}
                            </p>
                            <p className="w-full truncate text-[8px] font-normal leading-tight opacity-90">
                                {booking.sessionType === 'Ground School' && booking.courseName ? booking.courseName : booking.sessionType === 'Meeting' && booking.meetingType ? booking.meetingType : `${booking.studentIds?.length || (booking.studentId ? 1 : 0)} students`}
                            </p>
                          </>
                        )}
                    </div>
                </div>
            );
        })}
      </>
    );
};

type VehicleUsageLite = {
    id: string;
    vehicleId: string;
    vehicleRegistrationNumber: string;
    vehicleLabel: string;
    status: 'Booked Out' | 'Booked In';
    bookedOutAt: string;
    bookedOutByName: string;
    bookedOutOdometer: number;
    purpose: string;
    destination: string;
    notes: string;
    bookedInAt: string | null;
    bookedInByName: string | null;
    bookedInOdometer: number | null;
    returnNotes: string;
};

const VehicleBookingItem = ({
    booking,
    onBookingClick,
    selectedDate,
    compact,
}: {
    booking: VehicleUsageLite;
    onBookingClick: (booking: VehicleUsageLite) => void;
    selectedDate: Date;
    compact?: boolean;
}) => {
    const start = new Date(booking.bookedOutAt);
    const end = booking.bookedInAt ? new Date(booking.bookedInAt) : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999);
    const formattedSelectedDate = format(selectedDate, 'yyyy-MM-dd');

    if (Number.isNaN(start.getTime()) || (booking.bookedInAt && Number.isNaN(end.getTime()))) return null;
    if (format(start, 'yyyy-MM-dd') !== formattedSelectedDate && (!booking.bookedInAt || format(end, 'yyyy-MM-dd') !== formattedSelectedDate)) return null;

    const top = (getHours(start) * 60 + getMinutes(start)) * (HOUR_HEIGHT_PX / 60);
    const durationMinutes = Math.max(compact ? 48 : 40, differenceInMinutes(end, start));
    const height = durationMinutes * (HOUR_HEIGHT_PX / 60);

    return (
      <div
        className={cn(
          'absolute left-1 right-1 px-1 py-0.5 text-[9px] leading-none shadow-md flex flex-col justify-between items-stretch z-10 border cursor-pointer hover:opacity-90 transition-opacity rounded overflow-hidden',
          compact && 'px-0.5 py-0.25',
          booking.status === 'Booked Out' ? 'bg-amber-600 text-white border-amber-700' : 'bg-emerald-600 text-white border-emerald-700'
        )}
        style={{ top: `${top}px`, height: `${height}px` }}
        onClick={(e) => {
          e.stopPropagation();
          onBookingClick(booking);
        }}
      >
        <div className={cn('flex w-full flex-1 flex-col text-center', compact ? 'justify-center gap-0.25' : 'justify-evenly')}>
          <p className={cn('w-full truncate font-medium leading-tight', compact ? 'text-[6px]' : 'text-[8px]')}>
            {booking.vehicleRegistrationNumber}
          </p>
          <p className={cn('w-full truncate font-normal leading-tight opacity-90', compact ? 'text-[6px]' : 'text-[8px]')}>
            {booking.purpose || 'Vehicle usage'}
          </p>
          <p className={cn('w-full truncate font-normal leading-tight opacity-90', compact ? 'hidden' : 'text-[8px]')}>
            {booking.destination || booking.bookedOutByName}
          </p>
        </div>
      </div>
    );
};

export default function SchedulePage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { tenantId, userProfile } = useUserProfile();
  const { hasPermission, isLoading: isPermissionsLoading } = usePermissions();
  const [selectedDate, setSelectedDate] = useState(() => {
    const requestedDate = searchParams?.get('date');
    if (!requestedDate) return startOfToday();
    const parsedDate = parse(requestedDate, 'yyyy-MM-dd', new Date());
    return Number.isNaN(parsedDate.getTime()) ? startOfToday() : startOfDay(parsedDate);
  });

  const [now, setNow] = useState(new Date());
  const [nowLinePosition, setNowLinePosition] = useState(0);
  const [showNowLine, setShowNowLine] = useState(false);
  
  const [isBookingFormOpen, setIsBookingFormOpen] = useState(false);
  const [bookingFormData, setBookingFormData] = useState<{ aircraft: Aircraft; startTime: Date; allBookingsForAircraft: Booking[]; booking?: Booking } | null>(null);
  const [isRoomBookingFormOpen, setIsRoomBookingFormOpen] = useState(false);
  const [roomBookingFormData, setRoomBookingFormData] = useState<{ roomId: string; roomName: string; startTime: Date; booking?: Booking } | null>(null);
  const [scheduleView, setScheduleView] = useState<(typeof SCHEDULE_VIEWS)[number]['value']>('aircraft');
  const [dataVersion, setDataVersion] = useState(0);
  const [isMaintenanceDialogOpen, setIsMaintenanceDialogOpen] = useState(false);
  const [selectedMaintenanceAircraftId, setSelectedMaintenanceAircraftId] = useState<string>('');
  const [maintenanceTitle, setMaintenanceTitle] = useState('Maintenance');
  const [maintenanceFromDate, setMaintenanceFromDate] = useState(format(startOfToday(), 'yyyy-MM-dd'));
  const [maintenanceToDate, setMaintenanceToDate] = useState(format(startOfToday(), 'yyyy-MM-dd'));
  const [maintenanceNotes, setMaintenanceNotes] = useState('');
  const [editingMaintenanceWindowId, setEditingMaintenanceWindowId] = useState<string | null>(null);
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
  const highlightedAircraftId = searchParams?.get('aircraftId') || null;

  // PERMISSIONS
  const canManageSchedule = hasPermission('bookings-schedule-manage');

  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [vehicleUsageRecords, setVehicleUsageRecords] = useState<VehicleUsageLite[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [instructors, setInstructors] = useState<PilotProfile[]>([]);
  const [students, setStudents] = useState<PilotProfile[]>([]);
  const [privatePilots, setPrivatePilots] = useState<PilotProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [approvingBookingId, setApprovingBookingId] = useState<string | null>(null);

  useEffect(() => {
    const requestedDate = searchParams?.get('date');
    if (!requestedDate) return;
    const parsedDate = parse(requestedDate, 'yyyy-MM-dd', new Date());
    if (Number.isNaN(parsedDate.getTime())) return;
    const normalizedDate = startOfDay(parsedDate);
    setSelectedDate((current) => (isSameDay(current, normalizedDate) ? current : normalizedDate));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!tenantId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const [scheduleResponse, summaryResponse, vehicleResponse] = await Promise.all([
          fetch('/api/schedule-data', { cache: 'no-store' }),
          fetch('/api/dashboard-summary', { cache: 'no-store' }),
          fetch('/api/vehicle-usage', { cache: 'no-store' }),
        ]);

        const schedulePayload = await scheduleResponse.json();
        const summaryPayload = await summaryResponse.json();
        const vehiclePayload = await vehicleResponse.json().catch(() => ({ vehicles: [], usageRecords: [] }));
        if (!cancelled) {
          const scheduleBookings = schedulePayload.bookings ?? [];
          const apiAircraft = schedulePayload.aircraft ?? [];
          setAircraft(apiAircraft);
          setAllBookings(scheduleBookings);
          setVehicles(Array.isArray(vehiclePayload?.vehicles) ? vehiclePayload.vehicles : []);
          setVehicleUsageRecords(Array.isArray(vehiclePayload?.usageRecords) ? vehiclePayload.usageRecords : []);

          const today = format(selectedDate, 'yyyy-MM-dd');
          const yesterday = format(subDays(selectedDate, 1), 'yyyy-MM-dd');
          setBookings(
            scheduleBookings.filter((booking: Booking) => booking.date === today || booking.date === yesterday)
          );

          setPersonnel(summaryPayload.personnel ?? []);
          setInstructors(summaryPayload.instructors ?? []);
          setStudents(summaryPayload.students ?? []);
          setPrivatePilots(summaryPayload.privatePilots ?? []);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    const handlePersonnelUpdated = () => {
      if (!cancelled) {
        setDataVersion(v => v + 1);
      }
    };
    window.addEventListener('safeviate-personnel-updated', handlePersonnelUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-personnel-updated', handlePersonnelUpdated);
    };
  }, [tenantId, selectedDate, dataVersion]);

  const allPilots = useMemo(() => {
      const uniquePeople = new Map<string, Personnel | PilotProfile>();
      [...(personnel || []), ...(students || []), ...(instructors || []), ...(privatePilots || [])].forEach((person) => {
          uniquePeople.set(person.id, person);
      });
      return Array.from(uniquePeople.values());
  }, [personnel, students, instructors, privatePilots]);

  const peopleMap = useMemo(() => {
      const map = new Map<string, string>();
      allPilots.forEach((person) => {
          map.set(person.id, `${person.firstName} ${person.lastName}`);
      });
      return map;
  }, [allPilots]);

  const sortedVehicleUsageRecords = useMemo(
    () => [...vehicleUsageRecords].sort((a, b) => new Date(b.bookedOutAt).getTime() - new Date(a.bookedOutAt).getTime()),
    [vehicleUsageRecords]
  );

  const activeVehicleUsageByVehicleId = useMemo(() => {
    const activeMap = new Map<string, VehicleUsageLite>();
    for (const record of sortedVehicleUsageRecords) {
      if (record.status === 'Booked Out' && !activeMap.has(record.vehicleId)) {
        activeMap.set(record.vehicleId, record);
      }
    }
    return activeMap;
  }, [sortedVehicleUsageRecords]);

  const vehicleUsageStats = useMemo(() => {
    const totalVehicles = vehicles.length;
    const bookedOutCount = activeVehicleUsageByVehicleId.size;
    return { totalVehicles, bookedOutCount, availableCount: Math.max(totalVehicles - bookedOutCount, 0) };
  }, [vehicles, activeVehicleUsageByVehicleId]);

  const refreshBookings = useCallback(() => {
    setDataVersion(v => v + 1);
  }, []);

  const canManualApprove = useCallback((booking: Booking) => {
    const userId = userProfile?.id;
    const userRole = userProfile?.role?.toLowerCase();
    return ((!!userId && booking.instructorId === userId) || userRole === 'developer' || userRole === 'dev');
  }, [userProfile?.id, userProfile?.role]);

  const handleManualApproveBooking = useCallback(async (booking: Booking) => {
    if (!canManualApprove(booking)) {
      toast({ variant: 'destructive', title: 'Permission Denied', description: 'Only the assigned instructor can approve this flight.' });
      return;
    }

    const confirmed = window.confirm(`Approve booking #${booking.bookingNumber} now?`);
    if (!confirmed) return;

    setApprovingBookingId(booking.id);
    try {
      const res = await fetch('/api/bookings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking: {
            ...booking,
            status: 'Approved',
            approvedById: userProfile?.id || booking.approvedById,
            approvedByName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : booking.approvedByName,
            approvedAt: new Date().toISOString(),
          },
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Approval failed.');
      }

      window.dispatchEvent(new Event('safeviate-bookings-updated'));
      refreshBookings();
      toast({ title: 'Flight Approved', description: `Booking #${booking.bookingNumber} was manually approved.` });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Approval Failed', description: error instanceof Error ? error.message : 'Approval failed.' });
    } finally {
      setApprovingBookingId((current) => (current === booking.id ? null : current));
    }
  }, [canManualApprove, refreshBookings, toast, userProfile]);

  useEffect(() => {
    const calculateNowLine = () => {
        const currentTime = new Date();
        setNow(currentTime);
        const isToday = isSameDay(currentTime, selectedDate);
        setShowNowLine(isToday);

        if (isToday) {
            const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();
            const position = minutes * (HOUR_HEIGHT_PX / 60);
            setNowLinePosition(position);
        }
    };
    
    calculateNowLine();
    const interval = setInterval(calculateNowLine, 60000);
    return () => clearInterval(interval);
  }, [selectedDate]);
  
  const handleSlotClick = (ac: Aircraft, hour: number) => {
    const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
    const activeMaintenance = (ac.maintenanceWindows || []).filter((window) => isDateWithinWindow(selectedDateKey, window));
    if (activeMaintenance.length > 0) {
      const nextMaintenance = activeMaintenance[0];
      toast({
        variant: 'destructive',
        title: 'Aircraft In Maintenance',
        description: `${ac.tailNumber} is blocked for ${nextMaintenance.title || 'maintenance'} through ${format(parse(nextMaintenance.toDate, 'yyyy-MM-dd', new Date()), 'PPP')}.`,
      });
      return;
    }

    const slotTime = setMinutes(setHours(selectedDate, hour), 0);
    const currentTime = new Date();
    
    if (isSameDay(selectedDate, currentTime) && hour < getHours(now)) {
        toast({
            variant: 'destructive',
            title: 'Slot Unavailable',
            description: 'Past time slots cannot be used for new bookings.',
        });
        return; 
    }
    if (isBefore(selectedDate, startOfDay(currentTime))) {
        toast({
            variant: 'destructive',
            title: 'Date Unavailable',
            description: 'You cannot create a new booking on a past date.',
        });
        return;
    }

    const isCurrentHourSlot = isSameDay(slotTime, currentTime) && getHours(slotTime) === getHours(now);
    const startTime = isCurrentHourSlot ? now : slotTime;
    
    const allBookingsForAircraft = allBookings?.filter(b => b.aircraftId === ac.id) || [];

    setBookingFormData({ aircraft: ac, startTime, allBookingsForAircraft });
    setIsBookingFormOpen(true);

    if (!isPermissionsLoading && !canManageSchedule) {
        toast({
            title: 'Read-Only Access',
            description: 'You can view booking details, but you do not have permission to create or edit bookings.',
        });
    }
  };
  
  const handleBookingClick = (booking: Booking) => {
    const aircraftForBooking = aircraft?.find(a => a.id === booking.aircraftId);
    if (aircraftForBooking) {
      const allBookingsForAircraft = allBookings?.filter(b => b.aircraftId === aircraftForBooking.id) || [];
      const updatedBooking = allBookings?.find(b => b.id === booking.id) || booking;
      setBookingFormData({ aircraft: aircraftForBooking, startTime: combineDateAndTime(updatedBooking.date, updatedBooking.startTime), allBookingsForAircraft, booking: updatedBooking });
      setIsBookingFormOpen(true);
    }
  };

  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
  const briefingRoomBookings = useMemo(() => {
    return (bookings || []).filter((booking) => {
      if (!booking.briefingRoomId) return false;
      if (booking.date === selectedDateKey) return true;
      if (booking.isOvernight && booking.overnightBookingDate === selectedDateKey) return true;
      return false;
    });
  }, [bookings, selectedDateKey]);

  const handleRoomSlotClick = (room: { id: string; name: string }, hour: number) => {
    const slotTime = setMinutes(setHours(selectedDate, hour), 0);
    const currentTime = new Date();

    if (isSameDay(selectedDate, currentTime) && hour < getHours(now)) {
      toast({
        variant: 'destructive',
        title: 'Slot Unavailable',
        description: 'Past time slots cannot be used for new room bookings.',
      });
      return;
    }

    if (isBefore(selectedDate, startOfDay(currentTime))) {
      toast({
        variant: 'destructive',
        title: 'Date Unavailable',
        description: 'You cannot create a room booking on a past date.',
      });
      return;
    }

    const isCurrentHourSlot = isSameDay(slotTime, currentTime) && getHours(slotTime) === getHours(now);
    const startTime = isCurrentHourSlot ? now : slotTime;

    setRoomBookingFormData({ roomId: room.id, roomName: room.name, startTime });
    setIsRoomBookingFormOpen(true);
  };

  const handleRoomBookingClick = (booking: Booking) => {
    const room = BRIEFING_ROOMS.find((entry) => entry.id === booking.briefingRoomId);
    if (!room) return;
    const updatedBooking = allBookings?.find((entry) => entry.id === booking.id) || booking;
    setRoomBookingFormData({
      roomId: room.id,
      roomName: room.name,
      startTime: combineDateAndTime(updatedBooking.date, updatedBooking.startTime),
      booking: updatedBooking,
    });
    setIsRoomBookingFormOpen(true);
  };
  
  const hasAircraft = (aircraft || []).length > 0;
  const isAircraftView = scheduleView === 'aircraft';
  const isRoomsView = scheduleView === 'rooms';
  const isVehiclesView = scheduleView === 'vehicles';
  const extraLanes = hasAircraft ? ['', '', ''] : [];

  const resetMaintenanceDialog = useCallback(() => {
    setSelectedMaintenanceAircraftId(aircraft[0]?.id || '');
    setMaintenanceTitle('Maintenance');
    const today = format(startOfToday(), 'yyyy-MM-dd');
    setMaintenanceFromDate(today);
    setMaintenanceToDate(today);
    setMaintenanceNotes('');
    setEditingMaintenanceWindowId(null);
  }, [aircraft]);

  useEffect(() => {
    if (!selectedMaintenanceAircraftId && aircraft[0]?.id) {
      setSelectedMaintenanceAircraftId(aircraft[0].id);
    }
  }, [aircraft, selectedMaintenanceAircraftId]);

  const handleOpenMaintenanceDialog = useCallback(() => {
    resetMaintenanceDialog();
    setIsMaintenanceDialogOpen(true);
  }, [resetMaintenanceDialog]);

  const persistAircraftMaintenanceWindows = useCallback(async (aircraftRecord: Aircraft, windows: AircraftMaintenanceWindow[]) => {
    const nextAircraft = {
      ...aircraftRecord,
      maintenanceWindows: windows,
    };

    const response = await fetch(`/api/aircraft/${aircraftRecord.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aircraft: nextAircraft }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to save maintenance window.');
    }

    setAircraft((current) => current.map((entry) => (entry.id === aircraftRecord.id ? nextAircraft : entry)));
    setDataVersion((value) => value + 1);
    return nextAircraft;
  }, []);

  const handleEditMaintenanceWindow = useCallback((aircraftRecord: Aircraft, window: AircraftMaintenanceWindow) => {
    setSelectedMaintenanceAircraftId(aircraftRecord.id);
    setMaintenanceTitle(window.title);
    setMaintenanceFromDate(window.fromDate);
    setMaintenanceToDate(window.toDate);
    setMaintenanceNotes(window.notes || '');
    setEditingMaintenanceWindowId(window.id);
    setIsMaintenanceDialogOpen(true);
  }, []);

  const handleDeleteMaintenanceWindow = useCallback(async (aircraftRecord: Aircraft, maintenanceWindow: AircraftMaintenanceWindow) => {
    const confirmed = window.confirm(`Remove ${maintenanceWindow.title} from ${aircraftRecord.tailNumber}?`);
    if (!confirmed) return;

    setIsSavingMaintenance(true);
    try {
      await persistAircraftMaintenanceWindows(
        aircraftRecord,
        (aircraftRecord.maintenanceWindows || []).filter((entry) => entry.id !== maintenanceWindow.id)
      );
      toast({
        title: 'Maintenance Removed',
        description: `${aircraftRecord.tailNumber} is no longer blocked for ${maintenanceWindow.title}.`,
      });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to remove maintenance window.',
      });
    } finally {
      setIsSavingMaintenance(false);
    }
  }, [persistAircraftMaintenanceWindows, toast]);

  const handleSaveMaintenance = useCallback(async () => {
    const selectedAircraft = aircraft.find((entry) => entry.id === selectedMaintenanceAircraftId);
    if (!selectedAircraft) {
      toast({ variant: 'destructive', title: 'Aircraft Required', description: 'Select the aircraft that will be in maintenance.' });
      return;
    }

    if (!maintenanceFromDate || !maintenanceToDate) {
      toast({ variant: 'destructive', title: 'Dates Required', description: 'Choose both the maintenance from and to dates.' });
      return;
    }

    if (maintenanceToDate < maintenanceFromDate) {
      toast({ variant: 'destructive', title: 'Invalid Dates', description: 'The maintenance end date must be on or after the start date.' });
      return;
    }

    setIsSavingMaintenance(true);
    try {
      const nextWindow: AircraftMaintenanceWindow = {
        id: editingMaintenanceWindowId || crypto.randomUUID(),
        title: maintenanceTitle.trim() || 'Maintenance',
        fromDate: maintenanceFromDate,
        toDate: maintenanceToDate,
        notes: maintenanceNotes.trim() || undefined,
        status: 'Scheduled',
      };
      const existingWindows = selectedAircraft.maintenanceWindows || [];
      const nextWindows = editingMaintenanceWindowId
        ? existingWindows.map((entry) => (entry.id === editingMaintenanceWindowId ? nextWindow : entry))
        : [...existingWindows, nextWindow];

      await persistAircraftMaintenanceWindows(selectedAircraft, nextWindows);
      setIsMaintenanceDialogOpen(false);
      toast({
        title: editingMaintenanceWindowId ? 'Maintenance Updated' : 'Maintenance Scheduled',
        description: `${selectedAircraft.tailNumber} is blocked from ${format(parse(maintenanceFromDate, 'yyyy-MM-dd', new Date()), 'PPP')} to ${format(parse(maintenanceToDate, 'yyyy-MM-dd', new Date()), 'PPP')}.`,
      });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Failed to save maintenance window.',
      });
    } finally {
      setIsSavingMaintenance(false);
    }
  }, [aircraft, editingMaintenanceWindowId, maintenanceFromDate, maintenanceNotes, maintenanceTitle, maintenanceToDate, persistAircraftMaintenanceWindows, selectedMaintenanceAircraftId, toast]);

  if (isLoading) {
      return <div className="max-w-[1100px] mx-auto w-full px-1 pt-4"><Skeleton className="h-[600px] w-full" /></div>;
  }

  const isTodaySelected = isSameDay(selectedDate, startOfToday());
  const isPastDaySelected = isBefore(selectedDate, startOfToday());
  const scheduleActionControls = isMobile ? (
    <div className="flex w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              HEADER_MOBILE_ACTION_BUTTON_CLASS,
              "h-9 w-full justify-between gap-2"
            )}
          >
            <span className="truncate">Schedule Actions</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
          <DropdownMenuItem onSelect={() => setSelectedDate(subDays(selectedDate, 1))} className="text-[10px] font-bold uppercase">
            Previous Day
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSelectedDate(startOfToday())} className="text-[10px] font-bold uppercase">
            Today
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSelectedDate(addDays(selectedDate, 1))} className="text-[10px] font-bold uppercase">
            Next Day
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-[10px] font-bold uppercase">
              Pick Date
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="p-2">
              <CustomCalendar
                selectedDate={selectedDate}
                onDateSelect={(date) => date && setSelectedDate(startOfDay(date))}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {canManageSchedule ? (
            <DropdownMenuItem onSelect={handleOpenMaintenanceDialog} className="text-[10px] font-bold uppercase">
              Schedule Maintenance
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled className="text-[10px] font-bold uppercase">
              Read Only
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : (
    <div className="flex w-full flex-wrap items-center justify-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>Previous Day</Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(selectedDate, 'PPP')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <CustomCalendar
            selectedDate={selectedDate}
            onDateSelect={(date) => date && setSelectedDate(startOfDay(date))}
          />
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>Next Day</Button>
      {canManageSchedule ? (
        <Button variant="outline" size="sm" onClick={handleOpenMaintenanceDialog}>
          <Wrench className="mr-2 h-4 w-4" />
          Schedule Maintenance
        </Button>
      ) : (
        <Badge variant="outline" className="h-9 gap-1.5 text-muted-foreground bg-muted/20 border-border px-3 uppercase text-[10px] font-bold">
          <Lock className="h-3.5 w-3.5" /> Read Only
        </Badge>
      )}
    </div>
  );

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full px-1 pt-4 overflow-hidden">
        <Card className="overflow-hidden flex-grow flex flex-col shadow-none border">
            <MainPageHeader 
                title="Daily Schedule"
                description=""
                centerActions
                actions={scheduleActionControls}
            />
            <div className="border-b bg-muted/20 px-3 py-2">
                <Tabs value={scheduleView} onValueChange={(value) => setScheduleView(value as typeof scheduleView)} className="w-full">
                    <ResponsiveTabRow
                        value={scheduleView}
                        onValueChange={(value) => setScheduleView(value as typeof scheduleView)}
                        placeholder="Select View"
                        className="w-full"
                        options={SCHEDULE_VIEWS.map((view) => ({
                            value: view.value,
                            label: view.label,
                        }))}
                        centerTabs
                        buttonLikeTabs
                    />
                </Tabs>
            </div>
            <CardContent className="p-0 flex-grow flex flex-col overflow-hidden">
                <div className={cn("w-full flex-grow overflow-auto bg-card custom-scrollbar", !isAircraftView && 'hidden')} style={{ height: 'calc(100vh - 220px)' }}>
                    {hasAircraft ? (
                        <div className="min-w-full w-fit">
                            <div className="flex sticky top-0 z-50 bg-swimlane-header border-b border-white/10">
                                <div className={cn(
                                  TIME_COL_WIDTH_CLASS,
                                  isMobile && 'w-14',
                                  "flex-shrink-0 flex items-center justify-center font-bold text-[10px] text-swimlane-header-foreground uppercase tracking-wider h-12 bg-swimlane-header border-r sticky left-0 z-50 shadow-[2px_0_5px_rgba(0,0,0,0.1)]"
                                )}>
                                    TIME
                                </div>
                                {(aircraft || []).map((ac) => (
                                    <div
                                        key={ac.id}
                                        className={cn(
                                          LANE_FLEX_CLASS,
                                          LANE_WIDTH_CLASS,
                                          isMobile && "w-[112px] flex-[0_0_112px]",
                                          "border-r flex items-center justify-center font-bold text-xs px-2 text-center text-swimlane-header-foreground h-12 bg-swimlane-header whitespace-normal leading-tight",
                                          highlightedAircraftId === ac.id && "bg-primary text-primary-foreground"
                                        )}
                                    >
                                        {ac.tailNumber}
                                    </div>
                                ))}
                                {extraLanes.map((_, laneIdx) => (
                                    <div
                                        key={`extra-h-${laneIdx}`}
                                        className={cn(LANE_FLEX_CLASS, LANE_WIDTH_CLASS, isMobile && "w-[112px] flex-[0_0_112px]", "border-r bg-swimlane-header h-12")}
                                    />
                                ))}
                            </div>

                            <div className="flex relative">
                                <div className={cn(
                                  TIME_COL_WIDTH_CLASS,
                                  isMobile && 'w-14',
                                  "flex-shrink-0 border-r bg-swimlane-header sticky left-0 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.05)]"
                                )}>
                                    {Array.from({ length: TOTAL_HOURS }).map((_, hour) => (
                                        <div
                                            key={hour}
                                            className={cn("flex items-center justify-center border-b font-mono font-bold text-swimlane-header-foreground bg-swimlane-header", isMobile ? 'text-[9px]' : 'text-[10px] md:text-xs')}
                                            style={{ height: `${HOUR_HEIGHT_PX}px` }}
                                        >
                                            {format(new Date(0, 0, 0, hour), 'HH:mm')}
                                        </div>
                                    ))}
                                </div>

                                {(aircraft || []).map((ac) => {
                                    const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
                                    const relevantBookings = (bookings || []).filter((b) => {
                                        if (b.isOvernight) {
                                            return (b.aircraftId === ac.id) && (b.date === selectedDateKey || b.overnightBookingDate === selectedDateKey);
                                        }
                                        return (b.aircraftId === ac.id) && (b.date === selectedDateKey);
                                    });
                                    const activeMaintenance = (ac.maintenanceWindows || []).filter((window) => isDateWithinWindow(selectedDateKey, window));
                                    const isAircraftInMaintenance = activeMaintenance.length > 0;

                                    return (
                                        <div
                                            key={ac.id}
                                            className={cn(LANE_FLEX_CLASS, LANE_WIDTH_CLASS, "border-r relative")}
                                        >
                                            {Array.from({ length: TOTAL_HOURS }).map((_, hour) => {
                                                const isPast = isPastDaySelected || (isTodaySelected && hour < getHours(now));
                                                return (
                                                    <div
                                                        key={hour}
                                                        className={cn(
                                                            "border-b relative transition-colors",
                                                            isPast || isAircraftInMaintenance ? "bg-red-500/[0.02] cursor-not-allowed" : "cursor-pointer hover:bg-accent/50",
                                                            !canManageSchedule && !isPast && !isAircraftInMaintenance && "cursor-default"
                                                        )}
                                                        style={{ height: `${HOUR_HEIGHT_PX}px` }}
                                                        onClick={() => handleSlotClick(ac, hour)}
                                                    />
                                                );
                                            })}
                                            {activeMaintenance.length > 0 ? (
                                                <div className="absolute inset-x-1 top-1 bottom-1 z-20 rounded-md border-2 border-amber-600 bg-amber-100/90 px-2 py-2 shadow-sm">
                                                    <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-900">
                                                        <Wrench className="h-3 w-3" />
                                                        In Maintenance
                                                    </div>
                                                    <div className="mt-2 space-y-2">
                                                        {activeMaintenance.slice(0, 3).map((window) => (
                                                            <div key={window.id} className="rounded-md border border-amber-700/20 bg-white/70 px-2 py-1.5">
                                                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-950">
                                                                    {window.title}
                                                                </div>
                                                                <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-800">
                                                                    {formatMaintenanceWindowRange(window)}
                                                                </div>
                                                                {window.notes ? (
                                                                    <div className="mt-1 line-clamp-2 text-[10px] font-medium text-amber-950/80">
                                                                        {window.notes}
                                                                    </div>
                                                                ) : null}
                                                                {canManageSchedule ? (
                                                                    <div className="mt-2 flex items-center justify-end gap-1">
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-7 border-amber-700/30 bg-white/80 px-2 text-[9px] font-black uppercase text-amber-950 hover:bg-white"
                                                                            onClick={() => handleEditMaintenanceWindow(ac, window)}
                                                                        >
                                                                            <Pencil className="mr-1 h-3 w-3" />
                                                                            Edit
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-7 border-amber-700/30 bg-white/80 px-2 text-[9px] font-black uppercase text-amber-950 hover:bg-white"
                                                                            onClick={() => handleDeleteMaintenanceWindow(ac, window)}
                                                                        >
                                                                            <Trash2 className="mr-1 h-3 w-3" />
                                                                            Delete
                                                                        </Button>
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ))}
                                                        {activeMaintenance.length > 3 ? (
                                                            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-900">
                                                                +{activeMaintenance.length - 3} more windows
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ) : null}
                                            {relevantBookings.map((booking) => (
                                                <BookingItem
                                                    key={booking.id}
                                                    booking={booking}
                                                    onBookingClick={handleBookingClick}
                                                    onManualApprove={handleManualApproveBooking}
                                                    canManualApprove={canManualApprove}
                                                    isApproving={approvingBookingId === booking.id}
                                                    selectedDate={selectedDate}
                                                    peopleMap={peopleMap}
                                                    allBookingsForAircraft={allBookings?.filter((entry) => entry.aircraftId === ac.id) || []}
                                                    compact={isMobile}
                                                />
                                            ))}
                                        </div>
                                    );
                                })}

                                {extraLanes.map((_, laneIdx) => (
                                    <div
                                        key={`extra-${laneIdx}`}
                                        className={cn(LANE_FLEX_CLASS, LANE_WIDTH_CLASS, "border-r bg-muted/5 opacity-50")}
                                    >
                                        {Array.from({ length: TOTAL_HOURS }).map((_, hour) => (
                                            <div
                                                key={hour}
                                                className="border-b"
                                                style={{ height: `${HOUR_HEIGHT_PX}px` }}
                                            />
                                        ))}
                                    </div>
                                ))}

                                {showNowLine && (
                                    <>
                                        <div
                                            className="absolute left-0 right-0 bg-red-500/[0.08] z-20 pointer-events-none"
                                            style={{ top: 0, height: `${nowLinePosition}px` }}
                                        />
                                        <div
                                            className="absolute left-0 right-0 h-0.5 bg-red-500 z-30 pointer-events-none"
                                            style={{ top: `${nowLinePosition}px` }}
                                        >
                                            <div className="absolute -left-1.5 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full" />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center">
                            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">No Aircraft Configured</p>
                            <p className="max-w-md text-sm text-muted-foreground">
                                Add at least one aircraft before creating bookings from the daily schedule.
                            </p>
                            <Button asChild size="sm" className="font-black uppercase text-xs">
                                <Link href="/assets/aircraft/new">Add Aircraft</Link>
                            </Button>
                        </div>
                    )}
                </div>
                <div className={cn("mt-6 rounded-xl border bg-background shadow-none overflow-hidden", !isRoomsView && 'hidden')}>
                        <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-black uppercase tracking-tight">Debrief Rooms</p>
                                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                    Ground school, student debriefs, and meeting room sessions.
                                </p>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-black uppercase">
                                {briefingRoomBookings.length} bookings
                            </Badge>
                        </div>
                        <div className="w-full overflow-auto bg-card custom-scrollbar" style={{ height: 'calc(100vh - 220px)' }}>
                            <div className="min-w-full w-fit">
                                <div className="flex sticky top-0 z-50 bg-swimlane-header border-b border-white/10">
                                    <div className={cn(TIME_COL_WIDTH_CLASS, "flex-shrink-0 flex items-center justify-center font-bold text-[10px] text-swimlane-header-foreground uppercase tracking-wider h-12 bg-swimlane-header border-r sticky left-0 z-50 shadow-[2px_0_5px_rgba(0,0,0,0.1)]")}>
                                        TIME
                                    </div>
                                    {BRIEFING_ROOMS.map((room) => (
                                        <div
                                            key={room.id}
                                            className={cn(
                                                ROOM_LANE_FLEX_CLASS,
                                                ROOM_LANE_WIDTH_CLASS,
                                                "border-r flex items-center justify-center font-bold text-xs px-2 text-center text-swimlane-header-foreground h-12 bg-swimlane-header whitespace-normal leading-tight"
                                            )}
                                        >
                                            {room.name}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex relative">
                                    <div className={cn(TIME_COL_WIDTH_CLASS, "flex-shrink-0 border-r bg-swimlane-header sticky left-0 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.05)]")}>
                                        {Array.from({ length: TOTAL_HOURS }).map((_, hour) => (
                                            <div
                                                key={hour}
                                                className="flex items-center justify-center border-b text-[10px] md:text-xs font-mono font-bold text-swimlane-header-foreground bg-swimlane-header"
                                                style={{ height: `${HOUR_HEIGHT_PX}px` }}
                                            >
                                                {format(new Date(0, 0, 0, hour), 'HH:mm')}
                                            </div>
                                        ))}
                                    </div>

                                    {BRIEFING_ROOMS.map((room) => {
                                        const roomBookings = briefingRoomBookings.filter((booking) => booking.briefingRoomId === room.id);

                                        return (
                                            <div
                                                key={room.id}
                                                className={cn(ROOM_LANE_FLEX_CLASS, ROOM_LANE_WIDTH_CLASS, isMobile && "w-[120px] flex-[0_0_120px]", "border-r relative")}
                                            >
                                                {Array.from({ length: TOTAL_HOURS }).map((_, hour) => {
                                                    const isPast = isPastDaySelected || (isTodaySelected && hour < getHours(now));
                                                    return (
                                                        <div
                                                            key={hour}
                                                            className={cn(
                                                                "border-b relative transition-colors",
                                                                isPast ? "bg-red-500/[0.02] cursor-not-allowed" : "cursor-pointer hover:bg-accent/50",
                                                                !canManageSchedule && !isPast && "cursor-default"
                                                            )}
                                                            style={{ height: `${HOUR_HEIGHT_PX}px` }}
                                                            onClick={() => handleRoomSlotClick(room, hour)}
                                                        />
                                                    );
                                                })}

                                                {roomBookings.map((booking) => (
                                                    <RoomBookingItem
                                                        key={booking.id}
                                                        booking={booking}
                                                        onBookingClick={handleRoomBookingClick}
                                                        selectedDate={selectedDate}
                                                        peopleMap={peopleMap}
                                                        allBookingsForRoom={allBookings?.filter((entry) => entry.briefingRoomId === room.id) || []}
                                                        compact={isMobile}
                                                    />
                                                ))}
                                            </div>
                                        );
                                    })}

                                    {showNowLine && (
                                        <>
                                            <div
                                                className="absolute left-0 right-0 bg-red-500/[0.08] z-20 pointer-events-none"
                                                style={{ top: 0, height: `${nowLinePosition}px` }}
                                            />
                                            <div
                                                className="absolute left-0 right-0 h-0.5 bg-red-500 z-30 pointer-events-none"
                                                style={{ top: `${nowLinePosition}px` }}
                                            >
                                                <div className="absolute -left-1.5 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full" />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                <div className={cn("mt-6 rounded-xl border bg-background shadow-none overflow-hidden", !isVehiclesView && 'hidden')}>
                        <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-black uppercase tracking-tight">Vehicle Bookings</p>
                                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                    Booked-out vehicles, destinations, and return status.
                                </p>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-black uppercase">
                                {vehicleUsageStats.bookedOutCount} booked out
                            </Badge>
                        </div>
                        <div className="w-full overflow-auto bg-card custom-scrollbar" style={{ height: 'calc(100vh - 220px)' }}>
                            <div className="min-w-full w-fit">
                                <div className="flex sticky top-0 z-50 bg-swimlane-header border-b border-white/10">
                                    <div className={cn(TIME_COL_WIDTH_CLASS, "flex-shrink-0 flex items-center justify-center font-bold text-[10px] text-swimlane-header-foreground uppercase tracking-wider h-12 bg-swimlane-header border-r sticky left-0 z-50 shadow-[2px_0_5px_rgba(0,0,0,0.1)]")}>
                                        TIME
                                    </div>
                                    {vehicles.map((vehicle) => (
                                        <div
                                            key={vehicle.id}
                                            className={cn(
                                                VEHICLE_LANE_FLEX_CLASS,
                                                VEHICLE_LANE_WIDTH_CLASS,
                                                isMobile && "w-[128px] flex-[0_0_128px]",
                                                "border-r flex items-center justify-center font-bold text-xs px-2 text-center text-swimlane-header-foreground h-12 bg-swimlane-header whitespace-normal leading-tight"
                                            )}
                                        >
                                            {vehicle.registrationNumber}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex relative">
                                    <div className={cn(
                                      TIME_COL_WIDTH_CLASS,
                                      isMobile && 'w-14',
                                      "flex-shrink-0 border-r bg-swimlane-header sticky left-0 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.05)]"
                                    )}>
                                        {Array.from({ length: TOTAL_HOURS }).map((_, hour) => (
                                            <div
                                                key={hour}
                                                className={cn("flex items-center justify-center border-b font-mono font-bold text-swimlane-header-foreground bg-swimlane-header", isMobile ? 'text-[9px]' : 'text-[10px] md:text-xs')}
                                                style={{ height: `${HOUR_HEIGHT_PX}px` }}
                                            >
                                                {format(new Date(0, 0, 0, hour), 'HH:mm')}
                                            </div>
                                        ))}
                                    </div>

                                    {vehicles.map((vehicle) => {
                                        const vehicleBookings = sortedVehicleUsageRecords.filter((record) => record.vehicleId === vehicle.id);
                                        return (
                                            <div key={vehicle.id} className={cn(VEHICLE_LANE_FLEX_CLASS, VEHICLE_LANE_WIDTH_CLASS, isMobile && "w-[128px] flex-[0_0_128px]", "border-r relative")}>
                                                {Array.from({ length: TOTAL_HOURS }).map((_, hour) => {
                                                    const isPast = isPastDaySelected || (isTodaySelected && hour < getHours(now));
                                                    return (
                                                        <div
                                                            key={hour}
                                                            className={cn(
                                                                "border-b relative transition-colors",
                                                                isPast ? "bg-red-500/[0.02] cursor-not-allowed" : "cursor-pointer hover:bg-accent/50"
                                                            )}
                                                            style={{ height: `${HOUR_HEIGHT_PX}px` }}
                                                        />
                                                    );
                                                })}

                                                {vehicleBookings.map((booking) => (
                                                    <VehicleBookingItem
                                                        key={booking.id}
                                                        booking={booking}
                                                        onBookingClick={() => {}}
                                                        selectedDate={selectedDate}
                                                        compact={isMobile}
                                                    />
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
            </CardContent>
        </Card>

        {bookingFormData && tenantId && (
            <BookingForm 
                isOpen={isBookingFormOpen}
                setIsOpen={setIsBookingFormOpen}
                aircraft={bookingFormData.aircraft}
                startTime={bookingFormData.startTime}
                tenantId={tenantId}
                pilots={allPilots}
                allBookingsForAircraft={bookingFormData.allBookingsForAircraft}
                existingBooking={bookingFormData.booking}
                refreshBookings={refreshBookings}
            />
        )}

        {roomBookingFormData && tenantId && (
            <DebriefRoomBookingForm
                isOpen={isRoomBookingFormOpen}
                setIsOpen={setIsRoomBookingFormOpen}
                tenantId={tenantId}
                date={selectedDate}
                startTime={roomBookingFormData.startTime}
                roomId={roomBookingFormData.roomId}
                roomName={roomBookingFormData.roomName}
                pilots={allPilots}
                students={students}
                existingBooking={roomBookingFormData.booking}
                refreshBookings={refreshBookings}
            />
        )}

        <Dialog open={isMaintenanceDialogOpen} onOpenChange={setIsMaintenanceDialogOpen}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle className="text-lg font-black uppercase tracking-tight">
                {editingMaintenanceWindowId ? 'Edit Maintenance' : 'Schedule Maintenance'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Aircraft</Label>
                <Select value={selectedMaintenanceAircraftId} onValueChange={setSelectedMaintenanceAircraftId}>
                  <SelectTrigger className="h-11 font-bold">
                    <SelectValue placeholder="Select aircraft" />
                  </SelectTrigger>
                  <SelectContent>
                    {aircraft.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.tailNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maintenance-title" className="text-[10px] font-black uppercase tracking-widest">Maintenance Title</Label>
                <Input id="maintenance-title" value={maintenanceTitle} onChange={(event) => setMaintenanceTitle(event.target.value)} className="h-11 font-bold" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="maintenance-from" className="text-[10px] font-black uppercase tracking-widest">From Date</Label>
                  <Input id="maintenance-from" type="date" value={maintenanceFromDate} onChange={(event) => setMaintenanceFromDate(event.target.value)} className="h-11 font-bold" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maintenance-to" className="text-[10px] font-black uppercase tracking-widest">To Date</Label>
                  <Input id="maintenance-to" type="date" value={maintenanceToDate} onChange={(event) => setMaintenanceToDate(event.target.value)} className="h-11 font-bold" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maintenance-notes" className="text-[10px] font-black uppercase tracking-widest">Notes</Label>
                <Textarea id="maintenance-notes" value={maintenanceNotes} onChange={(event) => setMaintenanceNotes(event.target.value)} className="min-h-[88px]" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsMaintenanceDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSaveMaintenance} disabled={isSavingMaintenance}>
                {isSavingMaintenance ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
                {editingMaintenanceWindowId ? 'Update Maintenance' : 'Save Maintenance'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}

