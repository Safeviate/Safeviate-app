import { authOptions } from '@/auth';
import { isDatabaseAvailable, prisma } from '@/lib/prisma';
import { ensureAttendanceRecordsSchema, ensurePersonnelSchema } from '@/lib/server/bootstrap-db';
import { getTenantIdForRoute } from '@/lib/server/session-tenant';
import { randomUUID } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

async function getTenantId(request: Request) {
  return getTenantIdForRoute(request, { allowDevelopmentFallback: true });
}

async function getAttendanceRows(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
    `SELECT data FROM attendance_records WHERE tenant_id = $1 ORDER BY created_at DESC`,
    tenantId
  );
  return rows.map((row) => row.data);
}

export async function GET(request: Request) {
  try {
    await ensureAttendanceRecordsSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ attendance: [] }, { status: 200 });
    return NextResponse.json({ attendance: await getAttendanceRows(tenantId) }, { status: 200 });
  } catch (error) {
    console.error('[attendance] fallback to empty list:', error);
    return NextResponse.json({ attendance: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureAttendanceRecordsSchema();
    await ensurePersonnelSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const attendance = body?.attendance;
    if (!attendance || typeof attendance !== 'object') {
      return NextResponse.json({ error: 'Invalid attendance payload.' }, { status: 400 });
    }

    const id = typeof attendance.id === 'string' && attendance.id ? attendance.id : randomUUID();
    const data = { ...attendance, id, tenantId };

    await prisma.$executeRawUnsafe(
      `INSERT INTO attendance_records (id, tenant_id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      tenantId,
      JSON.stringify(data)
    );

    return NextResponse.json({ attendance: data }, { status: 200 });
  } catch (error) {
    console.error('[attendance] write failed:', error);
    return NextResponse.json({ error: 'Failed to save attendance record.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureAttendanceRecordsSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const attendance = body?.attendance;
    if (!attendance || typeof attendance !== 'object' || !attendance.id) {
      return NextResponse.json({ error: 'Invalid attendance payload.' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `UPDATE attendance_records SET data = $2::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $3`,
      attendance.id,
      JSON.stringify({ ...attendance, tenantId }),
      tenantId
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[attendance] patch failed:', error);
    return NextResponse.json({ error: 'Failed to update attendance record.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureAttendanceRecordsSchema();
    const tenantId = await getTenantId(request);
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await prisma.$executeRawUnsafe(`DELETE FROM attendance_records WHERE id = $1 AND tenant_id = $2`, id, tenantId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[attendance] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete attendance record.' }, { status: 500 });
  }
}
