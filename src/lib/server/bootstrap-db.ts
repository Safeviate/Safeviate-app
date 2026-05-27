import { isDatabaseAvailable, prisma } from '@/lib/prisma';

type TableName =
  | 'users'
  | 'tenants'
  | 'roles'
  | 'departments'
  | 'personnel'
  | 'tools'
  | 'safety_file_projects'
  | 'safety_file_assignments'
  | 'tenant_configs'
  | 'alerts'
  | 'company_documents'
  | 'external_organizations'
  | 'training_routes'
  | 'meetings'
  | 'bookings'
  | 'attendance_records'
  | 'aircrafts'
  | 'active_flight_sessions'
  | 'active_flight_session_blocks'
  | 'active_flight_track_points'
  | 'safety_reports'
  | 'quick_safety_reports'
  | 'technical_reports'
  | 'quality_audits'
  | 'corrective_action_plans'
  | 'risks'
  | 'management_of_change'
  | 'erp_state'
  | 'simulation_route_metrics';

const tableCache = new Map<TableName, boolean>();

async function hasTable(tableName: TableName) {
  if (!(await isDatabaseAvailable())) {
    tableCache.set(tableName, false);
    return false;
  }

  if (tableCache.has(tableName)) {
    return tableCache.get(tableName)!;
  }

  try {
    const rows = await prisma.$queryRawUnsafe<{ exists: string | null }[]>(
      `SELECT to_regclass('public.${tableName}')::text AS exists`
    );
    const exists = Boolean(rows[0]?.exists);
    tableCache.set(tableName, exists);
    return exists;
  } catch {
    tableCache.set(tableName, false);
    return false;
  }
}

export async function getBootstrapDbState() {
  const [hasUsers, hasTenants, hasRoles, hasPersonnel] = await Promise.all([
    hasTable('users'),
    hasTable('tenants'),
    hasTable('roles'),
    hasTable('personnel'),
  ]);

  return {
    hasUsers,
    hasTenants,
    hasRoles,
    hasPersonnel,
    bootstrapMode: !hasUsers || !hasTenants,
  };
}

export function getBootstrapProfile(email?: string | null) {
  return {
    id: 'bootstrap-admin',
    tenantId: 'safeviate',
    email: email || 'bootstrap@safeviate.local',
    firstName: 'Bootstrap',
    lastName: 'Admin',
    role: 'developer',
    profilePath: null,
    passwordHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function ensureCoreSchema() {
  // Intentionally no-op in production hot paths.
  // Schema provisioning should happen out-of-band to avoid connection spikes.
  return;
}

export async function ensureAircraftSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('aircrafts')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS aircrafts (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('aircrafts', true);
}

export async function ensureToolsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('tools')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tools (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('tools', true);
}

export async function ensureSafetyFileProjectsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('safety_file_projects')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS safety_file_projects (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('safety_file_projects', true);
}

export async function ensureSafetyFileAssignmentsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('safety_file_assignments')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS safety_file_assignments (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      project_id VARCHAR(128) NOT NULL,
      personnel_id VARCHAR(128) NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS safety_file_assignments_project_idx
    ON safety_file_assignments (tenant_id, project_id)
  `);
  tableCache.set('safety_file_assignments', true);
}

export async function ensureTenantConfigSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('tenant_configs')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tenant_configs (
      tenant_id VARCHAR(128) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('tenant_configs', true);
}

export async function ensureAlertsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('alerts')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS alerts (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('alerts', true);
}

export async function ensureCompanyDocumentsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('company_documents')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS company_documents (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      upload_date TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      expiration_date TIMESTAMPTZ(6),
      doc_type TEXT NOT NULL DEFAULT 'file',
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('company_documents', true);
}

export async function ensureExternalOrganizationsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('external_organizations')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS external_organizations (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('external_organizations', true);
}

export async function ensureTrainingRoutesSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('training_routes')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS training_routes (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('training_routes', true);
}

export async function ensureMeetingsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('meetings')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meetings (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('meetings', true);
}

export async function ensureErpStateSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('erp_state')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS erp_state (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('erp_state', true);
}

export async function ensureBookingsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('bookings')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bookings (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('bookings', true);
}

export async function ensureAttendanceRecordsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('attendance_records')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('attendance_records', true);
}

export async function ensureFlightSessionsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('active_flight_sessions')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS active_flight_sessions (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('active_flight_sessions', true);
}

export async function ensureFlightSessionBlocksSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('active_flight_session_blocks')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS active_flight_session_blocks (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('active_flight_session_blocks', true);
}

export async function ensureFlightTrackPointsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('active_flight_track_points')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS active_flight_track_points (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      aircraft_id VARCHAR(128),
      aircraft_registration TEXT NOT NULL,
      session_id VARCHAR(128) NOT NULL,
      device_id VARCHAR(128),
      recorded_at TIMESTAMPTZ(6) NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS active_flight_track_points_registration_idx
    ON active_flight_track_points (tenant_id, aircraft_registration, recorded_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS active_flight_track_points_session_idx
    ON active_flight_track_points (tenant_id, session_id, recorded_at DESC)
  `);
  tableCache.set('active_flight_track_points', true);
}

export async function ensureSafetyReportsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('safety_reports')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS safety_reports (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('safety_reports', true);
}

export async function ensureTechnicalReportsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('technical_reports')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS technical_reports (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('technical_reports', true);
}

export async function ensureQuickSafetyReportsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('quick_safety_reports')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS quick_safety_reports (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('quick_safety_reports', true);
}

export async function ensureQualityAuditsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('quality_audits')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS quality_audits (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('quality_audits', true);
}

export async function ensureManagementOfChangeSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('management_of_change')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS management_of_change (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('management_of_change', true);
}

export async function ensureRisksSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('risks')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS risks (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('risks', true);
}

export async function ensureCorrectiveActionPlansSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('corrective_action_plans')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS corrective_action_plans (
      id VARCHAR(128) PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);
  tableCache.set('corrective_action_plans', true);
}

export async function ensureSimulationRouteMetricsSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (await hasTable('simulation_route_metrics')) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS simulation_route_metrics (
      tenant_id VARCHAR(128) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      run_id VARCHAR(128) NOT NULL,
      route_key TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      read_count INTEGER NOT NULL DEFAULT 0,
      write_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      total_duration_ms INTEGER NOT NULL DEFAULT 0,
      last_seen_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, run_id, route_key)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS simulation_route_metrics_run_idx
    ON simulation_route_metrics (tenant_id, run_id)
  `);
  tableCache.set('simulation_route_metrics', true);
}

export async function ensurePersonnelSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (!(await hasTable('personnel'))) {
    return;
  }

  const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'personnel'`
  );
  const columnNames = new Set(columns.map((row) => row.column_name));

  const addColumn = async (columnSql: string) => {
    await prisma.$executeRawUnsafe(`ALTER TABLE personnel ADD COLUMN IF NOT EXISTS ${columnSql}`);
  };

  if (!columnNames.has('organization_id')) {
    await addColumn('organization_id VARCHAR(128)');
    columnNames.add('organization_id');
  }

  if (!columnNames.has('is_erp_incerfa_contact')) {
    await addColumn('is_erp_incerfa_contact BOOLEAN NOT NULL DEFAULT FALSE');
    columnNames.add('is_erp_incerfa_contact');
  }

  if (!columnNames.has('is_erp_alerfa_contact')) {
    await addColumn('is_erp_alerfa_contact BOOLEAN NOT NULL DEFAULT FALSE');
    columnNames.add('is_erp_alerfa_contact');
  }

  if (!columnNames.has('access_overrides')) {
    await addColumn('access_overrides JSONB');
    columnNames.add('access_overrides');
  }

  if (!columnNames.has('primary_instructor_id')) {
    await addColumn('primary_instructor_id VARCHAR(128)');
    columnNames.add('primary_instructor_id');
  }

  if (!columnNames.has('instructor_assignment_history')) {
    await addColumn(`instructor_assignment_history JSONB NOT NULL DEFAULT '[]'::jsonb`);
    columnNames.add('instructor_assignment_history');
  }

  if (!columnNames.has('progression_recommendation')) {
    await addColumn(`progression_recommendation JSONB NOT NULL DEFAULT '{}'::jsonb`);
    columnNames.add('progression_recommendation');
  }

  if (!columnNames.has('progression_review_history')) {
    await addColumn(`progression_review_history JSONB NOT NULL DEFAULT '[]'::jsonb`);
    columnNames.add('progression_review_history');
  }

  if (!columnNames.has('documents')) {
    await addColumn(`documents JSONB NOT NULL DEFAULT '[]'::jsonb`);
    columnNames.add('documents');
  }

  if (!columnNames.has('permissions')) {
    await addColumn('permissions JSONB NOT NULL DEFAULT \'[]\'::jsonb');
    columnNames.add('permissions');
  }

  if (!columnNames.has('can_be_instructor')) {
    await addColumn('can_be_instructor BOOLEAN NOT NULL DEFAULT FALSE');
    columnNames.add('can_be_instructor');
  }

  if (!columnNames.has('can_be_student')) {
    await addColumn('can_be_student BOOLEAN NOT NULL DEFAULT FALSE');
    columnNames.add('can_be_student');
  }

  if (!columnNames.has('can_be_pic')) {
    await addColumn('can_be_pic BOOLEAN NOT NULL DEFAULT FALSE');
    columnNames.add('can_be_pic');
  }
}

