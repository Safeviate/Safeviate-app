'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layers2, Map as MapIcon, Plus, Search, X } from 'lucide-react';

import { MAPLIBRE_BASE_STYLES } from '@/lib/maplibre-map-config';
import { parseJsonResponse } from '@/lib/safe-json';
import { formatWaypointCoordinatesDms } from '@/components/maps/waypoint-coordinate-utils';
import { useDebounce } from '@/hooks/use-debounce';
import { WaypointDmsForm } from '@/components/maps/waypoint-dms-dialog';
import { cn } from '@/lib/utils';
import type { Hazard, NavlogLeg } from '@/types/booking';
import {
  ROUTE_LINE_COLOR,
  ROUTE_LINE_OPACITY,
  ROUTE_LINE_WIDTH,
  ROUTE_LINE_CASING_COLOR,
  ROUTE_LINE_CASING_OPACITY,
  ROUTE_LINE_CASING_WIDTH,
} from '@/components/maps/route-line-style';
import { createNumberedWaypointElement } from '@/components/maps/waypoint-marker-style';

type Point = [number, number];
type LayerInfoItem = {
  label: string;
  layer: string;
  distanceNm?: number;
  frequencies?: string;
  detail?: string;
};
type LayerInfoState = {
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
  items: LayerInfoItem[];
};
type OpenAipFeature = {
  _id: string;
  name: string;
  type?: string;
  icaoCode?: string;
  identifier?: string;
  runways?: Array<{
    designator?: string;
    dimension?: {
      length?: { value?: number };
      width?: { value?: number };
    };
    declaredDistance?: {
      tora?: { value?: number };
      lda?: { value?: number };
    };
  }>;
  frequencies?: Array<{
    value?: string;
    name?: string;
    type?: number;
    primary?: boolean;
    publicUse?: boolean;
  }>;
  geometry?: {
    coordinates?: [number, number];
  };
  sourceLayer: 'airports' | 'navaids' | 'reporting-points';
};
type OpenAipAirspace = {
  _id: string;
  name: string;
  type?: number;
  icaoClass?: number;
  active?: boolean;
  hoursOfOperation?: {
    operatingHours?: unknown;
  };
  verticalLimits?: Record<string, unknown>;
  lowerLimit?: unknown;
  upperLimit?: unknown;
  floor?: unknown;
  ceiling?: unknown;
  limits?: unknown;
  geometry?: {
    coordinates?: unknown;
  };
};
type OpenAipObstacle = {
  _id: string;
  name?: string;
  height?: number;
  elevation?: number;
  geometry?: {
    coordinates?: [number, number];
  };
};
type AirspaceCollections = {
  classE: { type: 'FeatureCollection'; features: any[] };
  classF: { type: 'FeatureCollection'; features: any[] };
  classG: { type: 'FeatureCollection'; features: any[] };
  general: { type: 'FeatureCollection'; features: any[] };
  military: { type: 'FeatureCollection'; features: any[] };
  training: { type: 'FeatureCollection'; features: any[] };
  gliding: { type: 'FeatureCollection'; features: any[] };
  hangGliding: { type: 'FeatureCollection'; features: any[] };
};

export type RoutePlannerMapLibreShellProps = {
  className?: string;
  legs: NavlogLeg[];
  hazards?: Hazard[];
  baseStyle?: 'light' | 'satellite';
  onBaseStyleChange?: (style: 'light' | 'satellite') => void;
  center?: Point;
  minZoom?: number;
  maxZoom?: number;
  showRouteLine?: boolean;
  showWaypointMarkers?: boolean;
  showHazards?: boolean;
  rightAccessory?: ReactNode;
  isZoomPanelOpen?: boolean;
  isLayersPanelOpen?: boolean;
  onZoomPanelOpenChange?: (open: boolean) => void;
  onLayersPanelOpenChange?: (open: boolean) => void;
  isEditing?: boolean;
  onAddWaypoint?: (lat: number, lon: number, identifier?: string, frequencies?: string, layerInfo?: string) => void;
  onMoveWaypoint?: (legId: string, lat: number, lon: number) => void;
  onAddHazard?: (lat: number, lon: number) => void;
  onZoomChange?: (zoom: number) => void;
  onCenterChange?: (center: Point) => void;
};

const toVisibility = (visible: boolean) => (visible ? 'visible' : 'none') as 'visible' | 'none';

