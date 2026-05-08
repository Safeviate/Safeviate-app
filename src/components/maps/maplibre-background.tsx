'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { useMap } from 'react-leaflet';

import { MAPLIBRE_BASE_STYLES, OPENAIP_VECTOR_TILE_URL } from '@/lib/maplibre-map-config';

type MapLibreBackgroundProps = {
  variant?: 'light' | 'satellite';
};

const STYLES = MAPLIBRE_BASE_STYLES;

const addPointImage = (map: MapLibreMap, id: string, fill: string) =>
  new Promise<void>((resolve) => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="8" fill="${fill}" stroke="white" stroke-width="3" />
      </svg>
    `;
    const image = new Image();
    image.onload = () => {
      if (!map.hasImage(id)) {
        map.addImage(id, image);
      }
      resolve();
    };
    image.onerror = () => resolve();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

const addOpenAipVectorLayers = async (map: MapLibreMap) => {
  if (!OPENAIP_VECTOR_TILE_URL || map.getSource('openaip')) return;

  map.addSource('openaip', {
    type: 'vector',
    url: OPENAIP_VECTOR_TILE_URL,
  });

  await Promise.all([
    addPointImage(map, 'openaip-airport-point', '#2563eb'),
    addPointImage(map, 'openaip-navaid-point', '#7c3aed'),
    addPointImage(map, 'openaip-reporting-point', '#d97706'),
  ]);

  if (map.getLayer('openaip-airspaces-ctr')) return;

  const airportLabelLayout: any = {
    'text-field': ['coalesce', ['get', 'icaoCode'], ['get', 'identifier'], ['get', 'name']],
    'text-rotation-alignment': 'viewport',
    'text-pitch-alignment': 'viewport',
    'text-size': 11,
    'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
    'text-offset': [0, 1.1],
  };

  map.addLayer({
    id: 'openaip-airspaces-ctr',
    type: 'fill',
    source: 'openaip',
    'source-layer': 'airspaces',
    filter: ['any', ['==', ['get', 'icaoClass'], 1], ['==', ['get', 'type'], 5], ['==', ['get', 'type'], 10]],
    paint: {
      'fill-color': '#dc2626',
      'fill-opacity': 0.14,
      'fill-outline-color': '#b91c1c',
    },
  } as any);
  map.addLayer({
    id: 'openaip-airspaces-military',
    type: 'fill',
    source: 'openaip',
    'source-layer': 'airspaces',
    filter: ['any', ['==', ['get', 'type'], 1], ['==', ['get', 'type'], 33], ['match', ['downcase', ['get', 'name']], ['military', 'shooting', 'weapons', 'range', 'moa', 'operations area'], true, false]],
    paint: {
      'fill-color': '#ef4444',
      'fill-opacity': 0.14,
      'fill-outline-color': '#b91c1c',
    },
  } as any);
  map.addLayer({
    id: 'openaip-airspaces-training',
    type: 'fill',
    source: 'openaip',
    'source-layer': 'airspaces',
    filter: ['any', ['==', ['get', 'type'], 2], ['match', ['downcase', ['get', 'name']], ['training', 'general flying', 'flying tng', 'pje'], true, false]],
    paint: {
      'fill-color': '#f59e0b',
      'fill-opacity': 0.14,
      'fill-outline-color': '#d97706',
    },
  } as any);
  map.addLayer({
    id: 'openaip-airspaces-gliding',
    type: 'fill',
    source: 'openaip',
    'source-layer': 'airspaces',
    filter: ['any', ['==', ['get', 'type'], 21], ['match', ['downcase', ['get', 'name']], ['gliding', 'glider'], true, false]],
    paint: {
      'fill-color': '#22c55e',
      'fill-opacity': 0.14,
      'fill-outline-color': '#16a34a',
    },
  } as any);
  map.addLayer({
    id: 'openaip-airspaces-hang',
    type: 'fill',
    source: 'openaip',
    'source-layer': 'airspaces',
    filter: ['match', ['downcase', ['get', 'name']], ['hang gliding', 'hanggliding', 'hang'], true, false],
    paint: {
      'fill-color': '#a855f7',
      'fill-opacity': 0.14,
      'fill-outline-color': '#9333ea',
    },
  } as any);
  map.addLayer({
    id: 'openaip-airspaces-class-e',
    type: 'fill',
    source: 'openaip',
    'source-layer': 'airspaces',
    filter: ['==', ['get', 'icaoClass'], 6],
    paint: {
      'fill-color': '#3b82f6',
      'fill-opacity': 0.12,
      'fill-outline-color': '#2563eb',
    },
  } as any);
  map.addLayer({
    id: 'openaip-airspaces-class-f',
    type: 'fill',
    source: 'openaip',
    'source-layer': 'airspaces',
    filter: ['==', ['get', 'icaoClass'], 7],
    paint: {
      'fill-color': '#f97316',
      'fill-opacity': 0.12,
      'fill-outline-color': '#ea580c',
    },
  } as any);
  map.addLayer({
    id: 'openaip-airspaces-class-g',
    type: 'fill',
    source: 'openaip',
    'source-layer': 'airspaces',
    filter: ['==', ['get', 'icaoClass'], 8],
    paint: {
      'fill-color': '#14b8a6',
      'fill-opacity': 0.12,
      'fill-outline-color': '#0f766e',
    },
  } as any);
  map.addLayer({
    id: 'openaip-airspace-labels',
    type: 'symbol',
    source: 'openaip',
    'source-layer': 'airspaces',
    layout: {
      ...airportLabelLayout,
      'symbol-placement': 'point',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.2,
    },
  } as any);
  map.addLayer({
    id: 'openaip-airports',
    type: 'symbol',
    source: 'openaip',
    'source-layer': 'airports',
    layout: {
      'icon-image': 'openaip-airport-point',
      'icon-size': 0.8,
      'icon-rotation-alignment': 'viewport',
      'icon-pitch-alignment': 'viewport',
      'text-field': ['coalesce', ['get', 'icaoCode'], ['get', 'identifier'], ['get', 'name']],
      'text-offset': [0, 1.15],
      'text-size': 11,
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
      'symbol-placement': 'point',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.2,
    },
  } as any);
  map.addLayer({
    id: 'openaip-navaids',
    type: 'symbol',
    source: 'openaip',
    'source-layer': 'navaids',
    layout: {
      'icon-image': 'openaip-navaid-point',
      'icon-size': 0.75,
      'icon-rotation-alignment': 'viewport',
      'icon-pitch-alignment': 'viewport',
      'text-field': ['coalesce', ['get', 'identifier'], ['get', 'name']],
      'text-offset': [0, 1.15],
      'text-size': 11,
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
      'symbol-placement': 'point',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.2,
    },
  } as any);
  map.addLayer({
    id: 'openaip-reporting-points',
    type: 'symbol',
    source: 'openaip',
    'source-layer': 'reporting-points',
    layout: {
      'icon-image': 'openaip-reporting-point',
      'icon-size': 0.72,
      'icon-rotation-alignment': 'viewport',
      'icon-pitch-alignment': 'viewport',
      'text-field': ['coalesce', ['get', 'identifier'], ['get', 'name']],
      'text-offset': [0, 1.15],
      'text-size': 10,
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
      'symbol-placement': 'point',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.2,
    },
  } as any);
  map.addLayer({
    id: 'openaip-obstacles',
    type: 'circle',
    source: 'openaip',
    'source-layer': 'obstacles',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 5],
      'circle-color': '#ef4444',
      'circle-opacity': 0.8,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#ffffff',
    },
  } as any);
};

export function MapLibreBackground({ variant = 'light' }: MapLibreBackgroundProps) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapLibreRef = useRef<MapLibreMap | null>(null);
  const style = STYLES[variant];

  useEffect(() => {
    if (!containerRef.current || mapLibreRef.current) return;

    const mapLibre = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [map.getCenter().lng, map.getCenter().lat],
      zoom: map.getZoom(),
      pitch: 0,
      bearing: 0,
      interactive: false,
      attributionControl: false,
      dragPan: false,
      dragRotate: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      scrollZoom: false,
      touchZoomRotate: false,
      cooperativeGestures: true,
    });

    mapLibreRef.current = mapLibre;

    const syncCamera = () => {
      const center = map.getCenter();
      mapLibre.jumpTo({
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        pitch: 0,
        bearing: 0,
      });
    };

    const handleResize = () => {
      mapLibre.resize();
    };

    map.whenReady(syncCamera);
    map.on('move', syncCamera);
    map.on('zoom', syncCamera);
    map.on('resize', handleResize);

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    mapLibre.on('load', () => {
      syncCamera();
      mapLibre.resize();
      void addOpenAipVectorLayers(mapLibre);
    });

    return () => {
      resizeObserver.disconnect();
      map.off('move', syncCamera);
      map.off('zoom', syncCamera);
      map.off('resize', handleResize);
      mapLibre.remove();
      mapLibreRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!mapLibreRef.current) return;
    mapLibreRef.current.setStyle(style);
    void addOpenAipVectorLayers(mapLibreRef.current);
  }, [style]);

  return <div ref={containerRef} className="pointer-events-none absolute inset-0 z-0" aria-hidden="true" />;
}
