'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import type { Booking, BookingWorkflowCompletion, NavlogLeg, ChecklistPhoto } from "@/types/booking";
import type { Aircraft } from '@/types/aircraft';
import { Skeleton } from '@/components/ui/skeleton';
import { isPointInPolygon } from '@/lib/utils';
import { Save, AlertTriangle, Map as MapIcon, Loader2, X, RotateCcw, Trash2, FileText, Settings2, Scale, Map as NavIcon, ClipboardCheck, CheckCircle2, PlaneTakeoff, Lock, Radio, Wind, Eye, Thermometer, Clock, Activity } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Label as UILabel } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { NavlogBuilder } from '../../navlog-builder';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserProfile } from '@/hooks/use-user-profile';
import { BookingDetailHeader } from '@/components/booking-detail-header';
import { getAircraftHourSnapshot } from '@/lib/aircraft-hours';
import { BackNavButton } from '@/components/back-nav-button';
import { PhotoViewerDialog } from '@/components/photo-viewer-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { v4 as uuidv4 } from 'uuid';
import { createNavlogLegFromCoordinates } from '@/lib/flight-planner';
import { formatWaypointCoordinatesDms } from '@/components/maps/waypoint-coordinate-utils';
import { MasterMassBalanceGraph, type MassBalanceGraphPoint, type MassBalanceGraphTemplate } from '@/components/master-mass-balance-graph';
import { isBookingEligibleForTracking } from '@/lib/booking-tracking';
import { BookingPlannedLegsPanel } from '@/components/bookings/booking-planned-legs-panel';

// Dynamic import for Leaflet to avoid SSR issues
const AeronauticalMap = dynamic(
  () => import('@/components/bookings/booking-planning-map').then((mod) => mod.BookingPlanningMap),
  { 
    ssr: false,
    loading: () => (
        <div className="flex-1 flex items-center justify-center bg-slate-900">
            <div className="text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-emerald-500 mx-auto" />
                <p className="text-[10px] font-black uppercase text-emerald-500 tracking-[0.2em]">Initializing Chart Engine...</p>
            </div>
        </div>
    )
  }
);

const FUEL_WEIGHT_PER_GALLON = 6;
const DEFAULT_GRAPH_CONFIG = {
    xMin: 80,
    xMax: 94,
    yMin: 1295,
    yMax: 2600,
    envelope: [
        { x: 82, y: 1400 },
        { x: 82, y: 1950 },
        { x: 86.5, y: 2450 },
        { x: 93, y: 2450 },
        { x: 93, y: 1400 },
        { x: 82, y: 1400 },
    ] as { x: number; y: number }[],
};
const DEFAULT_BASIC_EMPTY = { weight: 1416, moment: 120360, arm: 85 };
const DEFAULT_STATIONS = [
    { id: 2, name: 'Pilot & Front Pax', weight: 340, arm: 85.5, type: 'standard' },
    { id: 3, name: 'Fuel', weight: 288, arm: 95, type: 'fuel', gallons: 48, maxGallons: 50 },
    { id: 4, name: 'Rear Pax', weight: 0, arm: 118.1, type: 'standard' },
    { id: 5, name: 'Baggage', weight: 0, arm: 142.8, type: 'standard' },
 ] satisfies NonNullable<NonNullable<Booking['massAndBalance']>['stations']>;

const FAA_NOTAM_SEARCH_URL = 'https://notams.aim.faa.gov/notamSearch/nsapp.html';

type BookingPerson = { id: string; firstName: string; lastName: string };
type BookingStation = NonNullable<NonNullable<Booking['massAndBalance']>['stations']>[number];
type BookingStationState = Omit<BookingStation, 'weight' | 'gallons'> & {
    weight: number | string;
    gallons?: number | string;
};

interface ViewBookingDetailsProps {
    booking: Booking;
}

type WeatherCardData = {
    metar?: {
        rawOb?: string;
        raw?: string;
        wspd?: string | number;
        wdir?: string | number;
        visib?: string | number;
        temp?: string | number;
        dewp?: string | number;
    };
    taf?: {
        rawTAF?: string;
        raw?: string;
    };
};


const DetailItem = ({ label, value, children }: { label: string, value?: string | undefined | null, children?: React.ReactNode }) => (
    <div>
        <p className="mb-1 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {children ? children : <p className="text-[10px] font-medium leading-4 text-foreground">{value || 'N/A'}</p>}
    </div>
);

const formatDateSafe = (dateString: string | undefined, formatString: string): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return format(date, formatString);
    } catch (e) {
        return 'Invalid Date';
    }
};

function stripUndefinedDeep<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined) as T;
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, nested]) => nested !== undefined)
                .map(([key, nested]) => [key, stripUndefinedDeep(nested)])
        ) as T;
    }

    return value;
}

const getStatusLabel = (status: Booking['status']) => (status === 'Completed' ? 'Complete' : status);

