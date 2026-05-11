import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureFlightTrackPointsSchema } from '@/lib/server/bootstrap-db';
import type { FlightTrackHistorySummary, FlightTrackPoint, FlightTrackPointData } from '@/types/flight-session';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantId() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return process.env.NODE_ENV === 'development' ? 'safeviate' : null;
  }
  const currentUser = await prisma.user.findUnique({ where: { email }, select: { tenantId: true } });
  return currentUser?.tenantId || 'safeviate';
}

export async function GET(request: Request) {
  try {
    await ensureFlightTrackPointsSchema();
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ summaries: [], points: [] }, { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const aircraftRegistration = searchParams.get('aircraftRegistration')?.trim() || '';
    const hoursRaw = Number(searchParams.get('hours') || '6');
    const hours = Number.isFinite(hoursRaw) ? Math.min(Math.max(hoursRaw, 1), 168) : 6;

    if (!aircraftRegistration) {
      const summaryRows = await prisma.$queryRawUnsafe<
        Array<{
          aircraft_registration: string;
          aircraft_id: string | null;
          point_count: bigint | number | string;
          first_recorded_at: Date | string;
          last_recorded_at: Date | string;
        }>
      >(
        `SELECT
            aircraft_registration,
            MAX(aircraft_id) AS aircraft_id,
            COUNT(*) AS point_count,
            MIN(recorded_at) AS first_recorded_at,
            MAX(recorded_at) AS last_recorded_at
          FROM active_flight_track_points
         WHERE tenant_id = $1
         GROUP BY aircraft_registration
         ORDER BY MAX(recorded_at) DESC
         LIMIT 100`,
        tenantId
      );

      const summaries: FlightTrackHistorySummary[] = summaryRows.map((row) => ({
        aircraftId: row.aircraft_id,
        aircraftRegistration: row.aircraft_registration,
        pointCount: Number(row.point_count),
        firstRecordedAt: new Date(row.first_recorded_at).toISOString(),
        lastRecordedAt: new Date(row.last_recorded_at).toISOString(),
      }));

      return NextResponse.json({ summaries }, { status: 200 });
    }

    const pointRows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        aircraft_id: string | null;
        aircraft_registration: string;
        session_id: string;
        device_id: string | null;
        recorded_at: Date | string;
        latitude: number;
        longitude: number;
        data: FlightTrackPointData | string | null;
      }>
    >(
      `SELECT
          id,
          aircraft_id,
          aircraft_registration,
          session_id,
          device_id,
          recorded_at,
          latitude,
          longitude,
          data
        FROM active_flight_track_points
       WHERE tenant_id = $1
         AND aircraft_registration = $2
         AND recorded_at >= NOW() - ($3::text || ' hours')::interval
       ORDER BY recorded_at ASC
       LIMIT 2000`,
      tenantId,
      aircraftRegistration,
      `${hours}`
    );

    const points: FlightTrackPoint[] = pointRows.map((row) => ({
      id: row.id,
      aircraftId: row.aircraft_id,
      aircraftRegistration: row.aircraft_registration,
      sessionId: row.session_id,
      deviceId: row.device_id,
      recordedAt: new Date(row.recorded_at).toISOString(),
      latitude: row.latitude,
      longitude: row.longitude,
      data:
        typeof row.data === 'string'
          ? ((JSON.parse(row.data) as FlightTrackPointData | null) ?? {})
          : ((row.data as FlightTrackPointData | null) ?? {}),
    }));

    return NextResponse.json({ points }, { status: 200 });
  } catch (error) {
    console.error('[flight-sessions/history] fallback to empty response:', error);
    return NextResponse.json({ summaries: [], points: [] }, { status: 200 });
  }
}
