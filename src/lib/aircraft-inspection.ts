import type { Aircraft } from '@/types/aircraft';
import type { AircraftInspectionWarningSettings } from '@/types/inspection';
import { getInspectionWarningStyle } from '@/lib/document-expiry';

type WarningStyle = ReturnType<typeof getInspectionWarningStyle>;

export type AircraftInspectionStatus = {
  hoursTo50: number;
  hoursTo100: number;
  fiftyStyle: WarningStyle;
  hundredStyle: WarningStyle;
  isBlocked: boolean;
};

const parseColorChannels = (color: string) => {
  const normalized = color.trim().toLowerCase();

  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    if (hex.length === 3) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }

    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      return { r, g, b };
    }
  }

  const rgbMatch = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: Number.parseInt(rgbMatch[1], 10),
      g: Number.parseInt(rgbMatch[2], 10),
      b: Number.parseInt(rgbMatch[3], 10),
    };
  }

  return null;
};

const isRedWarningColor = (color?: string | null) => {
  if (!color) return false;
  const channels = parseColorChannels(color);
  if (!channels) return false;
  const { r, g, b } = channels;
  return r >= 180 && g <= 110 && b <= 110 && (r - g) >= 40 && (r - b) >= 40;
};

export const getAircraftInspectionStatus = (
  aircraft: Aircraft,
  settings?: AircraftInspectionWarningSettings | null
): AircraftInspectionStatus => {
  const hoursTo50 = Math.max(0, (aircraft.tachoAtNext50Inspection || 0) - (aircraft.currentTacho || 0));
  const hoursTo100 = Math.max(0, (aircraft.tachoAtNext100Inspection || 0) - (aircraft.currentTacho || 0));
  const fiftyStyle = getInspectionWarningStyle(hoursTo50, '50', settings);
  const hundredStyle = getInspectionWarningStyle(hoursTo100, '100', settings);

  return {
    hoursTo50,
    hoursTo100,
    fiftyStyle,
    hundredStyle,
    isBlocked: isRedWarningColor(fiftyStyle?.backgroundColor) || isRedWarningColor(hundredStyle?.backgroundColor),
  };
};

export const isAircraftInspectionBlocked = (
  aircraft: Aircraft,
  settings?: AircraftInspectionWarningSettings | null
) => getAircraftInspectionStatus(aircraft, settings).isBlocked;
