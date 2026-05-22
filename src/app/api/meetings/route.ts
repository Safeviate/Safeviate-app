import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureMeetingsSchema, ensurePersonnelSchema } from '@/lib/server/bootstrap-db';
import { sendMeetingEmail } from '@/lib/server/mail';
import { getTenantIdFromSession } from '@/lib/server/session-tenant';
import { recordSimulationRouteMetric } from '@/lib/server/simulation-telemetry';
import type { MeetingRecordData } from '@/types/meeting';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

type MeetingAction = 'save' | 'sendAgenda' | 'sendMinutes';

async function getTenantContext(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  const tenantId = await getTenantIdFromSession(request);
  if (!tenantId) return null;

  const currentUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!currentUser) return null;

  return {
    ...currentUser,
    tenantId,
  };
}

function toMeetingRecord(row: { data: unknown; updated_at?: string; created_at?: string }): MeetingRecordData {
  const data = (row.data as Record<string, unknown>) || {};
  return {
    id: String(data.id || randomUUID()),
    meetingNumber: String(data.meetingNumber || 'MTG-0001'),
    title: String(data.title || 'Untitled Meeting'),
    meetingType: (data.meetingType as MeetingRecordData['meetingType']) || 'General',
    meetingDate: String(data.meetingDate || new Date().toISOString()),
    startTime: String(data.startTime || '09:00'),
    endTime: String(data.endTime || '10:00'),
    location: String(data.location || 'Main Board Room'),
    description: typeof data.description === 'string' ? data.description : undefined,
    inviteeIds: Array.isArray(data.inviteeIds) ? data.inviteeIds.filter((value): value is string => typeof value === 'string') : [],
    agendaItems: Array.isArray(data.agendaItems)
      ? data.agendaItems.map((item) => ({
          id: String((item as Record<string, unknown>).id || randomUUID()),
          title: String((item as Record<string, unknown>).title || 'Agenda item'),
          notes: typeof (item as Record<string, unknown>).notes === 'string' ? String((item as Record<string, unknown>).notes) : undefined,
        }))
      : [],
    agendaNotes: typeof data.agendaNotes === 'string' ? data.agendaNotes : undefined,
    agendaSentAt: typeof data.agendaSentAt === 'string' ? data.agendaSentAt : null,
    minutes: typeof data.minutes === 'string' ? data.minutes : undefined,
    minutesSentAt: typeof data.minutesSentAt === 'string' ? data.minutesSentAt : null,
    actionItems: Array.isArray(data.actionItems)
      ? data.actionItems.map((item) => ({
          id: String((item as Record<string, unknown>).id || randomUUID()),
          description: String((item as Record<string, unknown>).description || 'Action item'),
          assigneeId: String((item as Record<string, unknown>).assigneeId || ''),
          assigneeName: typeof (item as Record<string, unknown>).assigneeName === 'string' ? String((item as Record<string, unknown>).assigneeName) : undefined,
          dueDate: String((item as Record<string, unknown>).dueDate || new Date().toISOString()),
          status: ((item as Record<string, unknown>).status as MeetingRecordData['actionItems'][number]['status']) || 'Open',
        }))
      : [],
    status: (data.status as MeetingRecordData['status']) || 'Scheduled',
    createdById: typeof data.createdById === 'string' ? data.createdById : undefined,
    createdByName: typeof data.createdByName === 'string' ? data.createdByName : undefined,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  };
}

