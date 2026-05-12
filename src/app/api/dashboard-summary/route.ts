import { authOptions } from '@/auth';
import { isDatabaseAvailable, prisma } from '@/lib/prisma';
import {
  ensureAttendanceRecordsSchema,
  ensureAircraftSchema,
  ensureBookingsSchema,
  ensureCorrectiveActionPlansSchema,
  ensureManagementOfChangeSchema,
  ensureMeetingsSchema,
  ensurePersonnelSchema,
  ensureQualityAuditsSchema,
  ensureRisksSchema,
  ensureSafetyReportsSchema,
} from '@/lib/server/bootstrap-db';
import { getOrSetRouteCache } from '@/lib/server/route-cache';
import { recordSimulationRouteMetric } from '@/lib/server/simulation-telemetry';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

const PERSONNEL_TYPES = new Set(['Personnel', 'External']);
const INSTRUCTOR_TYPES = new Set(['Instructor']);
const STUDENT_TYPES = new Set(['Student']);
const PRIVATE_PILOT_TYPES = new Set(['Private Pilot']);
const EMPTY_SUMMARY = {
  bookings: [],
  aircrafts: [],
  personnel: [],
  instructors: [],
  students: [],
  privatePilots: [],
  mocs: [],
  audits: [],
  reports: [],
  caps: [],
  risks: [],
  attendanceRecords: [],
  meetings: [],
  clockedInCount: 0,
  openAttendanceSessions: 0,
  totalDutyMinutes: 0,
  totalDutyHours: 0,
  studentProgressReports: [],
  studentMilestones: null,
  instructorDuty: [],
};

type SummaryBookingRecord = {
  id?: string;
  bookingNumber?: string | null;
  type?: string | null;
  aircraftId?: string | null;
  date?: string | null;
  status?: string | null;
  instructorId?: string | null;
  studentId?: string | null;
  preFlightData?: {
    hobbs?: number;
    tacho?: number;
    fuelUpliftGallons?: number;
    fuelUpliftLitres?: number;
    oilUplift?: number;
  } | null;
  postFlightData?: {
    hobbs?: number;
    tacho?: number;
    defects?: string;
  } | null;
};

type SummaryPersonRecord = {
    id: string;
    userType: string;
    canBeInstructor: boolean | null;
    canBeStudent: boolean | null;
    canBePIC: boolean | null;
    primaryInstructorId: string | null;
    instructorAssignmentHistory: unknown;
    progressionRecommendation: unknown;
    progressionReviewHistory: unknown;
    userNumber: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department: string | null;
  organizationId: string | null;
  permissions: unknown;
  accessOverrides: unknown;
  contactNumber: string | null;
  isErpIncerfaContact: boolean | null;
  isErpAlerfaContact: boolean | null;
};

