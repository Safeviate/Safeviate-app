import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureFlightSessionBlocksSchema, ensureFlightSessionsSchema, ensureFlightTrackPointsSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

const TRACK_POINT_SAMPLE_MS = 15000;

type FlightSessionPayload = {
  id?: string;
  deviceId?: string;
  aircraftId?: string;
  aircraftRegistration?: string;
  bookingId?: string;
  plannerRouteId?: string;
  pilotId?: string;
  pilotName?: string;
  activeLegIndex?: number;
  distanceToNextNm?: number;
  bearingToNext?: number;
  etaToNextWaypointMinutes?: number;
  etaToNextMinutes?: number;
  groundSpeedKt?: number;
  crossTrackErrorNm?: number;
  onCourse?: boolean;
  lastPosition?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    altitude?: number | null;
    speedKt?: number | null;
    headingTrue?: number | null;
    timestamp?: string;
  } | null;
};

async function saveTrackPointIfDue(tenantId: string, session: FlightSessionPayload & { id: string }) {
  const position = session.lastPosition;
  if (
    !position ||
    typeof position.latitude !== 'number' ||
    typeof position.longitude !== 'number' ||
    !session.aircraftRegistration
  ) {
    return;
  }

  const recordedAt = position.timestamp ? new Date(position.timestamp) : new Date();
  if (Number.isNaN(recordedAt.getTime())) return;

  const latestRows = await prisma.$queryRawUnsafe<{ recorded_at: Date | string }[]>(
    `SELECT recorded_at
       FROM active_flight_track_points
      WHERE tenant_id = $1
        AND session_id = $2
      ORDER BY recorded_at DESC
      LIMIT 1`,
    tenantId,
    session.id
  );

  const latestRecordedAtRaw = latestRows[0]?.recorded_at;
  const latestRecordedAt = latestRecordedAtRaw ? new Date(latestRecordedAtRaw) : null;
  if (latestRecordedAt && !Number.isNaN(latestRecordedAt.getTime())) {
    const elapsedMs = recordedAt.getTime() - latestRecordedAt.getTime();
    if (elapsedMs < TRACK_POINT_SAMPLE_MS) {
      return;
    }
  }

  const pointData = {
    bookingId: session.bookingId || null,
    plannerRouteId: session.plannerRouteId || null,
    pilotId: session.pilotId || null,
    pilotName: session.pilotName || null,
    activeLegIndex: session.activeLegIndex ?? null,
    distanceToNextNm: session.distanceToNextNm ?? null,
    bearingToNext: session.bearingToNext ?? null,
    etaToNextWaypointMinutes: session.etaToNextWaypointMinutes ?? session.etaToNextMinutes ?? null,
    groundSpeedKt: session.groundSpeedKt ?? position.speedKt ?? null,
    crossTrackErrorNm: session.crossTrackErrorNm ?? null,
    onCourse: session.onCourse ?? null,
    accuracy: position.accuracy ?? null,
    altitude: position.altitude ?? null,
    speedKt: position.speedKt ?? null,
    headingTrue: position.headingTrue ?? null,
  };

  await prisma.$executeRawUnsafe(
    `INSERT INTO active_flight_track_points (
        id,
        tenant_id,
        aircraft_id,
        aircraft_registration,
        session_id,
        device_id,
        recorded_at,
        latitude,
        longitude,
        data,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW(), NOW()
      )`,
    randomUUID(),
    tenantId,
    session.aircraftId || null,
    session.aircraftRegistration,
    session.id,
    session.deviceId || null,
    recordedAt.toISOString(),
    position.latitude,
    position.longitude,
    JSON.stringify(pointData)
  );
}

async function getTenantId() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return process.env.NODE_ENV === 'development' ? 'safeviate' : null;
  }
  const currentUser = await prisma.user.findUnique({ where: { email }, select: { tenantId: true } });
  return currentUser?.tenantId || 'safeviate';
}

export async function GET() {
  try {
    await ensureFlightSessionBlocksSchema();
    await ensureFlightSessionsSchema();
    await ensureFlightTrackPointsSchema();
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ sessions: [] }, { status: 200 });
    const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
      `SELECT data FROM active_flight_sessions WHERE tenant_id = $1 AND id NOT IN (SELECT id FROM active_flight_session_blocks WHERE tenant_id = $1) ORDER BY created_at DESC`,
      tenantId
    );
    return NextResponse.json({ sessions: rows.map((row) => row.data) }, { status: 200 });
  } catch (error) {
    console.error('[flight-sessions] fallback to empty list:', error);
    return NextResponse.json({ sessions: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureFlightSessionBlocksSchema();
    await ensureFlightSessionsSchema();
    await ensureFlightTrackPointsSchema();
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    const session = body?.session;
    if (!session || typeof session !== 'object') return NextResponse.json({ error: 'Invalid session payload.' }, { status: 400 });
    const id = session.id || randomUUID();
    const blocked = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM active_flight_session_blocks WHERE tenant_id = $1 AND id = $2`,
      tenantId,
      id
    );
    if (blocked.length > 0) {
      return NextResponse.json({ error: 'Session has been ended by fleet operations.' }, { status: 423 });
    }
    const data = { ...session, id };
    await prisma.$executeRawUnsafe(
      `INSERT INTO active_flight_sessions (id, tenant_id, data, created_at, updated_at) VALUES ($1, $2, $3::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      tenantId,
      JSON.stringify(data)
    );
    await saveTrackPointIfDue(tenantId, data as FlightSessionPayload & { id: string });
    return NextResponse.json({ session: data }, { status: 200 });
  } catch (error) {
    console.error('[flight-sessions] write failed:', error);
    return NextResponse.json({ error: 'Failed to save flight session.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureFlightSessionBlocksSchema();
    await ensureFlightSessionsSchema();
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    const session = body?.session;
    if (!session || typeof session !== 'object' || !session.id) return NextResponse.json({ error: 'Invalid session payload.' }, { status: 400 });
    await prisma.$executeRawUnsafe(
      `UPDATE active_flight_sessions SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
      session.id,
      JSON.stringify({ ...session, tenantId }),
      tenantId
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[flight-sessions] patch failed:', error);
    return NextResponse.json({ error: 'Failed to update flight session.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureFlightSessionBlocksSchema();
    await ensureFlightSessionsSchema();
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const mode = searchParams.get('mode') || 'block';

    if (mode === 'unblock') {
      await prisma.$executeRawUnsafe(`DELETE FROM active_flight_session_blocks WHERE id = $1 AND tenant_id = $2`, id, tenantId);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO active_flight_session_blocks (id, tenant_id, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
      id,
      tenantId
    );
    await prisma.$executeRawUnsafe(`DELETE FROM active_flight_sessions WHERE id = $1 AND tenant_id = $2`, id, tenantId);
    return NextResponse.json({ ok: true, blocked: true }, { status: 200 });
  } catch (error) {
    console.error('[flight-sessions] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete flight session.' }, { status: 500 });
  }
}