async function loadPersonnelMap(tenantId: string) {
  const rows = await prisma.personnel.findMany({
    where: { tenantId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

async function getMeetingRows(tenantId: string) {
  const rows = await prisma.$queryRawUnsafe<{ data: unknown; updated_at: string; created_at: string }[]>(
    `SELECT data, updated_at, created_at FROM meetings WHERE tenant_id = $1 ORDER BY created_at DESC`,
    tenantId
  );
  return rows;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    await ensureMeetingsSchema();
    const context = await getTenantContext(request);
    if (!context) {
      return NextResponse.json({ meetings: [] }, { status: 200 });
    }
    tenantId = context.tenantId;

    const rows = await getMeetingRows(context.tenantId);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'meetings.GET',
      reads: 2,
      writes: 0,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ meetings: rows.map(toMeetingRecord) }, { status: 200 });
  } catch (error) {
    console.error('[meetings] fallback to empty list:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'meetings.GET',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ meetings: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    await ensureMeetingsSchema();
    await ensurePersonnelSchema();
    const context = await getTenantContext(request);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    tenantId = context.tenantId;

    const payload = await request.json().catch(() => ({}));
    const meeting = payload?.meeting as MeetingRecordData | undefined;
    if (!meeting || typeof meeting !== 'object') {
      return NextResponse.json({ error: 'Invalid meeting payload.' }, { status: 400 });
    }

    const id = meeting.id || randomUUID();
    const data: MeetingRecordData = {
      ...meeting,
      id,
      createdById: meeting.createdById || context.id,
      createdByName: meeting.createdByName || `${context.firstName || ''} ${context.lastName || ''}`.trim() || context.id,
      updatedAt: new Date().toISOString(),
      agendaItems: Array.isArray(meeting.agendaItems) ? meeting.agendaItems : [],
      actionItems: Array.isArray(meeting.actionItems) ? meeting.actionItems : [],
      inviteeIds: Array.isArray(meeting.inviteeIds) ? meeting.inviteeIds : [],
    };

    await prisma.$executeRawUnsafe(
      `INSERT INTO meetings (id, tenant_id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      id,
      context.tenantId,
      JSON.stringify(data)
    );

    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'meetings.POST',
      reads: 0,
      writes: 1,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ meeting: data }, { status: 200 });
  } catch (error) {
    console.error('[meetings] create failed:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'meetings.POST',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json({ error: 'Failed to save meeting.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureMeetingsSchema();
    await ensurePersonnelSchema();
    const context = await getTenantContext(request);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const meeting = payload?.meeting as MeetingRecordData | undefined;
    const action = (payload?.action as MeetingAction | undefined) || 'save';
    if (!meeting || typeof meeting !== 'object' || !meeting.id) {
      return NextResponse.json({ error: 'Invalid meeting payload.' }, { status: 400 });
    }

    const rows = await loadPersonnelMap(context.tenantId);
    const storedData: MeetingRecordData = {
      ...meeting,
      updatedAt: new Date().toISOString(),
      inviteeIds: Array.isArray(meeting.inviteeIds) ? meeting.inviteeIds : [],
      agendaItems: Array.isArray(meeting.agendaItems) ? meeting.agendaItems : [],
      actionItems: Array.isArray(meeting.actionItems) ? meeting.actionItems : [],
    };

    if (action === 'sendAgenda' || action === 'sendMinutes') {
      const invitees = storedData.inviteeIds
        .map((id) => rows.get(id))
        .filter((person) => Boolean(person));

      const dateLabel = new Date(storedData.meetingDate).toLocaleDateString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timeLabel = `${storedData.startTime} - ${storedData.endTime}`;
      const agendaBody = storedData.agendaItems.length
        ? storedData.agendaItems.map((item, index) => `${index + 1}. ${item.title}${item.notes ? ` - ${item.notes}` : ''}`).join('\n')
        : storedData.agendaNotes || 'No agenda items were added.';
      const minutesBody = storedData.minutes || 'No minutes notes were captured.';
      const actionBody = storedData.actionItems.length
        ? storedData.actionItems
            .map((item, index) => `${index + 1}. ${item.description} - ${item.assigneeName || item.assigneeId} - due ${item.dueDate}`)
            .join('\n')
        : 'No follow-up actions were recorded.';

      await Promise.all(
        invitees.map(async (person) => {
          if (!person?.email) return null;
          const name = `${person.firstName || ''} ${person.lastName || ''}`.trim() || person.email;
          return sendMeetingEmail({
            email: person.email,
            name,
            subject:
              action === 'sendAgenda'
                ? `Agenda: ${storedData.title}`
                : `Minutes: ${storedData.title}`,
            title: storedData.title,
            dateLabel,
            timeLabel,
            location: storedData.location,
            body:
              action === 'sendAgenda'
                ? `The agenda for ${storedData.title} is below.\n\n${agendaBody}`
                : `The minutes for ${storedData.title} are below.\n\n${minutesBody}\n\nAction items:\n${actionBody}`,
            actionLabel: action === 'sendAgenda' ? 'Open Agenda' : 'Open Minutes',
          });
        })
      );

      if (action === 'sendAgenda') {
        storedData.agendaSentAt = new Date().toISOString();
      } else {
        storedData.minutesSentAt = new Date().toISOString();
      }
    }

    await prisma.$executeRawUnsafe(
      `UPDATE meetings SET data = $3::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      storedData.id,
      context.tenantId,
      JSON.stringify(storedData)
    );

    return NextResponse.json({ meeting: storedData }, { status: 200 });
  } catch (error) {
    console.error('[meetings] patch failed:', error);
    return NextResponse.json({ error: 'Failed to update meeting.' }, { status: 500 });
  }
}
