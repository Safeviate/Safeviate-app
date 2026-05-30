import { authOptions } from '@/auth';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { ensureAircraftSchema } from '@/lib/server/bootstrap-db';
import { invalidateRouteCache } from '@/lib/server/route-cache';
import { normalizeAircraftRecord } from '@/lib/server/aircraft-normalize';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAircraftSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ aircraft: null }, { status: 200 });

    const { id } = await params;
    const row = await prisma.aircraftRecord.findFirst({
      where: { id, tenantId },
    });

    return NextResponse.json({ aircraft: normalizeAircraftRecord(row?.data ?? null) }, { status: 200 });
  } catch (error) {
    console.error('[aircraft/[id]] fallback to null:', error);
    return NextResponse.json({ aircraft: null }, { status: 200 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAircraftSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const incoming = body?.aircraft;
    if (!incoming || typeof incoming !== 'object') {
      return NextResponse.json({ error: 'Missing aircraft payload.' }, { status: 400 });
    }

    const data = normalizeAircraftRecord({
      ...incoming,
      id,
      tailNumber: incoming.tailNumber || incoming.registration || incoming.registrationNumber,
      registration: incoming.registration || incoming.tailNumber || incoming.registrationNumber,
      registrationNumber: incoming.registrationNumber || incoming.tailNumber || incoming.registration,
    }) as unknown as Prisma.InputJsonValue;

    await prisma.aircraftRecord.upsert({
      where: { id },
      update: {
        tenantId,
        data,
        updatedAt: new Date(),
      },
      create: {
        id,
        tenantId,
        data,
      },
    });

    invalidateRouteCache(`aircraft:${tenantId}`);
    invalidateRouteCache(`dashboard-summary:${tenantId}`);
    invalidateRouteCache(`schedule-data:${tenantId}`);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[aircraft/[id]] failed to update aircraft:', error);
    return NextResponse.json({ error: 'Failed to update aircraft.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureAircraftSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await prisma.aircraftRecord.deleteMany({ where: { id, tenantId } });
    invalidateRouteCache(`aircraft:${tenantId}`);
    invalidateRouteCache(`dashboard-summary:${tenantId}`);
    invalidateRouteCache(`schedule-data:${tenantId}`);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[aircraft/[id]] failed to delete aircraft:', error);
    return NextResponse.json({ error: 'Failed to delete aircraft.' }, { status: 500 });
  }
}
