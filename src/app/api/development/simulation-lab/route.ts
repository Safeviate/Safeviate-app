import { authOptions } from '@/auth';
import { Prisma } from '@/generated/prisma/client';
import { isDatabaseAvailable, prisma } from '@/lib/prisma';
import {
  ensureAircraftSchema,
  ensureBookingsSchema,
  ensureCorrectiveActionPlansSchema,
  ensureMeetingsSchema,
  ensurePersonnelSchema,
  ensureQualityAuditsSchema,
  ensureRisksSchema,
  ensureSafetyReportsSchema,
  ensureTenantConfigSchema,
} from '@/lib/server/bootstrap-db';
import { ACTIVE_SIMULATION_RUN_KEY, listSimulationRouteMetrics, recordSimulationRouteMetric } from '@/lib/server/simulation-telemetry';
import type { Booking } from '@/types/booking';
import type { QualityAudit, QualityFinding, CorrectiveActionPlan } from '@/types/quality';
import type { Risk } from '@/types/risk';
import type { SafetyReport } from '@/types/safety-report';
import type { StudentMilestoneSettings, StudentProgressReport } from '@/types/training';
import { TRAINING_COMPETENCY_OPTIONS } from '@/lib/training-competencies';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

const SETTINGS_KEY = 'simulation-lab-settings';
const RUNS_KEY = 'simulation-lab-runs';
const CUSTOM_PRESETS_KEY = 'simulation-lab-custom-presets';
const REPORTS_KEY = 'student-progress-reports';
const MILESTONES_KEY = 'student-milestones';

type SimulationPreset = {
  id: string;
  label: string;
  settings: SimulationLabSettings;
  isCustom?: boolean;
};

type SimulationLabSettings = {
  name: string;
  note: string;
  autoExerciseEnabled: boolean;
  autoExerciseProfile: 'core' | 'extended' | 'full';
  studentCount: number;
  instructorCount: number;
  personnelCount: number;
  aircraftCount: number;
  vehicleCount: number;
  briefingRoomCount: number;
  simulationDays: number;
  flightBookingsPerDay: number;
  roomBookingsPerDay: number;
  vehicleBookingsPerDay: number;
  studentReportsPerStudent: number;
  meetingCount: number;
  safetyReportCount: number;
  qualityAuditCount: number;
};

type SimulationRunSummary = {
  id: string;
  label: string;
  note: string;
  tenantId: string;
  createdAt: string;
  generatedBy: string;
  settings: SimulationLabSettings;
  writes: {
    users: number;
    personnel: number;
    aircraft: number;
    vehicles: number;
    bookings: number;
    studentReports: number;
    meetings: number;
    safetyReports: number;
    qualityAudits: number;
    correctiveActionPlans: number;
    risks: number;
    total: number;
  };
  totals: {
    simulatedFlightHours: number;
    simulatedDutyHours: number;
    simulatedActions: number;
  };
  telemetry: {
    estimatedApiRequests: number;
    estimatedDbReads: number;
    estimatedDbWrites: number;
    estimatedDashboardRefreshes: number;
    estimatedStorageMb: number;
    actualDbOperations: number;
    actualDbReads: number;
    actualDbWrites: number;
    actualDurationMs: number;
    stages: Array<{
      label: string;
      durationMs: number;
      reads: number;
      writes: number;
      operations: number;
    }>;
    observedRoutes?: Array<{
      routeKey: string;
      requestCount: number;
      readCount: number;
      writeCount: number;
      errorCount: number;
      totalDurationMs: number;
      lastSeenAt: string;
    }>;
  };
  assertions: Array<{
    id: string;
    label: string;
    status: 'pass' | 'watch' | 'fail';
    detail: string;
  }>;
};

type SimulationLabResponse = {
  settings: SimulationLabSettings;
  runs: SimulationRunSummary[];
  presets: SimulationPreset[];
  activeRunId: string | null;
};

function buildSimulationAssertions(run: SimulationRunSummary): SimulationRunSummary['assertions'] {
  const observedRoutes = run.telemetry.observedRoutes || [];
  const observedRequests = observedRoutes.reduce((sum, route) => sum + route.requestCount, 0);
  const observedErrors = observedRoutes.reduce((sum, route) => sum + route.errorCount, 0);
  const flightCoverageTarget = run.settings.simulationDays * Math.max(1, run.settings.flightBookingsPerDay);
  const reportCoverageTarget = run.settings.studentCount * run.settings.studentReportsPerStudent;

  return [
    {
      id: 'bookings-footprint',
      label: 'Booking Footprint',
      status: run.writes.bookings >= Math.max(1, Math.floor(flightCoverageTarget * 0.7)) ? 'pass' : 'watch',
      detail: `${run.writes.bookings} bookings written against a target window of about ${flightCoverageTarget}.`,
    },
    {
      id: 'student-report-coverage',
      label: 'Student Report Coverage',
      status: run.writes.studentReports >= Math.max(1, Math.floor(reportCoverageTarget * 0.8)) ? 'pass' : 'watch',
      detail: `${run.writes.studentReports} reports written for an expected footprint near ${reportCoverageTarget}.`,
    },
    {
      id: 'observed-route-traffic',
      label: 'Observed Route Traffic',
      status: observedRequests > 0 ? 'pass' : 'watch',
      detail: observedRequests > 0
        ? `${observedRequests} downstream requests observed across ${observedRoutes.length} routes.`
        : 'No downstream route traffic observed yet. Open seeded screens to validate real usage.',
    },
    {
      id: 'observed-route-errors',
      label: 'Observed Route Errors',
      status: observedErrors === 0 ? 'pass' : 'fail',
      detail: observedErrors === 0
        ? 'No observed downstream API errors recorded for this run.'
        : `${observedErrors} observed downstream API errors were recorded.`,
    },
    {
      id: 'db-write-pressure',
      label: 'DB Write Pressure',
      status: run.telemetry.actualDbWrites <= Math.max(50, run.writes.total * 1.4) ? 'pass' : 'watch',
      detail: `${run.telemetry.actualDbWrites} actual writes captured while generating ${run.writes.total} records.`,
    },
  ];
}

type TenantContext = {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

type SimPerson = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  userType: string;
  department: string;
  userNumber: string;
  canBeInstructor: boolean;
  canBeStudent: boolean;
};

type SimAircraft = {
  id: string;
  registration: string;
  make: string;
  model: string;
  currentHobbs: number;
  currentTacho: number;
  organizationId: string;
  status: 'Serviceable' | 'Grounded';
  simulationRunId: string;
  createdAt: string;
};

type SimVehicle = {
  id: string;
  registration: string;
  name: string;
  currentOdometer: number;
  organizationId: string;
  simulationRunId: string;
  createdAt: string;
};

const DEFAULT_SETTINGS: SimulationLabSettings = {
  name: 'Busy ATO Month',
  note: '',
  autoExerciseEnabled: true,
  autoExerciseProfile: 'core',
  studentCount: 30,
  instructorCount: 6,
  personnelCount: 4,
  aircraftCount: 5,
  vehicleCount: 2,
  briefingRoomCount: 3,
  simulationDays: 30,
  flightBookingsPerDay: 12,
  roomBookingsPerDay: 5,
  vehicleBookingsPerDay: 2,
  studentReportsPerStudent: 3,
  meetingCount: 6,
  safetyReportCount: 8,
  qualityAuditCount: 4,
};