const projectBookingSummary = (value: unknown): SummaryBookingRecord => {
  const booking = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const preFlightData =
    booking.preFlightData && typeof booking.preFlightData === 'object'
      ? (booking.preFlightData as Record<string, unknown>)
      : null;
  const postFlightData =
    booking.postFlightData && typeof booking.postFlightData === 'object'
      ? (booking.postFlightData as Record<string, unknown>)
      : null;

  return {
    id: typeof booking.id === 'string' ? booking.id : undefined,
    bookingNumber: typeof booking.bookingNumber === 'string' ? booking.bookingNumber : null,
    type: typeof booking.type === 'string' ? booking.type : null,
    aircraftId: typeof booking.aircraftId === 'string' ? booking.aircraftId : null,
    date: typeof booking.date === 'string' ? booking.date : null,
    status: typeof booking.status === 'string' ? booking.status : null,
    instructorId: typeof booking.instructorId === 'string' ? booking.instructorId : null,
    studentId: typeof booking.studentId === 'string' ? booking.studentId : null,
    preFlightData: preFlightData
      ? {
          hobbs: typeof preFlightData.hobbs === 'number' ? preFlightData.hobbs : undefined,
          tacho: typeof preFlightData.tacho === 'number' ? preFlightData.tacho : undefined,
          fuelUpliftGallons: typeof preFlightData.fuelUpliftGallons === 'number' ? preFlightData.fuelUpliftGallons : undefined,
          fuelUpliftLitres: typeof preFlightData.fuelUpliftLitres === 'number' ? preFlightData.fuelUpliftLitres : undefined,
          oilUplift: typeof preFlightData.oilUplift === 'number' ? preFlightData.oilUplift : undefined,
        }
      : null,
    postFlightData: postFlightData
      ? {
          hobbs: typeof postFlightData.hobbs === 'number' ? postFlightData.hobbs : undefined,
          tacho: typeof postFlightData.tacho === 'number' ? postFlightData.tacho : undefined,
          defects: typeof postFlightData.defects === 'string' ? postFlightData.defects : undefined,
        }
      : null,
  };
};

  const projectPersonSummary = (person: SummaryPersonRecord) => ({
    id: person.id,
    userType: person.userType,
    canBeInstructor: person.canBeInstructor ?? undefined,
    canBeStudent: person.canBeStudent ?? undefined,
    canBePIC: person.canBePIC ?? undefined,
    primaryInstructorId: person.primaryInstructorId ?? undefined,
    instructorAssignmentHistory: Array.isArray(person.instructorAssignmentHistory) ? person.instructorAssignmentHistory : [],
    progressionRecommendation:
      person.progressionRecommendation && typeof person.progressionRecommendation === 'object'
        ? person.progressionRecommendation
        : undefined,
    progressionReviewHistory: Array.isArray(person.progressionReviewHistory) ? person.progressionReviewHistory : [],
    userNumber: person.userNumber ?? undefined,
  firstName: person.firstName,
  lastName: person.lastName,
  email: person.email,
  role: person.role,
  department: person.department ?? undefined,
  organizationId: person.organizationId ?? undefined,
  permissions: Array.isArray(person.permissions) ? person.permissions : [],
  accessOverrides: person.accessOverrides ?? undefined,
  contactNumber: person.contactNumber ?? undefined,
  isErpIncerfaContact: person.isErpIncerfaContact ?? undefined,
  isErpAlerfaContact: person.isErpAlerfaContact ?? undefined,
});

async function safeFindMany<T>(label: string, task: Promise<T[]>): Promise<T[]> {
  try {
    return await task;
  } catch (error) {
    console.error(`[dashboard-summary] fallback for ${label}:`, error);
    return [];
  }
}

async function readTenantConfig(tenantId: string) {
  return getOrSetRouteCache(`dashboard-summary:tenant-config:${tenantId}`, 30_000, async () => {
    try {
      const rows = await prisma.$queryRawUnsafe<{ data: unknown }[]>(
        `SELECT data FROM tenant_configs WHERE tenant_id = $1 LIMIT 1`,
        tenantId
      );
      return (rows[0]?.data as Record<string, unknown> | null) || {};
    } catch (error) {
      console.error('[dashboard-summary] fallback for tenant config:', error);
      return {};
    }
  });
}

