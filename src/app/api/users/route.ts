import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensurePersonnelSchema, ensureRolesSchema } from '@/lib/server/bootstrap-db';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

const INSTRUCTOR_TYPES = new Set(['Instructor']);
const STUDENT_TYPES = new Set(['Student']);
const PRIVATE_PILOT_TYPES = new Set(['Private Pilot']);

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({
        users: [],
        personnel: [],
        instructors: [],
        students: [],
        privatePilots: [],
        roles: [],
        departments: [],
      }, { status: 200 });
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
    const tenantId = currentUser?.tenantId || 'safeviate';

    await Promise.all([ensurePersonnelSchema(), ensureRolesSchema()]);
    const [roleRows, departmentRows, userRows, authRows] = await Promise.all([
      prisma.role.findMany({ where: { tenantId } }),
      prisma.department.findMany({ where: { tenantId } }),
      prisma.personnel.findMany({ where: { tenantId } }),
      prisma.user.findMany({ where: { tenantId }, select: { email: true, suspendedAt: true } }),
    ]);

    const instructors = userRows.filter((row) => row.canBeInstructor || INSTRUCTOR_TYPES.has(row.userType || ''));
    const students = userRows.filter((row) => row.canBeStudent || row.canBePIC || STUDENT_TYPES.has(row.userType || ''));
    const privatePilots = userRows.filter((row) => PRIVATE_PILOT_TYPES.has(row.userType || ''));
    const authMap = new Map(authRows.map((row) => [row.email.trim().toLowerCase(), row.suspendedAt]));
    const mergedUsers = userRows.map((row) => ({
      ...row,
      suspendedAt: authMap.get(row.email.trim().toLowerCase()) || null,
    }));

    return NextResponse.json({
      users: mergedUsers,
      personnel: mergedUsers,
      instructors,
      students,
      privatePilots,
      roles: roleRows,
      departments: departmentRows,
    }, { status: 200 });
  } catch (error) {
    console.error('[users] fallback to empty payload:', error);
    return NextResponse.json({
      users: [],
      personnel: [],
      instructors: [],
      students: [],
      privatePilots: [],
      roles: [],
      departments: [],
    }, { status: 200 });
  }
}