const SCENARIO_PRESETS: SimulationPreset[] = [
  {
    id: 'busy-ato-month',
    label: 'Busy ATO Month',
    settings: DEFAULT_SETTINGS,
  },
  {
    id: 'startup-flight-school',
    label: 'Startup Flight School',
    settings: {
      name: 'Startup Flight School',
      note: '',
      autoExerciseEnabled: true,
      autoExerciseProfile: 'core',
      studentCount: 12,
      instructorCount: 3,
      personnelCount: 2,
      aircraftCount: 2,
      vehicleCount: 1,
      briefingRoomCount: 1,
      simulationDays: 14,
      flightBookingsPerDay: 5,
      roomBookingsPerDay: 2,
      vehicleBookingsPerDay: 1,
      studentReportsPerStudent: 2,
      meetingCount: 2,
      safetyReportCount: 3,
      qualityAuditCount: 1,
    },
  },
  {
    id: 'weather-disruption-week',
    label: 'Weather Disruption Week',
    settings: {
      name: 'Weather Disruption Week',
      note: '',
      autoExerciseEnabled: true,
      autoExerciseProfile: 'extended',
      studentCount: 24,
      instructorCount: 5,
      personnelCount: 4,
      aircraftCount: 4,
      vehicleCount: 2,
      briefingRoomCount: 3,
      simulationDays: 7,
      flightBookingsPerDay: 6,
      roomBookingsPerDay: 8,
      vehicleBookingsPerDay: 2,
      studentReportsPerStudent: 2,
      meetingCount: 4,
      safetyReportCount: 5,
      qualityAuditCount: 2,
    },
  },
  {
    id: 'maintenance-pressure',
    label: 'Maintenance Pressure',
    settings: {
      name: 'Maintenance Pressure',
      note: '',
      autoExerciseEnabled: true,
      autoExerciseProfile: 'full',
      studentCount: 30,
      instructorCount: 6,
      personnelCount: 5,
      aircraftCount: 5,
      vehicleCount: 2,
      briefingRoomCount: 3,
      simulationDays: 21,
      flightBookingsPerDay: 9,
      roomBookingsPerDay: 5,
      vehicleBookingsPerDay: 2,
      studentReportsPerStudent: 3,
      meetingCount: 5,
      safetyReportCount: 10,
      qualityAuditCount: 5,
    },
  },
];

const FIRST_NAMES = ['Liam', 'Ava', 'Noah', 'Mia', 'Ethan', 'Luca', 'Emma', 'Zoe', 'Kai', 'Amelia', 'Leo', 'Nina', 'Jay', 'Sarah', 'Daniel', 'Olivia'];
const LAST_NAMES = ['Nkosi', 'Peters', 'Daniels', 'Mokoena', 'Khumalo', 'Kruger', 'Botha', 'Naidoo', 'Visser', 'Meyer', 'Smith', 'Adams', 'Kekana', 'Pillay'];
const AIRCRAFT_MODELS = [
  { make: 'Cessna', model: '172S' },
  { make: 'Piper', model: 'PA-28 Warrior' },
  { make: 'Diamond', model: 'DA40' },
  { make: 'Sling', model: 'Sling 2' },
  { make: 'Tecnam', model: 'P2008' },
];
const MEETING_TYPES = ['Operations', 'Safety', 'Training', 'Board', 'General'] as const;
const REPORT_TYPES = ['Hazard', 'Occurrence', 'Near Miss', 'Maintenance Event'];
const COURSE_NAMES = ['PPL Ground School', 'Nav Briefing', 'Solo Debrief', 'Human Factors Review', 'Air Law Revision'];
const COMPETENCIES = TRAINING_COMPETENCY_OPTIONS;

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeSettings(input: Partial<SimulationLabSettings> | null | undefined): SimulationLabSettings {
  const source = input || {};
  return {
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : DEFAULT_SETTINGS.name,
    note: typeof source.note === 'string' ? source.note.trim().slice(0, 240) : DEFAULT_SETTINGS.note,
    autoExerciseEnabled: typeof source.autoExerciseEnabled === 'boolean' ? source.autoExerciseEnabled : DEFAULT_SETTINGS.autoExerciseEnabled,
    autoExerciseProfile:
      source.autoExerciseProfile === 'core' || source.autoExerciseProfile === 'extended' || source.autoExerciseProfile === 'full'
        ? source.autoExerciseProfile
        : DEFAULT_SETTINGS.autoExerciseProfile,
    studentCount: clampNumber(source.studentCount, DEFAULT_SETTINGS.studentCount, 1, 500),
    instructorCount: clampNumber(source.instructorCount, DEFAULT_SETTINGS.instructorCount, 1, 100),
    personnelCount: clampNumber(source.personnelCount, DEFAULT_SETTINGS.personnelCount, 0, 100),
    aircraftCount: clampNumber(source.aircraftCount, DEFAULT_SETTINGS.aircraftCount, 1, 100),
    vehicleCount: clampNumber(source.vehicleCount, DEFAULT_SETTINGS.vehicleCount, 0, 100),
    briefingRoomCount: clampNumber(source.briefingRoomCount, DEFAULT_SETTINGS.briefingRoomCount, 1, 20),
    simulationDays: clampNumber(source.simulationDays, DEFAULT_SETTINGS.simulationDays, 1, 180),
    flightBookingsPerDay: clampNumber(source.flightBookingsPerDay, DEFAULT_SETTINGS.flightBookingsPerDay, 0, 80),
    roomBookingsPerDay: clampNumber(source.roomBookingsPerDay, DEFAULT_SETTINGS.roomBookingsPerDay, 0, 40),
    vehicleBookingsPerDay: clampNumber(source.vehicleBookingsPerDay, DEFAULT_SETTINGS.vehicleBookingsPerDay, 0, 20),
    studentReportsPerStudent: clampNumber(source.studentReportsPerStudent, DEFAULT_SETTINGS.studentReportsPerStudent, 0, 20),
    meetingCount: clampNumber(source.meetingCount, DEFAULT_SETTINGS.meetingCount, 0, 100),
    safetyReportCount: clampNumber(source.safetyReportCount, DEFAULT_SETTINGS.safetyReportCount, 0, 100),
    qualityAuditCount: clampNumber(source.qualityAuditCount, DEFAULT_SETTINGS.qualityAuditCount, 0, 100),
  };
}

async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;

  if (!(await isDatabaseAvailable())) {
    return null;
  }

  const currentUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      tenantId: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  });

  if (!currentUser) return null;

  return {
    id: currentUser.id,
    tenantId: currentUser.tenantId || 'safeviate',
    email: currentUser.email,
    firstName: currentUser.firstName || '',
    lastName: currentUser.lastName || '',
    role: currentUser.role || '',
  };
}

async function readTenantConfig(tenantId: string) {
  await ensureTenantConfigSchema();
  const row = await prisma.tenantConfig.findUnique({
    where: { tenantId },
    select: { data: true },
  });
  return (row?.data as Record<string, unknown> | null) || {};
}

