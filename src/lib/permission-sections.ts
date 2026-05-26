import { permissionsConfig, type PermissionResource } from '@/lib/permissions-config';

export type PermissionSection = {
  title: string;
  resources: PermissionResource[];
};

const SECTION_DEFINITIONS: Array<{ title: string; resourceIds: string[] }> = [
  { title: 'Core', resourceIds: ['dashboard', 'my-dashboard'] },
  { title: 'Bookings', resourceIds: ['bookings'] },
  { title: 'Operations', resourceIds: ['operations', 'operations-alerts', 'operations-documents', 'operations-erp'] },
  { title: 'Safety', resourceIds: ['safety', 'moc', 'risk-register', 'risk-matrix', 'safety-indicators', 'safety-reports'] },
  { title: 'Quality', resourceIds: ['quality', 'quality-audits', 'quality-audit-schedule', 'quality-templates', 'quality-caps', 'quality-tasks', 'quality-matrix', 'quality-risk-plan'] },
  { title: 'Training', resourceIds: ['training', 'training-debriefs', 'training-exams', 'training-student-instructors', 'training-student-progression'] },
  { title: 'Assets', resourceIds: ['assets'] },
  { title: 'Maintenance', resourceIds: ['maintenance', 'maintenance-workpacks', 'maintenance-defects', 'maintenance-schedule'] },
  { title: 'Users', resourceIds: ['users'] },
  { title: 'Admin', resourceIds: ['admin', 'admin-roles', 'admin-permissions', 'admin-departments', 'admin-external-orgs', 'admin-settings', 'admin-database', 'settings'] },
  { title: 'Development', resourceIds: ['development'] },
];

export function getPermissionSections(resources: PermissionResource[] = permissionsConfig): PermissionSection[] {
  const byId = new Map(resources.map((resource) => [resource.id, resource]));

  const seen = new Set<string>();
  const sections: PermissionSection[] = [];

  SECTION_DEFINITIONS.forEach((section) => {
    const items = section.resourceIds
      .map((resourceId) => byId.get(resourceId))
      .filter((resource): resource is PermissionResource => Boolean(resource && !resource.hidden));

    if (items.length > 0) {
      items.forEach((resource) => seen.add(resource.id));
      sections.push({ title: section.title, resources: items });
    }
  });

  const leftovers = resources.filter((resource) => !resource.hidden && !seen.has(resource.id));
  if (leftovers.length > 0) {
    sections.push({ title: 'Other', resources: leftovers });
  }

  return sections;
}
