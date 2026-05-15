'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { DocumentUploader } from '@/components/document-uploader';
import { format, addMinutes, isBefore } from 'date-fns';
import type { Aircraft } from '@/types/aircraft';
import type { AircraftMaintenanceWindow } from '@/types/aircraft';
import type { PilotProfile, Personnel } from '@/app/(app)/users/personnel/page';
import type { Booking, OverrideLog, TrainingRoute, ChecklistPhoto, PreFlightData } from '@/types/booking';
import { Trash2, ShieldAlert, Lock, Eye, MapIcon, ClipboardCheck, Activity, CheckCircle2, PlaneTakeoff } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import Link from 'next/link';
import { PhotoViewerDialog } from '@/components/photo-viewer-dialog';
import { parseJsonResponse } from '@/lib/safe-json';
import { cn } from '@/lib/utils';
import { broadcastBookingUpdate } from '@/lib/booking-updates';
import { getBlockingBookingForTracking, isBookingEligibleForTracking } from '@/lib/booking-tracking';
import { getAircraftHourSnapshot } from '@/lib/aircraft-hours';
import { DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY, getTrainingExerciseTemplate, getTrainingExerciseTemplateOptions, resolveTrainingExerciseTemplates } from '@/lib/training-exercise-templates';

const parseLocalDate = (value?: string | null) => {
    if (!value) return undefined;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return undefined;
    return new Date(year, month - 1, day, 12);
};

const combineLocalDateAndTime = (date: Date, time: string) => {
    return new Date(`${format(date, 'yyyy-MM-dd')}T${time}`);
};

const getBookingRange = (booking: Pick<Booking, 'date' | 'startTime' | 'endTime' | 'start' | 'end' | 'isOvernight' | 'overnightBookingDate' | 'overnightEndTime'>) => {
    const fallbackStart = booking.date && booking.startTime ? new Date(`${booking.date}T${booking.startTime}`) : new Date(booking.start || '');
    const fallbackEnd = booking.date && booking.endTime ? new Date(`${booking.date}T${booking.endTime}`) : new Date(booking.end || '');

    if (booking.isOvernight && booking.overnightBookingDate && booking.overnightEndTime) {
        const overnightEnd = new Date(`${booking.overnightBookingDate}T${booking.overnightEndTime}`);
        return {
            start: fallbackStart,
            end: Number.isNaN(overnightEnd.getTime()) ? fallbackEnd : overnightEnd,
        };
    }

    return {
        start: fallbackStart,
        end: fallbackEnd,
    };
};

const BOOKING_STATUS_OPTIONS = [
    { value: 'Tentative', label: 'Tentative' },
    { value: 'Confirmed', label: 'Confirmed' },
    { value: 'Completed', label: 'Complete' },
] as const;

const BOOKING_TYPE_OPTIONS = [
    'Training Flight',
    'Rental',
    'Charter',
    'Ferry Flight',
    'Maintenance',
] as const;

const bookingFormSchema = z.object({
    type: z.string().min(1, 'Booking type is required.'),
    date: z.date(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid start time"),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid end time"),
    instructorId: z.string().optional(),
    studentId: z.string().optional(),
    isOvernight: z.boolean().default(false),
    overnightBookingDate: z.date().optional(),
    overnightEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid overnight end time").optional(),
    notes: z.string().optional(),
    status: z.enum(['Tentative', 'Confirmed', 'Approved', 'Completed', 'Cancelled', 'Cancelled with Reason']).default('Confirmed'),
    cancellationReason: z.string().optional(),
    routeId: z.string().optional(),
    trainingExerciseTemplateKey: z.string().optional(),
})
.refine(data => {
    const start = new Date(`${format(data.date, 'yyyy-MM-dd')}T${data.startTime}`);
    const end = new Date(`${format(data.date, 'yyyy-MM-dd')}T${data.endTime}`);
    return isBefore(start, end);
}, {
    message: "End time must be after start time",
    path: ["endTime"],
});

interface BookingFormProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    aircraft: Aircraft;
    startTime: Date;
    tenantId: string;
    pilots: (PilotProfile | Personnel)[];
    allBookingsForAircraft: Booking[];
    existingBooking?: Booking;
    refreshBookings: () => void;
}

type BookingDraft = Omit<Booking, 'id' | 'bookingNumber' | 'instructorId' | 'studentId' | 'notes' | 'overnightBookingDate' | 'overnightEndTime' | 'preFlightData' | 'postFlightData' | 'preFlight' | 'postFlight' | 'overrides'> & {
    id?: string;
    bookingNumber?: string;
    navlog?: Booking['navlog'];
    workflowCompletion?: Booking['workflowCompletion'];
    instructorId?: string | null;
    studentId?: string | null;
    notes?: string | null;
    overnightBookingDate?: string | null;
    overnightEndTime?: string | null;
    preFlightData?: (NonNullable<Booking['preFlightData']> & { photos?: ChecklistPhoto[] }) | null;
    postFlightData?: (NonNullable<Booking['postFlightData']> & { photos?: ChecklistPhoto[]; defects: string }) | null;
    preFlight?: boolean;
    postFlight?: boolean;
    overrides?: OverrideLog[];
};