export async function ensureRolesSchema() {
  if (!(await isDatabaseAvailable())) return;
  if (!(await hasTable('roles'))) {
    return;
  }

  const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'roles'`
  );
  const columnNames = new Set(columns.map((row) => row.column_name));

  const addColumn = async (columnSql: string) => {
    await prisma.$executeRawUnsafe(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS ${columnSql}`);
  };

  if (!columnNames.has('permissions')) {
    await addColumn(`permissions JSONB NOT NULL DEFAULT '[]'::jsonb`);
    columnNames.add('permissions');
  }

  if (!columnNames.has('access_overrides')) {
    await addColumn('access_overrides JSONB');
    columnNames.add('access_overrides');
  }

  if (!columnNames.has('required_documents')) {
    await addColumn('required_documents JSONB');
    columnNames.add('required_documents');
  }

  await prisma.$executeRawUnsafe(`
    UPDATE roles
    SET permissions = permissions || '["training-student-instructors-manage"]'::jsonb,
        updated_at = NOW()
    WHERE NOT (permissions ? 'training-student-instructors-manage')
      AND (
        permissions ? 'training-exams-manage'
        OR permissions ? 'admin-settings-manage'
        OR permissions ? 'admin-permissions-manage'
        OR LOWER(name) LIKE '%chief instructor%'
        OR LOWER(name) LIKE '%head of training%'
        OR LOWER(name) LIKE '%training manager%'
      )
  `).catch(() => null);

  await prisma.$executeRawUnsafe(`
    UPDATE roles
    SET permissions = permissions || '["training-student-progression-manage"]'::jsonb,
        updated_at = NOW()
    WHERE NOT (permissions ? 'training-student-progression-manage')
      AND (
        permissions ? 'training-exams-manage'
        OR permissions ? 'admin-settings-manage'
        OR permissions ? 'admin-permissions-manage'
        OR LOWER(name) LIKE '%chief instructor%'
        OR LOWER(name) LIKE '%head of training%'
        OR LOWER(name) LIKE '%training manager%'
      )
  `).catch(() => null);

  await prisma.$executeRawUnsafe(`
    UPDATE roles
    SET permissions = permissions
      || '["quality-audit-schedule-view","quality-audit-schedule-edit","quality-audit-schedule-manage"]'::jsonb,
        updated_at = NOW()
    WHERE NOT (permissions ? 'quality-audit-schedule-manage')
      AND (
        permissions ? 'quality-audits-manage'
        OR permissions ? 'admin-settings-manage'
        OR permissions ? 'admin-permissions-manage'
        OR LOWER(name) LIKE '%administrator%'
      )
  `).catch(() => null);
}
