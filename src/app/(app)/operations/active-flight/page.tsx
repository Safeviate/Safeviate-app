'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Compass, Layers3, Loader2, Menu, Navigation, PlaneTakeoff, Play, Radio, Route, Square } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { useTheme } from '@/components/theme-provider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Aircraft } from '@/types/aircraft';
import type { Booking } from '@/types/booking';
import type { NavlogLeg } from '@/types/booking';
import type { TrainingRoute } from '@/types/booking';
import type { FlightPosition, FlightSession } from '@/types/flight-session';
import { createNavlogLegFromCoordinates } from '@/lib/flight-planner';
import { getOrCreateDeviceBinding, setDeviceLabel } from '@/lib/flight-session';
import { useGeolocationTrack } from '@/hooks/use-geolocation-track';
import { getActiveLegState } from '@/lib/active-flight';
import { isHrefEnabledForIndustry, shouldBypassIndustryRestrictions } from '@/lib/industry-access';
import { cn } from '@/lib/utils';
import { parseJsonResponse } from '@/lib/safe-json';
import { FullScreenFlightLayout } from '@/components/active-flight/full-screen-flight-layout';
import { FlightTelemetryTable } from '@/components/active-flight/flight-telemetry-table';
import { useIsMobile } from '@/hooks/use-mobile';
import { OPERATIONS_MAP_SURFACE_HEIGHT_CLASS } from '@/components/operations/operations-map-layout';
import { Skeleton } from '@/components/ui/skeleton';

const BREADCRUMB_SAMPLE_MS = 15000;
const MAX_BREADCRUMB_POINTS = 60;
const FLIGHT_SESSION_OUTBOX_PREFIX = 'safeviate:active-flight-session-outbox:';
const FLIGHT_TRACK_POINT_OUTBOX_PREFIX = 'safeviate:active-flight-track-point-outbox:';
const ACTIVE_TRACKING_STATE_PREFIX = 'safeviate:active-flight-tracking-state:';
const ACTIVE_TRACKING_SELECTION_PREFIX = 'safeviate:active-flight-selection:';
const ACTIVE_TRACKING_LOCATION_CALIBRATION_PREFIX = 'safeviate:active-flight-location-calibration:';
const ACTIVE_TRACKING_LAYERS_CARD_OPEN_KEY = 'safeviate:active-flight-layers-card-open';
const ACTIVE_TRACKING_MAP_ZOOM_CARD_OPEN_KEY = 'safeviate:active-flight-map-zoom-card-open';

interface ActiveTrackingState {
  active: true;
  aircraftId: string;
  bookingId?: string;
  savedAt: string;
}

  interface ActiveTrackingSelection {
    aircraftId: string;
    bookingId?: string;
    plannerRouteId?: string;
  }

interface LocationCalibration {
  latitude: number;
  longitude: number;
  savedAt: string;
}

const ActiveFlightLiveMap = dynamic(() => import('@/components/active-flight/active-flight-live-map').then((module) => module.ActiveFlightLiveMap), {
  ssr: false,
  loading: () => (
    <div className={cn('flex items-center justify-center rounded-2xl border border-dashed bg-slate-950 px-6 py-12 text-center text-slate-100', OPERATIONS_MAP_SURFACE_HEIGHT_CLASS)}>
      <div className="space-y-4">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-400" />
        <p className="text-sm font-black uppercase tracking-widest">Loading Pilot Map</p>
      </div>
    </div>
  ),
});

const getFlightSessionOutboxKey = (deviceId: string) => `${FLIGHT_SESSION_OUTBOX_PREFIX}${deviceId}`;
const getFlightTrackPointOutboxKey = (deviceId: string) => `${FLIGHT_TRACK_POINT_OUTBOX_PREFIX}${deviceId}`;
const getActiveTrackingStateKey = (deviceId: string) => `${ACTIVE_TRACKING_STATE_PREFIX}${deviceId}`;
const getActiveTrackingSelectionKey = (deviceId: string) => `${ACTIVE_TRACKING_SELECTION_PREFIX}${deviceId}`;

const readQueuedFlightSession = (deviceId: string) => {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(getFlightSessionOutboxKey(deviceId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as FlightSession;
  } catch {
    window.localStorage.removeItem(getFlightSessionOutboxKey(deviceId));
    return null;
  }
};

const queueFlightSessionSave = (session: FlightSession) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getFlightSessionOutboxKey(session.deviceId), JSON.stringify(session));
};

const clearQueuedFlightSession = (deviceId: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getFlightSessionOutboxKey(deviceId));
};

const readQueuedTrackPoints = (deviceId: string) => {
  if (typeof window === 'undefined') return [] as FlightPosition[];

  const raw = window.localStorage.getItem(getFlightTrackPointOutboxKey(deviceId));
  if (!raw) return [] as FlightPosition[];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FlightPosition[]) : [];
  } catch {
    window.localStorage.removeItem(getFlightTrackPointOutboxKey(deviceId));
    return [] as FlightPosition[];
  }
};

const saveQueuedTrackPoints = (deviceId: string, points: FlightPosition[]) => {
  if (typeof window === 'undefined') return;
  if (points.length === 0) {
    window.localStorage.removeItem(getFlightTrackPointOutboxKey(deviceId));
    return;
  }
  window.localStorage.setItem(getFlightTrackPointOutboxKey(deviceId), JSON.stringify(points));
};

const clearQueuedTrackPoints = (deviceId: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getFlightTrackPointOutboxKey(deviceId));
};

const queueTrackPointSample = (deviceId: string, point: FlightPosition | null) => {
  if (!point) return;

  const queued = readQueuedTrackPoints(deviceId);
  const lastPoint = queued[queued.length - 1];
  if (lastPoint?.timestamp === point.timestamp) {
    return;
  }

  if (lastPoint?.timestamp) {
    const lastTime = new Date(lastPoint.timestamp).getTime();
    const nextTime = new Date(point.timestamp).getTime();
    if (!Number.isNaN(lastTime) && !Number.isNaN(nextTime) && nextTime - lastTime < BREADCRUMB_SAMPLE_MS) {
      return;
    }
  }

  saveQueuedTrackPoints(deviceId, [...queued, point]);
};

const readActiveTrackingState = (deviceId: string) => {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(getActiveTrackingStateKey(deviceId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ActiveTrackingState;
  } catch {
    window.localStorage.removeItem(getActiveTrackingStateKey(deviceId));
    return null;
  }
};

const saveActiveTrackingState = (deviceId: string, state: ActiveTrackingState) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getActiveTrackingStateKey(deviceId), JSON.stringify(state));
};

const clearActiveTrackingState = (deviceId: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getActiveTrackingStateKey(deviceId));
};

  const saveActiveTrackingSelection = (deviceId: string, selection: ActiveTrackingSelection) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getActiveTrackingSelectionKey(deviceId), JSON.stringify(selection));
  };

const getLocationCalibrationKey = (deviceId: string) => `${ACTIVE_TRACKING_LOCATION_CALIBRATION_PREFIX}${deviceId}`;

const readLocationCalibration = (deviceId: string) => {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(getLocationCalibrationKey(deviceId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LocationCalibration;
  } catch {
    window.localStorage.removeItem(getLocationCalibrationKey(deviceId));
    return null;
  }
};

const saveLocationCalibration = (deviceId: string, calibration: LocationCalibration) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getLocationCalibrationKey(deviceId), JSON.stringify(calibration));
};

const readStoredBoolean = (key: string, fallback = false) => {
  if (typeof window === 'undefined') return fallback;
  const stored = window.sessionStorage.getItem(key);
  if (stored === null) return fallback;
  return stored === 'true';
};

const clearLocationCalibration = (deviceId: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getLocationCalibrationKey(deviceId));
};

const getResumeTimestamp = (session: ActiveTrackingState | FlightSession) =>
  ('updatedAt' in session && session.updatedAt) ||
  ('savedAt' in session && session.savedAt) ||
  ('startedAt' in session && session.startedAt) ||
  'resume';

