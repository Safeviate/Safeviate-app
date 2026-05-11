'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FeatureGroup, GeoJSON, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SlidersHorizontal } from 'lucide-react';
import type { FlightSession, FlightTrackPoint } from '@/types/flight-session';
import type { NavlogLeg } from '@/types/booking';
import { isFlightSessionStale } from '@/lib/flight-session-status';
import { LeafletMapFrame } from '@/components/maps/leaflet-map-frame';
import { useMapZoomPreferences } from '@/hooks/use-map-zoom-preferences';
import { parseJsonResponse } from '@/lib/safe-json';
import { getCachedOpenAipResponse, setCachedOpenAipResponse } from '@/lib/openaip-cache';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { X } from 'lucide-react';
import { formatWaypointCoordinatesDms } from '@/components/maps/waypoint-coordinate-utils';
import { createNumberedWaypointIcon } from '@/components/maps/waypoint-marker-style';
import { buildWaypointPopupMarkup } from '@/components/maps/waypoint-popup-content';

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

type OpenAipFeature = {
  _id: string;
  name: string;
  icaoCode?: string;
  identifier?: string;
  geometry?: { coordinates?: [number, number] };
  sourceLayer: 'airports' | 'navaids' | 'reporting-points';
};

type OpenAipAirspace = {
  _id: string;
  name: string;
  type?: number;
  icaoClass?: number;
  activity?: number;
  lowerLimit?: unknown;
  upperLimit?: unknown;
  verticalLimits?: unknown;
  limits?: unknown;
  floor?: unknown;
  ceiling?: unknown;
  geometry?: {
    type?: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString';
    coordinates?: any;
  };
  hoursOfOperation?: {
    operatingHours?: Array<{
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
    }>;
  };
};

type OpenAipObstacle = {
  _id: string;
  name: string;
  geometry?: { type?: 'Point'; coordinates?: [number, number] };
  height?: { value?: number };
  elevation?: { value?: number };
};

type FleetTrackerMapSettings = {
  baseLayer?: 'light' | 'satellite';
  showAircraftNames?: boolean;
  showAircraftTrails?: boolean;
  showNavlogRoutes?: boolean;
  showMasterChart?: boolean;
  showAirports?: boolean;
  showAirportLabels?: boolean;
  showNavaids?: boolean;
  showNavaidLabels?: boolean;
  showReportingPoints?: boolean;
  showReportingPointLabels?: boolean;
  showAirspaces?: boolean;
  showAirspaceLabels?: boolean;
  showClassE?: boolean;
  showClassELabels?: boolean;
  showClassF?: boolean;
  showClassFLabels?: boolean;
  showClassG?: boolean;
  showClassGLabels?: boolean;
  showObstacles?: boolean;
  showObstacleLabels?: boolean;
  showMilitaryAreas?: boolean;
  showMilitaryAreaLabels?: boolean;
  showTrainingAreas?: boolean;
  showTrainingAreaLabels?: boolean;
  showGlidingSectors?: boolean;
  showGlidingSectorLabels?: boolean;
  showHangGlidings?: boolean;
  showHangGlidingLabels?: boolean;
};

type Bbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type ViewportCacheEntry<T> = {
  bbox: Bbox;
  data: T;
};

const FLEET_TRACKER_MAP_SETTINGS_KEY = 'safeviate.fleet-tracker-map-settings';
const DEFAULT_SETTINGS: Required<FleetTrackerMapSettings> = {
  baseLayer: 'light',
  showAircraftNames: true,
  showAircraftTrails: true,
  showNavlogRoutes: true,
  showMasterChart: true,
  showAirports: true,
  showAirportLabels: true,
  showNavaids: true,
  showNavaidLabels: true,
  showReportingPoints: true,
  showReportingPointLabels: true,
  showAirspaces: true,
  showAirspaceLabels: true,
  showClassE: true,
  showClassELabels: true,
  showClassF: true,
  showClassFLabels: true,
  showClassG: true,
  showClassGLabels: true,
  showObstacles: false,
  showObstacleLabels: false,
  showMilitaryAreas: true,
  showMilitaryAreaLabels: true,
  showTrainingAreas: true,
  showTrainingAreaLabels: true,
  showGlidingSectors: true,
  showGlidingSectorLabels: true,
  showHangGlidings: true,
  showHangGlidingLabels: true,
};

const viewportRequestCache = new Map<string, ViewportCacheEntry<unknown>>();
const AIRSPACE_CLASS_E = 6;
const AIRSPACE_CLASS_F = 7;
const AIRSPACE_CLASS_G = 8;