const AIRPORT_CLICK_SNAP_THRESHOLD_NM = 1;
const CLICK_SNAP_THRESHOLD_NM = 20;

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceNm = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const earthRadiusNm = 3440.065;
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const hav =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusNm * Math.asin(Math.sqrt(hav));
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatLimitValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.round(value)}`;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const nested = value as { value?: unknown; text?: unknown; unit?: unknown };
    if (nested.value !== undefined) {
      const rawValue: string = formatLimitValue(nested.value);
      const rawUnit = typeof nested.unit === 'string' ? nested.unit.trim() : '';
      return [rawValue, rawUnit].filter(Boolean).join(' ');
    }
    if (typeof nested.text === 'string') return nested.text.trim();
  }
  return '';
};

const formatAirspaceVerticalLimits = (airspace: OpenAipAirspace): string => {
  const rawVertical = airspace.verticalLimits;
  const lower =
    formatLimitValue(rawVertical?.lower ?? rawVertical?.lowerLimit ?? rawVertical?.floor ?? airspace.lowerLimit ?? airspace.floor);
  const upper =
    formatLimitValue(rawVertical?.upper ?? rawVertical?.upperLimit ?? rawVertical?.ceiling ?? airspace.upperLimit ?? airspace.ceiling);
  const fallback = formatLimitValue(airspace.limits) || formatLimitValue(rawVertical?.text) || formatLimitValue(rawVertical?.display) || '';
  if (lower || upper) {
    return [lower ? `LWR ${lower}` : '', upper ? `UPR ${upper}` : ''].filter(Boolean).join(' â€¢ ');
  }
  return fallback;
};

const isAirspaceActiveNow = (airspace: OpenAipAirspace) => {
  const operatingHours = airspace.hoursOfOperation?.operatingHours;
  return airspace.active === undefined || airspace.active === null || Boolean(operatingHours) || airspace.active === true;
};

const isMilitaryAirspace = (airspace: OpenAipAirspace) =>
  airspace.type === 1 || airspace.type === 33 || /MILITARY|SHOOTING|WEAPONS|RANGE|MOA|M\.O\.A|OPERATIONS AREA/i.test(airspace.name);

const isTrainingAirspace = (airspace: OpenAipAirspace) => airspace.type === 2 || /TRAINING|GENERAL FLYING|FLYING TNG|PJE/i.test(airspace.name);

const isGlidingAirspace = (airspace: OpenAipAirspace) => airspace.type === 21 || /GLIDING|GLIDER/i.test(airspace.name);

const isHangGlidingAirspace = (airspace: OpenAipAirspace) => /HANG\s*GLIDING|HANGGLIDING|HANG/i.test(airspace.name);

const isControlledAirspace = (airspace: OpenAipAirspace) =>
  /CTR|CONTROL\s*ZONE|CONTROLLED\s*TOR(E|W)R\s*REGION|CONTROL\s*TOR(E|W)R\s*REGION/i.test(airspace.name) || airspace.type === 5 || airspace.type === 10;

const getAirspaceClassCategory = (airspace: OpenAipAirspace) => {
  if (airspace.icaoClass === 6) return 'class-e';
  if (airspace.icaoClass === 7) return 'class-f';
  if (airspace.icaoClass === 8) return 'class-g';
  return null;
};

const getAirspaceCategory = (airspace: OpenAipAirspace) => {
  if (isControlledAirspace(airspace)) return 'ctr';
  if (isMilitaryAirspace(airspace)) return 'military';
  if (isTrainingAirspace(airspace)) return 'training';
  if (isGlidingAirspace(airspace)) return 'gliding';
  if (isHangGlidingAirspace(airspace)) return 'hang';
  const classCategory = getAirspaceClassCategory(airspace);
  return classCategory ?? 'other';
};

const airspaceFeatureCollection = (items: OpenAipAirspace[]) => ({
  type: 'FeatureCollection' as const,
  features: items
    .filter((item) => item.geometry?.coordinates)
    .map((item) => ({
      type: 'Feature' as const,
      properties: {
        _id: item._id,
        name: item.name,
        category: getAirspaceCategory(item),
        limits: formatAirspaceVerticalLimits(item),
        active: isAirspaceActiveNow(item),
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: item.geometry!.coordinates as any,
      },
    })),
});

const obstacleFeatureCollection = (items: OpenAipObstacle[]) => ({
  type: 'FeatureCollection' as const,
  features: items
    .filter((item) => item.geometry?.coordinates)
    .map((item) => ({
      type: 'Feature' as const,
      properties: {
        _id: item._id,
        name: item.name,
        height: item.height,
        elevation: item.elevation,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: item.geometry!.coordinates as [number, number],
      },
    })),
});

async function fetchOpenAipJson<T>(url: string, retries = 1): Promise<T | null> {
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

      return (await parseJsonResponse<T>(response)) ?? null;
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

const formatFrequencyLabel = (frequency: NonNullable<OpenAipFeature['frequencies']>[number]) => {
  const name = frequency.name?.trim();
  const value = frequency.value?.trim();
  if (name && value) return `${name} ${value}`;
  return name || value || '';
};

const formatWaypointFrequencies = (frequencies?: OpenAipFeature['frequencies']) =>
  frequencies
    ?.filter((frequency) => frequency.publicUse !== false)
    .map(formatFrequencyLabel)
    .filter(Boolean)
    .join(' • ');

const formatRunwaySummary = (runway: NonNullable<OpenAipFeature['runways']>[number]) => {
  const designator = runway.designator?.trim();
  const length = runway.dimension?.length?.value ?? runway.declaredDistance?.tora?.value;
  const width = runway.dimension?.width?.value;
  const size = [length ? `${Math.round(length)} m` : '', width ? `${Math.round(width)} m` : '']
    .filter(Boolean)
    .join(' x ');

  return [designator ? `RWY ${designator}` : '', size].filter(Boolean).join(' • ');
};

const formatAirportRunways = (runways?: OpenAipFeature['runways']) =>
  runways
    ?.filter((runway) => runway.designator || runway.dimension?.length?.value || runway.declaredDistance?.tora?.value)
    .slice(0, 4)
    .map(formatRunwaySummary)
    .filter(Boolean)
    .join(' • ');

const buildWaypointContext = (feature: OpenAipFeature) => {
  const identifier = feature.icaoCode || feature.identifier || feature.name;
  if (feature.sourceLayer === 'airports') {
    const runwaySummary = formatAirportRunways(feature.runways);
    return runwaySummary ? `OpenAIP Airports • ${identifier} • ${runwaySummary}` : `OpenAIP Airports • ${identifier}`;
  }
  if (feature.sourceLayer === 'navaids') {
    return `OpenAIP Navaids • ${identifier}`;
  }
  return `OpenAIP Reporting Points • ${identifier}`;
};

const getWaypointIdentifier = (feature: OpenAipFeature) => feature.icaoCode || feature.identifier || feature.name;

const buildFeatureDetail = (feature: OpenAipFeature) => {
  if (feature.sourceLayer === 'airports') {
    return formatAirportRunways(feature.runways) || undefined;
  }
  return undefined;
};

const getLayerLabel = (sourceLayer: OpenAipFeature['sourceLayer']) => {
  if (sourceLayer === 'airports') return 'OpenAIP Airports';
  if (sourceLayer === 'navaids') return 'OpenAIP Navaids';
  return 'OpenAIP Reporting Points';
};

const getSearchZoom = (sourceLayer: OpenAipFeature['sourceLayer']) => {
  if (sourceLayer === 'airports') return 13;
  if (sourceLayer === 'navaids') return 14;
  return 13;
};

const makePointFeatureCollection = (features: OpenAipFeature[]) => ({
  type: 'FeatureCollection' as const,
  features: features
    .filter((feature) => feature.geometry?.coordinates)
    .map((feature) => ({
      type: 'Feature' as const,
      properties: {
        _id: feature._id,
        name: feature.name,
        icaoCode: feature.icaoCode,
        identifier: feature.identifier,
        sourceLayer: feature.sourceLayer,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [feature.geometry!.coordinates![0], feature.geometry!.coordinates![1]],
      },
    })),
});

const makeLineFeatureCollection = (points: Point[]) => ({
  type: 'FeatureCollection' as const,
  features:
    points.length > 1
      ? [
          {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'LineString' as const,
              coordinates: points.map(([lat, lon]) => [lon, lat]),
            },
          },
        ]
      : [],
});

const makeHazardFeatureCollection = (hazards: Hazard[]) => ({
  type: 'FeatureCollection' as const,
  features: hazards.map((hazard) => ({
    type: 'Feature' as const,
    properties: {
      id: hazard.id,
      note: hazard.note,
      severity: hazard.severity ?? 'medium',
    },
    geometry: {
      type: 'Point' as const,
      coordinates: [hazard.lng, hazard.lat],
    },
  })),
});

export function RoutePlannerMapLibreShell({
  className,
  legs,
  hazards = [],
  baseStyle = 'light',
  onBaseStyleChange,
  center,
  minZoom = 4,
  maxZoom = 16,
  showRouteLine = true,
  showWaypointMarkers = true,
  showHazards = true,
  rightAccessory,
  isZoomPanelOpen = false,
  isLayersPanelOpen = false,
  onZoomPanelOpenChange,
  onLayersPanelOpenChange,
  isEditing = false,
  onAddWaypoint,
  onMoveWaypoint,
  onAddHazard,
  onZoomChange,
  onCenterChange,
}: RoutePlannerMapLibreShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(8);
  const [minVisibleZoom, setMinVisibleZoom] = useState(minZoom);
  const [maxVisibleZoom, setMaxVisibleZoom] = useState(maxZoom);
  const [showRouteLineState, setShowRouteLineState] = useState(showRouteLine);
  const [showWaypointMarkersState, setShowWaypointMarkersState] = useState(showWaypointMarkers);
  const [showHazardsState, setShowHazardsState] = useState(showHazards);
  const [showAirportsState, setShowAirportsState] = useState(true);
  const [showNavaidsState, setShowNavaidsState] = useState(true);
  const [showReportingState, setShowReportingState] = useState(true);
  const [showAirspacesState, setShowAirspacesState] = useState(true);
  const [showClassEState, setShowClassEState] = useState(true);
  const [showClassFState, setShowClassFState] = useState(true);
  const [showClassGState, setShowClassGState] = useState(true);
  const [showMilitaryState, setShowMilitaryState] = useState(true);
  const [showTrainingState, setShowTrainingState] = useState(true);
  const [showGlidingState, setShowGlidingState] = useState(true);
  const [showHangGlidingState, setShowHangGlidingState] = useState(true);
  const [showObstaclesState, setShowObstaclesState] = useState(true);
  const isInteractiveEditMode = isEditing && Boolean(onAddWaypoint);
  const isInteractiveEditModeRef = useRef(isInteractiveEditMode);
  const onAddWaypointRef = useRef(onAddWaypoint);
  const onMoveWaypointRef = useRef(onMoveWaypoint);
  const onAddHazardRef = useRef(onAddHazard);
  const visiblePointFeaturesRef = useRef<OpenAipFeature[]>([]);
  const loadSeqRef = useRef(0);
  const lastLoadKeyRef = useRef('');
  const [visiblePointFeatures, setVisiblePointFeatures] = useState<OpenAipFeature[]>([]);
  const [loadedAirspaceCollections, setLoadedAirspaceCollections] = useState<AirspaceCollections>(() => ({
    classE: { type: 'FeatureCollection', features: [] },
    classF: { type: 'FeatureCollection', features: [] },
    classG: { type: 'FeatureCollection', features: [] },
    general: { type: 'FeatureCollection', features: [] },
    military: { type: 'FeatureCollection', features: [] },
    training: { type: 'FeatureCollection', features: [] },
    gliding: { type: 'FeatureCollection', features: [] },
    hangGliding: { type: 'FeatureCollection', features: [] },
  }));
  const [loadedObstacleGeoJson, setLoadedObstacleGeoJson] = useState<{ type: 'FeatureCollection'; features: any[] }>(() => ({
    type: 'FeatureCollection',
    features: [],
  }));
  const [layerInfo, setLayerInfo] = useState<LayerInfoState | null>(null);
  const [layerInfoScreenPos, setLayerInfoScreenPos] = useState<Point | null>(null);
  const [isWaypointToolOpen, setIsWaypointToolOpen] = useState(false);
  const [waypointToolTab, setWaypointToolTab] = useState<'search' | 'dms'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OpenAipFeature[]>([]);
  const [selectedSearchResult, setSelectedSearchResult] = useState<OpenAipFeature | null>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const routePoints = useMemo(
    () =>
      legs
        .filter((leg) => leg.latitude !== undefined && leg.longitude !== undefined)
        .map((leg) => [leg.latitude!, leg.longitude!] as Point),
    [legs]
  );

  const routeGeoJson = useMemo(() => makeLineFeatureCollection(routePoints), [routePoints]);
  const hazardGeoJson = useMemo(() => makeHazardFeatureCollection(hazards), [hazards]);
  const mapCenter = center ?? routePoints[0] ?? ([-25.9, 27.9] as Point);
  const compactLayerToggleClass = 'rounded-md border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em]';
  const compactLayerToggleActiveClass = 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800';
  const compactLayerToggleInactiveClass = 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';

  useEffect(() => {
    isInteractiveEditModeRef.current = isInteractiveEditMode;
    const map = mapRef.current;
    if (map?.getCanvas()) {
      map.getCanvas().style.cursor = isInteractiveEditModeRef.current ? 'crosshair' : '';
    }
  }, [isInteractiveEditMode]);

  useEffect(() => {
    onAddWaypointRef.current = onAddWaypoint;
  }, [onAddWaypoint]);

  useEffect(() => {
    onMoveWaypointRef.current = onMoveWaypoint;
  }, [onMoveWaypoint]);

  useEffect(() => {
    onAddHazardRef.current = onAddHazard;
  }, [onAddHazard]);

  const buildLayerInfo = useCallback((lat: number, lon: number): LayerInfoState => {
    const items: LayerInfoItem[] = [];
    const activeResources: Array<OpenAipFeature['sourceLayer']> = ['airports', 'navaids', 'reporting-points'];

    const collectNearest = (sourceLayer: OpenAipFeature['sourceLayer'], maxDistanceNm: number, limit = 1) => {
      const nearby = visiblePointFeaturesRef.current
        .filter((feature) => feature.sourceLayer === sourceLayer && feature.geometry?.coordinates)
        .map((feature) => {
          const [featureLon, featureLat] = feature.geometry!.coordinates!;
          return { feature, distance: distanceNm(lat, lon, featureLat, featureLon) };
        })
        .filter((entry) => entry.distance <= maxDistanceNm)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);

      nearby.forEach(({ feature, distance }) => {
        items.push({
          label: getWaypointIdentifier(feature),
          layer: getLayerLabel(feature.sourceLayer),
          distanceNm: distance,
          frequencies: formatWaypointFrequencies(feature.frequencies),
          detail: buildFeatureDetail(feature),
        });
      });
    };

    if (activeResources.includes('airports')) {
      collectNearest('airports', AIRPORT_CLICK_SNAP_THRESHOLD_NM, 1);
    }
    if (activeResources.includes('navaids')) {
      collectNearest('navaids', CLICK_SNAP_THRESHOLD_NM, 2);
    }
    if (activeResources.includes('reporting-points')) {
      collectNearest('reporting-points', CLICK_SNAP_THRESHOLD_NM, 2);
    }

    const primary = items[0];
    return {
      lat,
      lon,
      title: primary?.label || 'Map Position',
      subtitle: primary?.layer,
      items: items.slice(0, 5),
    };
  }, []);

  const handleSelectSearchResult = useCallback((item: OpenAipFeature) => {
    const coords = item.geometry?.coordinates;
    if (!coords || coords.length < 2) return;
    const [lon, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const map = mapRef.current;
    map?.flyTo({
      center: [lon, lat],
      zoom: getSearchZoom(item.sourceLayer),
      duration: 1200,
    });

    setSelectedSearchResult(item);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAPLIBRE_BASE_STYLES[baseStyle],
      center: [mapCenter[1], mapCenter[0]],
      zoom: 8,
      minZoom,
      maxZoom,
      pitch: 0,
      bearing: 0,
      interactive: true,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.on('zoomend', () => {
      const nextZoom = map.getZoom();
      setCurrentZoom(nextZoom);
      onZoomChange?.(nextZoom);
    });

    map.on('load', () => {
      setIsMapReady(true);
      setCurrentZoom(map.getZoom());
      map.getCanvas().style.cursor = isInteractiveEditMode ? 'crosshair' : '';

      map.addSource('route', {
        type: 'geojson',
        data: routeGeoJson as any,
      });
      map.addLayer({
        id: 'route-line-casing',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': ROUTE_LINE_CASING_COLOR,
          'line-width': ROUTE_LINE_CASING_WIDTH,
          'line-opacity': ROUTE_LINE_CASING_OPACITY,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: toVisibility(showRouteLineState),
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': ROUTE_LINE_COLOR,
          'line-width': ROUTE_LINE_WIDTH,
          'line-opacity': ROUTE_LINE_OPACITY,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: toVisibility(showRouteLineState),
        },
      });

      map.addSource('hazards', {
        type: 'geojson',
        data: hazardGeoJson as any,
      });
      map.addLayer({
        id: 'hazard-points',
        type: 'circle',
        source: 'hazards',
        paint: {
          'circle-radius': 7,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
        layout: {
          visibility: toVisibility(showHazardsState),
        },
      });

      const pointSources: Array<{
        sourceId: string;
        layerId: string;
        labelLayerId: string;
        color: string;
        minzoom: number;
        sourceLayer: OpenAipFeature['sourceLayer'];
      }> = [
        {
          sourceId: 'openaip-airports',
          layerId: 'openaip-airports-points',
          labelLayerId: 'openaip-airports-labels',
          color: '#0f172a',
          minzoom: 10,
          sourceLayer: 'airports',
        },
        {
          sourceId: 'openaip-navaids',
          layerId: 'openaip-navaids-points',
          labelLayerId: 'openaip-navaids-labels',
          color: '#2563eb',
          minzoom: 11,
          sourceLayer: 'navaids',
        },
        {
          sourceId: 'openaip-reporting-points',
          layerId: 'openaip-reporting-points-points',
          labelLayerId: 'openaip-reporting-points-labels',
          color: '#7c3aed',
          minzoom: 12,
          sourceLayer: 'reporting-points',
        },
      ];

      pointSources.forEach(({ sourceId, layerId, labelLayerId, color, minzoom }) => {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: makePointFeatureCollection([]) as any,
          });
        }

        if (!map.getLayer(layerId)) {
          map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            paint: {
              'circle-radius': 5,
              'circle-color': color,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            },
            minzoom,
            layout: {
              visibility: 'visible',
            },
          });
        }

        if (!map.getLayer(labelLayerId)) {
          map.addLayer({
            id: labelLayerId,
            type: 'symbol',
            source: sourceId,
            minzoom: minzoom + 1,
            layout: {
              'text-field': ['coalesce', ['get', 'icaoCode'], ['get', 'identifier'], ['get', 'name']],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 10,
              'text-offset': [0, 1.1],
              'text-anchor': 'top',
              visibility: 'visible',
            },
            paint: {
              'text-color': '#0f172a',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.25,
            },
          });
        }
      });

      const addAirspaceLayers = (layerSuffix: string, fillColor: string, lineColor: string, visible: boolean) => {
        const sourceId = `openaip-airspaces-${layerSuffix}`;
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] } as any,
          });
        }

        if (!map.getLayer(`${sourceId}-fill`)) {
          map.addLayer({
            id: `${sourceId}-fill`,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': fillColor,
              'fill-opacity': 0.05,
            },
            layout: {
              visibility: toVisibility(visible),
            },
          });
        }

        if (!map.getLayer(`${sourceId}-line`)) {
          map.addLayer({
            id: `${sourceId}-line`,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': lineColor,
              'line-width': 2,
              'line-opacity': 0.62,
            },
            layout: {
              visibility: toVisibility(visible),
            },
          });
        }

        if (!map.getLayer(`${sourceId}-labels`)) {
          map.addLayer({
            id: `${sourceId}-labels`,
            type: 'symbol',
            source: sourceId,
            minzoom: 10.5,
            layout: {
              'text-field': ['coalesce', ['get', 'name'], ['concat', 'Airspace ', ['get', '_id']]],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 10,
              'text-offset': [0, 0.8],
              'text-anchor': 'top',
              visibility: toVisibility(visible),
            },
            paint: {
              'text-color': lineColor,
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.25,
            },
          });
        }
      };

      addAirspaceLayers('ctr', '#dc2626', '#dc2626', showAirspacesState);
      addAirspaceLayers('military', '#ef4444', '#ef4444', showMilitaryState);
      addAirspaceLayers('training', '#f59e0b', '#f59e0b', showTrainingState);
      addAirspaceLayers('gliding', '#22c55e', '#22c55e', showGlidingState);
      addAirspaceLayers('hang', '#a855f7', '#a855f7', showHangGlidingState);
      addAirspaceLayers('class-e', '#3b82f6', '#3b82f6', showClassEState);
      addAirspaceLayers('class-f', '#f97316', '#f97316', showClassFState);
      addAirspaceLayers('class-g', '#14b8a6', '#14b8a6', showClassGState);

      if (!map.getSource('openaip-obstacles')) {
        map.addSource('openaip-obstacles', {
          type: 'geojson',
          data: loadedObstacleGeoJson as any,
        });
      }
      if (!map.getLayer('openaip-obstacles')) {
        map.addLayer({
          id: 'openaip-obstacles',
          type: 'circle',
          source: 'openaip-obstacles',
          paint: {
            'circle-radius': 4,
            'circle-color': '#ea580c',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          },
          layout: {
            visibility: toVisibility(showObstaclesState),
          },
        });
      }
      if (!map.getLayer('openaip-obstacle-labels')) {
        map.addLayer({
          id: 'openaip-obstacle-labels',
          type: 'symbol',
          source: 'openaip-obstacles',
          minzoom: 11,
          layout: {
            'text-field': ['coalesce', ['get', 'name'], ['concat', 'Obstacle ', ['get', '_id']]],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 10,
            'text-offset': [0, 1.05],
            'text-anchor': 'top',
            visibility: toVisibility(showObstaclesState),
          },
          paint: {
            'text-color': '#7c2d12',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.25,
          },
        });
      }

      if (routePoints.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        routePoints.forEach(([lat, lon]) => bounds.extend([lon, lat]));
        map.fitBounds(bounds, { padding: 48, duration: 0 });
      }

      const loadVisiblePoints = async () => {
        const resources: Array<OpenAipFeature['sourceLayer']> = [];
        resources.push('airports', 'navaids', 'reporting-points');

        const bounds = map.getBounds();
        const bbox = [
          bounds.getWest().toFixed(6),
          bounds.getSouth().toFixed(6),
          bounds.getEast().toFixed(6),
          bounds.getNorth().toFixed(6),
        ].join(',');
        const requestKey = `${resources.join(',')}|${bbox}|airspaces|obstacles`;
        if (lastLoadKeyRef.current === requestKey) return;
        lastLoadKeyRef.current = requestKey;
        const seq = ++loadSeqRef.current;

        try {
          const responses = await Promise.all(
            resources.map(async (resource) => {
              const payload = await fetchOpenAipJson<{ items?: unknown[] }>(`/api/openaip?resource=${resource}&bbox=${bbox}`);
              return { resource, payload };
            })
          );

          if (seq !== loadSeqRef.current) return;

          const combined = responses.flatMap(({ resource, payload }) =>
            (payload?.items ?? []).map((item: any) => ({ ...item, sourceLayer: resource }))
          ) as OpenAipFeature[];
          visiblePointFeaturesRef.current = combined;
          setVisiblePointFeatures(combined);

          const [airspacePayload, obstaclePayload] = await Promise.all([
            fetchOpenAipJson<{ items?: unknown[] }>(`/api/openaip?resource=airspaces&bbox=${bbox}`),
            fetchOpenAipJson<{ items?: unknown[] }>(`/api/openaip?resource=obstacles&bbox=${bbox}`),
          ]);

          if (seq !== loadSeqRef.current) return;

          const airspaces = (airspacePayload?.items ?? []) as OpenAipAirspace[];
          const obstacles = (obstaclePayload?.items ?? []) as OpenAipObstacle[];
          const nextAirspaceCollections = {
            classE: airspaceFeatureCollection(airspaces.filter((item) => item.geometry?.coordinates && isAirspaceActiveNow(item) && getAirspaceClassCategory(item) === 'class-e')),
            classF: airspaceFeatureCollection(airspaces.filter((item) => item.geometry?.coordinates && isAirspaceActiveNow(item) && getAirspaceClassCategory(item) === 'class-f')),
            classG: airspaceFeatureCollection(airspaces.filter((item) => item.geometry?.coordinates && isAirspaceActiveNow(item) && getAirspaceClassCategory(item) === 'class-g')),
            military: airspaceFeatureCollection(airspaces.filter((item) => item.geometry?.coordinates && isAirspaceActiveNow(item) && isMilitaryAirspace(item))),
            training: airspaceFeatureCollection(airspaces.filter((item) => item.geometry?.coordinates && isAirspaceActiveNow(item) && isTrainingAirspace(item))),
            gliding: airspaceFeatureCollection(airspaces.filter((item) => item.geometry?.coordinates && isAirspaceActiveNow(item) && isGlidingAirspace(item))),
            hangGliding: airspaceFeatureCollection(airspaces.filter((item) => item.geometry?.coordinates && isAirspaceActiveNow(item) && isHangGlidingAirspace(item))),
            general: airspaceFeatureCollection(airspaces.filter((item) => item.geometry?.coordinates && isAirspaceActiveNow(item) && (getAirspaceCategory(item) === 'other' || getAirspaceCategory(item) === 'ctr'))),
          } satisfies AirspaceCollections;
          const nextObstacleGeoJson = obstacleFeatureCollection(obstacles);

          setLoadedAirspaceCollections(nextAirspaceCollections);
          setLoadedObstacleGeoJson(nextObstacleGeoJson);
        } catch (error) {
          console.error('Viewport OpenAIP load failed', error);
        }
      };

      void loadVisiblePoints();
      const handleVisiblePointMoveEnd = () => {
        void loadVisiblePoints();
      };
      const handleVisiblePointZoomEnd = () => {
        void loadVisiblePoints();
      };
      map.on('moveend', handleVisiblePointMoveEnd);
      map.on('zoomend', handleVisiblePointZoomEnd);
    });

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      const currentAddWaypoint = onAddWaypointRef.current;
      if (!isInteractiveEditModeRef.current || !currentAddWaypoint) return;
      const lat = event.lngLat.lat;
      const lon = event.lngLat.lng;
      const candidates = visiblePointFeaturesRef.current.filter((item) => item.geometry?.coordinates);

      let nearest: OpenAipFeature | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const feature of candidates) {
        const coords = feature.geometry?.coordinates;
        if (!coords) continue;
        const [featureLon, featureLat] = coords;
        const d = distanceNm(lat, lon, featureLat, featureLon);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = feature;
        }
      }

      if (nearest && nearest.sourceLayer === 'airports' && nearestDistance <= AIRPORT_CLICK_SNAP_THRESHOLD_NM) {
        const identifier = getWaypointIdentifier(nearest);
        currentAddWaypoint(lat, lon, identifier, formatWaypointFrequencies(nearest.frequencies), buildWaypointContext(nearest));
        return;
      }

      if (nearest && nearest.sourceLayer !== 'airports' && nearestDistance <= CLICK_SNAP_THRESHOLD_NM) {
        const identifier = getWaypointIdentifier(nearest);
        currentAddWaypoint(lat, lon, identifier, formatWaypointFrequencies(nearest.frequencies), buildWaypointContext(nearest));
        return;
      }

      currentAddWaypoint(lat, lon, 'PNT', undefined, 'Map Position');
    };

    const handleMapContextMenu = (event: maplibregl.MapMouseEvent) => {
      event.preventDefault();
      const currentAddHazard = onAddHazardRef.current;
      if (isInteractiveEditModeRef.current && currentAddHazard) {
        currentAddHazard(event.lngLat.lat, event.lngLat.lng);
        return;
      }

      const nextLayerInfo = buildLayerInfo(event.lngLat.lat, event.lngLat.lng);
      setLayerInfo(nextLayerInfo);
      const projected = map.project([event.lngLat.lng, event.lngLat.lat]);
      setLayerInfoScreenPos([projected.x, projected.y]);
    };

    map.on('click', handleMapClick);
    map.on('contextmenu', handleMapContextMenu);

    if (onZoomChange) {
      map.on('zoomend', () => onZoomChange(map.getZoom()));
    }
    if (onCenterChange) {
      map.on('moveend', () => {
        const nextCenter = map.getCenter();
        onCenterChange([nextCenter.lat, nextCenter.lng]);
      });
    }

    return () => {
      map.off('click', handleMapClick);
      map.off('contextmenu', handleMapContextMenu);
      waypointMarkersRef.current.forEach((marker) => marker.remove());
      waypointMarkersRef.current = [];
      if (map.getCanvas()) {
        map.getCanvas().style.cursor = '';
      }
      map.remove();
      mapRef.current = null;
      setIsMapReady(false);
    };
  }, [baseStyle, buildLayerInfo, maxZoom, minZoom, onCenterChange, onZoomChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;
    map.setMinZoom(minVisibleZoom);
    map.setMaxZoom(maxVisibleZoom);
  }, [maxVisibleZoom, minVisibleZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const routeSource = map.getSource('route') as GeoJSONSource | undefined;
    routeSource?.setData(routeGeoJson as any);
    if (map.getLayer('route-line-casing')) {
      map.setLayoutProperty('route-line-casing', 'visibility', toVisibility(showRouteLineState));
    }
    if (map.getLayer('route-line')) {
      map.setLayoutProperty('route-line', 'visibility', toVisibility(showRouteLineState));
    }
  }, [routeGeoJson, showRouteLineState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const hazardSource = map.getSource('hazards') as GeoJSONSource | undefined;
    hazardSource?.setData(hazardGeoJson as any);
    if (map.getLayer('hazard-points')) {
      map.setLayoutProperty('hazard-points', 'visibility', toVisibility(showHazardsState));
    }
  }, [hazardGeoJson, showHazardsState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const airspaceLayers: Array<[string, GeoJSON.FeatureCollection, string, string, string, boolean]> = [
      ['openaip-airspaces-ctr', loadedAirspaceCollections.general, 'openaip-airspaces-ctr-fill', 'openaip-airspaces-ctr-line', 'openaip-airspaces-ctr-labels', showAirspacesState],
      ['openaip-airspaces-military', loadedAirspaceCollections.military, 'openaip-airspaces-military-fill', 'openaip-airspaces-military-line', 'openaip-airspaces-military-labels', showMilitaryState],
      ['openaip-airspaces-training', loadedAirspaceCollections.training, 'openaip-airspaces-training-fill', 'openaip-airspaces-training-line', 'openaip-airspaces-training-labels', showTrainingState],
      ['openaip-airspaces-gliding', loadedAirspaceCollections.gliding, 'openaip-airspaces-gliding-fill', 'openaip-airspaces-gliding-line', 'openaip-airspaces-gliding-labels', showGlidingState],
      ['openaip-airspaces-hang', loadedAirspaceCollections.hangGliding, 'openaip-airspaces-hang-fill', 'openaip-airspaces-hang-line', 'openaip-airspaces-hang-labels', showHangGlidingState],
      ['openaip-airspaces-class-e', loadedAirspaceCollections.classE, 'openaip-airspaces-class-e-fill', 'openaip-airspaces-class-e-line', 'openaip-airspaces-class-e-labels', showClassEState],
      ['openaip-airspaces-class-f', loadedAirspaceCollections.classF, 'openaip-airspaces-class-f-fill', 'openaip-airspaces-class-f-line', 'openaip-airspaces-class-f-labels', showClassFState],
      ['openaip-airspaces-class-g', loadedAirspaceCollections.classG, 'openaip-airspaces-class-g-fill', 'openaip-airspaces-class-g-line', 'openaip-airspaces-class-g-labels', showClassGState],
    ];

    for (const [sourceId, sourceData, fillLayerId, lineLayerId, labelLayerId, visible] of airspaceLayers) {
      const source = map.getSource(sourceId) as GeoJSONSource | undefined;
      source?.setData(sourceData as any);
      if (map.getLayer(fillLayerId)) {
        map.setLayoutProperty(fillLayerId, 'visibility', toVisibility(visible));
      }
      if (map.getLayer(lineLayerId)) {
        map.setLayoutProperty(lineLayerId, 'visibility', toVisibility(visible));
      }
      if (map.getLayer(labelLayerId)) {
        map.setLayoutProperty(labelLayerId, 'visibility', toVisibility(visible));
      }
    }

    const obstacleSource = map.getSource('openaip-obstacles') as GeoJSONSource | undefined;
    obstacleSource?.setData(loadedObstacleGeoJson as any);
    if (map.getLayer('openaip-obstacles')) {
      map.setLayoutProperty('openaip-obstacles', 'visibility', toVisibility(showObstaclesState));
    }
    if (map.getLayer('openaip-obstacle-labels')) {
      map.setLayoutProperty('openaip-obstacle-labels', 'visibility', toVisibility(showObstaclesState));
    }
  }, [
    loadedAirspaceCollections,
    loadedObstacleGeoJson,
    showAirspacesState,
    showClassEState,
    showClassFState,
    showClassGState,
    showGlidingState,
    showHangGlidingState,
    showMilitaryState,
    showObstaclesState,
    showTrainingState,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextPointSources: Array<[string, OpenAipFeature['sourceLayer'], boolean]> = [
      ['openaip-airports', 'airports', showAirportsState],
      ['openaip-navaids', 'navaids', showNavaidsState],
      ['openaip-reporting-points', 'reporting-points', showReportingState],
    ];

    for (const [sourceId, sourceLayer, visible] of nextPointSources) {
      const source = map.getSource(sourceId) as GeoJSONSource | undefined;
      const sourceData = makePointFeatureCollection(visiblePointFeatures.filter((feature) => feature.sourceLayer === sourceLayer));
      source?.setData(sourceData as any);

      const pointLayerId =
        sourceLayer === 'airports'
          ? 'openaip-airports-points'
          : sourceLayer === 'navaids'
            ? 'openaip-navaids-points'
            : 'openaip-reporting-points-points';
      const labelLayerId =
        sourceLayer === 'airports'
          ? 'openaip-airports-labels'
          : sourceLayer === 'navaids'
            ? 'openaip-navaids-labels'
            : 'openaip-reporting-points-labels';

      if (map.getLayer(pointLayerId)) {
        map.setLayoutProperty(pointLayerId, 'visibility', toVisibility(visible));
      }
      if (map.getLayer(labelLayerId)) {
        map.setLayoutProperty(labelLayerId, 'visibility', toVisibility(visible));
      }
    }
  }, [showAirportsState, showNavaidsState, showReportingState, visiblePointFeatures]);

  useEffect(() => {
    if (isEditing) {
      setLayerInfo(null);
      setLayerInfoScreenPos(null);
    }
  }, [isEditing]);

  useEffect(() => {
    const runSearch = async () => {
      const query = debouncedSearchQuery.trim();
      if (query.length < 2) {
        setSearchResults([]);
        return;
      }

      const resources: Array<OpenAipFeature['sourceLayer']> = ['airports', 'navaids', 'reporting-points'];
      try {
        const searchResultsByResource = await Promise.all(
          resources.map(async (resource) => {
            const payload = await fetchOpenAipJson<{ items?: unknown[] }>(
              `/api/openaip?resource=${resource}&search=${encodeURIComponent(query)}`
            );
            return { resource, payload };
          })
        );

        const combinedResults = searchResultsByResource.flatMap(({ resource, payload }) =>
          (payload?.items ?? []).map((item: any) => ({ ...item, sourceLayer: resource }))
        ) as OpenAipFeature[];

        setSearchResults(combinedResults);
      } catch (error) {
        console.error('MapLibre planner search failed', error);
        setSearchResults([]);
      }
    };

    void runSearch();
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (isWaypointToolOpen) return;
    setWaypointToolTab('search');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedSearchResult(null);
  }, [isWaypointToolOpen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layerInfo) {
      setLayerInfoScreenPos(null);
      return;
    }

    const updateScreenPos = () => {
      const projected = map.project([layerInfo.lon, layerInfo.lat]);
      setLayerInfoScreenPos([projected.x, projected.y]);
    };

    updateScreenPos();
    map.on('move', updateScreenPos);
    map.on('zoom', updateScreenPos);

    return () => {
      map.off('move', updateScreenPos);
      map.off('zoom', updateScreenPos);
    };
  }, [layerInfo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    waypointMarkersRef.current.forEach((marker) => marker.remove());
    waypointMarkersRef.current = [];

    if (!showWaypointMarkersState) return;

    for (const [index, leg] of legs.entries()) {
      if (leg.latitude == null || leg.longitude == null) continue;

      const markerElement = createNumberedWaypointElement(index + 1);
      const currentMoveWaypoint = onMoveWaypointRef.current;
      if (isInteractiveEditModeRef.current && currentMoveWaypoint) {
        markerElement.style.cursor = 'grab';
        markerElement.style.touchAction = 'none';
        markerElement.style.userSelect = 'none';
      }

      const marker = new maplibregl.Marker({
        element: markerElement,
        draggable: isInteractiveEditModeRef.current && Boolean(currentMoveWaypoint),
        anchor: 'center',
      })
        .setLngLat([leg.longitude, leg.latitude])
        .addTo(map);

      if (isInteractiveEditModeRef.current && currentMoveWaypoint) {
        const disableMapGestures = () => {
          markerElement.style.cursor = 'grabbing';
          map.dragPan.disable();
          map.touchZoomRotate.disable();
        };
        const restoreMapGestures = () => {
          markerElement.style.cursor = 'grab';
          map.dragPan.enable();
          map.touchZoomRotate.enable();
        };

        marker.on('dragstart', disableMapGestures);
        marker.on('dragend', restoreMapGestures);
        marker.on('dragend', () => {
          const next = marker.getLngLat();
          currentMoveWaypoint(leg.id, next.lat, next.lng);
        });
      }

      waypointMarkersRef.current.push(marker);
    }
  }, [isEditing, isMapReady, legs, onMoveWaypoint, showWaypointMarkersState]);

  return (
    <div ref={containerRef} className={className ?? 'absolute inset-0 h-full w-full overflow-hidden'}>
      <div className="pointer-events-auto absolute left-1/2 top-4 z-[1000] -translate-x-1/2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsWaypointToolOpen((current) => !current)}
          className="h-10 w-10 rounded-full border-slate-200 bg-white/95 p-0 text-[10px] font-black uppercase tracking-[0.12em] shadow-xl backdrop-blur hover:bg-slate-50"
          aria-label="Add Waypoint"
          title="Add Waypoint"
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">Add Waypoint</span>
        </Button>

        {isWaypointToolOpen ? (
          <div
            className={cn(
              'mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-[10px] shadow-xl backdrop-blur',
              waypointToolTab === 'search'
                ? 'w-[min(18rem,calc(100vw-1.5rem))]'
                : 'w-[min(22rem,calc(100vw-1rem))]'
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Add Waypoint</p>
                <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Search OpenAIP or enter DMS coordinates
                </p>
              </div>
              <button
                type="button"
                aria-label="Close add waypoint tool"
                className="shrink-0 rounded-full border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
                onClick={() => setIsWaypointToolOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-3 py-2">
              <Tabs value={waypointToolTab} onValueChange={(value) => setWaypointToolTab(value as 'search' | 'dms')}>
                <TabsList className="grid h-8 grid-cols-2 bg-slate-100 p-1">
                  <TabsTrigger
                    value="search"
                    className="h-6 rounded-md text-[9px] font-black uppercase tracking-[0.12em]"
                  >
                    Search
                  </TabsTrigger>
                  <TabsTrigger
                    value="dms"
                    className="h-6 rounded-md text-[9px] font-black uppercase tracking-[0.12em]"
                  >
                    DMS
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="search" className="mt-3 space-y-2">
                  <div className="relative mx-auto w-[210px] max-w-full">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search..."
                      className="h-8 border-slate-200 bg-white/95 pl-8 pr-8 text-[10px] font-black uppercase shadow-sm backdrop-blur"
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>

                  {searchResults.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
                      <ScrollArea className="h-[210px] max-h-[210px]">
                        <div className="divide-y divide-slate-100">
                          {searchResults.map((item) => (
                            <button
                              key={item._id}
                              type="button"
                              className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                              onClick={() => handleSelectSearchResult(item)}
                            >
                              <p className="break-words text-[10px] font-black uppercase tracking-[0.16em] text-slate-900">
                                {item.name} {item.icaoCode || item.identifier ? `(${item.icaoCode || item.identifier})` : ''}
                              </p>
                              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                                {getLayerLabel(item.sourceLayer)}
                              </p>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="dms" className="mt-3">
                  <WaypointDmsForm
                    onAddWaypoint={onAddWaypoint ?? (() => undefined)}
                    onCancel={() => setIsWaypointToolOpen(false)}
                    showCancel
                    submitLabel="Add Waypoint"
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        ) : null}
      </div>

      {rightAccessory ? <div className="pointer-events-auto absolute right-4 top-4 z-[1000]">{rightAccessory}</div> : null}

      {selectedSearchResult ? (
        <div className="pointer-events-auto absolute bottom-4 left-4 z-[1000] w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white/95 p-3 text-[10px] shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Search Result</p>
              <p className="mt-1 break-words text-[11px] font-black uppercase text-slate-900">{selectedSearchResult.name}</p>
              <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                {getLayerLabel(selectedSearchResult.sourceLayer)}
              </p>
              <p className="mt-1 font-mono text-[9px] text-slate-500">
                {selectedSearchResult.geometry?.coordinates
                  ? formatWaypointCoordinatesDms(selectedSearchResult.geometry.coordinates[1], selectedSearchResult.geometry.coordinates[0])
                  : 'N/A'}
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
              onClick={() => setSelectedSearchResult(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
            <Button
              type="button"
              className="h-8 w-full bg-emerald-700 text-[10px] font-black uppercase text-white hover:bg-emerald-800"
              onClick={() => {
                if (!selectedSearchResult.geometry?.coordinates) return;
                const [lon, lat] = selectedSearchResult.geometry.coordinates;
                onAddWaypoint?.(
                  lat,
                  lon,
                  getWaypointIdentifier(selectedSearchResult),
                  formatWaypointFrequencies(selectedSearchResult.frequencies),
                  buildWaypointContext(selectedSearchResult)
                );
                setSelectedSearchResult(null);
              }}
            >
              Add to Route
            </Button>
          </div>
        </div>
      ) : null}

      {layerInfo ? (
        <div
          className="pointer-events-auto absolute z-[1000] w-[min(320px,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white/95 p-3 text-[10px] shadow-xl backdrop-blur"
          style={{
            left: layerInfoScreenPos ? `${layerInfoScreenPos[0]}px` : '50%',
            top: layerInfoScreenPos ? `${layerInfoScreenPos[1]}px` : '50%',
            transform: layerInfoScreenPos ? 'translate(-50%, -100%)' : 'translate(-50%, -50%)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Layer Information</p>
              <p className="mt-1 break-words text-[11px] font-black uppercase text-slate-900">{layerInfo.title}</p>
              {layerInfo.subtitle ? (
                <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-primary">{layerInfo.subtitle}</p>
              ) : null}
              <p className="mt-1 font-mono text-[9px] text-slate-500">{formatWaypointCoordinatesDms(layerInfo.lat, layerInfo.lon)}</p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
              onClick={() => setLayerInfo(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {layerInfo.items.length > 0 ? (
              layerInfo.items.map((item) => (
                <div key={`${item.layer}-${item.label}-${item.distanceNm?.toFixed(2)}`} className="rounded-md border bg-slate-50 px-2 py-1.5">
                  <p className="break-words text-[10px] font-black uppercase text-slate-900">{item.label}</p>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                    {item.layer}
                    {typeof item.distanceNm === 'number' ? ` | ${item.distanceNm.toFixed(1)} NM` : ''}
                  </p>
                  {item.detail ? <p className="mt-0.5 break-words text-[9px] text-slate-600">{item.detail}</p> : null}
                  {item.frequencies ? <p className="mt-0.5 break-words text-[9px] text-slate-600">{item.frequencies}</p> : null}
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                No nearby cached feature found.
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
            <Button
              type="button"
              className="h-8 w-full bg-emerald-700 text-[10px] font-black uppercase text-white hover:bg-emerald-800"
              onClick={() => {
                onAddWaypoint?.(
                  layerInfo.lat,
                  layerInfo.lon,
                  layerInfo.items[0]?.label || 'PNT',
                  layerInfo.items[0]?.frequencies,
                  layerInfo.items[0]?.layer && layerInfo.items[0].label
                    ? `${layerInfo.items[0].layer} | ${layerInfo.items[0].label}${layerInfo.items[0].detail ? ` | ${layerInfo.items[0].detail}` : ''}`
                    : 'Map Position'
                );
                setLayerInfo(null);
              }}
            >
              Add to Route
            </Button>
            {onAddHazard ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 w-full border-destructive/20 text-[10px] font-black uppercase text-destructive hover:bg-destructive/10"
                onClick={() => {
                  onAddHazard(layerInfo.lat, layerInfo.lon);
                  setLayerInfo(null);
                }}
              >
                Mark Hazard
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isZoomPanelOpen ? (
        <div className="pointer-events-auto absolute left-3 top-3 z-[1000] w-[320px] max-w-[calc(100%-1.5rem)] rounded-xl border border-slate-200 bg-white/95 p-3 text-[10px] shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Map Zoom</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
                Zoom {currentZoom.toFixed(0)} · range {minVisibleZoom}-{maxVisibleZoom}
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
              onClick={() => onZoomPanelOpenChange?.(false)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 grid gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-700">Min Zoom Level</p>
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{minVisibleZoom}</span>
              </div>
              <Slider
                value={[minVisibleZoom]}
                min={4}
                max={16}
                step={1}
                onValueChange={([nextMin]) => {
                  setMinVisibleZoom(nextMin);
                  if (nextMin > maxVisibleZoom) {
                    setMaxVisibleZoom(nextMin);
                  }
                }}
                className="py-1"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-700">Max Zoom Level</p>
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{maxVisibleZoom}</span>
              </div>
              <Slider
                value={[maxVisibleZoom]}
                min={4}
                max={16}
                step={1}
                onValueChange={([nextMax]) => {
                  setMaxVisibleZoom(nextMax);
                  if (nextMax < minVisibleZoom) {
                    setMinVisibleZoom(nextMax);
                  }
                }}
                className="py-1"
              />
            </div>
          </div>
        </div>
      ) : null}

      {isLayersPanelOpen ? (
        <div className="pointer-events-auto absolute right-2 top-2 z-[1000] flex h-[calc(36svh-0.75rem)] w-[min(300px,calc(100%-0.75rem))] max-w-[calc(100%-0.75rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-[10px] shadow-xl backdrop-blur sm:h-auto sm:max-h-[calc(100dvh-8rem)]">
          <div className="shrink-0 border-b border-slate-100 px-2.5 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Map Layers</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
                  Route, waypoints, hazards, airspaces, and obstacles
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
                onClick={() => onLayersPanelOpenChange?.(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 overscroll-contain">
            <div className="space-y-2 p-2 pb-2.5">
              <div className="space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Base Style</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { key: 'light', label: 'Light' },
                    { key: 'satellite', label: 'Satellite' },
                  ].map((style) => {
                    const active = baseStyle === style.key;
                    return (
                      <Button
                        key={style.key}
                        type="button"
                        variant="outline"
                        aria-pressed={active}
                        className={[
                          compactLayerToggleClass,
                          active ? compactLayerToggleActiveClass : compactLayerToggleInactiveClass,
                        ].join(' ')}
                        onClick={() => {
                          if (style.key !== baseStyle) {
                            onLayersPanelOpenChange?.(false);
                            onBaseStyleChange?.(style.key as 'light' | 'satellite');
                          }
                        }}
                      >
                        {style.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Map Layers</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ['Route', showRouteLineState, setShowRouteLineState],
                    ['Waypoints', showWaypointMarkersState, setShowWaypointMarkersState],
                    ['Hazards', showHazardsState, setShowHazardsState],
                    ['CTR', showAirspacesState, setShowAirspacesState],
                    ['Military', showMilitaryState, setShowMilitaryState],
                    ['Training', showTrainingState, setShowTrainingState],
                    ['Gliding', showGlidingState, setShowGlidingState],
                    ['Hang', showHangGlidingState, setShowHangGlidingState],
                    ['Class E', showClassEState, setShowClassEState],
                    ['Class F', showClassFState, setShowClassFState],
                    ['Class G', showClassGState, setShowClassGState],
                    ['Obstacles', showObstaclesState, setShowObstaclesState],
                    ['Airports', showAirportsState, setShowAirportsState],
                    ['Navaids', showNavaidsState, setShowNavaidsState],
                    ['Reporting', showReportingState, setShowReportingState],
                  ].map(([label, checked, setter]) => (
                    <Button
                      key={label as string}
                      type="button"
                      variant="outline"
                      aria-pressed={checked as boolean}
                      className={[
                        compactLayerToggleClass,
                        'h-9 w-auto flex-none justify-center px-4',
                        (checked as boolean) ? compactLayerToggleActiveClass : compactLayerToggleInactiveClass,
                      ].join(' ')}
                      onClick={() => (setter as (value: boolean) => void)(!(checked as boolean))}
                    >
                      {label as string}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-4 top-4 z-[1000] flex items-start gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onZoomPanelOpenChange?.(!isZoomPanelOpen)}
          className="pointer-events-auto h-10 w-10 rounded-full border-slate-200 bg-white/95 p-0 text-[10px] font-black uppercase tracking-[0.12em] shadow-xl backdrop-blur hover:bg-slate-50"
          aria-label="Map Zoom"
          title="Map Zoom"
        >
          <MapIcon className="h-4 w-4" />
          <span className="sr-only">Map Zoom</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onLayersPanelOpenChange?.(!isLayersPanelOpen)}
          className="pointer-events-auto h-10 w-10 rounded-full border-slate-200 bg-white/95 p-0 text-[10px] font-black uppercase tracking-[0.12em] shadow-xl backdrop-blur hover:bg-slate-50"
          aria-label="Map Layers"
          title="Map Layers"
        >
          <Layers2 className="h-4 w-4" />
          <span className="sr-only">Map Layers</span>
        </Button>
      </div>
    </div>
  );
}

export default RoutePlannerMapLibreShell;
