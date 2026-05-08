'use client';

import { ActiveFlightLiveMap } from '@/components/active-flight/active-flight-live-map';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogClose } from '@/components/ui/dialog';
import { FlightTelemetryTable } from '@/components/active-flight/flight-telemetry-table';
import type { Booking, NavlogLeg } from '@/types/booking';
import type { ActiveLegState, FlightPosition } from '@/types/flight-session';
import { cn } from '@/lib/utils';

type FullScreenFlightLayoutProps = {
  booking: Booking | null;
  legs: NavlogLeg[];
  position: FlightPosition | null;
  aircraftRegistration?: string;
  activeLegIndex?: number;
  activeLegState?: ActiveLegState | null;
  heading: number | null;
  speed: number | null;
  altitude: number | null;
  trailPoints: number;
  syncStatusLabel: string;
  syncStatusClassName: string;
  savedDeviceLabel: string;
  permissionState: string;
  isWatching: boolean;
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

export function FullScreenFlightLayout({
  booking,
  legs,
  position,
  aircraftRegistration,
  activeLegIndex,
  activeLegState,
  heading,
  speed,
  altitude,
  trailPoints,
  syncStatusLabel,
  syncStatusClassName,
  savedDeviceLabel,
  permissionState,
  isWatching,
}: FullScreenFlightLayoutProps) {
  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-3 md:p-5">
      <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="space-y-1">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Full Flight Tracking View</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border border-slate-200 bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-800 hover:bg-slate-100">
                {aircraftRegistration || 'Aircraft not selected'}
              </Badge>
              <Badge className={cn('px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]', syncStatusClassName)}>
                {syncStatusLabel}
              </Badge>
            </div>
          </div>
          <DialogClose asChild>
            <Button variant="outline" className="border-slate-200 bg-white font-black uppercase text-slate-800 hover:bg-slate-50">
              Menu
            </Button>
          </DialogClose>
        </div>

        <div className="grid flex-1 gap-3 xl:min-h-[calc(100dvh-8.5rem)] xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.6fr)]">
          <div className="flex min-h-0 flex-col gap-3">
            <FlightTelemetryTable
              heading={heading != null ? `${heading.toFixed(0)}°` : 'N/A'}
              speed={speed != null ? `${speed.toFixed(0)} kt` : 'N/A'}
              altitude={altitude != null ? `${Math.round(altitude)} m` : 'N/A'}
              trail={`${trailPoints} pts`}
            />
            <div className="fullscreen-lite-map flex-1 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 xl:min-h-0">
              <ActiveFlightLiveMap
                booking={booking}
                legs={legs}
                position={position}
                aircraftRegistration={aircraftRegistration}
                activeLegIndex={activeLegIndex}
                activeLegState={activeLegState}
                showRouteDrawer={false}
              />
            </div>
          </div>

          <div className="space-y-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-black uppercase tracking-widest text-slate-900">Active Leg Status</p>
              <div className="mt-3 space-y-3 text-sm">
                {activeLegState ? (
                  <>
                    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Current Leg</p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {(activeLegState.fromWaypoint || 'N/A')} → {(activeLegState.toWaypoint || 'N/A')}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                      <StatCard
                        label="Distance"
                        value={activeLegState.distanceToNextNm != null ? `${activeLegState.distanceToNextNm.toFixed(1)} NM` : 'N/A'}
                      />
                      <StatCard
                        label="Bearing"
                        value={activeLegState.bearingToNext != null ? `${activeLegState.bearingToNext.toFixed(0)}°` : 'N/A'}
                      />
                      <StatCard
                        label="XTK"
                        value={activeLegState.crossTrackErrorNm != null ? `${activeLegState.crossTrackErrorNm.toFixed(1)} NM` : 'N/A'}
                      />
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                    Select a booking and start tracking to compute the active leg.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-black uppercase tracking-widest text-slate-900">Live Device Coordinates</p>
              <div className="mt-3 space-y-3 text-sm">
                {position ? (
                  <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3 text-xs font-mono font-bold text-slate-900">
                    {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                    Start tracking to stream coordinates.
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <StatCard label="Device" value={savedDeviceLabel || 'Unnamed device'} />
                  <StatCard label="Permission" value={`${permissionState} · ${isWatching ? 'watching' : 'idle'}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        @media (min-width: 1280px) {
          .fullscreen-lite-map .nose-up-map,
          .fullscreen-lite-map .leaflet-container {
            height: 620px !important;
            min-height: 620px !important;
          }
        }
      `}</style>
    </div>
  );
}
