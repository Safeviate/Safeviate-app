export type FlightSessionStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface FlightPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
  speedKt?: number | null;
  headingTrue?: number | null;
  timestamp: string;
}

export interface DeviceBinding {
  deviceId: string;
  deviceLabel?: string;
  registeredAt: string;
}

export interface FlightSession {
  id: string;
  pilotId: string;
  pilotName: string;
  aircraftId: string;
  aircraftRegistration: string;
  bookingId?: string;
  plannerRouteId?: string;
  status: FlightSessionStatus;
  deviceId: string;
  deviceLabel?: string;
  activeLegIndex?: number;
  startedAt?: string;
  endedAt?: string;
  updatedAt: string;
  lastPosition?: FlightPosition;
  breadcrumb?: FlightPosition[];
  distanceToNextNm?: number;
  bearingToNext?: number;
  etaToNextWaypointMinutes?: number;
  etaToNextMinutes?: number;
  groundSpeedKt?: number;
  crossTrackErrorNm?: number;
  onCourse?: boolean;
}

export interface ActiveLegState {
  activeLegIndex: number;
  fromWaypoint?: string;
  toWaypoint?: string;
  distanceToNextNm?: number;
  bearingToNext?: number;
  etaToNextWaypointMinutes?: number;
  etaToNextMinutes?: number;
  groundSpeedKt?: number;
  crossTrackErrorNm?: number;
  onCourse?: boolean;
  hasArrived?: boolean;
}

export interface FlightTrackPointData {
  bookingId?: string | null;
  plannerRouteId?: string | null;
  pilotId?: string | null;
  pilotName?: string | null;
  activeLegIndex?: number | null;
  distanceToNextNm?: number | null;
  bearingToNext?: number | null;
  etaToNextWaypointMinutes?: number | null;
  groundSpeedKt?: number | null;
  crossTrackErrorNm?: number | null;
  onCourse?: boolean | null;
  accuracy?: number | null;
  altitude?: number | null;
  speedKt?: number | null;
  headingTrue?: number | null;
}

export interface FlightTrackPoint {
  id: string;
  aircraftId?: string | null;
  aircraftRegistration: string;
  sessionId: string;
  deviceId?: string | null;
  recordedAt: string;
  latitude: number;
  longitude: number;
  data: FlightTrackPointData;
}

export interface FlightTrackHistorySummary {
  aircraftId?: string | null;
  aircraftRegistration: string;
  pointCount: number;
  firstRecordedAt: string;
  lastRecordedAt: string;
}
