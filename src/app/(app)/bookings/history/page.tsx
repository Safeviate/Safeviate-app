'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { format, parse } from 'date-fns';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

import type { Aircraft } from '@/types/aircraft';
import type { PilotProfile, Personnel } from '@/app/(app)/users/personnel/page';
import type { Booking } from '@/types/booking';
import { Button } from '@/components/ui/button';
import { Eye, Trash2, FilePlus, ShieldAlert, ListFilter } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { useUserProfile } from '@/hooks/use-user-profile';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { Skeleton } from '@/components/ui/skeleton';

type EnrichedBooking = Booking & {
  aircraftTailNumber?: string;
  creatorName?: string;
  instructorName?: string;
  studentName?: string;
  roomContextLabel?: string;
  fullStartTime?: Date;
  aircraft?: Aircraft;
};

type BookingBuckets = {
  all: EnrichedBooking[];
  training: EnrichedBooking[];
  private: EnrichedBooking[];
  maintenance: EnrichedBooking[];
  cancelled: EnrichedBooking[];
};

function DeleteBookingButton({
  booking,
  tenantId,
  canDelete,
  canDeleteCompleted,
}: {
  booking: EnrichedBooking;
  tenantId: string;
  canDelete: boolean;
  canDeleteCompleted: boolean;
}) {
    const { toast } = useToast();
    const isCompleted = booking.status === 'Completed';

    const isAllowed = canDelete && (!isCompleted || canDeleteCompleted);

    if (!isAllowed) return null;

    const handleDelete = () => {
        void fetch('/api/bookings', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: booking.id }),
        });
        toast({
            title: 'Booking Deleted',
            description: `Booking #${booking.bookingNumber} is being deleted.`,
        });
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" className="h-8 w-8">
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete Booking</span>
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        {isCompleted && <ShieldAlert className="h-5 w-5 text-destructive" />}
                        Are you sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {isCompleted 
                            ? "Warning: You are deleting a COMPLETED flight record. This will remove the audit trail for these airframe hours. This action should only be taken for data entry errors."
                            : `This will permanently delete booking #${booking.bookingNumber}. This action cannot be undone.`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

const BookingsTable = ({
  bookings,
  tenantId,
  canDeleteBookings,
  canDeleteCompletedBookings,
  isLoading,
}: {
  bookings: EnrichedBooking[];
  tenantId: string;
  canDeleteBookings: boolean;
  canDeleteCompletedBookings: boolean;
  isLoading: boolean;
}) => {
    if (!isLoading && bookings.length === 0) {
        return (
            <div className="h-24 text-center flex items-center justify-center text-muted-foreground text-[10px] uppercase font-black tracking-widest bg-muted/5">
              No bookings found for this category.
            </div>
        );
    }
    
    return (
        <div className="flex h-full min-h-0 flex-col">
          <ResponsiveCardGrid
              items={bookings}
              isLoading={isLoading}
              loadingCount={4}
              className="p-4"
              gridClassName="sm:grid-cols-2 xl:grid-cols-3"
              renderItem={(b) => {
                const isNonInstructorBooking = ['Rental', 'Charter', 'Ferry Flight', 'Maintenance'].includes(b.type);
                const dateLabel = b.fullStartTime ? format(b.fullStartTime, 'PPP') : 'Invalid Date';
                const crewLabel = [
                  b.creatorName ? `Creator: ${b.creatorName}` : '',
                  !isNonInstructorBooking && b.instructorName ? `Instructor: ${b.instructorName}` : '',
                  b.studentName ? `${isNonInstructorBooking ? 'PIC' : 'Student'}: ${b.studentName}` : '',
                ].filter(Boolean).join(' • ');
                const isMuted = b.status === 'Cancelled' || b.status === 'Cancelled with Reason' || b.status === 'Completed';

                return (
                    <Card key={b.id} className={cn("min-h-[13.5rem] overflow-hidden border shadow-none transition-shadow hover:shadow-sm", isMuted && "text-muted-foreground")}>
                        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                            <div className="min-w-0 space-y-1">
                                <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">
                                    {b.bookingNumber}
                                </p>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 px-4 py-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border bg-background px-3 py-2.5">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Date</p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">{dateLabel}</p>
                                </div>
                                <div className="rounded-lg border bg-background px-3 py-2.5">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">People</p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">
                                        {crewLabel || b.creatorName || 'N/A'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <Button asChild variant="outline" size="compact" className="border-slate-300">
                                    <Link href={`/bookings/history/${b.id}`}>
                                        <Eye className="h-4 w-4" />
                                        View
                                    </Link>
                                </Button>
                                {b.type === 'Training Flight' && b.status === 'Completed' && (
                                    <Button asChild variant="secondary" size="icon" className="h-8 w-8">
                                        <Link href={`/training/student-debriefs/new?bookingId=${b.id}`}>
                                            <FilePlus className="h-4 w-4" />
                                            <span className="sr-only">Debrief</span>
                                        </Link>
                                    </Button>
                                )}
                                <DeleteBookingButton
                                  booking={b}
                                  tenantId={tenantId}
                                  canDelete={canDeleteBookings}
                                canDeleteCompleted={canDeleteCompletedBookings}
                                />
                            </div>
                        </CardContent>
                    </Card>
                );
              }}
              renderLoadingItem={(index) => <Skeleton key={index} className="h-40 w-full rounded-lg" />}
              emptyState={<div className="h-24 text-center flex items-center justify-center text-muted-foreground text-[10px] uppercase font-black tracking-widest bg-muted/5">No bookings found for this category.</div>}
          />
        </div>
    )
}

export default function BookingsHistoryPage() {
  const { tenantId } = useUserProfile();
  const { hasPermission } = usePermissions();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [personnel, setPersonnel] = useState<Array<Personnel | PilotProfile>>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [scheduleResponse, usersResponse] = await Promise.all([
          fetch('/api/schedule-data', { cache: 'no-store' }),
          fetch('/api/users', { cache: 'no-store' }),
        ]);
        const schedulePayload = await scheduleResponse.json();
        const usersPayload = await usersResponse.json();
        if (!cancelled) {
          setBookings(schedulePayload?.bookings ?? []);
          setAircraft(schedulePayload?.aircraft ?? []);
          setPersonnel(usersPayload?.users ?? usersPayload?.personnel ?? []);
        }
      } catch {
        if (!cancelled) {
          setBookings([]);
          setAircraft([]);
          setPersonnel([]);
        }
      } finally {
        if (!cancelled) setIsLoadingBookings(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

    const userMap = useMemo(() => {
    if (!personnel) return new Map<string, string>();
    const map = new Map(personnel.map((person) => [person.id, `${person.firstName} ${person.lastName}`]));
    map.set('DEVELOPER_MODE', 'System (Developer)');
    return map;
  }, [personnel]);

  const enrichedBookings = useMemo((): EnrichedBooking[] => {
    if (!bookings || !aircraft || userMap.size === 0) return [];

    const aircraftMap = new Map(aircraft.map(a => [a.id, a]));

    return bookings.map(b => {
      const bookingAircraft = aircraftMap.get(b.aircraftId);
      const fullStartTime = b.date && b.startTime ? parse(`${b.date} ${b.startTime}`, 'yyyy-MM-dd HH:mm', new Date()) : undefined;
        return {
        ...b,
        aircraftTailNumber: bookingAircraft?.tailNumber || b.briefingRoomName || 'Unknown Aircraft',
        creatorName: (b as Booking & { createdByName?: string }).createdByName || userMap.get(b.createdById || '') || 'Unknown Creator',
        instructorName: userMap.get(b.instructorId || '') || (b.instructorId ? b.instructorId : undefined),
        studentName: userMap.get(b.studentId || '') || (b.studentId ? b.studentId : undefined),
        roomContextLabel: b.briefingRoomName ? `${b.sessionType || b.type}` : undefined,
        fullStartTime: fullStartTime,
        aircraft: bookingAircraft,
      };
    });
  }, [bookings, aircraft, userMap]);

  const bookingBuckets = useMemo((): BookingBuckets => {
    const activeBookings = enrichedBookings.filter(
      (booking) => booking.status !== 'Cancelled' && booking.status !== 'Cancelled with Reason'
    );

    return {
      all: enrichedBookings,
      training: activeBookings.filter((booking) => booking.type === 'Training Flight'),
      private: activeBookings.filter((booking) => booking.type === 'Private Flight'),
      maintenance: activeBookings.filter((booking) => booking.type === 'Maintenance Flight'),
      cancelled: enrichedBookings.filter(
        (booking) => booking.status === 'Cancelled' || booking.status === 'Cancelled with Reason'
      ),
    };
  }, [enrichedBookings]);

  const canDeleteBookings = hasPermission('bookings-delete');
  const canDeleteCompletedBookings = hasPermission('admin-database-manage');

  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'training', label: 'Training' },
    { value: 'private', label: 'Private' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full min-h-0 px-1 pt-4">
      <Card className="flex h-full flex-col shadow-none border overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full min-h-0 flex-col">
          <ResponsiveTabRow
            value={activeTab}
            onValueChange={setActiveTab}
            placeholder="Filter by Type"
            className="border-b bg-muted/5 px-3 py-2 shrink-0"
            centerTabs
            options={tabs.map((tab) => ({
              value: tab.value,
              label: tab.label,
              icon: ListFilter,
            }))}
          />
          <CardContent className='flex flex-1 min-h-0 p-0'>
                <div className={cn("flex-1 min-h-0 overflow-auto pb-4", isMobile ? "h-full" : "h-full")}>
                    <TabsContent value="all" className='m-0 h-full min-h-0'><BookingsTable bookings={bookingBuckets.all} tenantId={tenantId || ''} canDeleteBookings={canDeleteBookings} canDeleteCompletedBookings={canDeleteCompletedBookings} isLoading={isLoadingBookings} /></TabsContent>
                    <TabsContent value="training" className='m-0 h-full min-h-0'><BookingsTable bookings={bookingBuckets.training} tenantId={tenantId || ''} canDeleteBookings={canDeleteBookings} canDeleteCompletedBookings={canDeleteCompletedBookings} isLoading={isLoadingBookings} /></TabsContent>
                    <TabsContent value="private" className='m-0 h-full min-h-0'><BookingsTable bookings={bookingBuckets.private} tenantId={tenantId || ''} canDeleteBookings={canDeleteBookings} canDeleteCompletedBookings={canDeleteCompletedBookings} isLoading={isLoadingBookings} /></TabsContent>
                    <TabsContent value="maintenance" className='m-0 h-full min-h-0'><BookingsTable bookings={bookingBuckets.maintenance} tenantId={tenantId || ''} canDeleteBookings={canDeleteBookings} canDeleteCompletedBookings={canDeleteCompletedBookings} isLoading={isLoadingBookings} /></TabsContent>
                    <TabsContent value="cancelled" className='m-0 h-full min-h-0'><BookingsTable bookings={bookingBuckets.cancelled} tenantId={tenantId || ''} canDeleteBookings={canDeleteBookings} canDeleteCompletedBookings={canDeleteCompletedBookings} isLoading={isLoadingBookings} /></TabsContent>
                </div>
            </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
