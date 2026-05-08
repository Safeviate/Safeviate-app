import type { StyleSpecification } from 'maplibre-gl';

const trimUrl = (value: string | undefined) => value?.trim() || '';

const FALLBACK_SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-world-imagery': {
      type: 'raster',
      tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Tiles © Esri',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'esri-world-imagery',
      type: 'raster',
      source: 'esri-world-imagery',
    },
  ],
};

export const MAPLIBRE_BASE_STYLES = {
  light: trimUrl(process.env.NEXT_PUBLIC_MAPLIBRE_LIGHT_STYLE_URL) || 'https://tiles.openfreemap.org/styles/liberty',
  satellite: trimUrl(process.env.NEXT_PUBLIC_MAPLIBRE_SATELLITE_STYLE_URL) || FALLBACK_SATELLITE_STYLE,
} as const;

export const OPENAIP_VECTOR_TILE_URL = trimUrl(process.env.NEXT_PUBLIC_OPENAIP_VECTOR_TILE_URL);
