import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { getOrSetRouteCache, invalidateRouteCache } from '@/lib/server/route-cache';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request);
}

export async function GET(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ vehicles: [], usageRecords: [] }, { status: 200 });
    }

    const [vehicleRows, usageRows] = await getOrSetRouteCache(
      `vehicle-usage:${tenantId}`,
      15_000,
      () => Promise.all([
        prisma.$queryRawUnsafe<{ data: unknown }[]>(
          `SELECT data FROM vehicles WHERE tenant_id = $1 ORDER BY created_at ASC`,
          tenantId
        ),
        prisma.$queryRawUnsafe<{ data: unknown }[]>(
          `SELECT data FROM vehicle_usage_records WHERE tenant_id = $1 ORDER BY created_at DESC`,
          tenantId
        ),
      ])
    );

    return NextResponse.json(
      { vehicles: vehicleRows.map((row) => row.data), usageRecords: usageRows.map((row) => row.data) },
      { status: 200 }
    );
  } catch (error) {
    console.error('[vehicle-usage] fallback to empty data:', error);
    return NextResponse.json({ vehicles: [], usageRecords: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getTenantId(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = body?.action;

    if (action === 'book-out') {
      const vehicleId = body?.vehicleId;
      const bookedOutOdometer = Number(body?.bookedOutOdometer ?? 0);
      const purpose = String(body?.purpose ?? '').trim();
      const destination = String(body?.destination ?? '').trim();
      const notes = String(body?.notes ?? '').trim();

      if (!vehicleId || !purpose) {
        return NextResponse.json({ error: 'Missing vehicle booking payload.' }, { status: 400 });
      }

      const vehicleRows = await prisma.$queryRawUnsafe<{ data: any }[]>(
        `SELECT data FROM vehicles WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        vehicleId,
        tenantId
      );
      const vehicle = vehicleRows[0]?.data;
      if (!vehicle) {
        return NextResponse.json({ error: 'Vehicle not found.' }, { status: 404 });
      }

      const usage = {
        id: randomUUID(),
        vehicleId,
        vehicleRegistrationNumber: vehicle.registrationNumber,
        vehicleLabel: `${vehicle.make} ${vehicle.model}`.trim(),
        status: 'Booked Out',
        bookedOutAt: new Date().toISOString(),
        bookedOutByName: String(body?.bookedOutByName ?? 'Unknown User'),
        bookedOutOdometer,
        purpose,
        destination,
        notes,
        bookedInAt: null,
        bookedInByName: null,
        bookedInOdometer: null,
        returnNotes: '',
      };

      await prisma.$transaction([
        prisma.$executeRawUnsafe(
          `UPDATE vehicles SET data = jsonb_set(data, '{currentOdometer}', to_jsonb($2::numeric), true), updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
          vehicleId,
          bookedOutOdometer,
          tenantId
        ),
        prisma.$executeRawUnsafe(
          `INSERT INTO vehicle_usage_records (id, tenant_id, data, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW(), NOW())`,
          usage.id,
          tenantId,
          JSON.stringify(usage)
        ),
      ]);

      invalidateRouteCache(`vehicle-usage:${tenantId}`);

      return NextResponse.json({ usageRecord: usage }, { status: 200 });
    }

    if (action === 'book-in') {
      const usageId = body?.usageId;
      const bookedInOdometer = Number(body?.bookedInOdometer ?? 0);
      const returnNotes = String(body?.returnNotes ?? '').trim();

      if (!usageId) {
        return NextResponse.json({ error: 'Missing usage record id.' }, { status: 400 });
      }

      const usageRows = await prisma.$queryRawUnsafe<{ data: any }[]>(
        `SELECT data FROM vehicle_usage_records WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        usageId,
        tenantId
      );
      const usage = usageRows[0]?.data;
      if (!usage) {
        return NextResponse.json({ error: 'Usage record not found.' }, { status: 404 });
      }

      const updatedUsage = {
        ...usage,
        status: 'Booked In',
        bookedInAt: new Date().toISOString(),
        bookedInByName: String(body?.bookedInByName ?? 'Unknown User'),
        bookedInOdometer,
        returnNotes,
      };

      await prisma.$transaction([
        prisma.$executeRawUnsafe(
          `UPDATE vehicles SET data = jsonb_set(data, '{currentOdometer}', to_jsonb($2::numeric), true), updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
          usage.vehicleId,
          bookedInOdometer,
          tenantId
        ),
        prisma.$executeRawUnsafe(
          `UPDATE vehicle_usage_records SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
          usageId,
          JSON.stringify(updatedUsage),
          tenantId
        ),
      ]);

      invalidateRouteCache(`vehicle-usage:${tenantId}`);

      return NextResponse.json({ usageRecord: updatedUsage }, { status: 200 });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    console.error('[vehicle-usage] write failed:', error);
    return NextResponse.json({ error: 'Failed to save vehicle usage.' }, { status: 500 });
  }
}