export function BookingForm({ isOpen, setIsOpen, aircraft, startTime, tenantId, pilots, allBookingsForAircraft, existingBooking, refreshBookings }: BookingFormProps) {
    const { toast } = useToast();
    const { hasPermission, isLoading: isPermissionsLoading } = usePermissions();
    const { userProfile } = useUserProfile();
    const { tenant } = useTenantConfig();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const canEditBooking = hasPermission('bookings-schedule-manage');
    const aircraftSnapshot = useMemo<PreFlightData>(() => getAircraftHourSnapshot(aircraft), [aircraft]);
    const [preFlight, setPreFlight] = useState(existingBooking?.preFlightData || aircraftSnapshot);
    const [postFlight, setPostFlight] = useState(existingBooking?.postFlightData || {
        hobbs: 0,
        tacho: 0,
        fuelUpliftGallons: 0,
        fuelUpliftLitres: 0,
        oilUplift: 0,
        defects: existingBooking?.postFlightData?.defects || '',
    });
    const [preFlightPhotos, setPreFlightPhotos] = useState<ChecklistPhoto[]>(((existingBooking?.preFlightData as { photos?: ChecklistPhoto[] } | undefined)?.photos || []) as ChecklistPhoto[]);
    const [postFlightPhotos, setPostFlightPhotos] = useState<ChecklistPhoto[]>(existingBooking?.postFlightData?.photos || []);
    const [requireWeatherPlanningNavlog, setRequireWeatherPlanningNavlog] = useState(!!existingBooking?.workflowCompletion?.weatherPlanningNavlogRequired);
    const trainingExerciseTemplates = useMemo(
        () => resolveTrainingExerciseTemplates((tenant as Record<string, unknown> | null | undefined) ?? null),
        [tenant],
    );
    const trainingExerciseOptions = useMemo(
        () => getTrainingExerciseTemplateOptions(trainingExerciseTemplates),
        [trainingExerciseTemplates],
    );

    // Fetch Training Routes
    const [trainingRoutes, setTrainingRoutes] = useState<TrainingRoute[]>([]);
    useEffect(() => {
        let cancelled = false;
        const loadRoutes = async () => {
            if (!tenantId) return;
            const response = await fetch('/api/training-routes', { cache: 'no-store' });
            const payload = await response.json().catch(() => ({ routes: [] }));
            if (!cancelled) {
                setTrainingRoutes((payload.routes ?? []).filter((route: TrainingRoute) => route.routeType !== 'other'));
            }
        };

        void loadRoutes();
        return () => {
            cancelled = true;
        };
    }, [tenantId]);

    // PERMISSIONS: Can user edit/save?
    const canManageSchedule = canEditBooking;
    const canManagePreFlight = canEditBooking || hasPermission('bookings-preflight-manage');
    const canManagePostFlight = canEditBooking || hasPermission('bookings-postflight-manage') || hasPermission('bookings-techlog-override');
    const canOverride = hasPermission('bookings-approve-override') || hasPermission('bookings-techlog-override');
    // LOGIC: A booking is "underway" if it is Approved or tech logs have started
    const isUnderway = existingBooking?.status === 'Approved' || existingBooking?.status === 'Completed' || existingBooking?.preFlight;
    const defaultActiveTab: 'details' | 'checks' = existingBooking && isUnderway ? 'checks' : 'details';
    const [activeTab, setActiveTab] = useState<'details' | 'checks'>(defaultActiveTab);
    const canEditUnderway = canOverride; // If you have override, you can edit underway bookings
    const canTrackFlight = !!existingBooking
        && (existingBooking.navlog?.legs?.length || 0) > 0
        && isBookingEligibleForTracking(allBookingsForAircraft, existingBooking);
    const blockingBooking = existingBooking ? getBlockingBookingForTracking(allBookingsForAircraft, existingBooking) : null;
    
    const canDelete = hasPermission('bookings-delete') && (!isUnderway || canOverride);

    const instructors = useMemo(() => pilots.filter(p => p.canBeInstructor || p.userType === 'Instructor'), [pilots]);
    const students = useMemo(() => pilots.filter(p => p.canBeStudent || p.canBePIC || p.userType === 'Student'), [pilots]);

    const defaultValues = useMemo(() => ({
        type: existingBooking?.type || 'Training Flight',
        date: existingBooking?.date ? parseLocalDate(existingBooking.date) : startTime,
        startTime: existingBooking ? existingBooking.startTime : format(startTime, 'HH:mm'),
        endTime: existingBooking ? existingBooking.endTime : format(addMinutes(startTime, 60), 'HH:mm'),
        instructorId: existingBooking?.instructorId || '',
        studentId: existingBooking?.studentId || '',
        isOvernight: existingBooking?.isOvernight || false,
        overnightBookingDate: parseLocalDate(existingBooking?.overnightBookingDate),
        overnightEndTime: existingBooking?.overnightEndTime || '08:00',
        notes: existingBooking?.notes || '',
        status: existingBooking?.status || 'Confirmed',
        cancellationReason: '',
        trainingExerciseTemplateKey: existingBooking?.trainingExerciseTemplateKey || DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY,
    }), [existingBooking, startTime]);
    
    const form = useForm<z.infer<typeof bookingFormSchema>>({
        resolver: zodResolver(bookingFormSchema),
        defaultValues,
    });
    
    useEffect(() => {
        if (isOpen) {
            setActiveTab(defaultActiveTab);
            form.reset(defaultValues);
            setPreFlight(existingBooking?.preFlightData || aircraftSnapshot);
            setPostFlight(existingBooking?.postFlightData || {
                hobbs: 0,
                tacho: 0,
                fuelUpliftGallons: 0,
                fuelUpliftLitres: 0,
                oilUplift: 0,
                defects: existingBooking?.postFlightData?.defects || '',
            });
            setPreFlightPhotos(((existingBooking?.preFlightData as { photos?: ChecklistPhoto[] } | undefined)?.photos || []) as ChecklistPhoto[]);
            setPostFlightPhotos(existingBooking?.postFlightData?.photos || []);
            setRequireWeatherPlanningNavlog(!!existingBooking?.workflowCompletion?.weatherPlanningNavlogRequired);
        }
    }, [isOpen, defaultActiveTab, defaultValues, form, existingBooking, aircraftSnapshot]);

    const isOvernight = form.watch('isOvernight');
    const watchStatus = form.watch('status');
    const watchType = form.watch('type');
    const isMaintenanceBooking = watchType === 'Maintenance';
    const isNonInstructorBooking = ['Rental', 'Charter', 'Ferry Flight', 'Maintenance'].includes(watchType);
    const showInstructorField = !isMaintenanceBooking && !isNonInstructorBooking;
    const studentFieldLabel = isNonInstructorBooking ? 'Pilot in Command' : 'Student';
    const studentSelectPlaceholder = isNonInstructorBooking ? 'Select Pilot in Command...' : 'Select Student...';

    const onSubmit = async (data: z.infer<typeof bookingFormSchema>) => {
        if (!canEditBooking) {
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'You do not have permission to manage the schedule.' });
            return;
        }
        setIsSubmitting(true);

        const newStart = combineLocalDateAndTime(data.date, data.startTime);
        const sameDayEnd = combineLocalDateAndTime(data.date, data.endTime);
        const overnightReturnDate = data.isOvernight && data.overnightBookingDate ? data.overnightBookingDate : null;
        const overnightReturnTime = data.isOvernight ? data.overnightEndTime || null : null;
        const newEnd = overnightReturnDate && overnightReturnTime
            ? combineLocalDateAndTime(overnightReturnDate, overnightReturnTime)
            : sameDayEnd;

        const startIso = newStart.toISOString();
        const endIso = newEnd.toISOString();

        if (data.type === 'Maintenance') {
            const toDate = data.overnightBookingDate ? format(data.overnightBookingDate, 'yyyy-MM-dd') : format(data.date, 'yyyy-MM-dd');
            if (toDate < format(data.date, 'yyyy-MM-dd')) {
                toast({
                    variant: 'destructive',
                    title: 'Invalid Dates',
                    description: 'The maintenance end date must be on or after the start date.',
                });
                setIsSubmitting(false);
                return;
            }

            try {
                const nextWindow: AircraftMaintenanceWindow = {
                    id: existingBooking?.id || crypto.randomUUID(),
                    title: data.notes?.trim() || 'Maintenance',
                    fromDate: format(data.date, 'yyyy-MM-dd'),
                    toDate,
                    notes: data.notes?.trim() || undefined,
                    status: 'Scheduled',
                };

                const existingWindows = aircraft.maintenanceWindows || [];
                const nextWindows = existingBooking
                    ? existingWindows.map((window) => (window.id === existingBooking.id ? nextWindow : window))
                    : [...existingWindows, nextWindow];

                const response = await fetch(`/api/aircraft/${aircraft.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ aircraft: { ...aircraft, maintenanceWindows: nextWindows } }),
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    throw new Error(payload.error || 'Failed to save maintenance window.');
                }

                toast({
                    title: 'Maintenance Scheduled',
                    description: `${aircraft.tailNumber} is blocked from ${format(data.date, 'PPP')} to ${format(data.overnightBookingDate || data.date, 'PPP')}.`,
                });
                refreshBookings();
                setIsOpen(false);
                return;
            } catch (error: unknown) {
                toast({
                    variant: 'destructive',
                    title: 'Save Failed',
                    description: error instanceof Error ? error.message : 'Failed to save maintenance window.',
                });
                setIsSubmitting(false);
                return;
            }
        }

        // VALIDATION: Cannot book in the past
        if (!existingBooking && isBefore(newStart, new Date())) {
            toast({
                variant: 'destructive',
                title: 'Invalid Time',
                description: 'You cannot create a booking in the past.',
            });
            setIsSubmitting(false);
            return;
        }

        // VALIDATION: Check for schedule overlaps
        const hasOverlap = allBookingsForAircraft.some(other => {
            if (other.id === existingBooking?.id) return false;
            if (other.status === 'Cancelled' || other.status === 'Cancelled with Reason') return false;
            
            const { start: otherStart, end: otherEnd } = getBookingRange(other);
            
            return newStart < otherEnd && newEnd > otherStart;
        });

        if (hasOverlap) {
            toast({
                variant: 'destructive',
                title: 'Schedule Conflict',
                description: 'The booking period overlaps with an existing flight for this aircraft. Please adjust the times.',
            });
            setIsSubmitting(false);
            return;
        }
        
        const bookingData: BookingDraft = {
            aircraftId: aircraft.id,
            type: data.type,
            trainingExerciseTemplateKey: data.type === 'Training Flight' ? data.trainingExerciseTemplateKey || DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY : undefined,
            trainingExerciseLabel: data.type === 'Training Flight'
                ? getTrainingExerciseTemplate(data.trainingExerciseTemplateKey || DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY, trainingExerciseTemplates)?.label
                : undefined,
            date: format(data.date, 'yyyy-MM-dd'),
            startTime: data.startTime,
            endTime: data.endTime,
            start: startIso,
            end: endIso,
            instructorId: isNonInstructorBooking ? null : data.instructorId || null,
            studentId: data.studentId || null,
            status: data.status,
            notes: data.notes || null,
            isOvernight: data.isOvernight,
        };

        // Attach Training Route if selected
        if (data.routeId) {
            const selectedRoute = trainingRoutes.find(r => r.id === data.routeId);
            if (selectedRoute) {
                bookingData.navlog = {
                    legs: selectedRoute.legs,
                    hazards: selectedRoute.hazards,
                    globalTas: 100, // Default TAS
                    globalFuelBurn: 10, // Default burn
                    globalFuelBurnUnit: 'GPH',
                };
            }
        }

        if (data.isOvernight && data.overnightBookingDate) {
            bookingData.overnightBookingDate = format(data.overnightBookingDate, 'yyyy-MM-dd');
            bookingData.overnightEndTime = data.overnightEndTime || null;
        }

        if (data.status === 'Cancelled with Reason') {
            bookingData.notes = `Cancelled: ${data.cancellationReason}\n\n${data.notes || ''}`;
            bookingData.status = 'Cancelled';
        }

        bookingData.preFlightData = {
            ...preFlight,
            fuelUpliftLitres: preFlight.fuelUpliftLitres || 0,
            photos: preFlightPhotos,
        };
            bookingData.postFlightData = {
                ...postFlight,
                defects: postFlight.defects || '',
                fuelUpliftLitres: postFlight.fuelUpliftLitres || 0,
                photos: postFlightPhotos,
            };
        bookingData.preFlight = existingBooking ? !!existingBooking.preFlight || !!preFlight.documentsChecked : false;
        bookingData.postFlight = existingBooking ? !!existingBooking.postFlight || (postFlight.hobbs || 0) > 0 : false;
        bookingData.workflowCompletion = {
            ...(existingBooking?.workflowCompletion || {}),
            weatherPlanningNavlogRequired: requireWeatherPlanningNavlog,
        };

        // Audit Admin/Locked Record Override
        if (existingBooking && isUnderway && canEditUnderway && userProfile) {
            const reason = window.prompt("This booking is locked (underway or approved). Please provide a reason for modifying the schedule details:");
            if (!reason) {
                toast({ variant: 'destructive', title: 'Save Cancelled', description: 'A reason is required to override locked records.' });
                setIsSubmitting(false);
                return;
            }
            const log: OverrideLog = {
                userId: userProfile.id,
                userName: `${userProfile.firstName} ${userProfile.lastName}`,
                permissionId: 'bookings-approve-override',
                action: 'Modified schedule details of a locked/underway record',
                reason: reason,
                timestamp: new Date().toISOString()
            };
            const currentOverrides = Array.isArray(existingBooking?.overrides) ? existingBooking?.overrides : [];
            bookingData.overrides = [...currentOverrides, log];
        }

        try {
            const clearActiveSessionsForBooking = async (bookingId: string) => {
                const sessionsResponse = await fetch('/api/flight-sessions', { cache: 'no-store' });
                if (!sessionsResponse.ok) return;
                const sessionsPayload = await sessionsResponse.json().catch(() => ({ sessions: [] }));
                const activeSessions = Array.isArray(sessionsPayload.sessions)
                  ? sessionsPayload.sessions.filter((session: { id?: string; bookingId?: string; status?: string }) => session.bookingId === bookingId && session.status === 'active' && session.id)
                  : [];

                await Promise.all(
                  activeSessions.map((session: { id: string }) =>
                    fetch(`/api/flight-sessions?id=${encodeURIComponent(session.id)}`, { method: 'DELETE' })
                  )
                );
              };

            if (existingBooking) {
                await fetch('/api/bookings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ booking: { ...bookingData, id: existingBooking.id, bookingNumber: existingBooking.bookingNumber } }),
                });
                if (bookingData.status === 'Completed' || bookingData.status === 'Cancelled') {
                    await clearActiveSessionsForBooking(existingBooking.id);
                }
                broadcastBookingUpdate();
                toast({ title: 'Booking Updated' });
            } else {
                const response = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        booking: {
                            ...bookingData,
                            preFlight: false,
                            postFlight: false,
                            createdById: userProfile?.id || null,
                            createdByName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : null,
                        },
                    }),
                });
                const payload = await parseJsonResponse<{ error?: string }>(response);
                if (!response.ok) {
                    throw new Error(payload?.error || 'Failed to create booking.');
                }
                broadcastBookingUpdate();
                toast({ title: 'Booking Created' });
            }
            refreshBookings();
            setIsOpen(false);
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Save Failed', description: error instanceof Error ? error.message : 'Save failed.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDelete = async () => {
        if (!existingBooking) return;
        setIsSubmitting(true);
        try {
            await fetch('/api/bookings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: existingBooking.id }),
            });
            broadcastBookingUpdate();
            toast({ title: 'Booking Deleted' });
            refreshBookings();
            setDeleteConfirmOpen(false);
            setIsOpen(false);
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Delete Failed', description: error instanceof Error ? error.message : 'Delete failed.' });
        } finally {
            setIsSubmitting(false);
        }
    }

    const isLocked = isUnderway && !canEditUnderway;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="flex h-[calc(100dvh-0.75rem)] w-[calc(100vw-0.75rem)] max-w-3xl min-h-0 flex-col overflow-hidden p-4 sm:h-auto sm:w-full sm:p-6">
                <DialogHeader className="space-y-1 pb-2">
                    <DialogTitle className="text-base font-black uppercase tracking-tight sm:text-lg">{existingBooking ? `Booking #${existingBooking.bookingNumber}` : `New Booking for ${aircraft.tailNumber}`}</DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm">
                        {format(startTime, 'PPP')} • Fleet: {aircraft.tailNumber}
                    </DialogDescription>
                </DialogHeader>

                {isLocked && (
                    <div className="mb-3 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 sm:p-3">
                        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800">
                            <p className="font-bold">Record Locked</p>
                            <p>This flight has been approved or technical logging has started. Basic schedule details cannot be modified by standard users.</p>
                        </div>
                    </div>
                )}

                {!isPermissionsLoading && !canEditBooking && (
                    <div className="mb-3 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
                        <Lock className="h-5 w-5 text-slate-600 shrink-0 mt-0.5" />
                        <div className="text-xs text-slate-700">
                            <p className="font-bold">Read-Only Booking</p>
                            <p>You can view this booking, but you do not have permission to edit the booking details or checks.</p>
                        </div>
                    </div>
                )}

                {canEditUnderway && isUnderway && (
                    <div className="mb-3 flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-2.5 sm:p-3">
                        <Lock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                        <div className="text-xs text-blue-800">
                            <p className="font-bold">Override Mode Active</p>
                            <p>You have permission to modify this locked flight record. Use with caution.</p>
                        </div>
                    </div>
                )}

                {!isPermissionsLoading && !canManageSchedule && (
                    <div className="mb-3 flex items-start gap-3 rounded-md border border-border bg-muted p-2.5 sm:p-3">
                        <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="text-xs text-muted-foreground">
                            <p className="font-bold">Read-Only Access</p>
                            <p>You do not have permission to create or modify aircraft bookings. Contact an administrator for access.</p>
                        </div>
                    </div>
                )}

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
                        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-1 pb-8">
                        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'details' | 'checks')} className="space-y-3">
                            <ResponsiveTabRow
                                value={activeTab}
                                onValueChange={(value) => setActiveTab(value as 'details' | 'checks')}
                                placeholder="Select Booking Section"
                                className="w-full"
                                options={[
                                    { value: 'details', label: 'Booking Information' },
                                    ...(isMaintenanceBooking ? [] : [{ value: 'checks', label: 'Pre / Post-Flight Checks' }]),
                                ]}
                            />

                            <TabsContent value="details" className="mt-0 space-y-4">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[9px] font-black uppercase tracking-widest">Booking Type</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value} disabled={isLocked || !canEditBooking}>
                                                    <FormControl>
                                                        <SelectTrigger className="h-9">
                                                            <SelectValue placeholder="Select booking type" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {BOOKING_TYPE_OPTIONS.map((option) => (
                                                            <SelectItem key={option} value={option}>
                                                                {option}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField control={form.control} name="status" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[9px] font-black uppercase tracking-widest">Status</FormLabel>
                                            <FormControl>
                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                    {BOOKING_STATUS_OPTIONS.map((option) => {
                                                        const active = field.value === option.value;
                                                        return (
                                                            <Button
                                                                key={option.value}
                                                                type="button"
                                                                variant={active ? 'default' : 'outline'}
                                                                className={cn(
                                                                    'h-9 rounded-md px-2.5 text-[8px] font-black uppercase tracking-[0.12em] leading-none whitespace-nowrap sm:h-10 sm:px-3 sm:text-[9px]',
                                                                    active ? 'shadow-sm' : 'bg-background'
                                                                )}
                                                                onClick={() => field.onChange(option.value)}
                                                                disabled={isLocked || !canEditBooking}
                                                                aria-pressed={active}
                                                            >
                                                                {option.label}
                                                            </Button>
                                                        );
                                                    })}
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                </div>

                                {watchStatus === 'Cancelled with Reason' && (
                                    <FormField control={form.control} name="cancellationReason" render={({ field }) => ( <FormItem><FormLabel>Reason for Cancellation</FormLabel><FormControl><Input placeholder='e.g., Weather, Maintenance' {...field} disabled={!canManageSchedule} /></FormControl><FormMessage /></FormItem> )}/>
                                )}

                                {isMaintenanceBooking ? (
                                    <div className="grid grid-cols-1 gap-2 rounded-xl border bg-amber-50/40 p-3 sm:grid-cols-2 sm:p-4">
                                        <FormField control={form.control} name="date" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>From Date</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="date"
                                                        value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                                        onChange={(e) => field.onChange(parseLocalDate(e.target.value))}
                                                        disabled={isLocked || !canEditBooking}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="overnightBookingDate" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>To Date</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="date"
                                                        value={field.value ? format(field.value, 'yyyy-MM-dd') : format(form.getValues('date'), 'yyyy-MM-dd')}
                                                        onChange={e => field.onChange(parseLocalDate(e.target.value))}
                                                        disabled={isLocked || !canEditBooking}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <FormField control={form.control} name="startTime" render={({ field }) => ( <FormItem><FormLabel>Start Time</FormLabel><FormControl><Input type="time" {...field} disabled={isLocked || !canEditBooking} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField control={form.control} name="endTime" render={({ field }) => ( <FormItem><FormLabel>End Time</FormLabel><FormControl><Input type="time" {...field} disabled={isLocked || !canEditBooking} /></FormControl><FormMessage /></FormItem> )} />
                                    </div>
                                )}

                                {!isMaintenanceBooking ? (
                                <div className={cn('grid grid-cols-1 gap-4', showInstructorField ? 'md:grid-cols-2' : 'md:grid-cols-1')}>
                                    {showInstructorField ? (
                                    <FormField
                                        control={form.control}
                                        name="instructorId"
                                        render={({ field }) => (
                                            <FormItem>
                                                    <FormLabel className="text-[9px] font-black uppercase tracking-widest">Instructor</FormLabel>
                                                <FormControl>
                                                    <select
                                                        value={field.value || ''}
                                                        onChange={(event) => field.onChange(event.target.value)}
                                                        disabled={isLocked || !canEditBooking}
                                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="">Select Instructor...</option>
                                                        {instructors.map((pilot) => (
                                                            <option key={pilot.id} value={pilot.id}>
                                                                {pilot.firstName} {pilot.lastName}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    ) : null}
                                    <FormField
                                        control={form.control}
                                        name="studentId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[9px] font-black uppercase tracking-widest">{studentFieldLabel}</FormLabel>
                                                <FormControl>
                                                    <select
                                                        value={field.value || ''}
                                                        onChange={(event) => field.onChange(event.target.value)}
                                                        disabled={isLocked || !canEditBooking}
                                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="">{studentSelectPlaceholder}</option>
                                                        {students.map((pilot) => (
                                                            <option key={pilot.id} value={pilot.id}>
                                                                {pilot.firstName} {pilot.lastName}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                ) : null}

                                <div className="grid gap-2 lg:grid-cols-2">
                                    {!existingBooking ? (
                                        !isMaintenanceBooking ? (
                                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3 space-y-3 sm:p-4">
                                            <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-emerald-700">
                                                 <MapIcon className="h-3.5 w-3.5" /> Mission Profile
                                            </p>
                                            {watchType === 'Training Flight' ? (
                                                <FormField control={form.control} name="trainingExerciseTemplateKey" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-[8px] font-black uppercase">Training Exercise</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value || DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY} disabled={isLocked || !canEditBooking}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-9 bg-background">
                                                                    <SelectValue placeholder="Select the training exercise..." />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {trainingExerciseOptions.map((option) => (
                                                                    <SelectItem key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )} />
                                            ) : null}
                                            <FormField control={form.control} name="routeId" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[8px] font-black uppercase">Preset Training Route (Optional)</FormLabel>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLocked || !canEditBooking}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-9 bg-background">
                                                                <SelectValue placeholder="Select a training route to pre-fill navlog..." />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="none">None / Manual Entry</SelectItem>
                                                            {trainingRoutes.map(r => (
                                                                <SelectItem key={r.id} value={r.id}>
                                                                    {r.name} ({r.legs.length} Waypoints)
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                        </div>
                                        ) : (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2 sm:p-4">
                                            <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-amber-800">
                                                <Lock className="h-3.5 w-3.5" /> Aircraft Maintenance Block
                                            </p>
                                            <p className="text-xs text-amber-900/80">
                                                This creates an aircraft maintenance window instead of a flight booking and will block the aircraft on the schedule for every day in the selected range.
                                            </p>
                                        </div>
                                        )
                                    ) : (
                                        <div />
                                    )}

                                    <FormField control={form.control} name="notes" render={({ field }) => (
                                        <FormItem className={cn('rounded-xl border bg-background p-3 shadow-sm sm:p-4', existingBooking ? 'lg:col-span-2' : '')}>
                                            <div className="space-y-1.5">
                                                <FormLabel>Admin Notes</FormLabel>
                                                <p className="text-xs text-muted-foreground">Add any relevant notes for dispatch or follow-up.</p>
                                            </div>
                                            <FormControl>
                                                <Textarea placeholder="Add any relevant notes..." {...field} disabled={!canEditBooking} rows={2} className="min-h-[56px]" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}/>
                                </div>

                                {!isMaintenanceBooking ? (
                                <div className="rounded-xl border bg-muted/20 p-2.5 space-y-3 sm:p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Planning Requirement</p>
                                            <p className="text-xs font-semibold text-muted-foreground">Mark whether weather, planning map, and navlog are required for this flight.</p>
                                        </div>
                                        <Badge variant={requireWeatherPlanningNavlog ? 'default' : 'secondary'} className="text-[10px] font-black uppercase">
                                            {requireWeatherPlanningNavlog ? 'Required' : 'Optional'}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5">
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] font-black uppercase tracking-widest">Require Weather / Map / Navlog</p>
                                            <p className="text-[10px] text-muted-foreground">Instructor can only approve after these are completed when enabled.</p>
                                        </div>
                                        <Switch
                                            checked={requireWeatherPlanningNavlog}
                                            onCheckedChange={setRequireWeatherPlanningNavlog}
                                            disabled={!canEditBooking}
                                        />
                                    </div>
                                </div>
                                ) : null}

                                {!isMaintenanceBooking ? (
                                <div className="flex items-center space-x-2">
                                    <FormField control={form.control} name="isOvernight" render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} id="isOvernight" disabled={isLocked || !canEditBooking} /></FormControl><FormLabel htmlFor="isOvernight">Overnight Booking</FormLabel></FormItem> )}/>
                                </div>
                                ) : null}

                                {!isMaintenanceBooking && isOvernight && (
                                    <div className="grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-2">
                                        <FormField control={form.control} name="overnightBookingDate" render={({ field }) => ( <FormItem><FormLabel>Return Date</FormLabel><FormControl><Input type="date" {...field} value={field.value ? format(field.value, 'yyyy-MM-dd') : ''} onChange={e => field.onChange(parseLocalDate(e.target.value))} disabled={isLocked || !canEditBooking} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField control={form.control} name="overnightEndTime" render={({ field }) => ( <FormItem><FormLabel>Return Time</FormLabel><FormControl><Input type="time" {...field} disabled={isLocked || !canEditBooking} /></FormControl><FormMessage /></FormItem> )} />
                                    </div>
                                )}
                            </TabsContent>

                            {!isMaintenanceBooking ? (
                            <TabsContent value="checks" className="space-y-6 mt-0">
                                <div className="rounded-xl border bg-muted/20 p-3 space-y-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <ClipboardCheck className="h-4 w-4 text-primary" />
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pre / Post-Flight Checks</p>
                                                <p className="text-xs font-semibold text-muted-foreground">Complete these here in the booking popup.</p>
                                            </div>
                                        </div>
                                        <Badge variant={(postFlight.hobbs || 0) > 0 ? 'default' : 'secondary'} className="text-[10px] font-black uppercase">
                                            {(postFlight.hobbs || 0) > 0 ? 'Recorded' : 'Pending'}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div className="space-y-3 rounded-lg border bg-background p-3">
                                            <div className="flex items-center gap-2">
                                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                                                    <Activity className="h-4 w-4 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest">Pre-flight</p>
                                                    <p className="text-[10px] text-muted-foreground">Must be completed before approval.</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <FormLabel className="text-[9px] font-bold uppercase">Hobbs Start</FormLabel>
                                                    <Input type="number" step="0.1" value={preFlight.hobbs} onChange={(e) => setPreFlight({ ...preFlight, hobbs: parseFloat(e.target.value) || 0 })} className="h-9 font-bold" disabled={!canManagePreFlight} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <FormLabel className="text-[9px] font-bold uppercase">Tacho Start</FormLabel>
                                                    <Input type="number" step="0.1" value={preFlight.tacho} onChange={(e) => setPreFlight({ ...preFlight, tacho: parseFloat(e.target.value) || 0 })} className="h-9 font-bold" disabled={!canManagePreFlight} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <FormLabel className="text-[9px] font-bold uppercase">Fuel Uplift (G)</FormLabel>
                                                    <Input type="number" value={preFlight.fuelUpliftGallons} onChange={(e) => setPreFlight({ ...preFlight, fuelUpliftGallons: parseFloat(e.target.value) || 0 })} className="h-9 font-bold" disabled={!canManagePreFlight} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <FormLabel className="text-[9px] font-bold uppercase">Fuel Uplift (L)</FormLabel>
                                                    <Input
                                                        type="number"
                                                        value={preFlight.fuelUpliftLitres}
                                                        onChange={(e) => {
                                                            const litres = parseFloat(e.target.value) || 0;
                                                            setPreFlight({
                                                                ...preFlight,
                                                                fuelUpliftLitres: litres,
                                                                fuelUpliftGallons: Number((litres / 3.785).toFixed(1)),
                                                            });
                                                        }}
                                                        className="h-9 font-bold"
                                                        disabled={!canManagePreFlight}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <FormLabel className="text-[9px] font-bold uppercase">Oil Uplift (Q)</FormLabel>
                                                    <Input type="number" value={preFlight.oilUplift} onChange={(e) => setPreFlight({ ...preFlight, oilUplift: parseFloat(e.target.value) || 0 })} className="h-9 font-bold" disabled={!canManagePreFlight} />
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-3 rounded-lg border p-3">
                                                <Checkbox id="popup-docs" checked={preFlight.documentsChecked} onCheckedChange={(val) => setPreFlight({ ...preFlight, documentsChecked: !!val })} disabled={!canManagePreFlight} />
                                                <label htmlFor="popup-docs" className="text-[10px] font-black uppercase leading-none cursor-pointer">Documents & License Checked</label>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Photos</p>
                                                    <DocumentUploader
                                                        defaultFileName="Pre-flight photo"
                                                        restrictedMode="camera"
                                                        onDocumentUploaded={(photo) => setPreFlightPhotos((current) => [...current, { url: photo.url, description: photo.name }])}
                                                        trigger={(open) => (
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 text-[10px] font-black uppercase"
                                                                disabled={!canManagePreFlight}
                                                                onClick={() => open('camera')}
                                                            >
                                                                Add Photo
                                                            </Button>
                                                        )}
                                                    />
                                                </div>
                                                {preFlightPhotos.length > 0 && (
                                                    <PhotoViewerDialog
                                                        title="Pre-flight Photos"
                                                        photos={preFlightPhotos.map((photo) => ({ url: photo.url, name: photo.description }))}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-3 rounded-lg border bg-background p-3">
                                            <div className="flex items-center gap-2">
                                                <div className="h-7 w-7 rounded-full bg-orange-500/10 flex items-center justify-center">
                                                    <CheckCircle2 className="h-4 w-4 text-orange-600" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest">Post-flight</p>
                                                    <p className="text-[10px] text-muted-foreground">Complete this last after the flight.</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <FormLabel className="text-[9px] font-bold uppercase">Hobbs End</FormLabel>
                                                    <Input type="number" step="0.1" value={postFlight.hobbs} onChange={(e) => setPostFlight({ ...postFlight, hobbs: parseFloat(e.target.value) || 0 })} className="h-9 font-bold" disabled={!canManagePostFlight} />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <FormLabel className="text-[9px] font-bold uppercase">Tacho End</FormLabel>
                                                    <Input type="number" step="0.1" value={postFlight.tacho} onChange={(e) => setPostFlight({ ...postFlight, tacho: parseFloat(e.target.value) || 0 })} className="h-9 font-bold" disabled={!canManagePostFlight} />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <FormLabel className="text-[9px] font-bold uppercase">Fuel Uplift (G)</FormLabel>
                                                    <Input
                                                        type="number"
                                                        value={postFlight.fuelUpliftGallons}
                                                        onChange={(e) => {
                                                            const gallons = parseFloat(e.target.value) || 0;
                                                            setPostFlight({
                                                                ...postFlight,
                                                                fuelUpliftGallons: gallons,
                                                                fuelUpliftLitres: Number((gallons * 3.785).toFixed(1)),
                                                            });
                                                        }}
                                                        className="h-9 font-bold"
                                                        disabled={!canManagePostFlight}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <FormLabel className="text-[9px] font-bold uppercase">Fuel Uplift (L)</FormLabel>
                                                    <Input
                                                        type="number"
                                                        value={postFlight.fuelUpliftLitres}
                                                        onChange={(e) => {
                                                            const litres = parseFloat(e.target.value) || 0;
                                                            setPostFlight({
                                                                ...postFlight,
                                                                fuelUpliftLitres: litres,
                                                                fuelUpliftGallons: Number((litres / 3.785).toFixed(1)),
                                                            });
                                                        }}
                                                        className="h-9 font-bold"
                                                        disabled={!canManagePostFlight}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <FormLabel className="text-[9px] font-bold uppercase">Oil Uplift (Q)</FormLabel>
                                                    <Input type="number" value={postFlight.oilUplift} onChange={(e) => setPostFlight({ ...postFlight, oilUplift: parseFloat(e.target.value) || 0 })} className="h-9 font-bold" disabled={!canManagePostFlight} />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Photos</p>
                                                    <DocumentUploader
                                                        defaultFileName="Post-flight photo"
                                                        restrictedMode="camera"
                                                        onDocumentUploaded={(photo) => setPostFlightPhotos((current) => [...current, { url: photo.url, description: photo.name }])}
                                                        trigger={(open) => (
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 text-[10px] font-black uppercase"
                                                                disabled={!canManagePostFlight}
                                                                onClick={() => open('camera')}
                                                            >
                                                                Add Photo
                                                            </Button>
                                                        )}
                                                    />
                                                </div>
                                                {postFlightPhotos.length > 0 && (
                                                    <PhotoViewerDialog
                                                        title="Post-flight Photos"
                                                        photos={postFlightPhotos.map((photo) => ({ url: photo.url, name: photo.description }))}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                            ) : null}
                        </Tabs>
                        </div>

                        <DialogFooter className="sticky bottom-0 z-10 mt-auto flex flex-col gap-3 border-t bg-background/95 pt-4 backdrop-blur sm:static sm:z-auto sm:flex-row sm:items-center sm:gap-2 sm:bg-transparent sm:pt-4">
                            {existingBooking && canDelete && (
                                <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                                    <Button type="button" variant="destructive" className="mr-auto" onClick={() => setDeleteConfirmOpen(true)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete booking #{existingBooking.bookingNumber}.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                            
                            {existingBooking && (
                                <Button variant="outline" size="sm" asChild className="h-10 gap-2 ml-auto sm:ml-0">
                                    <Link href={`/bookings/history/${existingBooking.id}`}>
                                        <Eye className="h-4 w-4" /> View
                                    </Link>
                                </Button>
                            )}

                            {existingBooking && canTrackFlight && (
                                <Button variant="outline" size="sm" asChild className="h-10 gap-2 sm:ml-0">
                                    <Link href={`/operations/active-flight?bookingId=${encodeURIComponent(existingBooking.id)}&aircraftId=${encodeURIComponent(existingBooking.aircraftId)}&setup=1`}>
                                        <PlaneTakeoff className="h-4 w-4" /> Track Flight
                                    </Link>
                                </Button>
                            )}

                            {existingBooking && !canTrackFlight && blockingBooking && (
                                <Badge variant="outline" className="ml-auto h-10 rounded-xl border-amber-200 bg-amber-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
                                    <Lock className="mr-1.5 h-3.5 w-3.5" />
                                    Locked by #{blockingBooking.bookingNumber}
                                </Badge>
                            )}

                            <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                                <DialogClose asChild><Button type="button" variant="outline" className="flex-1 sm:flex-none">Cancel</Button></DialogClose>
                                {canManageSchedule && !isLocked && (
                                    <Button type="submit" disabled={isSubmitting || !canEditBooking} className="flex-1 sm:flex-none">
                                        {isSubmitting ? 'Saving...' : isMaintenanceBooking ? 'Save Maintenance' : 'Save Booking'}
                                    </Button>
                                )}
                            </div>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