const createAircraftIcon = (
  label: string,
  headingTrue?: number | null,
  onCourse?: boolean | null,
  isStale?: boolean,
  showLabel: boolean = true
) =>
  L.divIcon({
    className: '',
    html: `
      <div style="display:flex;align-items:center;gap:${showLabel ? '8px' : '0'};transform:translate(-8px,-8px);">
        <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
          <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:18px solid ${
            isStale ? '#f59e0b' : onCourse === false ? '#ef4444' : '#10b981'
          };transform:rotate(${headingTrue ?? 0}deg);transform-origin:center 70%;filter:drop-shadow(0 0 6px ${
            isStale
              ? 'rgba(245,158,11,0.35)'
              : onCourse === false
                ? 'rgba(239,68,68,0.35)'
                : 'rgba(16,185,129,0.35)'
          });"></div>
        </div>
        ${
          showLabel
            ? `<div style="padding:4px 8px;border-radius:9999px;background:${
                isStale ? 'rgba(120,53,15,0.92)' : onCourse === false ? 'rgba(127,29,29,0.92)' : 'rgba(15,23,42,0.9)'
              };color:#f8fafc;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;border:1px solid ${
                isStale ? 'rgba(253,186,116,0.45)' : onCourse === false ? 'rgba(252,165,165,0.45)' : 'rgba(148,163,184,0.35)'
              };white-space:nowrap;">${label}</div>`
            : ''
        }
      </div>
    `,
    iconSize: showLabel ? [128, 36] : [28, 28],
    iconAnchor: showLabel ? [20, 20] : [14, 14],
  });

const getTrailStyle = (session: FlightSession, isStale: boolean) => {
  if (isStale) return { color: '#f59e0b', weight: 3, opacity: 0.75, dashArray: '8 8' };
  if (session.onCourse === false) return { color: '#ef4444', weight: 4, opacity: 0.85 };
  return { color: '#10b981', weight: 4, opacity: 0.8 };
};

const getNavlogRouteStyle = () => ({ color: '#2563eb', weight: 3, opacity: 0.7, dashArray: '10 8' });

const readStoredFleetTrackerMapSettings = (): Required<FleetTrackerMapSettings> => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const stored = window.localStorage.getItem(FLEET_TRACKER_MAP_SETTINGS_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(stored) as Partial<FleetTrackerMapSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const parseBbox = (bbox: string): Bbox => {
  const [west, south, east, north] = bbox.split(',').map(Number);
  return { west, south, east, north };
};

const containsBbox = (outer: Bbox, inner: Bbox) =>
  outer.west <= inner.west &&
  outer.south <= inner.south &&
  outer.east >= inner.east &&
  outer.north >= inner.north;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOpenAipJson<T>(url: string, retries = 1): Promise<T | null> {
  const cacheKey = `safeviate.openaip:${url}`;
  const cached = getCachedOpenAipResponse<T>(cacheKey);
  if (cached) return cached;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          await delay(250 * (attempt + 1));
          continue;
        }
        return null;
      }
      const parsed = (await parseJsonResponse<T>(response)) ?? null;
      if (parsed) setCachedOpenAipResponse(cacheKey, url, parsed);
      return parsed;
    } catch (error) {
      if (attempt < retries) {
        await delay(250 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  return null;
}

function FitBounds({ sessions }: { sessions: FlightSession[] }) {
  const map = useMap();
  const hasAutoFitRef = useRef(false);

  useEffect(() => {
    if (hasAutoFitRef.current) return;
    const positionedSessions = sessions.filter(
      (session) => session.lastPosition?.latitude !== undefined && session.lastPosition?.longitude !== undefined
    );
    if (positionedSessions.length === 0) return;
    if (positionedSessions.length === 1) {
      const session = positionedSessions[0];
      map.setView([session.lastPosition!.latitude, session.lastPosition!.longitude], 10);
      hasAutoFitRef.current = true;
      return;
    }
    const bounds = L.latLngBounds(
      positionedSessions.map((session) => [session.lastPosition!.latitude, session.lastPosition!.longitude] as [number, number])
    );
    map.fitBounds(bounds.pad(0.3));
    hasAutoFitRef.current = true;
  }, [map, sessions]);

  return null;
}

function MapZoomState({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
  });

  return null;
}

function RecenterMapControl({ sessions }: { sessions: FlightSession[] }) {
  const map = useMap();

  const recenter = useCallback(() => {
    const positionedSessions = sessions.filter(
      (session) => session.lastPosition?.latitude !== undefined && session.lastPosition?.longitude !== undefined
    );
    if (positionedSessions.length === 0) return;
    if (positionedSessions.length === 1) {
      const session = positionedSessions[0];
      map.setView([session.lastPosition!.latitude, session.lastPosition!.longitude], Math.max(map.getZoom(), 10));
      return;
    }
    const bounds = L.latLngBounds(
      positionedSessions.map((session) => [session.lastPosition!.latitude, session.lastPosition!.longitude] as [number, number])
    );
    map.fitBounds(bounds.pad(0.3));
  }, [map, sessions]);

  return (
    <button
      type="button"
      onClick={recenter}
      className="absolute right-3 top-3 z-[1100] rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-700 shadow-md backdrop-blur hover:bg-slate-50"
    >
      Recenter
    </button>
  );
}

function FitReplayBounds({ points }: { points: FlightTrackPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number]));
    map.fitBounds(bounds.pad(0.2));
  }, [map, points]);

  return null;
}

function VisiblePointLoader({
  airportsEnabled,
  navaidsEnabled,
  reportingEnabled,
  onFeaturesLoaded,
}: {
  airportsEnabled: boolean;
  navaidsEnabled: boolean;
  reportingEnabled: boolean;
  onFeaturesLoaded: (features: OpenAipFeature[]) => void;
}) {
  const map = useMap();
  const requestSeq = useRef(0);
  const lastRequestKeyRef = useRef('');

  const loadVisiblePoints = useCallback(async () => {
    const resources: OpenAipFeature['sourceLayer'][] = [];
    if (airportsEnabled) resources.push('airports');
    if (navaidsEnabled) resources.push('navaids');
    if (reportingEnabled) resources.push('reporting-points');
    if (!resources.length) {
      onFeaturesLoaded([]);
      return;
    }

    const bounds = map.getBounds().pad(0.25);
    const bbox = [bounds.getWest().toFixed(6), bounds.getSouth().toFixed(6), bounds.getEast().toFixed(6), bounds.getNorth().toFixed(6)].join(',');
    const requestKey = `${bbox}:${resources.join(',')}`;
    if (lastRequestKeyRef.current === requestKey) return;
    lastRequestKeyRef.current = requestKey;
    const nextSeq = ++requestSeq.current;

    try {
      const results = await Promise.all(
        resources.map(async (resource) => {
          const cacheKey = `${resource}:${bbox}`;
          const cached = viewportRequestCache.get(cacheKey) as ViewportCacheEntry<{ items?: unknown[] }> | undefined;
          if (cached && containsBbox(cached.bbox, parseBbox(bbox))) {
            return (cached.data.items || []) as OpenAipFeature[];
          }
          const data = (await fetchOpenAipJson<{ items?: unknown[] }>(`/api/openaip?resource=${resource}&bbox=${bbox}`)) ?? { items: [] };
          viewportRequestCache.set(cacheKey, { bbox: parseBbox(bbox), data });
          return (data.items || []).map((item: any) => ({ ...item, sourceLayer: resource })) as OpenAipFeature[];
        })
      );
      if (nextSeq !== requestSeq.current) return;
      onFeaturesLoaded(results.flat());
    } catch (error) {
      console.error('Viewport OpenAIP load failed', error);
    }
  }, [airportsEnabled, map, navaidsEnabled, onFeaturesLoaded, reportingEnabled]);

  useEffect(() => {
    void loadVisiblePoints();
  }, [loadVisiblePoints]);

  useMapEvents({
    moveend() {
      void loadVisiblePoints();
    },
    zoomend() {
      void loadVisiblePoints();
    },
  });

  return null;
}

function VisibleAirspaceLoader({
  enabled,
  onFeaturesLoaded,
}: {
  enabled: boolean;
  onFeaturesLoaded: (features: OpenAipAirspace[]) => void;
}) {
  const map = useMap();
  const requestSeq = useRef(0);
  const lastRequestKeyRef = useRef('');
  const lastCachedRef = useRef<ViewportCacheEntry<{ items?: unknown[] }> | null>(null);

  const loadVisibleAirspaces = useCallback(async () => {
    if (!enabled) {
      onFeaturesLoaded([]);
      return;
    }

    const bounds = map.getBounds().pad(0.25);
    const bbox = [bounds.getWest().toFixed(6), bounds.getSouth().toFixed(6), bounds.getEast().toFixed(6), bounds.getNorth().toFixed(6)].join(',');
    if (lastRequestKeyRef.current === bbox) return;
    lastRequestKeyRef.current = bbox;
    const nextSeq = ++requestSeq.current;

    try {
      if (lastCachedRef.current && containsBbox(lastCachedRef.current.bbox, parseBbox(bbox))) {
        onFeaturesLoaded((lastCachedRef.current.data.items || []) as OpenAipAirspace[]);
        return;
      }
      const data = (await fetchOpenAipJson<{ items?: unknown[] }>(`/api/openaip?resource=airspaces&bbox=${bbox}`)) ?? { items: [] };
      lastCachedRef.current = { bbox: parseBbox(bbox), data };
      if (nextSeq !== requestSeq.current) return;
      onFeaturesLoaded((data.items || []) as OpenAipAirspace[]);
    } catch (error) {
      console.error('Viewport OpenAIP airspace load failed', error);
    }
  }, [enabled, map, onFeaturesLoaded]);

  useEffect(() => {
    void loadVisibleAirspaces();
  }, [loadVisibleAirspaces]);

  useMapEvents({
    moveend() {
      void loadVisibleAirspaces();
    },
    zoomend() {
      void loadVisibleAirspaces();
    },
  });

  return null;
}

function VisibleObstacleLoader({
  enabled,
  onFeaturesLoaded,
}: {
  enabled: boolean;
  onFeaturesLoaded: (features: OpenAipObstacle[]) => void;
}) {
  const map = useMap();
  const requestSeq = useRef(0);
  const lastRequestKeyRef = useRef('');
  const lastCachedRef = useRef<ViewportCacheEntry<{ items?: unknown[] }> | null>(null);

  const loadVisibleObstacles = useCallback(async () => {
    if (!enabled) {
      onFeaturesLoaded([]);
      return;
    }

    const bounds = map.getBounds().pad(0.35);
    const bbox = [bounds.getWest().toFixed(6), bounds.getSouth().toFixed(6), bounds.getEast().toFixed(6), bounds.getNorth().toFixed(6)].join(',');
    if (lastRequestKeyRef.current === bbox) return;
    lastRequestKeyRef.current = bbox;
    const nextSeq = ++requestSeq.current;

    try {
      if (lastCachedRef.current && containsBbox(lastCachedRef.current.bbox, parseBbox(bbox))) {
        onFeaturesLoaded((lastCachedRef.current.data.items || []) as OpenAipObstacle[]);
        return;
      }
      const data = (await fetchOpenAipJson<{ items?: unknown[] }>(`/api/openaip?resource=obstacles&bbox=${bbox}`)) ?? { items: [] };
      lastCachedRef.current = { bbox: parseBbox(bbox), data };
      if (nextSeq !== requestSeq.current) return;
      onFeaturesLoaded((data.items || []) as OpenAipObstacle[]);
    } catch (error) {
      console.error('Viewport OpenAIP obstacle load failed', error);
    }
  }, [enabled, map, onFeaturesLoaded]);

  useEffect(() => {
    void loadVisibleObstacles();
  }, [loadVisibleObstacles]);

  useMapEvents({
    moveend() {
      void loadVisibleObstacles();
    },
    zoomend() {
      void loadVisibleObstacles();
    },
  });

  return null;
}

const formatLimitValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return `${value}`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const parts = [record.value, record.altitude, record.height, record.limit, record.text, record.unit, record.reference]
      .map((candidate) => formatLimitValue(candidate))
      .filter(Boolean);
    return parts.join(' ');
  }
  return '';
};

const formatAirspaceVerticalLimits = (airspace: OpenAipAirspace): string => {
  const rawVertical = airspace.verticalLimits as Record<string, unknown> | undefined;
  const lower = formatLimitValue(rawVertical?.lower ?? rawVertical?.lowerLimit ?? rawVertical?.floor ?? airspace.lowerLimit ?? airspace.floor);
  const upper = formatLimitValue(rawVertical?.upper ?? rawVertical?.upperLimit ?? rawVertical?.ceiling ?? airspace.upperLimit ?? airspace.ceiling);
  const rangeParts = [lower && `Lower ${lower}`, upper && `Upper ${upper}`].filter(Boolean) as string[];
  if (rangeParts.length > 0) return rangeParts.join(' • ');
  return formatLimitValue(airspace.limits) || formatLimitValue(rawVertical?.text) || formatLimitValue(rawVertical?.display) || '';
};

const isAirspaceActiveNow = (airspace: OpenAipAirspace) => {
  const operatingHours = airspace.hoursOfOperation?.operatingHours;
  if (!operatingHours?.length) return true;
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return operatingHours.some((entry) => {
    if (entry.dayOfWeek && entry.dayOfWeek !== day) return false;
    const start = entry.startTime?.split(':').map(Number) ?? [];
    const end = entry.endTime?.split(':').map(Number) ?? [];
    if (start.length < 2 || end.length < 2) return true;
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];
    if (endMinutes < startMinutes) return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  });
};

const isMilitaryAirspace = (airspace: OpenAipAirspace) => airspace.activity === 17 || /mil/i.test(airspace.name || '');
const isTrainingAirspace = (airspace: OpenAipAirspace) => /train/i.test(airspace.name || '');
const isGlidingAirspace = (airspace: OpenAipAirspace) => /glid/i.test(airspace.name || '');
const isHangGlidingAirspace = (airspace: OpenAipAirspace) => /hang/i.test(airspace.name || '');

const getAirspaceClassCategory = (airspace: OpenAipAirspace) => {
  if (airspace.icaoClass === AIRSPACE_CLASS_E) return 'class-e';
  if (airspace.icaoClass === AIRSPACE_CLASS_F) return 'class-f';
  if (airspace.icaoClass === AIRSPACE_CLASS_G) return 'class-g';
  return 'other';
};

const getAirspaceCategory = (airspace: OpenAipAirspace) => {
  if (isMilitaryAirspace(airspace)) return 'military';
  if (isTrainingAirspace(airspace)) return 'training';
  if (isGlidingAirspace(airspace)) return 'gliding';
  if (isHangGlidingAirspace(airspace)) return 'hang';
  return getAirspaceClassCategory(airspace);
};

const airspaceFeatureCollection = (items: OpenAipAirspace[]) => ({
  type: 'FeatureCollection' as const,
  features: items
    .filter((item) => item.geometry?.coordinates)
    .map((item) => ({
      type: 'Feature' as const,
      geometry: item.geometry,
      properties: {
        _id: item._id,
        name: item.name,
        category: getAirspaceCategory(item),
        limits: formatAirspaceVerticalLimits(item),
      },
    })),
});

const obstacleFeatureCollection = (items: OpenAipObstacle[]) => ({
  type: 'FeatureCollection' as const,
  features: items
    .filter((item) => item.geometry?.coordinates)
    .map((item) => ({
      type: 'Feature' as const,
      geometry: item.geometry,
      properties: {
        _id: item._id,
        name: item.name,
        height: item.height?.value,
      },
    })),
});

export function FleetTrackerMap({
  sessions,
  navlogRoutesByBookingId = {},
  layerSelectorOpen = false,
  layerLevelsOpen = false,
  onLayerSelectorOpenChange,
  onLayerLevelsOpenChange,
  replayPoints = [],
  replayCursor = 0,
  replayRegistration = null,
}: {
  sessions: FlightSession[];
  navlogRoutesByBookingId?: Record<string, NavlogLeg[]>;
  layerSelectorOpen?: boolean;
  layerLevelsOpen?: boolean;
  onLayerSelectorOpenChange?: (open: boolean) => void;
  onLayerLevelsOpenChange?: (open: boolean) => void;
  replayPoints?: FlightTrackPoint[];
  replayCursor?: number;
  replayRegistration?: string | null;
}) {
  const initialSettings = useMemo(() => readStoredFleetTrackerMapSettings(), []);
  const { preferences: zoomPreferences, setZoomRange } = useMapZoomPreferences({
    storageKey: 'safeviate.fleet-tracker-map-zoom',
    defaultMinZoom: 4,
    defaultMaxZoom: 16,
  });

  const [selectedBaseLayer, setSelectedBaseLayer] = useState<'light' | 'satellite'>(initialSettings.baseLayer);
  const [layerPanelTab, setLayerPanelTab] = useState<'layers' | 'labels' | 'broadcasts'>('layers');
  const [showAircraftNames, setShowAircraftNames] = useState(initialSettings.showAircraftNames);
  const [showAircraftTrails, setShowAircraftTrails] = useState(initialSettings.showAircraftTrails);
  const [showNavlogRoutes, setShowNavlogRoutes] = useState(initialSettings.showNavlogRoutes);
  const [masterVisible, setMasterVisible] = useState(initialSettings.showMasterChart);
  const [airportsVisible, setAirportsVisible] = useState(initialSettings.showAirports);
  const [airportLabelsVisible, setAirportLabelsVisible] = useState(initialSettings.showAirportLabels);
  const [navaidsVisible, setNavaidsVisible] = useState(initialSettings.showNavaids);
  const [navaidLabelsVisible, setNavaidLabelsVisible] = useState(initialSettings.showNavaidLabels);
  const [reportingVisible, setReportingVisible] = useState(initialSettings.showReportingPoints);
  const [reportingLabelsVisible, setReportingLabelsVisible] = useState(initialSettings.showReportingPointLabels);
  const [airspacesVisible, setAirspacesVisible] = useState(initialSettings.showAirspaces);
  const [airspaceLabelsVisible, setAirspaceLabelsVisible] = useState(initialSettings.showAirspaceLabels);
  const [classEVisible, setClassEVisible] = useState(initialSettings.showClassE);
  const [classELabelsVisible, setClassELabelsVisible] = useState(initialSettings.showClassELabels);
  const [classFVisible, setClassFVisible] = useState(initialSettings.showClassF);
  const [classFLabelsVisible, setClassFLabelsVisible] = useState(initialSettings.showClassFLabels);
  const [classGVisible, setClassGVisible] = useState(initialSettings.showClassG);
  const [classGLabelsVisible, setClassGLabelsVisible] = useState(initialSettings.showClassGLabels);
  const [obstaclesVisible, setObstaclesVisible] = useState(initialSettings.showObstacles);
  const [obstacleLabelsVisible, setObstacleLabelsVisible] = useState(initialSettings.showObstacleLabels);
  const [militaryAreasVisible, setMilitaryAreasVisible] = useState(initialSettings.showMilitaryAreas);
  const [militaryLabelsVisible, setMilitaryLabelsVisible] = useState(initialSettings.showMilitaryAreaLabels);
  const [trainingAreasVisible, setTrainingAreasVisible] = useState(initialSettings.showTrainingAreas);
  const [trainingLabelsVisible, setTrainingLabelsVisible] = useState(initialSettings.showTrainingAreaLabels);
  const [glidingSectorsVisible, setGlidingSectorsVisible] = useState(initialSettings.showGlidingSectors);
  const [glidingLabelsVisible, setGlidingLabelsVisible] = useState(initialSettings.showGlidingSectorLabels);
  const [hangGlidingVisible, setHangGlidingVisible] = useState(initialSettings.showHangGlidings);
  const [hangGlidingLabelsVisible, setHangGlidingLabelsVisible] = useState(initialSettings.showHangGlidingLabels);
  const [viewportFeatures, setViewportFeatures] = useState<OpenAipFeature[]>([]);
  const [airspaceFeatures, setAirspaceFeatures] = useState<OpenAipAirspace[]>([]);
  const [obstacleFeatures, setObstacleFeatures] = useState<OpenAipObstacle[]>([]);
  const [mapZoom, setMapZoom] = useState(6);

  useEffect(() => {
    window.localStorage.setItem(
      FLEET_TRACKER_MAP_SETTINGS_KEY,
      JSON.stringify({
        baseLayer: selectedBaseLayer,
        showAircraftNames,
        showAircraftTrails,
        showNavlogRoutes,
        showMasterChart: masterVisible,
        showAirports: airportsVisible,
        showAirportLabels: airportLabelsVisible,
        showNavaids: navaidsVisible,
        showNavaidLabels: navaidLabelsVisible,
        showReportingPoints: reportingVisible,
        showReportingPointLabels: reportingLabelsVisible,
        showAirspaces: airspacesVisible,
        showAirspaceLabels: airspaceLabelsVisible,
        showClassE: classEVisible,
        showClassELabels: classELabelsVisible,
        showClassF: classFVisible,
        showClassFLabels: classFLabelsVisible,
        showClassG: classGVisible,
        showClassGLabels: classGLabelsVisible,
        showObstacles: obstaclesVisible,
        showObstacleLabels: obstacleLabelsVisible,
        showMilitaryAreas: militaryAreasVisible,
        showMilitaryAreaLabels: militaryLabelsVisible,
        showTrainingAreas: trainingAreasVisible,
        showTrainingAreaLabels: trainingLabelsVisible,
        showGlidingSectors: glidingSectorsVisible,
        showGlidingSectorLabels: glidingLabelsVisible,
        showHangGlidings: hangGlidingVisible,
        showHangGlidingLabels: hangGlidingLabelsVisible,
      })
    );
  }, [
    airspaceLabelsVisible,
    airspacesVisible,
    airportLabelsVisible,
    airportsVisible,
    classELabelsVisible,
    classEVisible,
    classFLabelsVisible,
    classFVisible,
    classGLabelsVisible,
    classGVisible,
    glidingLabelsVisible,
    glidingSectorsVisible,
    hangGlidingLabelsVisible,
    hangGlidingVisible,
    masterVisible,
    militaryAreasVisible,
    militaryLabelsVisible,
    navaidLabelsVisible,
    navaidsVisible,
    obstacleLabelsVisible,
    obstaclesVisible,
    reportingLabelsVisible,
    reportingVisible,
    selectedBaseLayer,
    showAircraftNames,
    showAircraftTrails,
    showNavlogRoutes,
    trainingAreasVisible,
    trainingLabelsVisible,
  ]);

  const positionedSessions = useMemo(
    () => sessions.filter((session) => session.lastPosition?.latitude !== undefined && session.lastPosition?.longitude !== undefined),
    [sessions]
  );
  const activeReplayPoint = replayPoints[replayCursor] || null;
  const center = positionedSessions[0]
    ? ([positionedSessions[0].lastPosition!.latitude, positionedSessions[0].lastPosition!.longitude] as [number, number])
    : ([-25.9, 27.9] as [number, number]);
  const mapMinZoom = zoomPreferences.minZoom;
  const mapMaxZoom = zoomPreferences.maxZoom;

  const airportFeatures = useMemo(
    () => viewportFeatures.filter((item) => item.sourceLayer === 'airports' && item.geometry?.coordinates),
    [viewportFeatures]
  );
  const navaidFeatures = useMemo(
    () => viewportFeatures.filter((item) => item.sourceLayer === 'navaids' && item.geometry?.coordinates),
    [viewportFeatures]
  );
  const reportingPointFeatures = useMemo(
    () => viewportFeatures.filter((item) => item.sourceLayer === 'reporting-points' && item.geometry?.coordinates),
    [viewportFeatures]
  );
  const airspaceCollections = useMemo(() => {
    const filterItems = (predicate: (item: OpenAipAirspace) => boolean) =>
      airspaceFeatureCollection(airspaceFeatures.filter((item) => item.geometry?.coordinates && isAirspaceActiveNow(item) && predicate(item)));

    return {
      classE: filterItems((item) => getAirspaceClassCategory(item) === 'class-e'),
      classF: filterItems((item) => getAirspaceClassCategory(item) === 'class-f'),
      classG: filterItems((item) => getAirspaceClassCategory(item) === 'class-g'),
      military: filterItems((item) => isMilitaryAirspace(item)),
      training: filterItems((item) => isTrainingAirspace(item)),
      gliding: filterItems((item) => isGlidingAirspace(item)),
      hangGliding: filterItems((item) => isHangGlidingAirspace(item)),
      general: filterItems((item) => getAirspaceCategory(item) === 'other'),
    };
  }, [airspaceFeatures]);
  const obstacleGeoJson = useMemo(() => obstacleFeatureCollection(obstacleFeatures), [obstacleFeatures]);

  const featurePointIcon = useCallback(
    (color: string) =>
      L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 0 0 2px rgba(15,23,42,0.24);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
    []
  );
  const airportPointIcon = useMemo(() => featurePointIcon('#2563eb'), [featurePointIcon]);
  const navaidPointIcon = useMemo(() => featurePointIcon('#7c3aed'), [featurePointIcon]);
  const reportingPointIcon = useMemo(() => featurePointIcon('#d97706'), [featurePointIcon]);
  const labelClassName = 'openaip-layer-label';
  const airspaceLabelClassName = 'openaip-layer-label';

  const airspaceStyle = useCallback((feature: any) => {
    const category = feature?.properties?.category;
    let palette = { color: '#38bdf8', fillColor: '#38bdf8' };
    if (category === 'military') palette = { color: '#dc2626', fillColor: '#f87171' };
    else if (category === 'training') palette = { color: '#f59e0b', fillColor: '#fbbf24' };
    else if (category === 'gliding') palette = { color: '#22c55e', fillColor: '#4ade80' };
    else if (category === 'hang') palette = { color: '#a855f7', fillColor: '#a855f7' };
    else if (category === 'class-e') palette = { color: '#3b82f6', fillColor: '#3b82f6' };
    else if (category === 'class-f') palette = { color: '#f97316', fillColor: '#f97316' };
    else if (category === 'class-g') palette = { color: '#14b8a6', fillColor: '#14b8a6' };
    return { ...palette, weight: 2, fillOpacity: 0.12, opacity: 0.85 };
  }, []);

  const obstaclePointToLayer = useCallback((feature: any, latlng: L.LatLngExpression) => {
    const height = feature?.properties?.height;
    return L.circleMarker(latlng, {
      radius: height && Number(height) > 250 ? 5 : 4,
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: 0.8,
      weight: 1,
    });
  }, []);

  useEffect(() => {
    if (!layerSelectorOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onLayerSelectorOpenChange?.(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layerSelectorOpen, onLayerSelectorOpenChange]);

  useEffect(() => {
    if (!layerSelectorOpen) {
      setLayerPanelTab('layers');
    }
  }, [layerSelectorOpen]);

  return (
    <div className="relative h-full overflow-visible rounded-2xl" style={{ overscrollBehavior: 'none' }}>
      <LeafletMapFrame
        center={center}
        zoom={6}
        minZoom={mapMinZoom}
        maxZoom={mapMaxZoom}
        className="relative z-20 h-[640px] w-full rounded-2xl xl:h-[700px]"
        style={{ background: '#020617', touchAction: 'none', overscrollBehavior: 'none' }}
      >
        <TileLayer
          url={selectedBaseLayer === 'light' ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' : 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'}
          attribution={selectedBaseLayer === 'light' ? '&copy; OpenStreetMap contributors' : '&copy; MapLibre / OpenStreetMap'}
        />
        <FitBounds sessions={positionedSessions} />
        {replayPoints.length > 1 ? <FitReplayBounds points={replayPoints} /> : null}
        <MapZoomState onZoomChange={setMapZoom} />
        <RecenterMapControl sessions={positionedSessions} />
        <VisiblePointLoader
          airportsEnabled={airportsVisible}
          navaidsEnabled={navaidsVisible}
          reportingEnabled={reportingVisible}
          onFeaturesLoaded={setViewportFeatures}
        />
        <VisibleAirspaceLoader
          enabled={
            airspacesVisible ||
            classEVisible ||
            classFVisible ||
            classGVisible ||
            militaryAreasVisible ||
            trainingAreasVisible ||
            glidingSectorsVisible ||
            hangGlidingVisible
          }
          onFeaturesLoaded={setAirspaceFeatures}
        />
        <VisibleObstacleLoader enabled={obstaclesVisible} onFeaturesLoaded={setObstacleFeatures} />

        {masterVisible ? (
          <TileLayer
            url="/api/openaip/tiles/openaip/{z}/{x}/{y}"
            attribution="&copy; OpenAIP"
            opacity={1}
            minZoom={Math.max(mapMinZoom, 8)}
            minNativeZoom={8}
            maxNativeZoom={16}
            maxZoom={Math.min(mapMaxZoom, 20)}
          />
        ) : null}

        {airportsVisible ? (
          <FeatureGroup>
            {mapZoom >= 8
              ? airportFeatures.map((feature) => {
                  const coords = feature.geometry?.coordinates;
                  if (!coords) return null;
                  const [lon, lat] = coords;
                  const identifier = feature.icaoCode || feature.identifier || feature.name;
                  return (
                    <Marker key={feature._id} position={[lat, lon]} icon={airportPointIcon}>
                      {airportLabelsVisible && mapZoom >= 9 ? (
                        <Tooltip permanent direction="top" offset={[0, -6]} opacity={0.95} className={labelClassName}>
                          {identifier}
                        </Tooltip>
                      ) : null}
                    </Marker>
                  );
                })
              : null}
          </FeatureGroup>
        ) : null}

        {navaidsVisible ? (
          <FeatureGroup>
            {mapZoom >= 9
              ? navaidFeatures.map((feature) => {
                  const coords = feature.geometry?.coordinates;
                  if (!coords) return null;
                  const [lon, lat] = coords;
                  const identifier = feature.icaoCode || feature.identifier || feature.name;
                  return (
                    <Marker key={feature._id} position={[lat, lon]} icon={navaidPointIcon}>
                      {navaidLabelsVisible && mapZoom >= 10 ? (
                        <Tooltip permanent direction="top" offset={[0, -6]} opacity={0.95} className={labelClassName}>
                          {identifier}
                        </Tooltip>
                      ) : null}
                    </Marker>
                  );
                })
              : null}
          </FeatureGroup>
        ) : null}

        {reportingVisible ? (
          <FeatureGroup>
            {mapZoom >= 10
              ? reportingPointFeatures.map((feature) => {
                  const coords = feature.geometry?.coordinates;
                  if (!coords) return null;
                  const [lon, lat] = coords;
                  const identifier = feature.icaoCode || feature.identifier || feature.name;
                  return (
                    <Marker key={feature._id} position={[lat, lon]} icon={reportingPointIcon}>
                      {reportingLabelsVisible && mapZoom >= 11 ? (
                        <Tooltip permanent direction="top" offset={[0, -6]} opacity={0.95} className={labelClassName}>
                          {identifier}
                        </Tooltip>
                      ) : null}
                    </Marker>
                  );
                })
              : null}
          </FeatureGroup>
        ) : null}

        {[
          [classEVisible, classELabelsVisible, airspaceCollections.classE, 8],
          [classFVisible, classFLabelsVisible, airspaceCollections.classF, 8],
          [classGVisible, classGLabelsVisible, airspaceCollections.classG, 8],
          [militaryAreasVisible, militaryLabelsVisible, airspaceCollections.military, 9],
          [trainingAreasVisible, trainingLabelsVisible, airspaceCollections.training, 9],
          [glidingSectorsVisible, glidingLabelsVisible, airspaceCollections.gliding, 9],
          [hangGlidingVisible, hangGlidingLabelsVisible, airspaceCollections.hangGliding, 9],
          [airspacesVisible, airspaceLabelsVisible, airspaceCollections.general, 9],
        ].map(([visible, labelsVisible, collection, labelZoom], index) =>
          visible && (collection as any).features.length > 0 ? (
            <FeatureGroup key={index}>
              <GeoJSON
                data={collection as any}
                style={airspaceStyle as any}
                onEachFeature={(feature, layer) => {
                  const props = feature.properties as any;
                  const limits = props?.limits as string | undefined;
                  if (labelsVisible) {
                    layer.bindTooltip(limits ? `${props?.name || 'Airspace'} • ${limits}` : `${props?.name || 'Airspace'}`, {
                      permanent: mapZoom >= (labelZoom as number),
                      direction: 'center',
                      className: airspaceLabelClassName,
                      opacity: 0.9,
                    });
                  }
                  layer.bindPopup(`<div style="font-size:12px;font-weight:700;text-transform:uppercase">${props?.name || 'Airspace'}</div>`);
                }}
              />
            </FeatureGroup>
          ) : null
        )}

        {obstaclesVisible && mapZoom >= 11 && obstacleGeoJson.features.length > 0 ? (
          <FeatureGroup>
            <GeoJSON
              data={obstacleGeoJson as any}
              pointToLayer={obstaclePointToLayer as any}
              onEachFeature={(feature, layer) => {
                const props = feature.properties as any;
                if (obstacleLabelsVisible) {
                  layer.bindTooltip(`${props?.name || 'Obstacle'}`, {
                    permanent: true,
                    direction: 'top',
                    className: airspaceLabelClassName,
                    opacity: 0.9,
                  });
                }
                layer.bindPopup(`<div style="font-size:12px;font-weight:700;text-transform:uppercase">${props?.name || 'Obstacle'}</div>`);
              }}
            />
          </FeatureGroup>
        ) : null}

        {replayPoints.length > 1 ? (
          <Polyline
            positions={replayPoints.map((point) => [point.latitude, point.longitude] as [number, number])}
            pathOptions={{ color: '#f97316', weight: 5, opacity: 0.9 }}
          />
        ) : null}

        {activeReplayPoint ? (
          <Marker
            position={[activeReplayPoint.latitude, activeReplayPoint.longitude]}
            icon={
              createAircraftIcon(
                replayRegistration ? `${replayRegistration} Replay` : 'Replay',
                activeReplayPoint.data.headingTrue ?? null,
                activeReplayPoint.data.onCourse ?? null,
                false,
                true
              ) || DefaultIcon
            }
          >
            <Popup>
              <div className="space-y-1 text-xs">
                <p className="font-black uppercase">{replayRegistration || activeReplayPoint.aircraftRegistration}</p>
                <p className="font-medium text-muted-foreground">Replay point</p>
                <p>{formatWaypointCoordinatesDms(activeReplayPoint.latitude, activeReplayPoint.longitude)}</p>
                <p>Recorded: {new Date(activeReplayPoint.recordedAt).toLocaleString()}</p>
                <p>
                  Speed:{' '}
                  {activeReplayPoint.data.groundSpeedKt != null
                    ? `${activeReplayPoint.data.groundSpeedKt.toFixed(0)} kt`
                    : activeReplayPoint.data.speedKt != null
                      ? `${activeReplayPoint.data.speedKt.toFixed(0)} kt`
                      : 'Unavailable'}
                </p>
                <p>Heading: {activeReplayPoint.data.headingTrue != null ? `${activeReplayPoint.data.headingTrue.toFixed(0)}°` : 'Unavailable'}</p>
                <p>
                  Distance next:{' '}
                  {activeReplayPoint.data.distanceToNextNm != null ? `${activeReplayPoint.data.distanceToNextNm.toFixed(1)} NM` : 'Unavailable'}
                </p>
              </div>
            </Popup>
          </Marker>
        ) : null}

        {positionedSessions.map((session) => {
          const position = session.lastPosition!;
          const stale = isFlightSessionStale(session);
          const breadcrumbPoints = (session.breadcrumb || [])
            .filter((point) => point?.latitude !== undefined && point?.longitude !== undefined)
            .map((point) => [point.latitude, point.longitude] as [number, number]);
          const navlogRouteLegs = session.bookingId ? navlogRoutesByBookingId[session.bookingId] || [] : [];
          const navlogRoutePoints = navlogRouteLegs
            .filter((leg) => leg.latitude !== undefined && leg.longitude !== undefined)
            .map((leg) => [leg.latitude, leg.longitude] as [number, number]);

          return (
            <Fragment key={session.id}>
              {showNavlogRoutes && navlogRoutePoints.length > 1 ? <Polyline positions={navlogRoutePoints} pathOptions={getNavlogRouteStyle()} /> : null}
              {showNavlogRoutes && navlogRouteLegs.length > 0
                ? navlogRouteLegs.map((leg, index) =>
                    leg.latitude !== undefined && leg.longitude !== undefined ? (
                      <Marker
                        key={`${session.id}-navlog-waypoint-${leg.id}`}
                        position={[leg.latitude, leg.longitude]}
                        icon={createNumberedWaypointIcon(index + 1, {
                          backgroundColor: '#0ea5e9',
                          shadowColor: 'rgba(14,165,233,0.35)',
                        })}
                      >
                        <Popup>
                          <div dangerouslySetInnerHTML={{ __html: buildWaypointPopupMarkup(leg, index) }} />
                        </Popup>
                      </Marker>
                    ) : null
                  )
                : null}
              {showAircraftTrails && breadcrumbPoints.length > 1 ? <Polyline positions={breadcrumbPoints} pathOptions={getTrailStyle(session, stale)} /> : null}
              <Marker
                position={[position.latitude, position.longitude]}
                icon={createAircraftIcon(session.aircraftRegistration, position.headingTrue, session.onCourse, stale, showAircraftNames) || DefaultIcon}
              >
                <Popup>
                  <div className="space-y-1 text-xs">
                    <p className="font-black uppercase">{session.aircraftRegistration}</p>
                    <p className="font-medium text-muted-foreground">{session.pilotName}</p>
                    <p>
                      {formatWaypointCoordinatesDms(position.latitude, position.longitude)}
                    </p>
                    <p>Accuracy: {position.accuracy ? `${Math.round(position.accuracy)} m` : 'Unknown'}</p>
                    <p>Altitude: {position.altitude != null ? `${Math.round(position.altitude)} m` : 'Unavailable'}</p>
                    <p>Speed: {session.groundSpeedKt != null ? `${session.groundSpeedKt.toFixed(0)} kt` : position.speedKt != null ? `${position.speedKt.toFixed(0)} kt` : 'Unavailable'}</p>
                    <p>Heading: {position.headingTrue != null ? `${position.headingTrue.toFixed(0)}°` : 'Unavailable'}</p>
                    <p>Trail points: {breadcrumbPoints.length}</p>
                    <p>Status: {stale ? 'Stale' : 'Live'}</p>
                    <p>Course: {session.onCourse === undefined || session.onCourse === null ? 'Unavailable' : session.onCourse ? 'On Course' : 'Off Course'}</p>
                    <p>XTK: {session.crossTrackErrorNm != null ? `${session.crossTrackErrorNm.toFixed(2)} NM` : 'Unavailable'}</p>
                    <p>Updated: {session.updatedAt}</p>
                  </div>
                </Popup>
              </Marker>
            </Fragment>
          );
        })}
      </LeafletMapFrame>

      {layerSelectorOpen ? (
        <div className="pointer-events-auto absolute left-1/2 top-2 z-[1200] flex max-h-[calc(100vh-1rem)] w-[min(340px,calc(100%-0.75rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-[10px] shadow-xl backdrop-blur">
          <div className="border-b border-slate-100 px-2 py-1.5 sm:px-3 sm:py-3">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                aria-label="Close layer panel"
                className="shrink-0 rounded-full border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
                onClick={() => onLayerSelectorOpenChange?.(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="text-right leading-none">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Map Layers</p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 sm:px-3 sm:py-3">
            <div className="mb-2 grid grid-cols-3 gap-1">
              {[
                { key: 'layers', label: 'Layers' },
                { key: 'labels', label: 'Labels' },
                { key: 'broadcasts', label: 'Broadcasts' },
              ].map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  variant="outline"
                  aria-pressed={layerPanelTab === tab.key}
                  className={`h-7 px-2 text-[8px] font-black uppercase ${
                    layerPanelTab === tab.key
                      ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                  onClick={() => setLayerPanelTab(tab.key as typeof layerPanelTab)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            {layerPanelTab === 'layers' ? (
              <div className="space-y-1.5">
                {[
                  ['OpenAIP Master Chart', masterVisible, setMasterVisible],
                  ['OpenAIP Airports', airportsVisible, setAirportsVisible],
                  ['OpenAIP Navaids', navaidsVisible, setNavaidsVisible],
                  ['OpenAIP Reporting Points', reportingVisible, setReportingVisible],
                  ['Class E', classEVisible, setClassEVisible],
                  ['Class F', classFVisible, setClassFVisible],
                  ['Class G', classGVisible, setClassGVisible],
                  ['Military Operations Areas', militaryAreasVisible, setMilitaryAreasVisible],
                  ['Training Areas', trainingAreasVisible, setTrainingAreasVisible],
                  ['Gliding Sectors', glidingSectorsVisible, setGlidingSectorsVisible],
                  ['Hang Glidings', hangGlidingVisible, setHangGlidingVisible],
                  ['OpenAIP Airspaces', airspacesVisible, setAirspacesVisible],
                  ['OpenAIP Obstacles', obstaclesVisible, setObstaclesVisible],
                ].map(([label, checked, setter]) => (
                  <Button
                    key={label as string}
                    type="button"
                    variant="outline"
                    aria-pressed={checked as boolean}
                    className={`h-7 w-full justify-start gap-1.5 px-2 text-[8px] font-black uppercase sm:h-9 sm:px-3 sm:text-[10px] ${
                      checked
                        ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => (setter as (value: boolean) => void)(!(checked as boolean))}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full border-2 ${
                        checked ? 'border-white bg-white' : 'border-slate-300 bg-transparent'
                      }`}
                    />
                    <span className="text-[8px] font-semibold sm:text-[10px]">{label as string}</span>
                  </Button>
                ))}
              </div>
            ) : null}

            {layerPanelTab === 'labels' ? (
              <div className="space-y-1.5">
                {[
                  ['Airport Labels', airportLabelsVisible, setAirportLabelsVisible],
                  ['Navaid Labels', navaidLabelsVisible, setNavaidLabelsVisible],
                  ['Reporting Labels', reportingLabelsVisible, setReportingLabelsVisible],
                  ['Airspace Labels', airspaceLabelsVisible, setAirspaceLabelsVisible],
                  ['Class E Labels', classELabelsVisible, setClassELabelsVisible],
                  ['Class F Labels', classFLabelsVisible, setClassFLabelsVisible],
                  ['Class G Labels', classGLabelsVisible, setClassGLabelsVisible],
                  ['Military Labels', militaryLabelsVisible, setMilitaryLabelsVisible],
                  ['Training Labels', trainingLabelsVisible, setTrainingLabelsVisible],
                  ['Gliding Labels', glidingLabelsVisible, setGlidingLabelsVisible],
                  ['Hang Gliding Labels', hangGlidingLabelsVisible, setHangGlidingLabelsVisible],
                  ['Obstacle Labels', obstacleLabelsVisible, setObstacleLabelsVisible],
                ].map(([label, checked, setter]) => (
                  <Button
                    key={label as string}
                    type="button"
                    variant="outline"
                    aria-pressed={checked as boolean}
                    className={`h-7 w-full justify-start gap-1.5 px-2 text-[8px] font-black uppercase sm:h-9 sm:px-3 sm:text-[10px] ${
                      checked
                        ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => (setter as (value: boolean) => void)(!(checked as boolean))}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full border-2 ${
                        checked ? 'border-white bg-white' : 'border-slate-300 bg-transparent'
                      }`}
                    />
                    <span className="text-[8px] font-semibold sm:text-[10px]">{label as string}</span>
                  </Button>
                ))}
              </div>
            ) : null}

            {layerPanelTab === 'broadcasts' ? (
              <div className="space-y-1.5">
                {[
                  ['Aircraft Names', showAircraftNames, setShowAircraftNames],
                  ['Aircraft Trails', showAircraftTrails, setShowAircraftTrails],
                  ['Navlog Routes', showNavlogRoutes, setShowNavlogRoutes],
                ].map(([label, checked, setter]) => (
                  <Button
                    key={label as string}
                    type="button"
                    variant="outline"
                    aria-pressed={checked as boolean}
                    className={`h-7 w-full justify-start gap-1.5 px-2 text-[8px] font-black uppercase sm:h-9 sm:px-3 sm:text-[10px] ${
                      checked
                        ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => (setter as (value: boolean) => void)(!(checked as boolean))}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full border-2 ${
                        checked ? 'border-white bg-white' : 'border-slate-300 bg-transparent'
                      }`}
                    />
                    <span className="text-[8px] font-semibold sm:text-[10px]">{label as string}</span>
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {layerLevelsOpen ? (
        <div className="pointer-events-auto absolute left-3 top-3 z-[1200] w-[320px] max-w-[calc(100%-1.5rem)] rounded-xl border border-slate-200 bg-white/95 p-3 text-[10px] shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Map Zoom</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
                Zoom {Math.round((mapMinZoom + mapMaxZoom) / 2)} · range {mapMinZoom}-{mapMaxZoom}
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-600 hover:bg-slate-50"
              onClick={() => onLayerLevelsOpenChange?.(false)}
            >
              Hide card
            </button>
          </div>
          <div className="mt-3 grid gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-700">Min Zoom Level</p>
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{mapMinZoom}</span>
              </div>
              <Slider
                value={[mapMinZoom]}
                min={4}
                max={16}
                step={1}
                onValueChange={([nextMin]) => {
                  setZoomRange({
                    minZoom: nextMin,
                    maxZoom: Math.max(nextMin, mapMaxZoom),
                  });
                }}
                className="py-1"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-700">Max Zoom Level</p>
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{mapMaxZoom}</span>
              </div>
              <Slider
                value={[mapMaxZoom]}
                min={4}
                max={16}
                step={1}
                onValueChange={([nextMax]) => {
                  setZoomRange({
                    minZoom: Math.min(nextMax, mapMinZoom),
                    maxZoom: nextMax,
                  });
                }}
                className="py-1"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