export async function GET() {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(EMPTY_SUMMARY, { status: 200 });
    }

    if (!(await isDatabaseAvailable())) {
      return NextResponse.json(EMPTY_SUMMARY, { status: 200 });
    }

    await prisma.tenant.upsert({
      where: { id: 'safeviate' },
      update: { updatedAt: new Date() },
      create: { id: 'safeviate', name: 'Safeviate' },
    });

    const currentUser = await prisma.user.findUnique({
      where: { email },
      select: { tenantId: true },
    });
    tenantId = currentUser?.tenantId || 'safeviate';
    const resolvedTenantId = tenantId;
    const tenantConfig = await readTenantConfig(resolvedTenantId);

    await Promise.all([
      ensureAttendanceRecordsSchema(),
      ensureAircraftSchema(),
      ensureBookingsSchema(),
      ensureManagementOfChangeSchema(),
      ensureMeetingsSchema(),
      ensurePersonnelSchema(),
      ensureQualityAuditsSchema(),
      ensureCorrectiveActionPlansSchema(),
      ensureRisksSchema(),
      ensureSafetyReportsSchema(),
    ]);
    const [
      bookingRows,
      aircraftRows,
      personnelRows,
      mocRows,
      auditRows,
      reportRows,
      capRows,
      riskRows,
      attendanceRows,
      meetingRows,
    ] = await getOrSetRouteCache(`dashboard-summary:v2:${resolvedTenantId}`, 30_000, async () => Promise.all([
      safeFindMany('bookings', prisma.bookingRecord.findMany({ where: { tenantId: resolvedTenantId }, select: { data: true } })),
      safeFindMany('aircrafts', prisma.aircraftRecord.findMany({ where: { tenantId: resolvedTenantId }, select: { data: true } })),
      safeFindMany(
        'personnel',
        prisma.$queryRawUnsafe<SummaryPersonRecord[]>(
          `SELECT
             id,
             user_type AS "userType",
             can_be_instructor AS "canBeInstructor",
             can_be_student AS "canBeStudent",
             can_be_pic AS "canBePIC",
             primary_instructor_id AS "primaryInstructorId",
             instructor_assignment_history AS "instructorAssignmentHistory",
             progression_recommendation AS "progressionRecommendation",
             progression_review_history AS "progressionReviewHistory",
             user_number AS "userNumber",
             first_name AS "firstName",
             last_name AS "lastName",
             email,
             role,
             department,
             organization_id AS "organizationId",
             permissions,
             access_overrides AS "accessOverrides",
             contact_number AS "contactNumber",
             is_erp_incerfa_contact AS "isErpIncerfaContact",
             is_erp_alerfa_contact AS "isErpAlerfaContact"
           FROM personnel
           WHERE tenant_id = $1`,
          resolvedTenantId
        )
      ),
      safeFindMany('management_of_change', prisma.managementOfChange.findMany({ where: { tenantId: resolvedTenantId }, select: { data: true } })),
      safeFindMany('quality_audits', prisma.qualityAudit.findMany({ where: { tenantId: resolvedTenantId }, select: { data: true } })),
      safeFindMany('safety_reports', prisma.safetyReport.findMany({ where: { tenantId: resolvedTenantId }, select: { data: true } })),
      safeFindMany('corrective_action_plans', prisma.correctiveActionPlan.findMany({ where: { tenantId: resolvedTenantId }, select: { data: true } })),
      safeFindMany('risks', prisma.risk.findMany({ where: { tenantId: resolvedTenantId }, select: { data: true } })),
      safeFindMany(
        'attendance_records',
        prisma.$queryRawUnsafe<{ data: unknown }[]>(
          `SELECT data FROM attendance_records WHERE tenant_id = $1 ORDER BY created_at DESC`,
          resolvedTenantId
        )
      ),
      safeFindMany(
        'meetings',
        prisma.$queryRawUnsafe<{ data: unknown }[]>(
          `SELECT data FROM meetings WHERE tenant_id = $1 ORDER BY created_at DESC`,
          resolvedTenantId
        )
      ),
    ]));

    const personnelList: Array<{ id: string; firstName?: string; lastName?: string; userType?: string; canBeInstructor?: boolean | null; canBeStudent?: boolean | null; canBePIC?: boolean | null }> = [];
    const instructorList: Array<{ id: string; firstName?: string; lastName?: string; userType?: string; canBeInstructor?: boolean | null; canBeStudent?: boolean | null; canBePIC?: boolean | null }> = [];
    const studentList: Array<{ id: string; firstName?: string; lastName?: string; userType?: string; canBeInstructor?: boolean | null; canBeStudent?: boolean | null; canBePIC?: boolean | null }> = [];
    const privatePilotList: Array<{ id: string; firstName?: string; lastName?: string; userType?: string; canBeInstructor?: boolean | null; canBeStudent?: boolean | null; canBePIC?: boolean | null }> = [];
    const studentTrainingReports = Array.isArray(tenantConfig['student-progress-reports'])
      ? (tenantConfig['student-progress-reports'] as unknown[])
      : [];
    const studentMilestones = tenantConfig['student-milestones'] ?? null;
    const attendanceRecords = attendanceRows.map((row) => row.data as {
      id: string;
      status?: 'clocked_in' | 'clocked_out';
      clockIn?: string;
      clockOut?: string | null;
    });
    const clockedInCount = attendanceRecords.filter((record) => record.status === 'clocked_in' && !record.clockOut).length;
    const openAttendanceSessions = clockedInCount;
    const totalDutyMinutes = attendanceRecords.reduce((sum, record) => {
      if (!record.clockIn) return sum;
      const start = new Date(record.clockIn).getTime();
      const end = record.clockOut ? new Date(record.clockOut).getTime() : Date.now();
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) return sum;
      return sum + Math.max(0, Math.round((end - start) / 60000));
    }, 0);
    const totalDutyHours = parseFloat((totalDutyMinutes / 60).toFixed(1));
    const summaryPersonnelRows = personnelRows.map(projectPersonSummary);

    for (const row of summaryPersonnelRows) {
      const type = row.userType || 'Personnel';
      if (row.canBeInstructor || INSTRUCTOR_TYPES.has(type)) {
        instructorList.push(row);
      }
      if (row.canBeStudent || row.canBePIC || STUDENT_TYPES.has(type)) {
        studentList.push(row);
      }
      if (PRIVATE_PILOT_TYPES.has(type)) {
        privatePilotList.push(row);
      }
      if (PERSONNEL_TYPES.has(type)) {
        personnelList.push(row);
      } else if (!row.canBeInstructor && !row.canBeStudent && !row.canBePIC && !PRIVATE_PILOT_TYPES.has(type)) {
        personnelList.push(row);
      }
    }

    const instructorDuty = instructorList.map((instructor) => {
      const instructorBookings = bookingRows
        .map((row) => projectBookingSummary(row.data))
        .filter((booking) => booking.instructorId === instructor.id);
      const bookingCount = instructorBookings.length;
      const instructionHours = instructorBookings.reduce((sum, booking) => {
        if (booking.postFlightData?.hobbs === undefined || booking.preFlightData?.hobbs === undefined) return sum;
        return sum + Math.max(0, booking.postFlightData.hobbs - booking.preFlightData.hobbs);
      }, 0);
      const dutyPressure = bookingCount + instructionHours;
      const status = dutyPressure >= 12 ? 'busy' : dutyPressure >= 6 ? 'pressure' : 'ok';

      return {
        id: instructor.id,
        name: `${instructor.firstName || ''} ${instructor.lastName || ''}`.trim() || instructor.id,
        bookingCount,
        instructionHours: parseFloat(instructionHours.toFixed(1)),
        dutyPressure: parseFloat(dutyPressure.toFixed(1)),
        status,
      };
    });

    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'dashboard-summary.GET',
      reads: 11,
      writes: 0,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        bookings: bookingRows.map((row) => projectBookingSummary(row.data)),
        aircrafts: aircraftRows.map((row) => row.data),
        personnel: personnelList,
        instructors: instructorList,
        students: studentList,
        privatePilots: privatePilotList,
        mocs: mocRows.map((row) => row.data),
        audits: auditRows.map((row) => row.data),
        reports: reportRows.map((row) => row.data),
        caps: capRows.map((row) => row.data),
        risks: riskRows.map((row) => row.data),
        attendanceRecords,
        meetings: meetingRows.map((row) => row.data),
        clockedInCount,
        openAttendanceSessions,
        totalDutyMinutes,
        totalDutyHours,
        studentProgressReports: studentTrainingReports,
        studentMilestones,
        instructorDuty,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[dashboard-summary] fallback to empty payload:', error);
    await recordSimulationRouteMetric({
      tenantId,
      routeKey: 'dashboard-summary.GET',
      reads: 0,
      writes: 0,
      durationMs: Date.now() - startedAt,
      isError: true,
    });
    return NextResponse.json(EMPTY_SUMMARY, { status: 200 });
  }
}