async function writeTenantConfig(tenantId: string, config: Record<string, unknown>) {
  await prisma.tenantConfig.upsert({
    where: { tenantId },
    create: { tenantId, data: config as unknown as Prisma.InputJsonValue },
    update: { data: config as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
  });
}

async function hasRawTable(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<{ exists: string | null }[]>(
    `SELECT to_regclass('public.${tableName}')::text AS exists`
  );
  return Boolean(rows[0]?.exists);
}

function pickName(seed: number) {
  return {
    firstName: FIRST_NAMES[seed % FIRST_NAMES.length],
    lastName: LAST_NAMES[Math.floor(seed / FIRST_NAMES.length) % LAST_NAMES.length],
  };
}

function buildSimulationPeople(runId: string, tenantId: string, settings: SimulationLabSettings) {
  const instructors: SimPerson[] = [];
  const students: SimPerson[] = [];
  const personnel: SimPerson[] = [];

  for (let index = 0; index < settings.instructorCount; index += 1) {
    const name = pickName(index);
    const id = `sim_${runId}_instr_${String(index + 1).padStart(3, '0')}`;
    instructors.push({
      id,
      email: `${id}@safeviate.local`,
      firstName: name.firstName,
      lastName: `${name.lastName} FI`,
      role: 'instructor',
      userType: 'Instructor',
      department: 'Training',
      userNumber: `SIM-INSTR-${String(index + 1).padStart(3, '0')}`,
      canBeInstructor: true,
      canBeStudent: false,
    });
  }

  for (let index = 0; index < settings.studentCount; index += 1) {
    const name = pickName(index + 40);
    const id = `sim_${runId}_student_${String(index + 1).padStart(3, '0')}`;
    students.push({
      id,
      email: `${id}@safeviate.local`,
      firstName: name.firstName,
      lastName: `${name.lastName} ST`,
      role: 'student',
      userType: 'Student',
      department: 'Training',
      userNumber: `SIM-STU-${String(index + 1).padStart(3, '0')}`,
      canBeInstructor: false,
      canBeStudent: true,
    });
  }

  for (let index = 0; index < settings.personnelCount; index += 1) {
    const name = pickName(index + 80);
    const id = `sim_${runId}_staff_${String(index + 1).padStart(3, '0')}`;
    personnel.push({
      id,
      email: `${id}@safeviate.local`,
      firstName: name.firstName,
      lastName: `${name.lastName} OPS`,
      role: 'operations',
      userType: 'Personnel',
      department: index % 2 === 0 ? 'Operations' : 'Safety',
      userNumber: `SIM-OPS-${String(index + 1).padStart(3, '0')}`,
      canBeInstructor: false,
      canBeStudent: false,
    });
  }

  return { instructors, students, personnel, allPeople: [...instructors, ...students, ...personnel], tenantId };
}

function buildSimulationAircraft(runId: string, tenantId: string, count: number) {
  return Array.from({ length: count }, (_, index): SimAircraft => {
    const template = AIRCRAFT_MODELS[index % AIRCRAFT_MODELS.length];
    const suffix = String.fromCharCode(65 + (index % 26));
    return {
      id: `sim_${runId}_aircraft_${String(index + 1).padStart(3, '0')}`,
      registration: `ZS-SIM${suffix}${index + 1}`,
      make: template.make,
      model: template.model,
      currentHobbs: 220 + index * 18,
      currentTacho: 190 + index * 16,
      organizationId: tenantId,
      status: 'Serviceable',
      simulationRunId: runId,
      createdAt: new Date().toISOString(),
    };
  });
}

function buildSimulationVehicles(runId: string, tenantId: string, count: number) {
  return Array.from({ length: count }, (_, index): SimVehicle => ({
    id: `sim_${runId}_vehicle_${String(index + 1).padStart(3, '0')}`,
    registration: `SIM-V${index + 1}`,
    name: `Ops Vehicle ${index + 1}`,
    currentOdometer: 10000 + index * 850,
    organizationId: tenantId,
    simulationRunId: runId,
    createdAt: new Date().toISOString(),
  }));
}

function buildSimulationBookings(args: {
  runId: string;
  tenantId: string;
  settings: SimulationLabSettings;
  instructors: SimPerson[];
  students: SimPerson[];
  aircraft: SimAircraft[];
  vehicles: SimVehicle[];
}) {
  const { runId, tenantId, settings, instructors, students, aircraft, vehicles } = args;
  const bookings: Booking[] = [];
  const now = new Date();
  const aircraftHours = new Map(aircraft.map((item) => [item.id, { hobbs: item.currentHobbs, tacho: item.currentTacho }]));
  let bookingSequence = 1;
  let totalFlightHours = 0;

  for (let dayOffset = settings.simulationDays - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(now.getDate() - dayOffset);
    const dayLabel = day.toISOString().slice(0, 10);

    for (let slot = 0; slot < settings.flightBookingsPerDay; slot += 1) {
      const aircraftPick = aircraft[(dayOffset + slot) % aircraft.length];
      const instructor = instructors[(dayOffset + slot) % instructors.length];
      const student = students[(dayOffset * Math.max(1, settings.flightBookingsPerDay) + slot) % students.length];
      const meter = aircraftHours.get(aircraftPick.id)!;
      const startHour = 6 + (slot % 8);
      const durationHours = 1 + ((slot + dayOffset) % 2) * 0.5;
      const start = new Date(day);
      start.setHours(startHour, (slot % 2) * 30, 0, 0);
      const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      const preHobbs = meter.hobbs;
      const preTacho = meter.tacho;
      const postHobbs = parseFloat((preHobbs + durationHours).toFixed(1));
      const postTacho = parseFloat((preTacho + durationHours).toFixed(1));
      meter.hobbs = postHobbs;
      meter.tacho = postTacho;
      totalFlightHours += durationHours;

      bookings.push({
        id: `sim_${runId}_booking_${String(bookingSequence).padStart(5, '0')}`,
        bookingNumber: `SIM-${String(bookingSequence).padStart(5, '0')}`,
        type: 'Training Flight',
        start: start.toISOString(),
        end: end.toISOString(),
        date: dayLabel,
        startTime: start.toTimeString().slice(0, 5),
        endTime: end.toTimeString().slice(0, 5),
        aircraftId: aircraftPick.id,
        instructorId: instructor.id,
        studentId: student.id,
        status: 'Completed',
        notes: `Simulation booking for ${student.firstName} ${student.lastName}`,
        preFlight: true,
        postFlight: true,
        preFlightData: {
          hobbs: preHobbs,
          tacho: preTacho,
          fuelUpliftGallons: 0,
          fuelUpliftLitres: 0,
          oilUplift: 0,
          documentsChecked: true,
        },
        postFlightData: {
          hobbs: postHobbs,
          tacho: postTacho,
          fuelUpliftGallons: 0,
          fuelUpliftLitres: 0,
          oilUplift: 0,
          defects: slot % 9 === 0 ? 'Minor landing light snag logged during simulation.' : '',
          photos: [],
        },
        organizationId: tenantId,
        approvedById: instructor.id,
        approvedByName: `${instructor.firstName} ${instructor.lastName}`,
        approvedAt: end.toISOString(),
        createdById: instructor.id,
        totalCost: parseFloat((durationHours * 1650).toFixed(2)),
        accountingStatus: 'Unbilled',
      });
      bookingSequence += 1;
    }

    for (let slot = 0; slot < settings.roomBookingsPerDay; slot += 1) {
      const instructor = instructors[(dayOffset + slot) % instructors.length];
      const studentOne = students[(dayOffset + slot) % students.length];
      const studentTwo = students[(dayOffset + slot + 1) % students.length];
      const start = new Date(day);
      start.setHours(8 + slot, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      bookings.push({
        id: `sim_${runId}_booking_${String(bookingSequence).padStart(5, '0')}`,
        bookingNumber: `SIM-${String(bookingSequence).padStart(5, '0')}`,
        type: 'Briefing Room',
        start: start.toISOString(),
        end: end.toISOString(),
        date: dayLabel,
        startTime: start.toTimeString().slice(0, 5),
        endTime: end.toTimeString().slice(0, 5),
        aircraftId: '',
        instructorId: instructor.id,
        studentIds: [studentOne.id, studentTwo.id],
        briefingRoomId: `sim_room_${((slot % settings.briefingRoomCount) + 1)}`,
        briefingRoomName: `Briefing Room ${((slot % settings.briefingRoomCount) + 1)}`,
        sessionType: slot % 3 === 0 ? 'Meeting' : slot % 2 === 0 ? 'Ground School' : 'Student Debrief',
        courseName: COURSE_NAMES[(dayOffset + slot) % COURSE_NAMES.length],
        meetingType: slot % 3 === 0 ? 'Instructor Meeting' : undefined,
        status: 'Completed',
        notes: 'Simulation room booking',
        preFlight: false,
        postFlight: false,
        organizationId: tenantId,
      });
      bookingSequence += 1;
    }

    for (let slot = 0; slot < settings.vehicleBookingsPerDay && vehicles.length > 0; slot += 1) {
      const vehicle = vehicles[(dayOffset + slot) % vehicles.length];
      const staff = instructors[(dayOffset + slot) % instructors.length];
      const start = new Date(day);
      start.setHours(7 + slot, 15, 0, 0);
      const end = new Date(start.getTime() + 90 * 60 * 1000);
      bookings.push({
        id: `sim_${runId}_booking_${String(bookingSequence).padStart(5, '0')}`,
        bookingNumber: `SIM-${String(bookingSequence).padStart(5, '0')}`,
        type: 'Vehicle Booking',
        start: start.toISOString(),
        end: end.toISOString(),
        date: dayLabel,
        startTime: start.toTimeString().slice(0, 5),
        endTime: end.toTimeString().slice(0, 5),
        aircraftId: vehicle.id,
        instructorId: staff.id,
        status: 'Completed',
        notes: `Simulation vehicle booking for ${vehicle.name}`,
        preFlight: false,
        postFlight: false,
        organizationId: tenantId,
      });
      bookingSequence += 1;
    }
  }

  return { bookings, totalFlightHours: parseFloat(totalFlightHours.toFixed(1)) };
}

function buildStudentReports(runId: string, settings: SimulationLabSettings, students: SimPerson[], instructors: SimPerson[], bookings: Booking[]) {
  const reports: StudentProgressReport[] = [];
  const bookingsByStudent = new Map<string, Booking[]>();
  bookings.forEach((booking) => {
    if (!booking.studentId) return;
    const list = bookingsByStudent.get(booking.studentId) || [];
    list.push(booking);
    bookingsByStudent.set(booking.studentId, list);
  });

  students.forEach((student, index) => {
    const studentBookings = bookingsByStudent.get(student.id) || [];
    for (let reportIndex = 0; reportIndex < settings.studentReportsPerStudent && studentBookings.length > 0; reportIndex += 1) {
      const booking = studentBookings[(index + reportIndex) % studentBookings.length];
      const competency = COMPETENCIES[(index + reportIndex) % COMPETENCIES.length];
      const rating = ((index + reportIndex) % 5) + 1 as 1 | 2 | 3 | 4 | 5;
      reports.push({
        id: `sim_${runId}_report_${student.id}_${reportIndex + 1}`,
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        studentId: student.id,
        instructorId: booking.instructorId,
        date: booking.end,
        overallComment: rating >= 3 ? 'Student progressing well in simulation.' : 'Student requires more repetition in simulation.',
        entries: [
          {
            id: `${student.id}_entry_${reportIndex + 1}_a`,
            exercise: competency.label,
            rating,
            comment: rating >= 3 ? `${competency.label} handled confidently.` : `${competency.label} needs more rehearsal.`,
            competencyKey: competency.value,
            competencySignal: rating >= 4 ? 'strength' : rating === 2 ? 'growth' : 'watch',
          },
          {
            id: `${student.id}_entry_${reportIndex + 1}_b`,
            exercise: 'Airmanship Review',
            rating: Math.max(1, Math.min(5, rating + 1)) as 1 | 2 | 3 | 4 | 5,
            comment: 'General scan, lookout, and handling assessed during simulation.',
            competencyKey: 'airmanship',
            competencySignal: rating >= 4 ? 'strength' : 'watch',
          },
        ],
      });
    }
  });

  return reports;
}

function buildMeetings(runId: string, settings: SimulationLabSettings, instructors: SimPerson[], personnel: SimPerson[]) {
  const invitees = [...instructors, ...personnel];
  return Array.from({ length: settings.meetingCount }, (_, index) => {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - (settings.meetingCount - index));
    baseDate.setHours(14, 0, 0, 0);
    return {
      id: `sim_${runId}_meeting_${String(index + 1).padStart(3, '0')}`,
      meetingNumber: `SIM-MTG-${String(index + 1).padStart(3, '0')}`,
      title: `${MEETING_TYPES[index % MEETING_TYPES.length]} Review ${index + 1}`,
      meetingType: MEETING_TYPES[index % MEETING_TYPES.length],
      meetingDate: baseDate.toISOString(),
      startTime: '14:00',
      endTime: '15:00',
      location: `Board Room ${((index % 2) + 1)}`,
      description: 'Simulation-generated meeting for workflow testing.',
      inviteeIds: invitees.slice(0, Math.min(4, invitees.length)).map((person) => person.id),
      agendaItems: [
        { id: randomUUID(), title: 'Operational review' },
        { id: randomUUID(), title: 'Training throughput' },
      ],
      actionItems: [
        {
          id: randomUUID(),
          description: 'Review simulation follow-up items',
          assigneeId: invitees[index % invitees.length]?.id || '',
          assigneeName: invitees[index % invitees.length]
            ? `${invitees[index % invitees.length].firstName} ${invitees[index % invitees.length].lastName}`
            : 'Unassigned',
          dueDate: new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Open',
        },
      ],
      status: 'Completed',
      simulationRunId: runId,
    };
  });
}

function buildSafetyReports(runId: string, settings: SimulationLabSettings, instructors: SimPerson[]): SafetyReport[] {
  return Array.from({ length: settings.safetyReportCount }, (_, index) => {
    const submittedAt = new Date();
    submittedAt.setDate(submittedAt.getDate() - index * 2);
    const owner = instructors[index % instructors.length];
    return {
      id: `sim_${runId}_safety_${String(index + 1).padStart(3, '0')}`,
      reportNumber: `SIM-SAF-${String(index + 1).padStart(4, '0')}`,
      reportType: REPORT_TYPES[index % REPORT_TYPES.length],
      status: index % 4 === 0 ? 'Closed' : index % 3 === 0 ? 'Under Review' : 'Open',
      submittedBy: owner.id,
      submittedByName: `${owner.firstName} ${owner.lastName}`,
      submittedAt: submittedAt.toISOString(),
      isAnonymous: false,
      eventDate: submittedAt.toISOString(),
      eventTime: '10:30',
      location: `Apron ${((index % 3) + 1)}`,
      description: 'Simulation-generated safety event for dashboard and workflow testing.',
      eventClassification: index % 4 === 0 ? 'Incident' : 'Hazard',
      correctiveActions: [
        {
          id: randomUUID(),
          description: 'Review briefing and reinforce controls.',
          responsiblePersonId: owner.id,
          deadline: new Date(submittedAt.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
          status: index % 4 === 0 ? 'Closed' : 'Open',
        },
      ],
    };
  });
}

function buildQualityAudits(runId: string, settings: SimulationLabSettings, personnel: SimPerson[], instructors: SimPerson[]): QualityAudit[] {
  return Array.from({ length: settings.qualityAuditCount }, (_, index) => {
    const auditDate = new Date();
    auditDate.setDate(auditDate.getDate() - index * 7);
    const auditor = personnel[index % Math.max(1, personnel.length)] || instructors[index % instructors.length];
    const auditee = instructors[index % instructors.length];
    const findings: QualityFinding[] = [
      {
        checklistItemId: randomUUID(),
        finding: index % 3 === 0 ? 'Compliant' : 'Non Compliant',
        level: index % 3 === 0 ? 'Level 0' : 'Level 1',
        comment: 'Simulation audit checkpoint.',
      },
      {
        checklistItemId: randomUUID(),
        finding: index % 2 === 0 ? 'Compliant' : 'Non Compliant',
        level: index % 2 === 0 ? 'Level 0' : 'Level 2',
        comment: 'Follow-up required in simulation.',
      },
    ];
    const compliant = findings.filter((item) => item.finding === 'Compliant').length;
    return {
      id: `sim_${runId}_audit_${String(index + 1).padStart(3, '0')}`,
      templateId: 'simulation-template',
      title: `Simulation Audit ${index + 1}`,
      auditNumber: `SIM-AUD-${String(index + 1).padStart(4, '0')}`,
      auditorId: auditor.id,
      auditeeId: auditee.id,
      scope: 'Generated quality audit used for simulation testing.',
      auditDate: auditDate.toISOString(),
      status: index % 4 === 0 ? 'Closed' : 'In Progress',
      findings,
      complianceScore: parseFloat(((compliant / Math.max(1, findings.length)) * 100).toFixed(1)),
    };
  });
}

function buildCorrectiveActionPlans(runId: string, audits: QualityAudit[], safetyReports: SafetyReport[]): CorrectiveActionPlan[] {
  const caps: CorrectiveActionPlan[] = [];
  audits.forEach((audit, index) => {
    const firstFinding = audit.findings.find((finding) => finding.finding !== 'Compliant');
    if (!firstFinding) return;
    caps.push({
      id: `sim_${runId}_cap_${String(index + 1).padStart(3, '0')}`,
      auditId: audit.id,
      findingId: firstFinding.checklistItemId,
      rootCauseAnalysis: 'Simulation workflow identified a follow-up item.',
      status: index % 2 === 0 ? 'Open' : 'In Progress',
      actions: [
        {
          id: randomUUID(),
          description: 'Close the simulation finding.',
          responsiblePersonId: audit.auditeeId,
          deadline: new Date(new Date(audit.auditDate).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          status: index % 2 === 0 ? 'Open' : 'In Progress',
        },
      ],
      responsiblePersonId: audit.auditeeId,
    });
  });

  safetyReports.slice(0, Math.ceil(safetyReports.length / 2)).forEach((report, index) => {
    caps.push({
      id: `sim_${runId}_cap_safety_${String(index + 1).padStart(3, '0')}`,
      auditId: report.id,
      findingId: report.correctiveActions?.[0]?.id || randomUUID(),
      rootCauseAnalysis: 'Simulation safety review follow-up.',
      status: report.status === 'Closed' ? 'Closed' : 'Open',
      actions: report.correctiveActions,
      responsiblePersonId: report.submittedBy,
    });
  });

  return caps;
}

function buildRisks(runId: string, settings: SimulationLabSettings, instructors: SimPerson[]): Risk[] {
  const count = Math.max(1, Math.ceil(settings.safetyReportCount / 2));
  return Array.from({ length: count }, (_, index) => ({
    id: `sim_${runId}_risk_${String(index + 1).padStart(3, '0')}`,
    hazardArea: index % 2 === 0 ? 'Flight Operations' : 'Ground Operations',
    hazard: index % 2 === 0 ? 'High sortie density' : 'Briefing room congestion',
    status: index % 3 === 0 ? 'Closed' : 'Open',
    risks: [
      {
        id: randomUUID(),
        description: 'Operational pressure could degrade adherence to procedure.',
        initialRiskAssessment: {
          severity: 3,
          likelihood: 3,
          riskScore: 9,
          riskLevel: 'Medium',
        },
        mitigations: [
          {
            id: randomUUID(),
            description: 'Adjust instructor and asset loading.',
            responsiblePersonId: instructors[index % instructors.length]?.id || '',
            reviewDate: new Date().toISOString(),
            residualRiskAssessment: {
              severity: 2,
              likelihood: 2,
              riskScore: 4,
              riskLevel: 'Low',
            },
          },
        ],
      },
    ],
  }));
}

async function persistSimulationRun(context: TenantContext, settings: SimulationLabSettings) {
  const runStartedAt = Date.now();
  const telemetryStages: SimulationRunSummary['telemetry']['stages'] = [];
  const recordStage = <T,>(label: string, counts: { reads?: number; writes?: number }, action: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    return action()
      .then((result) => {
        const reads = counts.reads || 0;
        const writes = counts.writes || 0;
        telemetryStages.push({
          label,
          durationMs: Date.now() - startedAt,
          reads,
          writes,
          operations: reads + writes,
        });
        return result;
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : 'Unknown stage failure.';
        throw new Error(`${label} failed: ${detail}`);
      });
  };

  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { instructors, students, personnel } = await recordStage('Build people', { writes: 0 }, async () => buildSimulationPeople(runId, context.tenantId, settings));
  const aircraft = await recordStage('Build aircraft', { writes: 0 }, async () => buildSimulationAircraft(runId, context.tenantId, settings.aircraftCount));
  const vehicles = await recordStage('Build vehicles', { writes: 0 }, async () => buildSimulationVehicles(runId, context.tenantId, settings.vehicleCount));
  const { bookings, totalFlightHours } = await recordStage('Build bookings', { writes: 0 }, async () =>
    buildSimulationBookings({
      runId,
      tenantId: context.tenantId,
      settings,
      instructors,
      students,
      aircraft,
      vehicles,
    })
  );
  const studentReports = await recordStage('Build student reports', { writes: 0 }, async () =>
    buildStudentReports(runId, settings, students, instructors, bookings)
  );
  const meetings = await recordStage('Build meetings', { writes: 0 }, async () => buildMeetings(runId, settings, instructors, personnel));
  const safetyReports = await recordStage('Build safety reports', { writes: 0 }, async () => buildSafetyReports(runId, settings, instructors));
  const qualityAudits = await recordStage('Build quality audits', { writes: 0 }, async () => buildQualityAudits(runId, settings, personnel, instructors));
  const correctiveActionPlans = await recordStage('Build CAPs', { writes: 0 }, async () => buildCorrectiveActionPlans(runId, qualityAudits, safetyReports));
  const risks = await recordStage('Build risks', { writes: 0 }, async () => buildRisks(runId, settings, instructors));
  const milestones: StudentMilestoneSettings = {
    id: 'student-milestones',
    milestones: [
      { milestone: 10, warningHours: 7 },
      { milestone: 20, warningHours: 16 },
      { milestone: 35, warningHours: 30 },
      { milestone: 50, warningHours: 44 },
    ],
  };
  const hasVehiclesTable = settings.vehicleCount > 0
    ? await recordStage('Check vehicles table', { reads: 1 }, async () => hasRawTable('vehicles'))
    : false;

  await recordStage('Ensure schemas', { writes: 0 }, async () => {
    await Promise.all([
      ensureAircraftSchema(),
      ensureBookingsSchema(),
      ensureCorrectiveActionPlansSchema(),
      ensureMeetingsSchema(),
      ensurePersonnelSchema(),
      ensureQualityAuditsSchema(),
      ensureRisksSchema(),
      ensureSafetyReportsSchema(),
      ensureTenantConfigSchema(),
    ]);
  });

  await recordStage(
    'Persist simulation records',
    {
      writes:
        (instructors.length + students.length + personnel.length) * 2 +
        aircraft.length +
        (hasVehiclesTable ? vehicles.length : 0) +
        bookings.length +
        meetings.length +
        safetyReports.length +
        qualityAudits.length +
        correctiveActionPlans.length +
        risks.length,
    },
    async () => prisma.$transaction(async (tx) => {
      for (const person of [...instructors, ...students, ...personnel]) {
        const normalizedEmail = person.email.trim().toLowerCase();
        const existingUser = await tx.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, tenantId: true },
        });

        if (existingUser && existingUser.tenantId !== context.tenantId) {
          throw new Error(`Simulation seed conflict: ${normalizedEmail} already belongs to tenant ${existingUser.tenantId}.`);
        }

        if (existingUser) {
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              firstName: person.firstName,
              lastName: person.lastName,
              role: person.role,
              passwordHash: null,
              profilePath: `tenants/${context.tenantId}/personnel/${existingUser.id}`,
              updatedAt: new Date(),
            },
          });
        } else {
          await tx.user.create({
            data: {
              id: person.id,
              tenantId: context.tenantId,
              email: normalizedEmail,
              firstName: person.firstName,
              lastName: person.lastName,
              role: person.role,
              passwordHash: null,
              profilePath: `tenants/${context.tenantId}/personnel/${person.id}`,
            },
          });
        }

        await tx.personnel.upsert({
          where: { id: person.id },
          update: {
            tenantId: context.tenantId,
            userNumber: person.userNumber,
            firstName: person.firstName,
            lastName: person.lastName,
            email: normalizedEmail,
            department: person.department,
            organizationId: context.tenantId,
            role: person.role,
            userType: person.userType,
            canBeInstructor: person.canBeInstructor,
            canBeStudent: person.canBeStudent,
            permissions: [],
            updatedAt: new Date(),
          },
          create: {
            id: person.id,
            tenantId: context.tenantId,
            userNumber: person.userNumber,
            firstName: person.firstName,
            lastName: person.lastName,
            email: normalizedEmail,
            department: person.department,
            organizationId: context.tenantId,
            role: person.role,
            userType: person.userType,
            canBeInstructor: person.canBeInstructor,
            canBeStudent: person.canBeStudent,
            permissions: [],
          },
        });
      }

      for (const item of aircraft) {
        await tx.aircraftRecord.upsert({
          where: { id: item.id },
          update: { tenantId: context.tenantId, data: item as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
          create: { id: item.id, tenantId: context.tenantId, data: item as unknown as Prisma.InputJsonValue },
        });
      }

      if (hasVehiclesTable) {
        for (const item of vehicles) {
          await tx.$executeRawUnsafe(
            `INSERT INTO vehicles (id, tenant_id, data, created_at, updated_at)
             VALUES ($1, $2, $3::jsonb, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
            item.id,
            context.tenantId,
            JSON.stringify(item)
          );
        }
      }

      for (const booking of bookings) {
        await tx.bookingRecord.upsert({
          where: { id: booking.id },
          update: { data: booking as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
          create: { id: booking.id, tenantId: context.tenantId, data: booking as unknown as Prisma.InputJsonValue },
        });
      }

      for (const meeting of meetings) {
        await tx.$executeRawUnsafe(
          `INSERT INTO meetings (id, tenant_id, data, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          meeting.id,
          context.tenantId,
          JSON.stringify(meeting)
        );
      }

      for (const report of safetyReports) {
        await tx.$executeRawUnsafe(
          `INSERT INTO safety_reports (id, tenant_id, data, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          report.id,
          context.tenantId,
          JSON.stringify(report)
        );
      }

      for (const audit of qualityAudits) {
        await tx.$executeRawUnsafe(
          `INSERT INTO quality_audits (id, tenant_id, data, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          audit.id,
          context.tenantId,
          JSON.stringify(audit)
        );
      }

      for (const cap of correctiveActionPlans) {
        await tx.$executeRawUnsafe(
          `INSERT INTO corrective_action_plans (id, tenant_id, data, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          cap.id,
          context.tenantId,
          JSON.stringify(cap)
        );
      }

      for (const risk of risks) {
        await tx.$executeRawUnsafe(
          `INSERT INTO risks (id, tenant_id, data, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          risk.id,
          context.tenantId,
          JSON.stringify(risk)
        );
      }
    }, {
      maxWait: 30_000,
      timeout: 180_000,
    })
  );

  const existingConfig = await recordStage('Read tenant config', { reads: 1 }, async () => readTenantConfig(context.tenantId));
  const existingReports = Array.isArray(existingConfig[REPORTS_KEY]) ? (existingConfig[REPORTS_KEY] as StudentProgressReport[]) : [];
  const existingRuns = Array.isArray(existingConfig[RUNS_KEY]) ? (existingConfig[RUNS_KEY] as SimulationRunSummary[]) : [];
  const existingMilestones = existingConfig[MILESTONES_KEY];

  const writeSummary = {
    users: instructors.length + students.length + personnel.length,
    personnel: instructors.length + students.length + personnel.length,
    aircraft: aircraft.length,
    vehicles: hasVehiclesTable ? vehicles.length : 0,
    bookings: bookings.length,
    studentReports: studentReports.length,
    meetings: meetings.length,
    safetyReports: safetyReports.length,
    qualityAudits: qualityAudits.length,
    correctiveActionPlans: correctiveActionPlans.length,
    risks: risks.length,
    total: 0,
  };
  writeSummary.total = Object.values(writeSummary).filter((value) => typeof value === 'number').slice(0, -1).reduce((sum, value) => sum + value, 0);
  const estimatedApiRequests =
    bookings.length * 2 +
    studentReports.length +
    meetings.length +
    safetyReports.length +
    qualityAudits.length +
    correctiveActionPlans.length +
    risks.length +
    Math.ceil(settings.simulationDays * 1.5);
  const estimatedDbReads =
    bookings.length * 3 +
    studentReports.length +
    meetings.length * 2 +
    safetyReports.length * 2 +
    qualityAudits.length * 2 +
    settings.studentCount +
    settings.instructorCount +
    settings.aircraftCount;
  const estimatedDbWrites = writeSummary.total + Math.ceil(bookings.length * 0.3);
  const estimatedDashboardRefreshes = Math.max(1, settings.simulationDays * 3);
  const estimatedStorageMb = parseFloat((writeSummary.total * 0.012).toFixed(1));

  const runSummary: SimulationRunSummary = {
    id: runId,
    label: settings.name,
    note: settings.note,
    tenantId: context.tenantId,
    createdAt: new Date().toISOString(),
    generatedBy: `${context.firstName} ${context.lastName}`.trim() || context.email,
    settings,
    writes: writeSummary,
    totals: {
      simulatedFlightHours: totalFlightHours,
      simulatedDutyHours: parseFloat((totalFlightHours + meetings.length + settings.roomBookingsPerDay * settings.simulationDays * 0.5).toFixed(1)),
      simulatedActions: bookings.length + studentReports.length + meetings.length + safetyReports.length + qualityAudits.length,
    },
    telemetry: {
      estimatedApiRequests,
      estimatedDbReads,
      estimatedDbWrites,
      estimatedDashboardRefreshes,
      estimatedStorageMb,
      actualDbOperations: 0,
      actualDbReads: 0,
      actualDbWrites: 0,
      actualDurationMs: 0,
      stages: [],
    },
    assertions: [],
  };

  await recordStage('Write tenant config', { writes: 1 }, async () =>
    writeTenantConfig(context.tenantId, {
      ...existingConfig,
      [SETTINGS_KEY]: settings,
      [REPORTS_KEY]: [...studentReports, ...existingReports],
      [MILESTONES_KEY]: existingMilestones ?? milestones,
      [ACTIVE_SIMULATION_RUN_KEY]: runId,
      [RUNS_KEY]: [runSummary, ...existingRuns].slice(0, 25),
    })
  );

  const actualDbReads = telemetryStages.reduce((sum, stage) => sum + stage.reads, 0);
  const actualDbWrites = telemetryStages.reduce((sum, stage) => sum + stage.writes, 0);
  const actualDbOperations = telemetryStages.reduce((sum, stage) => sum + stage.operations, 0);
  const actualDurationMs = Date.now() - runStartedAt;
  runSummary.telemetry = {
    ...runSummary.telemetry,
    actualDbOperations,
    actualDbReads,
    actualDbWrites,
    actualDurationMs,
    stages: telemetryStages,
  };
  runSummary.assertions = buildSimulationAssertions(runSummary);

  await writeTenantConfig(context.tenantId, {
    ...existingConfig,
    [SETTINGS_KEY]: settings,
    [REPORTS_KEY]: [...studentReports, ...existingReports],
    [MILESTONES_KEY]: existingMilestones ?? milestones,
    [ACTIVE_SIMULATION_RUN_KEY]: runId,
    [RUNS_KEY]: [runSummary, ...existingRuns].slice(0, 25),
  });

  return runSummary;
}

async function deleteSimulationRun(context: TenantContext, runId: string) {
  const prefix = `sim_${runId}_`;
  await Promise.all([
    ensureAircraftSchema(),
    ensureBookingsSchema(),
    ensureCorrectiveActionPlansSchema(),
    ensureMeetingsSchema(),
    ensurePersonnelSchema(),
    ensureQualityAuditsSchema(),
    ensureRisksSchema(),
    ensureSafetyReportsSchema(),
    ensureTenantConfigSchema(),
  ]);

  const vehiclesTable = await hasRawTable('vehicles');

  await prisma.$transaction(async (tx) => {
    await tx.bookingRecord.deleteMany({
      where: {
        tenantId: context.tenantId,
        id: { startsWith: prefix },
      },
    });
    await tx.aircraftRecord.deleteMany({
      where: {
        tenantId: context.tenantId,
        id: { startsWith: prefix },
      },
    });
    await tx.personnel.deleteMany({
      where: {
        tenantId: context.tenantId,
        id: { startsWith: prefix },
      },
    });
    await tx.user.deleteMany({
      where: {
        tenantId: context.tenantId,
        id: { startsWith: prefix },
      },
    });

    if (vehiclesTable) {
      await tx.$executeRawUnsafe(`DELETE FROM vehicles WHERE tenant_id = $1 AND id LIKE $2`, context.tenantId, `${prefix}%`);
    }

    await tx.$executeRawUnsafe(`DELETE FROM meetings WHERE tenant_id = $1 AND id LIKE $2`, context.tenantId, `${prefix}%`);
    await tx.$executeRawUnsafe(`DELETE FROM safety_reports WHERE tenant_id = $1 AND id LIKE $2`, context.tenantId, `${prefix}%`);
    await tx.$executeRawUnsafe(`DELETE FROM quality_audits WHERE tenant_id = $1 AND id LIKE $2`, context.tenantId, `${prefix}%`);
    await tx.$executeRawUnsafe(`DELETE FROM corrective_action_plans WHERE tenant_id = $1 AND id LIKE $2`, context.tenantId, `${prefix}%`);
    await tx.$executeRawUnsafe(`DELETE FROM risks WHERE tenant_id = $1 AND id LIKE $2`, context.tenantId, `${prefix}%`);
    await tx.$executeRawUnsafe(`DELETE FROM simulation_route_metrics WHERE tenant_id = $1 AND run_id = $2`, context.tenantId, runId);
  });

  const existingConfig = await readTenantConfig(context.tenantId);
  const reports = Array.isArray(existingConfig[REPORTS_KEY]) ? (existingConfig[REPORTS_KEY] as StudentProgressReport[]) : [];
  const runs = Array.isArray(existingConfig[RUNS_KEY]) ? (existingConfig[RUNS_KEY] as SimulationRunSummary[]) : [];
  const activeRunId = typeof existingConfig[ACTIVE_SIMULATION_RUN_KEY] === 'string' ? existingConfig[ACTIVE_SIMULATION_RUN_KEY] : null;

  await writeTenantConfig(context.tenantId, {
    ...existingConfig,
    [REPORTS_KEY]: reports.filter((report) => !String(report.id).startsWith(prefix)),
    [ACTIVE_SIMULATION_RUN_KEY]: activeRunId === runId ? null : activeRunId,
    [RUNS_KEY]: runs.filter((run) => run.id !== runId),
  });
}

async function deleteAllSimulationRuns(context: TenantContext) {
  const existingConfig = await readTenantConfig(context.tenantId);
  const runs = Array.isArray(existingConfig[RUNS_KEY]) ? (existingConfig[RUNS_KEY] as SimulationRunSummary[]) : [];

  for (const run of runs) {
    await deleteSimulationRun(context, run.id);
  }
}

async function stopSimulationTracking(context: TenantContext) {
  const existingConfig = await readTenantConfig(context.tenantId);
  await writeTenantConfig(context.tenantId, {
    ...existingConfig,
    [ACTIVE_SIMULATION_RUN_KEY]: null,
  });
}

async function resumeSimulationTracking(context: TenantContext, runId: string) {
  const existingConfig = await readTenantConfig(context.tenantId);
  const runs = Array.isArray(existingConfig[RUNS_KEY]) ? (existingConfig[RUNS_KEY] as SimulationRunSummary[]) : [];
  const targetRun = runs.find((run) => run.id === runId);
  if (!targetRun) {
    throw new Error('Simulation run not found.');
  }

  await writeTenantConfig(context.tenantId, {
    ...existingConfig,
    [ACTIVE_SIMULATION_RUN_KEY]: runId,
  });
}

async function runAutoExercise(context: TenantContext, run: SimulationRunSummary) {
  if (!run.settings.autoExerciseEnabled) {
    return {
      profile: 'disabled' as const,
      routeCount: 0,
      requestCount: 0,
    };
  }

  const routeProfiles: Record<SimulationLabSettings['autoExerciseProfile'], Array<{ routeKey: string; reads: number; writes: number; requests: number; durationMs: number }>> = {
    core: [
      { routeKey: '/api/dashboard-summary', reads: 12, writes: 0, requests: 3, durationMs: 120 },
      { routeKey: '/api/schedule-data', reads: 10, writes: 0, requests: 3, durationMs: 140 },
      { routeKey: '/api/bookings', reads: 8, writes: 1, requests: 2, durationMs: 110 },
      { routeKey: '/api/aircraft', reads: 7, writes: 0, requests: 2, durationMs: 95 },
    ],
    extended: [
      { routeKey: '/api/dashboard-summary', reads: 14, writes: 0, requests: 4, durationMs: 130 },
      { routeKey: '/api/schedule-data', reads: 12, writes: 0, requests: 4, durationMs: 150 },
      { routeKey: '/api/bookings', reads: 9, writes: 1, requests: 3, durationMs: 120 },
      { routeKey: '/api/aircraft', reads: 8, writes: 0, requests: 3, durationMs: 105 },
      { routeKey: '/api/student-training', reads: 11, writes: 1, requests: 3, durationMs: 125 },
      { routeKey: '/api/meetings', reads: 6, writes: 0, requests: 2, durationMs: 90 },
    ],
    full: [
      { routeKey: '/api/dashboard-summary', reads: 16, writes: 0, requests: 5, durationMs: 140 },
      { routeKey: '/api/schedule-data', reads: 13, writes: 0, requests: 4, durationMs: 155 },
      { routeKey: '/api/bookings', reads: 10, writes: 2, requests: 3, durationMs: 125 },
      { routeKey: '/api/aircraft', reads: 9, writes: 0, requests: 3, durationMs: 110 },
      { routeKey: '/api/student-training', reads: 12, writes: 1, requests: 4, durationMs: 135 },
      { routeKey: '/api/meetings', reads: 7, writes: 0, requests: 3, durationMs: 95 },
      { routeKey: '/api/safety-reports', reads: 8, writes: 0, requests: 2, durationMs: 100 },
      { routeKey: '/api/quality-audits', reads: 8, writes: 0, requests: 2, durationMs: 100 },
      { routeKey: '/api/corrective-action-plans', reads: 7, writes: 0, requests: 2, durationMs: 95 },
      { routeKey: '/api/risk-register', reads: 7, writes: 0, requests: 2, durationMs: 95 },
    ],
  };

  const selectedRoutes = routeProfiles[run.settings.autoExerciseProfile];

  try {
    for (const route of selectedRoutes) {
      for (let index = 0; index < route.requests; index += 1) {
        await recordSimulationRouteMetric({
          tenantId: context.tenantId,
          runId: run.id,
          routeKey: route.routeKey,
          reads: route.reads,
          writes: route.writes,
          durationMs: route.durationMs,
        });
      }
    }
  } catch (error) {
    console.error('[simulation-lab] auto exercise failed:', error);
    return {
      profile: run.settings.autoExerciseProfile,
      routeCount: selectedRoutes.length,
      requestCount: 0,
      failed: true,
    };
  }

  return {
    profile: run.settings.autoExerciseProfile,
    routeCount: selectedRoutes.length,
    requestCount: selectedRoutes.reduce((sum, route) => sum + route.requests, 0),
    failed: false,
  };
}

async function saveSimulationPreset(context: TenantContext, label: string, settings: SimulationLabSettings) {
  const existingConfig = await readTenantConfig(context.tenantId);
  const customPresets = Array.isArray(existingConfig[CUSTOM_PRESETS_KEY])
    ? (existingConfig[CUSTOM_PRESETS_KEY] as SimulationPreset[])
    : [];
  const normalizedLabel = label.trim() || settings.name.trim() || 'Custom Simulation Preset';
  const presetId = `custom-${randomUUID()}`;
  const preset: SimulationPreset = {
    id: presetId,
    label: normalizedLabel,
    settings,
    isCustom: true,
  };

  await writeTenantConfig(context.tenantId, {
    ...existingConfig,
    [CUSTOM_PRESETS_KEY]: [preset, ...customPresets].slice(0, 20),
  });

  return preset;
}

async function deleteSimulationPreset(context: TenantContext, presetId: string) {
  const existingConfig = await readTenantConfig(context.tenantId);
  const customPresets = Array.isArray(existingConfig[CUSTOM_PRESETS_KEY])
    ? (existingConfig[CUSTOM_PRESETS_KEY] as SimulationPreset[])
    : [];

  await writeTenantConfig(context.tenantId, {
    ...existingConfig,
    [CUSTOM_PRESETS_KEY]: customPresets.filter((preset) => preset.id !== presetId),
  });
}

export async function GET() {
  try {
    const context = await getTenantContext();
    if (!context) {
      return NextResponse.json<SimulationLabResponse>({ settings: DEFAULT_SETTINGS, runs: [], presets: SCENARIO_PRESETS, activeRunId: null }, { status: 200 });
    }

    const config = await readTenantConfig(context.tenantId);
    const runs = Array.isArray(config[RUNS_KEY]) ? (config[RUNS_KEY] as SimulationRunSummary[]) : [];
    const activeRunId = typeof config[ACTIVE_SIMULATION_RUN_KEY] === 'string' ? config[ACTIVE_SIMULATION_RUN_KEY] : null;
    const customPresets = Array.isArray(config[CUSTOM_PRESETS_KEY])
      ? (config[CUSTOM_PRESETS_KEY] as SimulationPreset[]).map((preset) => ({
          ...preset,
          settings: normalizeSettings(preset.settings),
          isCustom: true,
        }))
      : [];
    const enrichedRuns = await Promise.all(
      runs.map(async (run) => {
        const observedRoutes = await listSimulationRouteMetrics(context.tenantId, run.id);
        const hydratedRun: SimulationRunSummary = {
          ...run,
          note: typeof run.note === 'string' ? run.note : '',
          telemetry: {
            ...run.telemetry,
            observedRoutes,
          },
          assertions: [],
        };
        hydratedRun.assertions = buildSimulationAssertions(hydratedRun);
        return hydratedRun;
      })
    );

    return NextResponse.json<SimulationLabResponse>(
      {
        settings: normalizeSettings((config[SETTINGS_KEY] as Partial<SimulationLabSettings> | undefined) ?? DEFAULT_SETTINGS),
        runs: enrichedRuns,
        presets: [...customPresets, ...SCENARIO_PRESETS],
        activeRunId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[simulation-lab] failed to load:', error);
    return NextResponse.json<SimulationLabResponse>({ settings: DEFAULT_SETTINGS, runs: [], presets: SCENARIO_PRESETS, activeRunId: null }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const settings = normalizeSettings(payload?.settings);
    const run = await persistSimulationRun(context, settings);
    const autoExercise = await runAutoExercise(context, run);

    return NextResponse.json({ ok: true, run, autoExercise }, { status: 200 });
  } catch (error) {
    console.error('[simulation-lab] failed to generate run:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate simulation run.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const clearAll = body?.clearAll === true;

    if (clearAll) {
      await deleteAllSimulationRuns(context);
      return NextResponse.json({ ok: true, cleared: true }, { status: 200 });
    }

    const runId = typeof body?.runId === 'string' ? body.runId.trim() : '';
    if (!runId) {
      return NextResponse.json({ error: 'Missing run id.' }, { status: 400 });
    }

    await deleteSimulationRun(context, runId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[simulation-lab] failed to delete run:', error);
    return NextResponse.json({ error: 'Failed to delete simulation run.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : '';
    const runId = typeof body?.runId === 'string' ? body.runId.trim() : '';
    const presetId = typeof body?.presetId === 'string' ? body.presetId.trim() : '';
    const presetLabel = typeof body?.label === 'string' ? body.label.trim() : '';

    if (action === 'stopTracking') {
      await stopSimulationTracking(context);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (action === 'resumeTracking') {
      if (!runId) {
        return NextResponse.json({ error: 'Missing run id.' }, { status: 400 });
      }
      await resumeSimulationTracking(context, runId);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (action === 'savePreset') {
      const preset = await saveSimulationPreset(context, presetLabel, normalizeSettings(body?.settings));
      return NextResponse.json({ ok: true, preset }, { status: 200 });
    }

    if (action === 'deletePreset') {
      if (!presetId) {
        return NextResponse.json({ error: 'Missing preset id.' }, { status: 400 });
      }
      await deleteSimulationPreset(context, presetId);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (!['stopTracking', 'resumeTracking', 'savePreset', 'deletePreset'].includes(action)) {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[simulation-lab] failed to update tracking:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update simulation tracking.' },
      { status: 500 }
    );
  }
}
