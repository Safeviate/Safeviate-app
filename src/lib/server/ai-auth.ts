import { authOptions } from '@/auth';
import { isDatabaseAvailable, prisma } from '@/lib/prisma';
import { ensureRolesSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';

type DbUserProfile = {
  id: string;
  role: string;
  permissions?: string[];
};

type FlowPermissionRule = {
  anyOf: string[];
};

export const aiFlowPermissions: Record<string, FlowPermissionRule> = {
  analyzeMoc: { anyOf: ['moc-manage'] },
  generateChecklist: { anyOf: ['quality-templates-manage', 'quality-audits-manage'] },
  generateExam: { anyOf: ['training-exams-manage'] },
  generateSafetyProtocolRecommendations: { anyOf: ['safety-view', 'safety-reports-manage'] },
  parseLogbook: { anyOf: ['development-view'] },
  summarizeDocument: { anyOf: ['operations-documents-manage', 'quality-view', 'safety-view'] },
  summarizeMaintenanceLogs: { anyOf: ['assets-view', 'assets-edit'] },
};

const SUPER_USERS = ['deanebolton@gmail.com', 'barry@safeviate.com'];

export async function authenticateAiRequest() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return { ok: false as const, status: 401, error: 'You must be signed in to use AI tools.' };
  }

  if (SUPER_USERS.includes(email)) {
    return {
      ok: true as const,
      tenantId: 'safeviate',
      userProfile: { id: session?.user?.id || email, role: 'developer', permissions: ['*'] },
      effectivePermissions: new Set(['*']),
    };
  }

  if (!(await isDatabaseAvailable())) {
    return {
      ok: false as const,
      status: 503,
      error: 'Database is unavailable.',
    };
  }

  await prisma.tenant.upsert({
    where: { id: 'safeviate' },
    update: { updatedAt: new Date() },
    create: { id: 'safeviate', name: 'Safeviate' },
  });

  await ensureRolesSchema();

  const currentUser = await prisma.user.findUnique({
    where: { email },
  });

  if (!currentUser) {
    return { ok: false as const, status: 403, error: 'No profile is linked to this account.' };
  }

  const roleRows = await prisma.role.findMany({ where: { tenantId: currentUser.tenantId } });
  const roleRow = roleRows.find((role) => role.id === currentUser.role) || roleRows[0] || null;
  const inheritedPermissions = Array.isArray(roleRow?.permissions) ? (roleRow.permissions as string[]) : [];

  return {
    ok: true as const,
    tenantId: currentUser.tenantId,
    userProfile: { id: currentUser.id, role: currentUser.role, permissions: inheritedPermissions } satisfies DbUserProfile,
    effectivePermissions: new Set(inheritedPermissions),
  };
}

export function isAuthorizedForAiFlow(flow: string, userProfile: DbUserProfile, effectivePermissions: Set<string>) {
  if (effectivePermissions.has('*')) return true;

  const role = userProfile.role?.toLowerCase();
  if (role === 'dev' || role === 'developer') {
    return true;
  }

  const rule = aiFlowPermissions[flow];
  if (!rule) return false;

  return rule.anyOf.some((permission) => effectivePermissions.has(permission));
}