export default function ActiveFlightPage() {
  const { toast } = useToast();
  const { tenantId, userProfile, isLoading: isUserLoading } = useUserProfile();
  const { tenant, isLoading: isTenantLoading } = useTenantConfig();
  const { uiMode } = useTheme();
  const isMobile = useIsMobile();
  const [isMobileSelectorOpen, setIsMobileSelectorOpen] = useState(false);
  const [showCompactMenus, setShowCompactMenus] = useState(true);
  const [isOrientationCardOpen, setIsOrientationCardOpen] = useState(false);
  const [isRouteDrawerOpen, setIsRouteDrawerOpen] = useState(false);
  const [selectedAircraftId, setSelectedAircraftId] = useState('');
  const [selectedBookingFilterId, setSelectedBookingFilterId] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [selectedPlannerRouteId, setSelectedPlannerRouteId] = useState('');
  const [deviceLabelInput, setDeviceLabelInput] = useState('');
  const [savedDeviceLabel, setSavedDeviceLabel] = useState('');
  const [isTrackingActive, setIsTrackingActive] = useState(false);
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trainingRoutes, setTrainingRoutes] = useState<TrainingRoute[]>([]);
  const [flightSessions, setFlightSessions] = useState<FlightSession[]>([]);
  const [scheduleDataLoaded, setScheduleDataLoaded] = useState(false);
  const [locationCalibration, setLocationCalibration] = useState<LocationCalibration | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [isFullscreenMapOpen, setIsFullscreenMapOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [hasQueuedSession, setHasQueuedSession] = useState(false);
  const [queuedTrackPointCount, setQueuedTrackPointCount] = useState(0);
  const [followOwnship, setFollowOwnship] = useState(true);
  const [mapRecenterSignal, setMapRecenterSignal] = useState(0);
  const [loadedBookingId, setLoadedBookingId] = useState('');
  const [loadedPlannerRouteId, setLoadedPlannerRouteId] = useState('');
  const [isLayersCardOpen, setIsLayersCardOpen] = useState(() => readStoredBoolean(ACTIVE_TRACKING_LAYERS_CARD_OPEN_KEY, false));
  const [isMapZoomCardOpen, setIsMapZoomCardOpen] = useState(() => readStoredBoolean(ACTIVE_TRACKING_MAP_ZOOM_CARD_OPEN_KEY, false));
  const resumeHydratedRef = useRef<string | null>(null);
  const lastWriteRef = useRef(0);
  const { position, error: geolocationError, permissionState, isWatching, startWatching, stopWatching } = useGeolocationTrack();
  const isModern = uiMode === 'modern';
  useEffect(() => {
    const binding = getOrCreateDeviceBinding();
    if (!binding) return;
    setSavedDeviceLabel(binding.deviceLabel || '');
    setDeviceLabelInput(binding.deviceLabel || '');
  }, []);

  useEffect(() => {
    const load = async () => {
      const [aircraftRes, scheduleRes, sessionsRes] = await Promise.all([
        fetch('/api/aircraft', { cache: 'no-store' }),
        fetch('/api/schedule-data', { cache: 'no-store' }),
        fetch('/api/flight-sessions', { cache: 'no-store' }),
      ]);
      let scheduleAircrafts: Aircraft[] = [];
      if (scheduleRes.ok) {
        const data = await scheduleRes.json();
        scheduleAircrafts = Array.isArray(data.aircraft) ? data.aircraft : [];
        setAircrafts(scheduleAircrafts);
        setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      }
      if (scheduleAircrafts.length === 0 && aircraftRes.ok) {
        const data = await aircraftRes.json();
        setAircrafts(Array.isArray(data.aircraft) ? data.aircraft : []);
      }
      setScheduleDataLoaded(true);
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setFlightSessions(Array.isArray(data.sessions) ? data.sessions : []);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRoutes = async () => {
      try {
        const response = await fetch('/api/training-routes', { cache: 'no-store' });
        const payload = await parseJsonResponse<{ routes?: TrainingRoute[] }>(response);
        if (cancelled) return;
        setTrainingRoutes(Array.isArray(payload?.routes) ? payload.routes.filter((route) => route.routeType !== 'other') : []);
      } catch {
        if (!cancelled) setTrainingRoutes([]);
      }
    };

    void loadRoutes();
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadFlightSessions = async () => {
    const response = await fetch('/api/flight-sessions', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setFlightSessions(Array.isArray(data.sessions) ? data.sessions : []);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncConnectivityState = () => {
      setIsOnline(window.navigator.onLine);
    };

    const syncQueuedSessionState = () => {
      const binding = getOrCreateDeviceBinding();
      if (!binding?.deviceId) {
        setHasQueuedSession(false);
        setQueuedTrackPointCount(0);
        return;
      }

      const queuedPoints = readQueuedTrackPoints(binding.deviceId);
      setQueuedTrackPointCount(queuedPoints.length);
      setHasQueuedSession(Boolean(readQueuedFlightSession(binding.deviceId)) || queuedPoints.length > 0);
    };

    syncConnectivityState();
    syncQueuedSessionState();

    window.addEventListener('online', syncConnectivityState);
    window.addEventListener('offline', syncConnectivityState);
    window.addEventListener('storage', syncQueuedSessionState);

    return () => {
      window.removeEventListener('online', syncConnectivityState);
      window.removeEventListener('offline', syncConnectivityState);
      window.removeEventListener('storage', syncQueuedSessionState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(ACTIVE_TRACKING_LAYERS_CARD_OPEN_KEY, String(isLayersCardOpen));
  }, [isLayersCardOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(ACTIVE_TRACKING_MAP_ZOOM_CARD_OPEN_KEY, String(isMapZoomCardOpen));
  }, [isMapZoomCardOpen]);

  const deviceBinding = useMemo(() => getOrCreateDeviceBinding(), []);
  const fallbackAircraft = useMemo(
    () =>
      flightSessions
        .filter((session, index, items) => items.findIndex((item) => item.aircraftId === session.aircraftId) === index)
        .map((session) => ({
          id: session.aircraftId,
          make: '',
          model: '',
          tailNumber: session.aircraftRegistration,
        })) as Aircraft[],
    [flightSessions]
  );
  const sortedAircraft = useMemo(() => {
    const source = aircrafts.length > 0 ? aircrafts : fallbackAircraft;
    return [...source].sort((a, b) => {
      const left = (a.tailNumber || a.id || '').trim();
      const right = (b.tailNumber || b.id || '').trim();
      return left.localeCompare(right);
    });
  }, [aircrafts, fallbackAircraft]);
  const selectedAircraft = useMemo(() => sortedAircraft.find((aircraft) => aircraft.id === selectedAircraftId) || null, [selectedAircraftId, sortedAircraft]);
  const bookingChoices = useMemo(
    () => bookings.filter((booking) => !selectedAircraftId || booking.aircraftId === selectedAircraftId).sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()),
    [bookings, selectedAircraftId],
  );
  const candidateBookings = useMemo(() => bookings.filter((booking) => !selectedAircraftId || booking.aircraftId === selectedAircraftId).filter((booking) => (booking.navlog?.legs?.length || 0) > 0).sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()), [bookings, selectedAircraftId]);
  const plannerRouteChoices = useMemo(() => [...trainingRoutes].sort((a, b) => (a.name || '').localeCompare(b.name || '')), [trainingRoutes]);
  const selectedBooking = useMemo(() => candidateBookings.find((booking) => booking.id === loadedBookingId) || null, [candidateBookings, loadedBookingId]);
  const selectedBookingFilter = useMemo(() => bookingChoices.find((booking) => booking.id === selectedBookingFilterId) || null, [bookingChoices, selectedBookingFilterId]);
  const selectedPlannerRoute = useMemo(() => plannerRouteChoices.find((route) => route.id === loadedPlannerRouteId) || null, [plannerRouteChoices, loadedPlannerRouteId]);
  const selectedBookingChoice = useMemo(() => candidateBookings.find((booking) => booking.id === selectedBookingId) || null, [candidateBookings, selectedBookingId]);
  const selectedPlannerRouteChoice = useMemo(() => plannerRouteChoices.find((route) => route.id === selectedPlannerRouteId) || null, [plannerRouteChoices, selectedPlannerRouteId]);
  const selectedAircraftValue = selectedAircraft ? selectedAircraftId : undefined;
  const selectedBookingFilterValue = selectedBookingFilter ? selectedBookingFilterId : undefined;
  const selectedBookingValue = selectedBookingId || undefined;
  const selectedPlannerRouteValue = selectedPlannerRouteId || undefined;
  const mobileSelectorSummary = selectedAircraft?.tailNumber || selectedBookingFilter?.bookingNumber || selectedBookingChoice?.bookingNumber || selectedPlannerRouteChoice?.name
    ? [selectedAircraft?.tailNumber, selectedBookingFilter ? `Booking #${selectedBookingFilter.bookingNumber}` : null, selectedBookingChoice ? `Route #${selectedBookingChoice.bookingNumber}` : null, selectedPlannerRouteChoice ? `Planner Route ${selectedPlannerRouteChoice.name}` : null]
        .filter(Boolean)
        .join(' • ')
    : 'Flight Setup';
  const selectedLegs = selectedPlannerRoute?.legs?.length ? selectedPlannerRoute.legs : selectedBooking?.navlog?.legs || [];
  const [editableLegs, setEditableLegs] = useState<NavlogLeg[] | null>(null);
  const currentDeviceSession = useMemo(
    () => flightSessions.find((session) => session.deviceId === deviceBinding?.deviceId) || null,
    [deviceBinding?.deviceId, flightSessions],
  );
  const currentDeviceTrackHistory = useMemo(
    () =>
      currentDeviceSession?.breadcrumb
        ? currentDeviceSession.breadcrumb
            .filter((point) => typeof point.latitude === 'number' && typeof point.longitude === 'number')
            .map((point) => [point.latitude, point.longitude] as [number, number])
        : [],
    [currentDeviceSession?.breadcrumb],
  );
  const currentDeviceLastPosition = currentDeviceSession?.lastPosition || null;
  useEffect(() => {
    setEditableLegs(null);
  }, [loadedBookingId, loadedPlannerRouteId]);
  const displayLegs = editableLegs ?? selectedLegs;
  const displayPosition = useMemo<FlightPosition | null>(() => {
    if (!position && !locationCalibration && !currentDeviceSession?.lastPosition) return null;

    if (position && !locationCalibration) {
      return position;
    }

    if (position && locationCalibration) {
      return {
        ...position,
        latitude: locationCalibration.latitude,
        longitude: locationCalibration.longitude,
      };
    }

    if (currentDeviceSession?.lastPosition && !locationCalibration) {
      return currentDeviceSession.lastPosition;
    }

    return {
      latitude: locationCalibration!.latitude,
      longitude: locationCalibration!.longitude,
      accuracy: undefined,
      altitude: null,
      speedKt: null,
      headingTrue: null,
      timestamp: locationCalibration!.savedAt,
    };
  }, [currentDeviceSession?.lastPosition, locationCalibration, position]);
  const effectivePosition = displayPosition;
  const activeLegState = useMemo(() => getActiveLegState(displayLegs, effectivePosition), [displayLegs, effectivePosition]);
  const handleMoveWaypoint = useCallback((legId: string, lat: number, lon: number) => {
    setEditableLegs((current) => {
      const sourceLegs = current ?? selectedLegs;
      if (!sourceLegs.length) return current;

      const movedLegs = sourceLegs.map((leg) => (leg.id === legId ? { ...leg, latitude: lat, longitude: lon } : leg));
      const recalculatedLegs = movedLegs.map((leg, index) => {
        const rebuiltLeg = createNavlogLegFromCoordinates(
          movedLegs.slice(0, index),
          leg.latitude ?? 0,
          leg.longitude ?? 0,
          leg.waypoint?.replace(/-\d+$/, '') || 'PNT',
          leg.frequencies,
          leg.layerInfo,
          leg.notes,
        );

        return {
          ...leg,
          ...rebuiltLeg,
          id: leg.id,
        };
      });

      return recalculatedLegs;
    });
  }, [selectedLegs]);
  const handleWaypointNotesChange = useCallback((legId: string, nextNotes: string) => {
    setEditableLegs((current) => {
      const sourceLegs = current ?? selectedLegs;
      if (!sourceLegs.length) return current;

      return sourceLegs.map((leg) => (leg.id === legId ? { ...leg, notes: nextNotes } : leg));
    });
  }, [selectedLegs]);
  const pilotName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'Pilot';
  const liveTelemetry = {
    speed: activeLegState?.groundSpeedKt ?? effectivePosition?.speedKt ?? null,
    altitude: effectivePosition?.altitude ?? null,
    heading: effectivePosition?.headingTrue ?? null,
    hdop: effectivePosition?.hdop ?? null,
    trailPoints: currentDeviceSession?.breadcrumb?.length ?? (effectivePosition ? 1 : 0),
  };
  const rawAccuracyMeters = position?.accuracy != null && !Number.isNaN(position.accuracy) ? Math.round(position.accuracy) : null;
  const isCoarseFix = rawAccuracyMeters != null && rawAccuracyMeters > 500;
  const locationStatusLabel = locationCalibration
    ? 'Calibrated'
    : isCoarseFix
      ? 'Coarse GPS'
      : position
        ? 'GPS Fix'
        : 'Waiting for GPS';
  const nextWaypointNumber = activeLegState?.activeLegIndex != null ? `${activeLegState.activeLegIndex + 2}` : 'N/A';
  const etaToNextMinutes = activeLegState?.etaToNextWaypointMinutes ?? activeLegState?.etaToNextMinutes ?? null;
  const etaToNextLabel = etaToNextMinutes != null ? `${Math.max(1, Math.round(etaToNextMinutes))} min` : 'N/A';
  const activeNavlogLeg =
    activeLegState?.activeLegIndex != null ? displayLegs[activeLegState.activeLegIndex] ?? null : null;
  const activeFromNavlogLeg =
    activeLegState?.activeLegIndex != null && activeLegState.activeLegIndex > 0
      ? displayLegs[activeLegState.activeLegIndex - 1] ?? null
      : null;
  const activeLegRemainingFuel =
    activeLegState?.activeLegIndex != null && selectedBooking?.navlog?.globalFuelOnBoard != null
      ? selectedBooking.navlog.globalFuelOnBoard -
        displayLegs
          .slice(1, activeLegState.activeLegIndex + 1)
          .reduce((sum, leg) => sum + (leg.tripFuel ?? 0), 0)
      : null;
  const syncStatusLabel = hasQueuedSession
    ? queuedTrackPointCount > 0
      ? `Queued for Sync (${queuedTrackPointCount} pts)`
      : 'Queued for Sync'
    : isOnline
      ? 'Online'
      : 'Offline';
  const syncStatusClassName = hasQueuedSession
    ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50'
    : isOnline
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50'
      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50';
  const formatHeadingValue = (value?: number | null) =>
    value == null || Number.isNaN(value) ? 'N/A' : `${Math.round(((value % 360) + 360) % 360)}°`;
  const formatSignedHeadingValue = (value?: number | null) =>
    value == null || Number.isNaN(value) ? 'N/A' : `${value >= 0 ? '+' : '-'}${Math.abs(Math.round(value))}°`;
  const formatMinutesValue = (value?: number | null) => {
    if (value == null || Number.isNaN(value) || value <= 0) return 'N/A';
    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);
    return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}` : `${minutes} min`;
  };

  const conflictingAircraftSession = useMemo(() => {
    if (!selectedAircraft || !deviceBinding?.deviceId) return null;
    return flightSessions.find((session) => session.status === 'active' && session.aircraftId === selectedAircraft.id && session.deviceId !== deviceBinding.deviceId) || null;
  }, [deviceBinding?.deviceId, flightSessions, selectedAircraft]);

  const actionButtons = [
    {
      value: isTrackingActive ? 'stop-tracking' : 'start-tracking',
      label: isTrackingActive ? 'Stop Tracking' : 'Start Tracking',
      onClick: () => {
        if (isTrackingActive) {
          stopTrackingSession();
          return;
        }
        startTracking();
      },
      className: isTrackingActive
        ? 'border-rose-600 bg-rose-600 text-white hover:bg-rose-700'
        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
      disabled: !isTrackingActive && (!selectedAircraft || Boolean(conflictingAircraftSession)),
    },
    {
      value: 'layers',
      label: 'Layers',
      onClick: () => {
        setIsLayersCardOpen((current) => !current);
        setIsMapZoomCardOpen(false);
      },
      className: 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
    },
    {
      value: 'map-zoom',
      label: 'Map Zoom',
      onClick: () => {
        setIsMapZoomCardOpen((current) => !current);
        setIsLayersCardOpen(false);
      },
      className: 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
    },
    {
      value: 'centre-map',
      label: 'Centre Map',
      onClick: () => {
        setMapRecenterSignal((current) => current + 1);
        setIsLayersCardOpen(false);
        setIsMapZoomCardOpen(false);
      },
      className: 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
    },
    {
      value: 'north-up',
      label: 'North Up',
      onClick: () => {
        setFollowOwnship(false);
        setIsLayersCardOpen(false);
        setIsMapZoomCardOpen(false);
      },
      className: !followOwnship ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
    },
    {
      value: 'nose-up',
      label: 'Nose Up',
      onClick: () => {
        setFollowOwnship(true);
        setIsLayersCardOpen(false);
        setIsMapZoomCardOpen(false);
      },
      className: followOwnship ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
    },
  ];

  const handleAircraftSelectionChange = (aircraftId: string) => {
    setSelectedAircraftId(aircraftId);
    if (!deviceBinding?.deviceId) return;
    saveActiveTrackingSelection(deviceBinding.deviceId, {
      aircraftId,
      bookingId: selectedBookingId || undefined,
      plannerRouteId: selectedPlannerRouteId || undefined,
    });
  };

  const handleBookingFilterSelectionChange = (bookingId: string) => {
    setSelectedBookingFilterId(bookingId);
    if (!deviceBinding?.deviceId) return;
    saveActiveTrackingSelection(deviceBinding.deviceId, {
      aircraftId: selectedAircraftId,
      bookingId: selectedBookingId || undefined,
      plannerRouteId: selectedPlannerRouteId || undefined,
    });
  };

  const handleBookingSelectionChange = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    if (bookingId) {
      setSelectedPlannerRouteId('');
    }
    setLoadedBookingId('');
    setLoadedPlannerRouteId('');
    if (!deviceBinding?.deviceId) return;
    saveActiveTrackingSelection(deviceBinding.deviceId, {
      aircraftId: selectedAircraftId,
      bookingId: bookingId || undefined,
      plannerRouteId: bookingId ? undefined : selectedPlannerRouteId || undefined,
    });
  };

  const handlePlannerRouteSelectionChange = (routeId: string) => {
    setSelectedPlannerRouteId(routeId === 'none' ? '' : routeId);
    if (routeId !== 'none') {
      setSelectedBookingId('');
    }
    setLoadedBookingId('');
    setLoadedPlannerRouteId('');
    if (!deviceBinding?.deviceId) return;
    saveActiveTrackingSelection(deviceBinding.deviceId, {
      aircraftId: selectedAircraftId,
      bookingId: routeId === 'none' ? selectedBookingId || undefined : undefined,
      plannerRouteId: routeId === 'none' ? undefined : routeId,
    });
  };

  const handleClearRouteSelection = () => {
    setSelectedBookingId('');
    setSelectedPlannerRouteId('');
    setLoadedBookingId('');
    setLoadedPlannerRouteId('');
    if (!deviceBinding?.deviceId) return;
    saveActiveTrackingSelection(deviceBinding.deviceId, {
      aircraftId: selectedAircraftId,
      plannerRouteId: undefined,
      bookingId: undefined,
    });
  };

  const forceRouteLoad = (source: 'booking' | 'route') => {
    const bookingRouteId = selectedBookingId || '';
    const plannerRouteId = selectedPlannerRouteId || '';

    if (source === 'booking') {
      if (!bookingRouteId) {
        toast({
          variant: 'destructive',
          title: 'No booking route selected',
          description: 'Choose a navlog route first, then load it.',
        });
        return;
      }

      setLoadedBookingId(bookingRouteId);
      setLoadedPlannerRouteId('');
      return;
    }

    if (!plannerRouteId) {
      toast({
        variant: 'destructive',
        title: 'No planner route selected',
        description: 'Choose a planner route first, then load it.',
      });
      return;
    }

    setLoadedPlannerRouteId(plannerRouteId);
    setLoadedBookingId('');
  };

  useEffect(() => {
    if (!scheduleDataLoaded) return;
    if (!selectedAircraftId) return;
    if (selectedAircraft) return;
    setSelectedAircraftId('');
  }, [scheduleDataLoaded, selectedAircraft, selectedAircraftId]);

  useEffect(() => {
    if (!deviceBinding?.deviceId) return;

    const serverSession = flightSessions.find((session) => session.deviceId === deviceBinding.deviceId && session.status === 'active') || null;
    const persistedState = readActiveTrackingState(deviceBinding.deviceId);
    const resumeSource = serverSession || persistedState;
    if (!resumeSource) return;

    const resumeKey = `${deviceBinding.deviceId}:${getResumeTimestamp(resumeSource)}`;
    if (resumeHydratedRef.current === resumeKey) return;
    resumeHydratedRef.current = resumeKey;

    if (!isTrackingActive) {
      setIsTrackingActive(true);
      startWatching();
    }
  }, [deviceBinding?.deviceId, flightSessions, isTrackingActive, startWatching]);

  useEffect(() => {
    if (!deviceBinding?.deviceId) return;
    const raw = window.localStorage.getItem(getActiveTrackingSelectionKey(deviceBinding.deviceId));
    if (!raw) return;

    try {
      const savedSelection = JSON.parse(raw) as ActiveTrackingSelection;
      if (savedSelection.bookingId) {
        setSelectedBookingId(savedSelection.bookingId);
        setSelectedPlannerRouteId('');
      }
      if (savedSelection.plannerRouteId) {
        setSelectedBookingId('');
        setSelectedPlannerRouteId(savedSelection.plannerRouteId);
      }
    } catch {
      window.localStorage.removeItem(getActiveTrackingSelectionKey(deviceBinding.deviceId));
    }
  }, [deviceBinding?.deviceId]);

  const buildBreadcrumb = (existing: FlightPosition[] | undefined, nextPosition: FlightPosition | null) => {
    if (!nextPosition) return existing || [];
    const trail = Array.isArray(existing) ? [...existing] : [];
    const lastPoint = trail[trail.length - 1];
    if (!lastPoint) {
      return [nextPosition];
    }

    const lastTime = new Date(lastPoint.timestamp).getTime();
    const nextTime = new Date(nextPosition.timestamp).getTime();
    if (!Number.isNaN(lastTime) && !Number.isNaN(nextTime) && nextTime - lastTime < BREADCRUMB_SAMPLE_MS) {
      return trail;
    }

    trail.push(nextPosition);
    return trail.slice(-MAX_BREADCRUMB_POINTS);
  };

  useEffect(() => {
    if (!deviceBinding?.deviceId || typeof window === 'undefined') return;

    const flushQueuedSession = async () => {
      if (!navigator.onLine) return;

      const queuedSession = readQueuedFlightSession(deviceBinding.deviceId);
      const queuedTrackPoints = readQueuedTrackPoints(deviceBinding.deviceId);
      if (!queuedSession && queuedTrackPoints.length === 0) return;
      if (!queuedSession) return;

      try {
        const response = await fetch('/api/flight-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: queuedSession, trackPoints: queuedTrackPoints }),
        });

        if (response.ok) {
          clearQueuedFlightSession(deviceBinding.deviceId);
          clearQueuedTrackPoints(deviceBinding.deviceId);
          setHasQueuedSession(false);
          setQueuedTrackPointCount(0);
        }
      } catch {
        // Keep the queued session until the browser regains connectivity.
      }
    };

    void flushQueuedSession();

    const handleOnline = () => {
      void flushQueuedSession();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [deviceBinding?.deviceId]);

  useEffect(() => {
    if (!isTrackingActive || !displayPosition || !selectedAircraft || !deviceBinding) return;
    const now = Date.now();
    if (now - lastWriteRef.current < 5000) return;
    lastWriteRef.current = now;
    const existingSession = flightSessions.find((session) => session.deviceId === deviceBinding.deviceId);
    const startedAt = existingSession?.startedAt || new Date().toISOString();
    const nextSession: FlightSession = {
      id: deviceBinding.deviceId,
      pilotId: userProfile?.id || 'unknown',
      pilotName,
      aircraftId: selectedAircraft.id,
      aircraftRegistration: selectedAircraft.tailNumber,
      bookingId: selectedBooking?.id || '',
      status: 'active',
      deviceId: deviceBinding.deviceId,
      deviceLabel: savedDeviceLabel || deviceBinding.deviceLabel || '',
      activeLegIndex: activeLegState?.activeLegIndex ?? 0,
      startedAt,
      updatedAt: new Date().toISOString(),
      lastPosition: displayPosition,
      breadcrumb: buildBreadcrumb(existingSession?.breadcrumb, displayPosition),
      distanceToNextNm: activeLegState?.distanceToNextNm,
      bearingToNext: activeLegState?.bearingToNext,
      etaToNextMinutes: activeLegState?.etaToNextMinutes,
      crossTrackErrorNm: activeLegState?.crossTrackErrorNm,
      onCourse: activeLegState?.onCourse,
      groundSpeedKt: activeLegState?.groundSpeedKt ?? displayPosition.speedKt ?? undefined,
    };
    const next = [...flightSessions.filter((session) => session.deviceId !== deviceBinding.deviceId), nextSession];
    void persistSessions(next);
  }, [activeLegState, deviceBinding, displayPosition, flightSessions, isTrackingActive, pilotName, savedDeviceLabel, selectedAircraft, selectedBooking?.id, userProfile?.id]);

  const persistSessions = async (next: FlightSession[]) => {
    setFlightSessions(next);
    const current = deviceBinding?.deviceId
      ? next.find((session) => session.deviceId === deviceBinding.deviceId)
      : next[next.length - 1];
    if (!current) return;
    try {
      const response = await fetch('/api/flight-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: current }),
      });

      if (response.status === 423) {
        setIsTrackingActive(false);
        stopWatching();
        if (deviceBinding?.deviceId) {
          clearActiveTrackingState(deviceBinding.deviceId);
          clearQueuedTrackPoints(deviceBinding.deviceId);
          clearQueuedFlightSession(deviceBinding.deviceId);
          setQueuedTrackPointCount(0);
        }
        toast({ variant: 'destructive', title: 'Tracking Ended By Ops', description: 'This device was cleared from fleet operations. Start tracking again to rejoin.' });
        await reloadFlightSessions();
        return;
      }

      if (!response.ok) {
        queueFlightSessionSave(current);
        queueTrackPointSample(current.deviceId, current.lastPosition || null);
        setQueuedTrackPointCount(readQueuedTrackPoints(current.deviceId).length);
        setHasQueuedSession(true);
        return;
      }

      clearQueuedFlightSession(current.deviceId);
      clearQueuedTrackPoints(current.deviceId);
      setQueuedTrackPointCount(0);
      setHasQueuedSession(false);
    } catch {
      queueFlightSessionSave(current);
      queueTrackPointSample(current.deviceId, current.lastPosition || null);
      setQueuedTrackPointCount(readQueuedTrackPoints(current.deviceId).length);
      setHasQueuedSession(true);
    }
  };

  const startTracking = () => {
    if (!selectedAircraft || !deviceBinding) return;
    if (conflictingAircraftSession) {
      toast({ variant: 'destructive', title: 'Aircraft Already In Use', description: `${selectedAircraft.tailNumber} is already active on another device.` });
      return;
    }
    if (selectedBookingId) {
      setLoadedBookingId(selectedBookingId);
      setLoadedPlannerRouteId('');
    } else if (selectedPlannerRouteId) {
      setLoadedPlannerRouteId(selectedPlannerRouteId);
      setLoadedBookingId('');
    }
    void fetch(`/api/flight-sessions?id=${deviceBinding.deviceId}&mode=unblock`, { method: 'DELETE' });
    saveActiveTrackingState(deviceBinding.deviceId, {
      active: true,
      aircraftId: selectedAircraft.id,
      bookingId: selectedBookingId || selectedBooking?.id || undefined,
      savedAt: new Date().toISOString(),
    });
    saveActiveTrackingSelection(deviceBinding.deviceId, {
      aircraftId: selectedAircraft.id,
      bookingId: selectedBookingId || selectedBooking?.id || undefined,
      plannerRouteId: selectedPlannerRouteId || undefined,
    });
    setIsTrackingActive(true);
    lastWriteRef.current = 0;
    void persistSessions(flightSessions.filter((session) => session.deviceId !== deviceBinding.deviceId).concat({
      id: deviceBinding.deviceId,
      pilotId: userProfile?.id || 'unknown',
      pilotName,
      aircraftId: selectedAircraft.id,
      aircraftRegistration: selectedAircraft.tailNumber,
      bookingId: selectedBookingId || selectedBooking?.id || undefined,
      status: 'active',
      deviceId: deviceBinding.deviceId,
      deviceLabel: savedDeviceLabel || deviceBinding.deviceLabel || '',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      breadcrumb: position ? buildBreadcrumb([], position) : [],
      ...(activeLegState
        ? {
            activeLegIndex: activeLegState.activeLegIndex,
            distanceToNextNm: activeLegState.distanceToNextNm,
            bearingToNext: activeLegState.bearingToNext,
            etaToNextMinutes: activeLegState.etaToNextMinutes,
            crossTrackErrorNm: activeLegState.crossTrackErrorNm,
            onCourse: activeLegState.onCourse,
            groundSpeedKt: activeLegState.groundSpeedKt ?? position?.speedKt ?? undefined,
          }
        : {}),
    }));
    startWatching();
  };

  const stopTrackingSession = () => {
    stopWatching();
    setIsTrackingActive(false);
    if (!deviceBinding) return;
    clearActiveTrackingState(deviceBinding.deviceId);
    void persistSessions(flightSessions.map((session) => session.deviceId === deviceBinding.deviceId ? { ...session, status: 'completed', endedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : session));
  };

  function LegacyFullscreenFlightLayout({ children: _children }: { children?: unknown }) {
    /*
      <div className="grid h-full min-h-0 grid-rows-[1fr] gap-3 md:grid-rows-[auto,minmax(44vh,1fr),auto]">
        <div className="hidden rounded-2xl border border-slate-800 bg-slate-900/95 px-4 py-3 shadow-[0_20px_40px_rgba(15,23,42,0.28)] md:block">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-100 hover:bg-slate-800">
                  {selectedAircraft?.tailNumber || 'Aircraft not selected'}
                </Badge>
                <Badge className="border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-100 hover:bg-slate-800">
                  {isTrackingActive ? 'Tracking active' : 'Tracking idle'}
                </Badge>
                <Badge className={cn('px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]', syncStatusClassName)}>
                  {syncStatusLabel}
                </Badge>
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">
                {displayLegs.length > 0
                  ? `Route ${selectedBooking.bookingNumber} • ${displayLegs.length} legs • ${activeLegState?.toWaypoint || 'No active waypoint'}`
                  : 'Select a booking with a navlog to show route progress'}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">HDG</p>
                <p className="mt-1 text-sm font-black text-slate-100">{liveTelemetry.heading != null ? `${liveTelemetry.heading.toFixed(0)}°` : 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">SPD</p>
                <p className="mt-1 text-sm font-black text-slate-100">{liveTelemetry.speed != null ? `${liveTelemetry.speed.toFixed(0)} kt` : 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ALT</p>
                <p className="mt-1 text-sm font-black text-slate-100">{liveTelemetry.altitude != null ? `${Math.round(liveTelemetry.altitude)} m` : 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">HDOP</p>
                <p className="mt-1 text-sm font-black text-slate-100">{liveTelemetry.hdop != null ? liveTelemetry.hdop.toFixed(1) : 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">TRK</p>
                <p className="mt-1 text-sm font-black text-slate-100">{liveTelemetry.trailPoints} pts</p>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-[0_22px_50px_rgba(15,23,42,0.35)] md:rounded-2xl">
          <ActiveFlightLiveMap
            booking={selectedBooking}
            legs={displayLegs}
            position={effectivePosition}
            initialTrackHistory={currentDeviceTrackHistory}
            initialLastPosition={currentDeviceLastPosition}
            aircraftRegistration={selectedAircraft?.tailNumber}
            activeLegIndex={activeLegState?.activeLegIndex}
            activeLegState={activeLegState}
            onMoveWaypoint={handleMoveWaypoint}
            onWaypointNotesChange={handleWaypointNotesChange}
          />
        </div>

        <div className="hidden max-h-[28vh] gap-3 overflow-y-auto pb-1 md:grid lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
          <Card className="border border-slate-800 bg-slate-900/95 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-100">Route Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {activeLegState ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">From</p>
                      <p className="mt-1 font-black text-slate-100">{activeLegState.fromWaypoint || 'N/A'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">To</p>
                      <p className="mt-1 font-black text-slate-100">{activeLegState.toWaypoint || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dist</p>
                      <p className="mt-1 font-black text-slate-100">{activeLegState.distanceToNextNm != null ? `${activeLegState.distanceToNextNm.toFixed(1)} NM` : 'N/A'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Brg</p>
                      <p className="mt-1 font-black text-slate-100">{activeLegState.bearingToNext != null ? `${activeLegState.bearingToNext.toFixed(0)}°` : 'N/A'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">XTK</p>
                      <p className="mt-1 font-black text-slate-100">{activeLegState.crossTrackErrorNm != null ? `${activeLegState.crossTrackErrorNm.toFixed(1)} NM` : 'N/A'}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-4 text-slate-300">
                  Select a booking or planner route and start tracking to populate route progress.
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border border-slate-800 bg-slate-900/95 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-100">Telemetry</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Heading</p>
                <p className="mt-1 text-sm font-black text-slate-100">{liveTelemetry.heading != null ? `${liveTelemetry.heading.toFixed(0)}°` : 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Speed</p>
                <p className="mt-1 text-sm font-black text-slate-100">{liveTelemetry.speed != null ? `${liveTelemetry.speed.toFixed(0)} kt` : 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Altitude</p>
                <p className="mt-1 text-sm font-black text-slate-100">{liveTelemetry.altitude != null ? `${Math.round(liveTelemetry.altitude)} m` : 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Breadcrumb</p>
                <p className="mt-1 text-sm font-black text-slate-100">{liveTelemetry.trailPoints} pts</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-slate-800 bg-slate-900/95 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-100">Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Device</p>
                <p className="mt-1 font-black text-slate-100">{savedDeviceLabel || 'Unnamed device'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sync</p>
                <p className="mt-1 font-black text-slate-100">{syncStatusLabel}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Map Mode</p>
                <p className="mt-1 font-black text-slate-100">{activeLegState ? 'Route Follow' : 'Ownship Follow'}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    */
    return (
      <div className="relative h-full min-h-0 overflow-hidden bg-black">
        <ActiveFlightLiveMap
          booking={selectedBooking}
          legs={displayLegs}
          position={effectivePosition}
          initialTrackHistory={currentDeviceTrackHistory}
          initialLastPosition={currentDeviceLastPosition}
          aircraftRegistration={selectedAircraft?.tailNumber}
          activeLegIndex={activeLegState?.activeLegIndex}
          activeLegState={activeLegState}
          onMoveWaypoint={handleMoveWaypoint}
          onWaypointNotesChange={handleWaypointNotesChange}
          fullscreen
        />
      </div>
    );
  }

  const canAccessActiveFlight = shouldBypassIndustryRestrictions(tenant?.id) || isHrefEnabledForIndustry('/operations/active-flight', tenant?.industry) || (tenant?.enabledMenus?.includes('/operations/active-flight') ?? false);

  if (isTenantLoading) {
    return (
      <div className={cn('mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-1 flex-col gap-4 overflow-hidden px-1 pt-4', isModern && 'gap-4')}>
        {isModern && (
          <section className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_34%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(15,23,42,0.94)_40%,_rgba(30,41,59,0.92))] px-6 py-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] md:px-8 md:py-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl space-y-3">
                <Skeleton className="h-3 w-36 bg-white/15" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full max-w-xl bg-white/15 md:h-10" />
                  <Skeleton className="h-4 w-full max-w-lg bg-white/15" />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Skeleton className="h-7 w-28 rounded-full bg-white/15" />
                  <Skeleton className="h-7 w-24 rounded-full bg-white/15" />
                  <Skeleton className="h-7 w-24 rounded-full bg-white/15" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
                <Skeleton className="h-[124px] rounded-2xl bg-white/10" />
                <Skeleton className="h-[124px] rounded-2xl bg-white/10" />
              </div>
            </div>
          </section>
        )}

        <Card className={cn('flex min-h-0 flex-1 flex-col border shadow-none', isModern && 'overflow-hidden border-slate-200/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.08)]')}>
          <div className="border-b border-slate-200/80 px-2 py-1.5 sm:px-3 sm:py-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1 space-y-1">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-full" />
              </div>
              <div className="min-w-[220px] flex-1 space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-full" />
              </div>
              <div className="min-w-[240px] flex-1 space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200/80 bg-white">
            <div className="px-2 py-1.5 sm:px-3 sm:py-2">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={`action-skeleton-${index}`} className="h-7 w-[92px] rounded-md" />
                ))}
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200/80 bg-white">
            <div className="grid grid-cols-4 gap-px bg-slate-200/80 lg:grid-cols-8">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={`telemetry-skeleton-${index}`} className="bg-white px-1.5 py-1 sm:px-3">
                  <Skeleton className="h-3 w-8" />
                  <Skeleton className="mt-1 h-4 w-16" />
                </div>
              ))}
            </div>
          </div>

          <CardContent className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center">
              <div className="space-y-4">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-500" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canAccessActiveFlight) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-lg border shadow-none">
          <CardHeader>
            <CardTitle className="text-xl font-black uppercase tracking-tight">Active Flight Unavailable</CardTitle>
            <CardDescription>This tenant does not have access to the active flight screen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your current company setup does not include this module. An administrator can enable it from Page Format if needed.
            </p>
            <Button asChild variant="outline" className="font-black uppercase">
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-1 flex-col gap-4 overflow-hidden px-1 pt-4', isModern && 'gap-4')}>
      {isModern && (
        <section className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.15),_transparent_34%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(15,23,42,0.95)_40%,_rgba(30,41,59,0.94))] px-6 py-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)] md:px-8 md:py-7">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,_rgba(45,212,191,0.16),_transparent_62%)] md:block" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-sky-100/80">Pilot Surface</p>
              <div className="space-y-2">
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">Track your own live flight from one focused cockpit.</h1>
                <p className="max-w-xl text-sm text-slate-200/85 md:text-[15px]">
                  Bind this device to an aircraft, stream live telemetry, and follow the loaded navlog route in a cleaner in-flight surface.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge className="border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white hover:bg-white/10">
                  {selectedAircraft?.tailNumber || 'aircraft not selected'}
                </Badge>
                <Badge className="border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white hover:bg-white/10">
                  {isTrackingActive ? 'tracking active' : 'tracking idle'}
                </Badge>
                <Badge className={cn('px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]', syncStatusClassName)}>
                  {syncStatusLabel}
                </Badge>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-200">Live Telemetry</p>
                  <Radio className="h-4 w-4 text-sky-200" />
                </div>
                <p className="mt-3 text-3xl font-black text-white">{liveTelemetry.speed != null ? `${liveTelemetry.speed.toFixed(0)} kt` : 'N/A'}</p>
                <p className="mt-1 text-xs text-slate-200/80">Current speed from the device position stream.</p>
              </div>
              <Link href="/operations/fleet-tracker" className="block">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md transition hover:bg-white/14">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-200">Ops View</p>
                    <Navigation className="h-4 w-4 text-emerald-200" />
                  </div>
                  <p className="mt-3 text-lg font-black text-white">Open Fleet Tracker</p>
                  <p className="mt-1 text-xs text-slate-200/80">See this aircraft from the operations surface.</p>
                </div>
              </Link>
            </div>
          </div>
        </section>
      )}

      <Card className={cn('flex min-h-0 flex-1 flex-col border shadow-none', isModern && 'overflow-hidden border-slate-200/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.08)]')}>
        {(!isMobile || showCompactMenus) ? (
        <>
        <div className="border-b border-slate-200/80 px-2 py-1.5 sm:px-3 sm:py-2">
          {isMobile ? (
            <Collapsible open={isMobileSelectorOpen} onOpenChange={setIsMobileSelectorOpen}>
              <div className="space-y-1.5">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-full justify-between border-input bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-foreground shadow-sm hover:bg-accent/40"
                  >
                    <span className="truncate">{mobileSelectorSummary}</span>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', isMobileSelectorOpen && 'rotate-180')} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1.5 pt-0.5">
                  <div className="space-y-1">
                    <Label htmlFor="active-flight-aircraft-select" className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Aircraft Registration</Label>
                    <Select value={selectedAircraftValue} onValueChange={handleAircraftSelectionChange}>
                        <SelectTrigger id="active-flight-aircraft-select" aria-label="Aircraft registration" className="h-7 font-black uppercase tracking-[0.08em] text-[10px]">
                          <SelectValue placeholder="No aircraft selected" />
                      </SelectTrigger>
                      <SelectContent>{sortedAircraft.map((aircraft) => <SelectItem key={aircraft.id} value={aircraft.id}>{aircraft.tailNumber}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="active-flight-booking-filter-select" className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Booking</Label>
                    <Select value={selectedBookingFilterValue} onValueChange={handleBookingFilterSelectionChange}>
                        <SelectTrigger id="active-flight-booking-filter-select" aria-label="Booking" className="h-7 font-black uppercase tracking-[0.08em] text-[10px]">
                          <SelectValue placeholder="No booking selected" />
                      </SelectTrigger>
                      <SelectContent>{bookingChoices.map((booking) => <SelectItem key={booking.id} value={booking.id}>#{booking.bookingNumber} ? {booking.date}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="active-flight-booking-select" className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Navlog Route</Label>
                    <Select value={selectedBookingValue} onValueChange={handleBookingSelectionChange}>
                        <SelectTrigger id="active-flight-booking-select" aria-label="Navlog route" className="h-7 font-black uppercase tracking-[0.08em] text-[10px]">
                          <SelectValue placeholder="No route selected" />
                      </SelectTrigger>
                      <SelectContent>{candidateBookings.map((booking) => <SelectItem key={booking.id} value={booking.id}>#{booking.bookingNumber} ? {booking.date} ? {(booking.navlog?.legs?.length || 0)} legs</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="active-flight-planner-route-select" className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Planner Route</Label>
                    <div className="flex items-center gap-2">
                      <Select value={selectedPlannerRouteValue} onValueChange={handlePlannerRouteSelectionChange}>
                        <SelectTrigger id="active-flight-planner-route-select" aria-label="Planner route" className="h-7 font-black uppercase tracking-[0.08em] text-[10px]">
                          <SelectValue placeholder="No planner route selected" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No planner route selected</SelectItem>
                          {plannerRouteChoices.map((route) => (
                            <SelectItem key={route.id} value={route.id}>
                              {route.name} ? {(route.legs?.length || 0)} waypoints
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-7 shrink-0 border-input bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] shadow-sm hover:bg-accent/40"
                          >
                            <span>Route Actions</span>
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[12rem]">
                          <DropdownMenuItem
                            disabled={!selectedBookingId}
                            className="text-[10px] font-bold uppercase"
                            onClick={() => forceRouteLoad('booking')}
                          >
                            Load Navlog
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!selectedPlannerRouteId}
                            className="text-[10px] font-bold uppercase"
                            onClick={() => forceRouteLoad('route')}
                          >
                            Load Route
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!selectedBookingId && !selectedPlannerRouteId && !loadedBookingId && !loadedPlannerRouteId}
                            className="text-[10px] font-bold uppercase"
                            onClick={handleClearRouteSelection}
                          >
                            Clear Route
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label htmlFor="active-flight-aircraft-select" className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Aircraft Registration</Label>
                <Select value={selectedAircraftValue} onValueChange={handleAircraftSelectionChange}>
                    <SelectTrigger id="active-flight-aircraft-select" aria-label="Aircraft registration" className="h-8 font-black uppercase tracking-[0.08em] text-[10px]">
                      <SelectValue placeholder="No aircraft selected" />
                  </SelectTrigger>
                  <SelectContent>{sortedAircraft.map((aircraft) => <SelectItem key={aircraft.id} value={aircraft.id}>{aircraft.tailNumber}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label htmlFor="active-flight-booking-filter-select" className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Booking</Label>
                <Select value={selectedBookingFilterValue} onValueChange={handleBookingFilterSelectionChange}>
                  <SelectTrigger id="active-flight-booking-filter-select" aria-label="Booking" className="h-8 font-black uppercase tracking-[0.08em] text-[10px]">
                    <SelectValue placeholder="No booking selected" />
                  </SelectTrigger>
                  <SelectContent>{bookingChoices.map((booking) => <SelectItem key={booking.id} value={booking.id}>#{booking.bookingNumber} ? {booking.date}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="min-w-[240px] flex-1 space-y-1">
                <Label htmlFor="active-flight-booking-select" className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Navlog Route</Label>
                <Select value={selectedBookingValue} onValueChange={handleBookingSelectionChange}>
                  <SelectTrigger id="active-flight-booking-select" aria-label="Navlog route" className="h-8 font-black uppercase tracking-[0.08em] text-[10px]">
                    <SelectValue placeholder="No route selected" />
                  </SelectTrigger>
                  <SelectContent>{candidateBookings.map((booking) => <SelectItem key={booking.id} value={booking.id}>#{booking.bookingNumber} ? {booking.date} ? {(booking.navlog?.legs?.length || 0)} legs</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="min-w-[240px] flex-1 space-y-1">
                <Label htmlFor="active-flight-planner-route-select" className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Planner Route</Label>
                <div className="flex min-w-0 items-center gap-2">
                  <Select value={selectedPlannerRouteValue} onValueChange={handlePlannerRouteSelectionChange}>
                    <SelectTrigger
                      id="active-flight-planner-route-select"
                      aria-label="Planner route"
                      className="h-8 min-w-0 flex-1 font-black uppercase tracking-[0.08em] text-[10px]"
                    >
                      <SelectValue placeholder="No planner route selected" />
                    </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No planner route selected</SelectItem>
                    {plannerRouteChoices.map((route) => (
                      <SelectItem key={route.id} value={route.id}>
                        {route.name} ? {(route.legs?.length || 0)} waypoints
                      </SelectItem>
                    ))}
                  </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 shrink-0 border-input bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] shadow-sm hover:bg-accent/40"
                      >
                        <span>Route Actions</span>
                        <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[12rem]">
                      <DropdownMenuItem
                        disabled={!selectedBookingId}
                        className="text-[10px] font-bold uppercase"
                        onClick={() => forceRouteLoad('booking')}
                      >
                        Load Navlog
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!selectedPlannerRouteId}
                        className="text-[10px] font-bold uppercase"
                        onClick={() => forceRouteLoad('route')}
                      >
                        Load Route
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!selectedBookingId && !selectedPlannerRouteId && !loadedBookingId && !loadedPlannerRouteId}
                        className="text-[10px] font-bold uppercase"
                        onClick={handleClearRouteSelection}
                      >
                        Clear Route
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="border-b border-slate-200/80 bg-white">
          <div className="px-2 py-1.5 sm:px-3 sm:py-2">
            {isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Select flight action"
                      className="h-8 w-full justify-between border-input bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] shadow-sm hover:bg-accent/40"
                  >
                    <span>Select Action</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[14rem]">
                  {actionButtons.map((action) => (
                    <DropdownMenuItem
                      key={action.value}
                      disabled={action.disabled}
                      className="text-[10px] font-bold uppercase"
                      onClick={action.onClick}
                    >
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {actionButtons.map((action) => (
                  <Button
                    key={action.label}
                    type="button"
                    variant="outline"
                    className={cn('h-7 rounded-md border px-2.5 text-[9px] font-black uppercase tracking-[0.1em]', action.className)}
                    onClick={action.onClick}
                    disabled={action.disabled}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-slate-200/80 px-2 py-1.5 text-center sm:px-3 sm:py-2">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">
              Aircraft is required to start tracking. Booking and route selection are optional.
            </p>
          </div>
        </div>
        </>
        ) : null}
        <div className="border-b border-slate-200/80 bg-white">
          <div className="grid grid-cols-4 gap-px bg-slate-200/80 lg:grid-cols-8">
            {[
              { label: 'ALT', value: liveTelemetry.altitude != null ? `${Math.round(liveTelemetry.altitude)} m` : 'N/A' },
              { label: 'SPD', value: liveTelemetry.speed != null ? `${liveTelemetry.speed.toFixed(0)} kt` : 'N/A' },
              { label: 'DIR', value: liveTelemetry.heading != null ? `${liveTelemetry.heading.toFixed(0)}°` : 'N/A' },
              { label: 'NXT', value: nextWaypointNumber },
              { label: 'DST', value: activeLegState?.distanceToNextNm != null ? `${activeLegState.distanceToNextNm.toFixed(1)} NM` : 'N/A' },
              { label: 'XTK', value: activeLegState?.crossTrackErrorNm != null ? `${activeLegState.crossTrackErrorNm.toFixed(1)} NM` : 'N/A' },
              { label: 'BRG', value: activeLegState?.bearingToNext != null ? `${activeLegState.bearingToNext.toFixed(0)}°` : 'N/A' },
              { label: 'ETA', value: etaToNextLabel },
            ].map((item) => (
              <div key={item.label} className="flex min-w-0 items-center gap-1 bg-white px-1.5 py-1 sm:px-3">
                <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  {item.label}
                </span>
                <span className="min-w-0 truncate text-[10px] font-black leading-none text-foreground">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="border-b border-slate-200/80 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50/80">
                  {['FROM', 'TO', 'TC', 'TH', 'MH', 'WCA', 'VAR', 'GS', 'DIST', 'ETE', 'CUM', 'FUEL', 'REM'].map((label) => (
                    <th
                      key={label}
                      className="border-r border-slate-200/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground last:border-r-0 sm:px-3"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[
                    activeFromNavlogLeg?.waypoint || 'N/A',
                    activeNavlogLeg?.waypoint || 'N/A',
                    formatHeadingValue(activeNavlogLeg?.trueCourse),
                    formatHeadingValue(activeNavlogLeg?.trueHeading),
                    formatHeadingValue(activeNavlogLeg?.magneticHeading),
                    formatSignedHeadingValue(activeNavlogLeg?.wca),
                    activeNavlogLeg?.variation == null || Number.isNaN(activeNavlogLeg.variation)
                      ? 'N/A'
                      : `${Math.abs(Math.round(activeNavlogLeg.variation))}°${activeNavlogLeg.variation >= 0 ? 'E' : 'W'}`,
                    activeNavlogLeg?.groundSpeed != null ? `${Math.round(activeNavlogLeg.groundSpeed)} kt` : 'N/A',
                    activeNavlogLeg?.distance != null ? `${activeNavlogLeg.distance.toFixed(1)} NM` : 'N/A',
                    formatMinutesValue(activeNavlogLeg?.ete),
                    formatMinutesValue(activeNavlogLeg?.cumulativeEte),
                    activeNavlogLeg?.tripFuel != null ? `${activeNavlogLeg.tripFuel.toFixed(1)}` : 'N/A',
                    activeLegRemainingFuel != null ? `${Math.max(0, activeLegRemainingFuel).toFixed(1)}` : 'N/A',
                  ].map((value, index) => (
                    <td
                      key={`${index}-${value}`}
                      className="max-w-[8rem] border-r border-t border-slate-200/80 px-2 py-1.5 text-[10px] font-black leading-none text-foreground last:border-r-0 sm:px-3"
                    >
                      <span className="block truncate">{value}</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <CardContent className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
          <Dialog open={isFullscreenMapOpen} onOpenChange={setIsFullscreenMapOpen}>
            <DialogContent className="fixed inset-0 m-0 h-[100dvh] w-[100vw] max-w-none max-h-none translate-x-0 translate-y-0 overflow-hidden border-0 bg-black p-0 text-slate-100 shadow-none">
              <DialogHeader className="sr-only">
                <DialogTitle>Full Flight Tracking View</DialogTitle>
              </DialogHeader>
              <FullScreenFlightLayout
                booking={selectedBooking}
                legs={displayLegs}
                position={effectivePosition}
                initialTrackHistory={currentDeviceTrackHistory}
                initialLastPosition={currentDeviceLastPosition}
                aircraftRegistration={selectedAircraft?.tailNumber}
                activeLegIndex={activeLegState?.activeLegIndex}
                activeLegState={activeLegState}
                heading={liveTelemetry.heading}
                speed={liveTelemetry.speed}
                altitude={liveTelemetry.altitude}
                trailPoints={liveTelemetry.trailPoints}
                syncStatusLabel={syncStatusLabel}
                syncStatusClassName={syncStatusClassName}
                savedDeviceLabel={savedDeviceLabel}
                permissionState={permissionState}
                isWatching={isWatching}
              />
            </DialogContent>
          </Dialog>
          <div className="flex min-h-0 flex-1 flex-col space-y-4 px-0 pb-0 pt-0">
            {!isFullscreenMapOpen ? (
              <ActiveFlightLiveMap
                booking={selectedBooking}
                legs={displayLegs}
                position={effectivePosition}
                aircraftRegistration={selectedAircraft?.tailNumber}
                activeLegIndex={activeLegState?.activeLegIndex}
                activeLegState={activeLegState}
                showControls={false}
                followOwnship={followOwnship}
                onFollowOwnshipChange={setFollowOwnship}
                recenterSignal={mapRecenterSignal}
                isLayersCardOpen={isLayersCardOpen}
                isMapZoomCardOpen={isMapZoomCardOpen}
                onLayersCardOpenChange={setIsLayersCardOpen}
                onMapZoomCardOpenChange={setIsMapZoomCardOpen}
                routeDrawerOpen={isRouteDrawerOpen}
                onRouteDrawerOpenChange={setIsRouteDrawerOpen}
                showRouteDrawerButton={!isMobile}
                mapOverlay={
                  isMobile ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="pointer-events-auto flex flex-row items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur">
                        <Button
                          type="button"
                          variant={isTrackingActive ? 'default' : 'outline'}
                          size="icon"
                          aria-label={isTrackingActive ? 'Stop tracking' : 'Start tracking'}
                          className={cn(
                            'h-10 w-10 rounded-full shadow-sm',
                            isTrackingActive
                              ? 'border-rose-600 bg-rose-600 text-white hover:bg-rose-700'
                              : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                          )}
                          disabled={!isTrackingActive && (!selectedAircraft || Boolean(conflictingAircraftSession))}
                          onClick={() => {
                            setIsOrientationCardOpen(false);
                            if (isTrackingActive) {
                              stopTrackingSession();
                              return;
                            }
                            startTracking();
                          }}
                        >
                          {isTrackingActive ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Toggle map layers"
                          className={cn(
                            'h-10 w-10 rounded-full border-slate-300 shadow-sm',
                            isLayersCardOpen ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-800 hover:bg-slate-50'
                          )}
                          onClick={() => {
                            setIsOrientationCardOpen(false);
                            setIsLayersCardOpen((current) => !current);
                            setIsMapZoomCardOpen(false);
                          }}
                        >
                          <Layers3 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Toggle map orientation controls"
                          className={cn(
                            'h-10 w-10 rounded-full border-slate-300 shadow-sm',
                            isOrientationCardOpen ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-800 hover:bg-slate-50'
                          )}
                          onClick={() => {
                            setIsLayersCardOpen(false);
                            setIsMapZoomCardOpen(false);
                            setIsOrientationCardOpen((current) => !current);
                          }}
                        >
                          <Compass className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Center map"
                          className="h-10 w-10 rounded-full border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
                          onClick={() => {
                            setIsOrientationCardOpen(false);
                            setMapRecenterSignal((current) => current + 1);
                          }}
                        >
                          <Navigation className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={isRouteDrawerOpen ? 'Hide route cards' : 'Show route cards'}
                          className={cn(
                            'h-10 w-10 rounded-full border-slate-300 shadow-sm',
                            isRouteDrawerOpen ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-800 hover:bg-slate-50'
                          )}
                          onClick={() => {
                            setIsOrientationCardOpen(false);
                            setIsRouteDrawerOpen((current) => !current);
                          }}
                        >
                          <Route className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={showCompactMenus ? 'Hide menus' : 'Show menus'}
                          className={cn(
                            'h-10 w-10 rounded-full border-slate-300 shadow-sm',
                            showCompactMenus ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-800 hover:bg-slate-50'
                          )}
                          onClick={() => setShowCompactMenus((current) => !current)}
                        >
                          <Menu className="h-4 w-4" />
                        </Button>
                      </div>
                      {isOrientationCardOpen ? (
                        <div className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur">
                          <div className="grid gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className={cn(
                                'h-8 justify-start rounded-full px-3 text-[9px] font-black uppercase tracking-[0.12em]',
                                !followOwnship ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                              )}
                              onClick={() => {
                                setFollowOwnship(false);
                                setIsOrientationCardOpen(false);
                              }}
                            >
                              North Up
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className={cn(
                                'h-8 justify-start rounded-full px-3 text-[9px] font-black uppercase tracking-[0.12em]',
                                followOwnship ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                              )}
                              onClick={() => {
                                setFollowOwnship(true);
                                setIsOrientationCardOpen(false);
                              }}
                            >
                              Nose Up
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null
                }
                onMoveWaypoint={handleMoveWaypoint}
                onWaypointNotesChange={handleWaypointNotesChange}
              />
            ) : (
                  <div className={cn('flex items-center justify-center rounded-2xl border border-dashed bg-muted/10 px-6 py-12 text-center text-sm text-muted-foreground', OPERATIONS_MAP_SURFACE_HEIGHT_CLASS)}>
                    Full screen map is open. Close it to restore the compact pilot map.
                  </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