const WeatherCard = ({ icao, title, onHide }: { icao?: string, title: string, onHide: () => void }) => {
    const [data, setData] = useState<WeatherCardData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchWeather = useCallback(async () => {
        if (!icao || icao.length < 3) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/weather?ids=${icao}`);
            const weather = await res.json().catch(() => null);

            if (res.status === 404) {
                setData({});
                return;
            }

            if (!res.ok) throw new Error('Fetch failed');
            setData(weather);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load booking.');
        } finally {
            setLoading(false);
        }
    }, [icao]);

    useEffect(() => {
        fetchWeather();
    }, [fetchWeather]);

    return (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
                <div className="flex items-center gap-2">
                    {icao && <Badge variant="outline" className="text-[9px] font-black uppercase">{icao}</Badge>}
                    <Button variant="ghost" size="sm" className="h-8 px-3 text-[9px] font-medium uppercase tracking-[0.16em]" onClick={onHide}>Hide</Button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground animate-pulse py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-bold uppercase">Fetching METAR/TAF...</span>
                </div>
            ) : error ? (
                <div className="space-y-2 py-2">
                    <p className="text-xs text-destructive font-bold">{error}</p>
                    <Button variant="ghost" className="h-10 px-4 text-sm font-medium uppercase hover:bg-transparent" onClick={fetchWeather}>Retry</Button>
                </div>
            ) : data ? (
                <div className="space-y-4">
                    {data.metar && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-emerald-600">
                                <Activity className="h-3 w-3" /> METAR
                            </div>
                            <p className="text-[10px] font-mono font-bold leading-tight bg-background/50 p-2 rounded border border-border/50">
                                {data.metar.rawOb || data.metar.raw}
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                                <div className="flex items-center gap-2">
                                    <Wind className="h-3 w-3 text-sky-500" />
                                    <span className="text-[10px] font-black uppercase">{data.metar.wspd || 0}KT @ {data.metar.wdir || '0'}°</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Eye className="h-3 w-3 text-sky-500" />
                                    <span className="text-[10px] font-black uppercase">{data.metar.visib || 'N/A'} SM</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Thermometer className="h-3 w-3 text-sky-500" />
                                    <span className="text-[10px] font-black uppercase">{data.metar.temp}°C / {data.metar.dewp}°C</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {data.taf && (
                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-600">
                                <Clock className="h-3 w-3" /> TAF
                            </div>
                            <p className="text-[10px] font-mono font-medium leading-relaxed whitespace-pre-line opacity-80">
                                {data.taf.rawTAF || data.taf.raw}
                            </p>
                        </div>
                    )}

                    {!data.metar && !data.taf && <p className="text-xs italic text-muted-foreground">No reports available for this station.</p>}

                    <Button variant="ghost" className="h-10 w-full mt-2 px-4 text-sm font-medium uppercase border border-dashed hover:bg-background/50" onClick={fetchWeather}>Refresh Weather</Button>
                </div>
            ) : (
                <div className="py-4 text-center">
                    <p className="text-[10px] text-muted-foreground font-medium italic mb-4">No weather briefing loaded yet.</p>
                    <Button variant="outline" className="h-8 rounded-md border-input bg-background px-3 text-[10px] font-medium shadow-sm hover:bg-accent" onClick={fetchWeather}>Fetch Weather</Button>
                </div>
            )}
        </div>
    );
};

const NotamCard = ({
    icao,
    title,
    selectedNotams,
    onSelectedNotamsChange,
    onSaveSelectedNotams,
    isSaving,
}: {
    icao?: string;
    title: string;
    selectedNotams: string;
    onSelectedNotamsChange: (value: string) => void;
    onSaveSelectedNotams: () => void;
    isSaving?: boolean;
}) => {
    const normalizedIcao = icao?.trim().toUpperCase() || '';
    const notamSearchUrl = normalizedIcao
        ? `${FAA_NOTAM_SEARCH_URL}?${new URLSearchParams({
            ACTIONTYPE: 'NOTAMRETRIEVALBYICAOS',
            FORMATTYPE: 'DOMESTIC',
            METHOD: 'DISPLAYBYICAOS',
            REPORTTYPE: 'RAW',
            RETRIEVELOCID: normalizedIcao,
        }).toString()}#/results`
        : FAA_NOTAM_SEARCH_URL;

    return (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
                {normalizedIcao ? <Badge variant="outline" className="text-[9px] font-black uppercase">{normalizedIcao}</Badge> : null}
            </div>
            <div className="space-y-3">
                <p className="text-[10px] font-medium leading-5 text-foreground">
                    {normalizedIcao
                        ? `Open the official FAA NOTAM Search for ${normalizedIcao} to review the latest published NOTAMs. Safeviate is not rendering the FAA result content inline yet.`
                        : 'Enter an ICAO code above to open the official FAA NOTAM Search for the latest airport NOTAMs.'}
                </p>
                <div className="rounded-xl border border-dashed bg-background/60 p-3 text-[10px] font-medium leading-5 text-muted-foreground">
                    Use the button below to open the FAA result for this airport. If no notices are listed there, then there are no active NOTAMs returned for that location.
                </div>
                <Button asChild variant="outline" className="h-8 rounded-md border-input bg-background px-3 text-[10px] font-medium shadow-sm hover:bg-accent">
                    <a href={notamSearchUrl} target="_blank" rel="noreferrer">
                        <FileText className="h-3.5 w-3.5" />
                        {normalizedIcao ? `Open ${normalizedIcao} NOTAMs` : 'Open FAA NOTAM Search'}
                    </a>
                </Button>
                <div className="rounded-xl border bg-background/70 p-3 space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Selected NOTAMs</p>
                        {selectedNotams.trim() ? <Badge variant="secondary" className="text-[9px] font-black uppercase">Saved</Badge> : null}
                    </div>
                    {selectedNotams.trim() ? (
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Saved Summary</p>
                            <p className="whitespace-pre-wrap text-[10px] font-medium leading-5 text-foreground">{selectedNotams}</p>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-[10px] font-medium leading-5 text-muted-foreground">
                            No NOTAM summary has been saved for this airport yet.
                        </div>
                    )}
                    <p className="text-[10px] font-medium leading-5 text-foreground">
                        Capture the NOTAMs you selected from the FAA page here, then save them into this booking.
                    </p>
                    <Textarea
                        value={selectedNotams}
                        onChange={(event) => onSelectedNotamsChange(event.target.value)}
                        placeholder={normalizedIcao ? `Paste or summarize the selected NOTAMs for ${normalizedIcao} here...` : 'Paste or summarize the selected NOTAMs here...'}
                        className="min-h-[110px] resize-y text-[10px] font-medium leading-5"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-md border-input bg-background px-3 text-[10px] font-medium shadow-sm hover:bg-accent"
                        onClick={onSaveSelectedNotams}
                        disabled={isSaving}
                    >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save Selected NOTAMs
                    </Button>
                </div>
            </div>
        </div>
    );
};

export function ViewBookingDetails({ booking }: ViewBookingDetailsProps) {
    const isMobile = useIsMobile();
    const { toast } = useToast();
    const { tenantId, userProfile } = useUserProfile();
    const [activeTab, setActiveTab] = useState('navlog');
    const [isSaving, setIsSaving] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
    const [personnel, setPersonnel] = useState<BookingPerson[]>([]);
    const [loadingAc, setLoadingAc] = useState(true);
    const [loadingPeople, setLoadingPeople] = useState(true);
    const [loadingBookings, setLoadingBookings] = useState(true);
    const [allBookingsForAircraft, setAllBookingsForAircraft] = useState<Booking[] | null>(null);
    const [initialDetailsLoaded, setInitialDetailsLoaded] = useState(false);
    const [checkApprovals, setCheckApprovals] = useState(booking.checkApprovals || {});
    const [workflowCompletion, setWorkflowCompletion] = useState<BookingWorkflowCompletion>(booking.workflowCompletion || {});

    const aircraft = useMemo(() => aircrafts?.find(a => a.id === booking.aircraftId), [aircrafts, booking.aircraftId]);
    const isNonInstructorBooking = ['Rental', 'Charter', 'Ferry Flight', 'Maintenance'].includes(booking.type);
    const instructorLabel = useMemo(() => {
        if (!booking.instructorId) return 'N/A';
        const instructor = personnel.find((person) => person.id === booking.instructorId);
        return instructor ? `${instructor.firstName} ${instructor.lastName}` : booking.instructorId;
    }, [personnel, booking.instructorId]);

    const studentLabel = useMemo(() => {
        if (!booking.studentId) return 'N/A';
        const student = personnel.find((person) => person.id === booking.studentId);
        return student ? `${student.firstName} ${student.lastName}` : booking.studentId;
    }, [personnel, booking.studentId]);
    const canTrackFlight = (booking.navlog?.legs?.length || 0) > 0
        && !loadingBookings
        && allBookingsForAircraft !== null
        && isBookingEligibleForTracking(allBookingsForAircraft, booking);
    const blockingBooking = !loadingBookings && allBookingsForAircraft !== null
        ? allBookingsForAircraft
            .filter((otherBooking) => otherBooking.id !== booking.id)
            .filter((otherBooking) => otherBooking.aircraftId === booking.aircraftId)
            .filter((otherBooking) => new Date(otherBooking.start).getTime() <= new Date(booking.start).getTime())
            .filter((otherBooking) => !['Completed', 'Cancelled', 'Cancelled with Reason'].includes(otherBooking.status))
            .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())[0] || null
        : null;
    const isAssignedInstructor = !!userProfile && booking.instructorId === userProfile.id;
    const canManuallyApprove = isAssignedInstructor || userProfile?.role?.toLowerCase() === 'developer' || userProfile?.role?.toLowerCase() === 'dev';
    const [graphConfig, setGraphConfig] = useState(DEFAULT_GRAPH_CONFIG);
    const [basicEmpty, setBasicEmpty] = useState(DEFAULT_BASIC_EMPTY);
    const [stations, setStations] = useState<BookingStationState[]>(DEFAULT_STATIONS);
    const [results, setResults] = useState({ cg: 0, weight: 0, isSafe: false });
    const [preFlight, setPreFlight] = useState(booking.preFlightData || {
        hobbs: 0,
        tacho: 0,
        fuelUpliftGallons: 0,
        fuelUpliftLitres: 0,
        oilUplift: 0,
        documentsChecked: false,
    });
    const [postFlight, setPostFlight] = useState(booking.postFlightData || {
        hobbs: 0,
        tacho: 0,
        fuelUpliftGallons: 0,
        fuelUpliftLitres: 0,
        oilUplift: 0,
        defects: '',
    });
    const preFlightPhotos = ((booking.preFlightData as (typeof booking.preFlightData & { photos?: ChecklistPhoto[] }) | undefined)?.photos || []) as ChecklistPhoto[];
    const postFlightPhotos = (booking.postFlightData?.photos || []) as ChecklistPhoto[];
    const workflowReady = {
        flightDetails: !!workflowCompletion.flightDetails,
        planning: !!workflowCompletion.planning,
        weatherPlanningNavlogRequired: !!workflowCompletion.weatherPlanningNavlogRequired,
        massBalance: !!workflowCompletion.massBalance,
        navlog: !!workflowCompletion.navlog,
        checks: !!workflowCompletion.checks,
    };
    const requiresPlanningAndNavlog = !!workflowCompletion.weatherPlanningNavlogRequired;
    const allWorkflowComplete = workflowReady.flightDetails && workflowReady.massBalance && workflowReady.checks && (!requiresPlanningAndNavlog || (workflowReady.planning && workflowReady.navlog));
    // Planning state
    const [plannedLegs, setPlannedLegs] = useState<NavlogLeg[]>(booking.navlog?.legs || []);
    const [departureLegId, setDepartureLegId] = useState<string | null>(booking.navlog?.legs?.[0]?.id || null);
    const [arrivalLegId, setArrivalLegId] = useState<string | null>(booking.navlog?.legs?.[booking.navlog?.legs.length ? booking.navlog.legs.length - 1 : 0]?.id || null);
    const [depIcao, setDepIcao] = useState(booking.navlog?.departureIcao || '');
    const [arrIcao, setArrIcao] = useState(booking.navlog?.arrivalIcao || '');
    const [depLat, setDepLat] = useState(booking.navlog?.departureLatitude?.toString() || '');
    const [depLon, setDepLon] = useState(booking.navlog?.departureLongitude?.toString() || '');
    const [arrLat, setArrLat] = useState(booking.navlog?.arrivalLatitude?.toString() || '');
    const [arrLon, setArrLon] = useState(booking.navlog?.arrivalLongitude?.toString() || '');
    const [depNotamNotes, setDepNotamNotes] = useState(booking.navlog?.departureNotamNotes || '');
    const [arrNotamNotes, setArrNotamNotes] = useState(booking.navlog?.arrivalNotamNotes || '');
    const [showDepWeather, setShowDepWeather] = useState(true);
    const [showArrWeather, setShowArrWeather] = useState(true);
    const [isLookingUpDep, setIsLookingUpDep] = useState(false);
    const [isLookingUpArr, setIsLookingUpArr] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            if (!tenantId) {
                setLoadingAc(false);
                setLoadingPeople(false);
                return;
            }

            try {
                const [aircraftRes, usersRes, bookingsRes] = await Promise.all([
                    fetch(`/api/aircraft/${booking.aircraftId}`),
                    fetch('/api/users'),
                    fetch('/api/bookings'),
                ]);

                if (!aircraftRes.ok) throw new Error('Failed to load aircraft data.');
                if (!usersRes.ok) throw new Error('Failed to load personnel data.');
                if (!bookingsRes.ok) throw new Error('Failed to load bookings data.');

                const aircraftData = await aircraftRes.json();
                const peopleData = await usersRes.json();
                const bookingsData = await bookingsRes.json();

                if (!cancelled) {
                    setAircrafts(aircraftData?.aircraft ? [aircraftData.aircraft] : []);
                    setPersonnel(peopleData.users || peopleData.personnel || []);
                    setAllBookingsForAircraft(
                        Array.isArray(bookingsData.bookings)
                            ? bookingsData.bookings.filter((entry: Booking) => entry.aircraftId === booking.aircraftId)
                            : []
                    );
                }
            } catch {
                if (!cancelled) {
                    setAircrafts([]);
                    setPersonnel([]);
                    setAllBookingsForAircraft(null);
                }
            } finally {
                if (!cancelled) {
                    setLoadingAc(false);
                    setLoadingPeople(false);
                    setLoadingBookings(false);
                    setInitialDetailsLoaded(true);
                }
            }
        };

        loadData();
        return () => {
            cancelled = true;
        };
    }, [tenantId]);

    useEffect(() => {
        setCheckApprovals(booking.checkApprovals || {});
    }, [booking.checkApprovals, booking.id]);

    useEffect(() => {
        setWorkflowCompletion(booking.workflowCompletion || {});
    }, [booking.workflowCompletion, booking.id]);

    useEffect(() => {
        if (aircraft) {
            if (aircraft?.cgEnvelope?.length) {
                const envelope = aircraft.cgEnvelope.map((point) => ({ x: point.cg, y: point.weight }));
                setGraphConfig({
                    xMin: Math.min(...envelope.map((point) => point.x)) - 2,
                    xMax: Math.max(...envelope.map((point) => point.x)) + 2,
                    yMin: Math.min(...envelope.map((point) => point.y)) - 200,
                    yMax: Math.max(...envelope.map((point) => point.y)) + 200,
                    envelope,
                });
            } else {
                setGraphConfig(DEFAULT_GRAPH_CONFIG);
            }

            const arm = aircraft?.emptyWeight && aircraft.emptyWeight > 0
                ? (aircraft.emptyWeightMoment || 0) / aircraft.emptyWeight
                : DEFAULT_BASIC_EMPTY.arm;
            setBasicEmpty({
                weight: aircraft?.emptyWeight && aircraft.emptyWeight > 0 ? aircraft.emptyWeight : DEFAULT_BASIC_EMPTY.weight,
                moment: aircraft?.emptyWeight && aircraft.emptyWeight > 0 ? (aircraft.emptyWeightMoment || 0) : DEFAULT_BASIC_EMPTY.moment,
                arm: parseFloat(arm.toFixed(2)),
            });

            if (booking.massAndBalance?.stations && booking.massAndBalance.stations.length > 0) {
                setStations(booking.massAndBalance.stations);
            } else if (aircraft?.stations && aircraft.stations.length > 0) {
                setStations(aircraft.stations);
            } else {
                setStations(DEFAULT_STATIONS);
            }
        }
    }, [aircraft, booking.massAndBalance?.stations]);

    useEffect(() => {
        if (booking.preFlightData) return;
        if (!aircraft) return;
        setPreFlight(getAircraftHourSnapshot(aircraft));
    }, [aircraft, booking.id, booking.preFlightData]);

    useEffect(() => {
        let totalMom = parseFloat(String(basicEmpty.moment)) || 0;
        let totalWt = parseFloat(String(basicEmpty.weight)) || 0;
        stations.forEach(st => {
            const wt = parseFloat(String(st.weight)) || 0;
            const arm = parseFloat(String(st.arm)) || 0;
            totalWt += wt;
            totalMom += (wt * arm);
        });
        const cg = totalWt > 0 ? (totalMom / totalWt) : 0;
        const roundedCg = parseFloat(cg.toFixed(2));
        const roundedWeight = parseFloat(totalWt.toFixed(1));
        const safe = graphConfig.envelope.length > 2
            ? isPointInPolygon({ x: roundedCg, y: roundedWeight }, graphConfig.envelope)
            : false;
        setResults({ cg: roundedCg, weight: roundedWeight, isSafe: safe });
    }, [stations, basicEmpty, graphConfig.envelope]);

    const handleStationWeightChange = (id: number, weight: string) => {
        if (weight === '') {
            setStations(prev => prev.map(s => {
                if (s.id !== id) return s;
                if (s.type === 'fuel') {
                    return { ...s, weight: '', gallons: '' };
                }
                return { ...s, weight: '' };
            }));
            return;
        }

        const val = parseFloat(weight) || 0;
        setStations(prev => prev.map(s => {
            if (s.id !== id) return s;
            if (s.type === 'fuel') {
                return { ...s, weight: val, gallons: parseFloat((val / FUEL_WEIGHT_PER_GALLON).toFixed(1)) };
            }
            return { ...s, weight: val };
        }));
    };

    const handleGallonsChange = (id: number, gallons: string) => {
        if (gallons === '') {
            setStations(prev => prev.map(s => {
                if (s.id !== id || s.type !== 'fuel') return s;
                return { ...s, gallons: '', weight: '' };
            }));
            return;
        }

        const val = parseFloat(gallons) || 0;
        setStations(prev => prev.map(s => {
            if (s.id !== id || s.type !== 'fuel') return s;
            return { ...s, gallons: val, weight: parseFloat((val * FUEL_WEIGHT_PER_GALLON).toFixed(1)) };
        }));
    };

    // Fuel sync between M&B and NavLog
    const fuelStation = useMemo(() => stations.find(s => s.type === 'fuel'), [stations]);
    const fuelWeightLbs = fuelStation ? (parseFloat(String(fuelStation.weight)) || 0) : undefined;

    const handleNavlogFuelSync = useCallback((weightLbs: number) => {
        setStations(prev => prev.map(s => {
            if (s.type !== 'fuel') return s;
            return { ...s, weight: weightLbs, gallons: parseFloat((weightLbs / FUEL_WEIGHT_PER_GALLON).toFixed(1)) };
        }));
    }, []);

    const handleSaveFlightDetails = () => {
        void fetch('/api/bookings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                booking: {
                    ...booking,
                    navlog: {
                        ...(booking.navlog || {}),
                        departureIcao: depIcao,
                        arrivalIcao: arrIcao,
                        departureLatitude: depLat ? parseFloat(depLat) : null,
                        departureLongitude: depLon ? parseFloat(depLon) : null,
                        arrivalLatitude: arrLat ? parseFloat(arrLat) : null,
                        arrivalLongitude: arrLon ? parseFloat(arrLon) : null,
                        departureNotamNotes: depNotamNotes.trim() || undefined,
                        arrivalNotamNotes: arrNotamNotes.trim() || undefined,
                    },
                    workflowCompletion: {
                        ...workflowCompletion,
                        flightDetails: true,
                    },
                },
            }),
        }).then(async (res) => {
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Save failed.');
            }
            setWorkflowCompletion((current) => ({ ...current, flightDetails: true }));
            toast({ title: 'Flight Details Saved' });
        }).catch((error: unknown) => {
            toast({ variant: 'destructive', title: 'Save Failed', description: error instanceof Error ? error.message : 'Save failed.' });
        });
    };

    const handleSaveSelectedNotams = useCallback(async (type: 'dep' | 'arr') => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/bookings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    booking: {
                        ...booking,
                        navlog: {
                            ...(booking.navlog || {}),
                            departureIcao: depIcao,
                            arrivalIcao: arrIcao,
                            departureLatitude: depLat ? parseFloat(depLat) : null,
                            departureLongitude: depLon ? parseFloat(depLon) : null,
                            arrivalLatitude: arrLat ? parseFloat(arrLat) : null,
                            arrivalLongitude: arrLon ? parseFloat(arrLon) : null,
                            departureNotamNotes: depNotamNotes.trim() || undefined,
                            arrivalNotamNotes: arrNotamNotes.trim() || undefined,
                        },
                        workflowCompletion: {
                            ...workflowCompletion,
                            flightDetails: true,
                        },
                    },
                }),
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Failed to save selected NOTAMs.');
            }

            setWorkflowCompletion((current) => ({ ...current, flightDetails: true }));
            toast({
                title: 'Selected NOTAMs saved',
                description: type === 'dep' ? 'Departure NOTAM notes were saved to the booking.' : 'Arrival NOTAM notes were saved to the booking.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'NOTAM save failed',
                description: error instanceof Error ? error.message : 'Failed to save selected NOTAMs.',
            });
        } finally {
            setIsSaving(false);
        }
    }, [arrIcao, arrLat, arrLon, arrNotamNotes, booking, depIcao, depLat, depLon, depNotamNotes, toast, workflowCompletion]);

    const lookupAirport = async (icao: string, type: 'dep' | 'arr') => {
        if (!icao) return;
        type === 'dep' ? setIsLookingUpDep(true) : setIsLookingUpArr(true);
        try {
            const res = await fetch(`/api/openaip?resource=airports&icaoCode=${icao}`);
            const data = await res.json();
            const airport = data.items?.[0];
            if (airport && airport.geometry?.coordinates) {
                const [lon, lat] = airport.geometry.coordinates;
                if (type === 'dep') {
                    setDepLat(lat.toString());
                    setDepLon(lon.toString());
                } else {
                    setArrLat(lat.toString());
                    setArrLon(lon.toString());
                }
            } else {
                throw new Error('Airport not found');
            }
        } catch {
            toast({
                variant: 'destructive',
                title: 'Lookup failed',
                description: `Could not find airport data for ${icao}.`,
            });
        } finally {
            type === 'dep' ? setIsLookingUpDep(false) : setIsLookingUpArr(false);
        }
    };

    const handleSaveToBooking = () => {
        void fetch('/api/bookings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                booking: {
                    ...booking,
                    checkApprovals,
                    massAndBalance: stripUndefinedDeep({
                        takeoffWeight: results.weight,
                        takeoffCg: results.cg,
                        isWithinLimits: results.isSafe,
                        stations,
                    }),
                    workflowCompletion: {
                        ...workflowCompletion,
                        massBalance: true,
                    },
                },
            }),
        }).then(async (res) => {
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Save failed.');
            }
            setWorkflowCompletion((current) => ({ ...current, massBalance: true }));
            toast({ title: 'M&B Saved' });
        }).catch((error: unknown) => {
            toast({ variant: 'destructive', title: 'Save Failed', description: error instanceof Error ? error.message : 'Save failed.' });
        });
    };

    const handleSaveChecks = () => {
        void fetch('/api/bookings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    booking: {
                        ...booking,
                        checkApprovals,
                        preFlightData: stripUndefinedDeep(preFlight),
                        postFlightData: stripUndefinedDeep(postFlight),
                        preFlight: true,
                        postFlight: (postFlight.hobbs || 0) > 0,
                        status: 'Completed',
                        workflowCompletion: {
                            ...workflowCompletion,
                            checks: true,
                        },
                    },
            }),
        }).then(async (res) => {
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Save failed.');
            }
            setWorkflowCompletion((current) => ({ ...current, checks: true }));
            window.dispatchEvent(new Event('safeviate-bookings-updated'));
            window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
            toast({ title: 'Checks Saved' });
        }).catch((error: unknown) => {
            toast({ variant: 'destructive', title: 'Save Failed', description: error instanceof Error ? error.message : 'Save failed.' });
        });
    };

    const handleManualConfirmFlight = async () => {
        if (!canManuallyApprove) {
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Only the assigned instructor can approve this flight.' });
            return;
        }

        const confirmed = window.confirm(`Approve booking #${booking.bookingNumber} now?`);
        if (!confirmed) return;

        setIsApproving(true);
        try {
            const res = await fetch('/api/bookings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                        booking: {
                            ...booking,
                            checkApprovals,
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
            toast({ title: 'Booking Approved', description: 'Instructor approval recorded.' });
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Approval Failed',
                description: error instanceof Error ? error.message : 'Approval failed.',
            });
        } finally {
            setIsApproving(false);
        }
    };

    const handleAddWaypoint = (lat: number, lon: number, identifier: string = 'WP', frequencies?: string, layerInfo?: string, notes?: string) => {
        setPlannedLegs(current => [...current, createNavlogLegFromCoordinates(current, lat, lon, identifier, frequencies, layerInfo, notes)]);
    };

    const handleWaypointNotesChange = useCallback((legId: string, nextNotes: string) => {
        setPlannedLegs((current) => current.map((leg) => (leg.id === legId ? { ...leg, notes: nextNotes } : leg)));
    }, []);

    const handleSetDeparture = (leg: NavlogLeg) => {
        setDepartureLegId(leg.id);
        setArrivalLegId((current) => (current === leg.id ? null : current));
        setDepIcao(leg.waypoint);
        setDepLat(leg.latitude?.toString() || '');
        setDepLon(leg.longitude?.toString() || '');
    };

    const handleSetArrival = (leg: NavlogLeg) => {
        setArrivalLegId(leg.id);
        setDepartureLegId((current) => (current === leg.id ? null : current));
        setArrIcao(leg.waypoint);
        setArrLat(leg.latitude?.toString() || '');
        setArrLon(leg.longitude?.toString() || '');
    };

    const handleCommitRoute = async () => {
        setIsSaving(true);
        try {
            const sanitizedLegs = stripUndefinedDeep(plannedLegs);
            const res = await fetch('/api/bookings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    booking: {
                        ...booking,
                        navlog: {
                            ...(booking.navlog || {}),
                            legs: sanitizedLegs,
                            departureIcao: depIcao,
                            arrivalIcao: arrIcao,
                            departureLatitude: depLat ? parseFloat(depLat) : null,
                            departureLongitude: depLon ? parseFloat(depLon) : null,
                            arrivalLatitude: arrLat ? parseFloat(arrLat) : null,
                            arrivalLongitude: arrLon ? parseFloat(arrLon) : null,
                            departureNotamNotes: depNotamNotes.trim() || undefined,
                            arrivalNotamNotes: arrNotamNotes.trim() || undefined,
                        },
                    },
                }),
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Commit failed.');
            }
            toast({ title: "Route Committed", description: "The navigation log has been updated." });
        } catch (error: unknown) {
            toast({ variant: "destructive", title: "Commit Failed", description: error instanceof Error ? error.message : 'Commit failed.' });
        } finally {
            setIsSaving(false);
        }
    };

    if (!initialDetailsLoaded && (loadingAc || loadingPeople)) return <Skeleton className="h-64 w-full" />;

    const envelope = graphConfig.envelope;
    const envelopeXs = envelope.map((point) => point.x);
    const cgMargin =
        envelopeXs.length > 0
            ? Math.min(
                Math.abs(results.cg - Math.min(...envelopeXs)),
                Math.abs(Math.max(...envelopeXs) - results.cg)
            )
            : null;
    const graphTemplate: MassBalanceGraphTemplate = {
        id: booking.id,
        name: aircraft ? `${aircraft.make} ${aircraft.model}` : booking.type,
        family: aircraft?.tailNumber || 'Booking',
        xLabel: 'CG (inches)',
        yLabel: 'Gross Weight (lbs)',
        xDomain: [graphConfig.xMin, graphConfig.xMax],
        yDomain: [graphConfig.yMin, graphConfig.yMax],
        envelope: envelope.map((point, index) => ({
            ...point,
            color: ['#f97316', '#3b82f6', '#eab308', '#8b5cf6', '#ec4899'][index % 5],
        })) as MassBalanceGraphPoint[],
        currentPoint: { x: results.cg, y: results.weight },
    };

    return (
        <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border shadow-none">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full min-h-0 flex-1 flex-col">
                <BookingDetailHeader
                    title={booking.type}
                    subtitle={`${booking.bookingNumber} - ${aircraft ? aircraft.tailNumber : booking.aircraftId} • Inst: ${instructorLabel} • Stud: ${studentLabel}`}
                    status={booking.status}
                    approvalMeta={booking.approvedByName ? `Approved by ${booking.approvedByName}${booking.approvedAt ? ` • ${formatDateSafe(booking.approvedAt, 'PPP p')}` : ''}` : 'Awaiting instructor approval'}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    headerAction={isMobile ? null : <BackNavButton href="/bookings/schedule" text="Back to Schedule" />}
                    tabRowAction={
                        <div className="flex items-center gap-2">
                            {canTrackFlight && (
                                <Button asChild size="sm" className="h-8 bg-sky-700 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-sky-800">
                                    <Link href={`/operations/active-flight?bookingId=${encodeURIComponent(booking.id)}&aircraftId=${encodeURIComponent(booking.aircraftId)}&setup=1`}>
                                        <PlaneTakeoff className="mr-2 h-3.5 w-3.5" />
                                        Track Flight
                                    </Link>
                                </Button>
                            )}
                            {!canTrackFlight && blockingBooking && (
                                <Badge variant="outline" className="h-8 rounded-xl border-amber-200 bg-amber-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
                                    <Lock className="mr-1.5 h-3.5 w-3.5" />
                                    Locked by #{blockingBooking.bookingNumber}
                                </Badge>
                            )}
                            {activeTab === 'planning' && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setPlannedLegs([])}
                                        className="h-8 border-slate-300 text-[10px] font-black uppercase"
                                        disabled={plannedLegs.length === 0}
                                    >
                                        <RotateCcw className="mr-1.5 h-3 w-3" /> Clear
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-8 shrink-0 gap-2 bg-emerald-700 px-4 text-[10px] font-black uppercase text-white shadow-md hover:bg-emerald-800"
                                        onClick={handleCommitRoute}
                                        disabled={isSaving || plannedLegs.length === 0}
                                    >
                                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                        Commit Route
                                    </Button>
                                </>
                            )}
                            <Button
                                type="button"
                                size="sm"
                                className="h-8 bg-emerald-700 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-800"
                                onClick={handleManualConfirmFlight}
                                disabled={isApproving || booking.status === 'Approved' || booking.status === 'Completed' || !canManuallyApprove}
                            >
                                {isApproving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                                {booking.status === 'Approved' ? 'Approved' : 'Approve Booking'}
                            </Button>
                        </div>
                    }
                />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <TabsContent value="flight-details" className="m-0 flex h-full min-h-0 flex-1 flex-col data-[state=inactive]:hidden overflow-hidden">
                        <ScrollArea className="min-h-0 flex-1">
                            <CardContent className="pt-4 pb-20 space-y-6">
                                <div className="rounded-xl bg-muted/20 p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Flight Overview</p>
                                            <p className="text-[9px] font-medium capitalize tracking-[0.18em] text-foreground/90">Quick Reference</p>
                                        </div>
                                        <Badge variant="outline" className="text-[9px] font-black uppercase">Visible in Scroll</Badge>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
                                        <DetailItem label="Status" value={getStatusLabel(booking.status)} />
                                        <DetailItem label="Aircraft" value={aircraft ? aircraft.tailNumber : booking.aircraftId} />
          {!isNonInstructorBooking ? <DetailItem label="Instructor" value={instructorLabel} /> : null}
          <DetailItem label={isNonInstructorBooking ? 'Pilot in command' : 'Student'} value={studentLabel} />
                                        <DetailItem label="Date" value={formatDateSafe(booking.start, 'PPP')} />
                                        <DetailItem label="Start Time" value={formatDateSafe(booking.start, 'p')} />
                                        <DetailItem label="End Time" value={formatDateSafe(booking.end, 'p')} />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <DetailItem label="Notes" value={booking.notes || 'No notes provided.'} />
                                </div>
                                <div className="border-t pt-6">
                                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <UILabel className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Departure ICAO</UILabel>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <Input value={depIcao} onChange={(e) => setDepIcao(e.target.value.toUpperCase())} placeholder="ICAO" className="h-10 w-full min-w-0 text-[10px] font-semibold" />
                                                    <Button
                                                        variant="outline"
                                                        className="h-10 w-full min-w-0 justify-center rounded-md border-input bg-background px-3 text-[10px] font-medium shadow-sm hover:bg-accent"
                                                        onClick={() => lookupAirport(depIcao, 'dep')}
                                                        disabled={isLookingUpDep}
                                                    >
                                                        {isLookingUpDep ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radio className="h-3 w-3" />} Lookup
                                                    </Button>
                                                </div>
                                            </div>
                                            <NotamCard
                                                title="Departure NOTAMs"
                                                icao={depIcao}
                                                selectedNotams={depNotamNotes}
                                                onSelectedNotamsChange={setDepNotamNotes}
                                                onSaveSelectedNotams={() => void handleSaveSelectedNotams('dep')}
                                                isSaving={isSaving}
                                            />
                                            {showDepWeather && <WeatherCard title="Departure Weather" icao={depIcao} onHide={() => setShowDepWeather(false)} />}
                                            {!showDepWeather && <Button variant="ghost" size="sm" onClick={() => setShowDepWeather(true)} className="text-sm font-medium uppercase">Show Departure Weather</Button>}
                                        </div>
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <UILabel className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Arrival ICAO</UILabel>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <Input value={arrIcao} onChange={(e) => setArrIcao(e.target.value.toUpperCase())} placeholder="ICAO" className="h-10 w-full min-w-0 text-[10px] font-semibold" />
                                                    <Button
                                                        variant="outline"
                                                        className="h-10 w-full min-w-0 justify-center rounded-md border-input bg-background px-3 text-[10px] font-medium shadow-sm hover:bg-accent"
                                                        onClick={() => lookupAirport(arrIcao, 'arr')}
                                                        disabled={isLookingUpArr}
                                                    >
                                                        {isLookingUpArr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />} Lookup
                                                    </Button>
                                                </div>
                                            </div>
                                            <NotamCard
                                                title="Arrival NOTAMs"
                                                icao={arrIcao}
                                                selectedNotams={arrNotamNotes}
                                                onSelectedNotamsChange={setArrNotamNotes}
                                                onSaveSelectedNotams={() => void handleSaveSelectedNotams('arr')}
                                                isSaving={isSaving}
                                            />
                                            {showArrWeather && <WeatherCard title="Arrival Weather" icao={arrIcao} onHide={() => setShowArrWeather(false)} />}
                                            {!showArrWeather && <Button variant="ghost" size="sm" onClick={() => setShowArrWeather(true)} className="text-sm font-medium uppercase">Show Arrival Weather</Button>}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="planning" className="m-0 flex h-full min-h-0 flex-1 flex-col data-[state=inactive]:hidden overflow-hidden">
                        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[42svh_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_311px] lg:grid-rows-none lg:h-full">
                            <div className="relative order-1 z-20 flex h-full min-h-0 flex-col overflow-hidden bg-slate-900">
                                <AeronauticalMap 
                                    legs={plannedLegs} 
                                    onAddWaypoint={handleAddWaypoint}
                            />
                            </div>

                            <div className="relative order-2 z-10 flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-t bg-background lg:border-l lg:border-t-0">
                                <ScrollArea className="h-full flex-1 overscroll-contain">
                                    <div className="mx-auto min-w-0 max-w-[311px] space-y-6 overflow-x-hidden px-4 pt-2 pb-12 lg:px-3">
                                        <BookingPlannedLegsPanel
                                            legs={plannedLegs}
                                            onRemoveLeg={(legId) => setPlannedLegs((current) => current.filter((leg) => leg.id !== legId))}
                                            emptyMessage="Click the map to add waypoints"
                                            onWaypointNotesChange={handleWaypointNotesChange}
                                        />
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="mass-balance" className="m-0 flex h-full min-h-0 flex-1 flex-col data-[state=inactive]:hidden overflow-hidden overflow-x-hidden">
                        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden">
                            <ScrollArea className="min-h-0 flex-1 max-w-full overflow-x-hidden">
                                <CardHeader><CardTitle className="text-xl flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-primary" /> Mass & Balance</CardTitle></CardHeader>
                                <CardContent className="min-h-full overflow-x-hidden pb-20">
                                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8 overflow-x-hidden">
                                        <div className="flex flex-col">
                                            <div className={cn("max-w-full overflow-x-hidden", isMobile ? "mx-auto w-full max-w-[430px]" : "mx-auto w-full max-w-[860px]")}>
                                                <MasterMassBalanceGraph
                                                    template={graphTemplate}
                                                    currentPoint={{ x: results.cg, y: results.weight }}
                                                    showHeader={false}
                                                    showLayoutBadge={false}
                                                    inlineTitle
                                                    showCompactMetrics={false}
                                                    compactHeightMode="tight"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-6">
                                            <div className="rounded-xl border bg-background p-4 space-y-4">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aircraft</p>
                                                        <div className="flex flex-wrap items-baseline gap-2">
                                                            <span className="text-sm font-black uppercase tracking-[0.18em] text-primary">
                                                                {aircraft?.tailNumber || booking.aircraftId}
                                                            </span>
                                                            <span className="text-lg font-black uppercase tracking-tight">
                                                                {aircraft ? `${aircraft.make} ${aircraft.model}` : booking.type}
                                                            </span>
                                                        </div>
                                                    </div>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/70 pt-3">
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CG</p>
                                                        <p className="text-sm font-black tabular-nums">{results.cg.toFixed(2)} in</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Weight</p>
                                                        <p className="text-sm font-black tabular-nums">{results.weight.toFixed(0)} lbs</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</p>
                                                        <p className={cn('text-sm font-black uppercase', results.isSafe ? 'text-emerald-700' : 'text-red-700')}>
                                                            {results.isSafe ? 'Within limits' : 'Review'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CG Margin</p>
                                                        <p className="text-sm font-black tabular-nums">
                                                            {cgMargin === null ? '--' : `${cgMargin.toFixed(1)} in`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-xl border bg-background p-4 space-y-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Input Stations</p>
                                                        <p className="text-xs text-muted-foreground">Adjust only the live loading inputs for this booking.</p>
                                                    </div>
                                                    <Button size="sm" onClick={handleSaveToBooking} className="h-10 min-w-[150px] justify-center uppercase text-xs font-black bg-emerald-700" disabled={isSaving}>
                                                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                                        {isSaving ? 'Saving...' : 'Save Load Config'}
                                                    </Button>
                                                </div>
                                                <div className="space-y-4">
                                                    {stations.map(s => (
                                                        <div key={s.id} className="space-y-1.5 p-3 border rounded-lg bg-background">
                                                            <UILabel className="text-[10px] font-black uppercase text-muted-foreground">{s.name}</UILabel>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <Input type="number" value={s.weight} onChange={(e) => handleStationWeightChange(s.id, e.target.value)} className="h-8 text-xs font-bold" placeholder="Weight" />
                                                                <Input type="number" value={s.arm ?? ''} readOnly className="h-8 text-xs font-bold bg-muted/30" placeholder="Arm" />
                                                            </div>
                                                            {s.type === 'fuel' && (
                                                                <div className="space-y-2 pt-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <Input type="number" value={s.gallons ?? ''} onChange={(e) => handleGallonsChange(s.id, e.target.value)} className="h-8 text-xs font-bold" placeholder="Gallons" />
                                                                        <div className="text-[10px] font-bold text-muted-foreground">
                                                                            MAX: {s.maxGallons || 50}
                                                                        </div>
                                                                    </div>
                                                                    <input
                                                                        type="range"
                                                                        min="0"
                                                                        max={s.maxGallons || 50}
                                                                        step="0.1"
                                                                        value={s.gallons || 0}
                                                                        onChange={(e) => handleGallonsChange(s.id, e.target.value)}
                                                                        className="w-full h-2 accent-yellow-600 rounded-full cursor-pointer"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </ScrollArea>
                        </div>
                    </TabsContent>

                    {activeTab === 'checks' ? (
                        <div className="m-0 flex h-full min-h-0 flex-1 flex-col overflow-auto">
                            <CardContent className="pb-20">
                                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
                                    <div className="space-y-6">
                                        <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pre-flight</p>
                                            </div>
                                        </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <UILabel className="text-[9px] font-bold uppercase">Hobbs Start</UILabel>
                                                    <Input type="number" step="0.1" value={preFlight.hobbs ?? 0} readOnly className="font-bold h-10 bg-muted/30" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <UILabel className="text-[9px] font-bold uppercase">Tacho Start</UILabel>
                                                    <Input type="number" step="0.1" value={preFlight.tacho ?? 0} readOnly className="font-bold h-10 bg-muted/30" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <UILabel className="text-[9px] font-bold uppercase">Fuel Uplift (G)</UILabel>
                                                    <Input type="number" value={preFlight.fuelUpliftGallons ?? 0} readOnly className="font-bold h-10 bg-muted/30" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <UILabel className="text-[9px] font-bold uppercase">Fuel Uplift (L)</UILabel>
                                                    <Input type="number" value={preFlight.fuelUpliftLitres ?? 0} readOnly className="font-bold h-10 bg-muted/30" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <UILabel className="text-[9px] font-bold uppercase">Oil Uplift (Q)</UILabel>
                                                    <Input type="number" value={preFlight.oilUplift ?? 0} readOnly className="font-bold h-10 bg-muted/30" />
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-3 p-3 bg-background border rounded-lg">
                                                <Checkbox id="docs-checks" checked={!!preFlight.documentsChecked} disabled />
                                                <label htmlFor="docs-checks" className="text-[10px] font-black uppercase leading-none cursor-pointer">Documents & License Checked</label>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Post-flight</p>
                                            </div>
                                        </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <UILabel className="text-[9px] font-bold uppercase">Hobbs End</UILabel>
                                                    <Input type="number" step="0.1" value={booking.postFlightData?.hobbs ?? 0} readOnly className="font-bold h-10 bg-muted/30" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <UILabel className="text-[9px] font-bold uppercase">Tacho End</UILabel>
                                                    <Input type="number" step="0.1" value={booking.postFlightData?.tacho ?? 0} readOnly className="font-bold h-10 bg-muted/30" />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="space-y-1.5">
                                                    <UILabel className="text-[9px] font-bold uppercase">Fuel Uplift (G)</UILabel>
                                                    <Input type="number" value={booking.postFlightData?.fuelUpliftGallons ?? 0} readOnly className="font-bold h-9 bg-muted/30" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <UILabel className="text-[9px] font-bold uppercase">Fuel Uplift (L)</UILabel>
                                                    <Input type="number" value={booking.postFlightData?.fuelUpliftLitres ?? 0} readOnly className="font-bold h-9 bg-muted/30" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <UILabel className="text-[9px] font-bold uppercase">Oil Uplift (Q)</UILabel>
                                                    <Input type="number" value={booking.postFlightData?.oilUplift ?? 0} readOnly className="font-bold h-9 bg-muted/30" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="rounded-xl border bg-background p-4 space-y-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Photos</p>
                                            <div className="space-y-4">
                                                {preFlightPhotos.length > 0 && (
                                                    <div className="space-y-2">
                                                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Pre-flight Photos</p>
                                                        <PhotoViewerDialog
                                                            title="Pre-flight Photos"
                                                            photos={preFlightPhotos.map((photo) => ({ url: photo.url, name: photo.description }))}
                                                        />
                                                    </div>
                                                )}
                                                {postFlightPhotos.length > 0 && (
                                                    <div className="space-y-2">
                                                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Post-flight Photos</p>
                                                        <PhotoViewerDialog
                                                            title="Post-flight Photos"
                                                            photos={postFlightPhotos.map((photo) => ({ url: photo.url, name: photo.description }))}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="rounded-xl border bg-background p-4 space-y-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Flight Summary</p>
                                            <div className="grid gap-3">
                                                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Mass & Balance</p>
                                                    <p className="text-sm font-black">{booking.massAndBalance?.takeoffWeight ?? 'N/A'} lbs</p>
                                                    <p className="text-xs text-muted-foreground">CG {booking.massAndBalance?.takeoffCg ?? 'N/A'} in</p>
                                                </div>
                                                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Navlog</p>
                                                    <p className="text-sm font-black">{booking.navlog?.legs?.length || 0} leg(s)</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {booking.navlog?.departureIcao || '---'} to {booking.navlog?.arrivalIcao || '---'}
                                                    </p>
                                                </div>
                                                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Approval</p>
                                                    <p className="text-sm font-black">{booking.status || 'N/A'}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {booking.approvedByName ? `Approved by ${booking.approvedByName}` : 'Awaiting instructor approval'}
                                                    </p>
                                                    {booking.approvedAt ? (
                                                        <p className="text-xs text-muted-foreground">
                                                            {formatDateSafe(booking.approvedAt, 'PPP p')}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </div>
                    ) : null}

                    <TabsContent value="navlog" className="m-0 flex h-full min-h-0 flex-1 flex-col data-[state=inactive]:hidden overflow-hidden">
                        <div className="min-h-0 flex-1 overflow-hidden">
                            <NavlogBuilder booking={booking} tenantId={tenantId!} fuelWeightLbs={fuelWeightLbs} onFuelWeightChange={handleNavlogFuelSync} />
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
        </Card>
    );
}



