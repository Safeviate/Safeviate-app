import {
  LayoutDashboard,
  Users,
  LucideIcon,
  Code,
  UserCog,
  GaugeCircle,
  PlaneTakeoff,
  AlertTriangle,
  GraduationCap,
  Plane,
  CheckSquare,
  CalendarDays,
  Calculator,
  FileSpreadsheet,
  FileText,
  ClipboardPlus,
  Eye,
  Settings2,
  FileEdit,
  Library,
  BookOpen,
  Wrench,
} from 'lucide-react';

export type SubMenuItem = {
  href: string;
  label: string;
  description?: string;
  permissionId?: string;
};

export type MenuItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permissionId?: string;
  subItems?: SubMenuItem[];
};

export const menuConfig: MenuItem[] = [
  {
    href: '/dashboard',
    label: 'Company Dashboard',
    icon: GaugeCircle,
  },
  {
    href: '/my-dashboard',
    label: 'My Dashboard',
    icon: LayoutDashboard,
    permissionId: 'my-dashboard-view',
    subItems: [
      { href: '/my-dashboard/tasks', label: 'Tasks' },
      { href: '/my-dashboard/messages', label: 'Messages' },
      { href: '/my-dashboard/logbook', label: 'My Logbook' },
    ]
  },
  {
    href: '/bookings',
    label: 'Bookings',
    icon: CalendarDays,
    permissionId: 'bookings-view',
    subItems: [
      {
        href: '/bookings/schedule',
        label: 'Daily Schedule',
        description: 'View and manage resource bookings.',
        permissionId: 'bookings-schedule-view',
      },
      {
        href: '/bookings/history',
        label: 'History',
        description: 'View past bookings and logs.',
        permissionId: 'bookings-history-view',
      },
    ],
  },
  {
    href: '/operations',
    label: 'Operations',
    icon: PlaneTakeoff,
    permissionId: 'operations-view',
    subItems: [
      {
        href: '/operations/alerts',
        label: 'Alerts',
        description: 'View and manage critical system alerts.',
        permissionId: 'operations-alerts-view',
      },
      {
        href: '/operations/company-documents',
        label: 'Company Documents',
        description: 'Access controlled manuals and reference materials.',
        permissionId: 'operations-documents-view',
      },
      {
        href: '/operations/emergency-response',
        label: 'Emergency Response Plan',
        description: 'Manage emergency contacts, triggers, and live response diaries.',
        permissionId: 'operations-erp-view',
      },
      {
        href: '/operations/vehicle-usage',
        label: 'Vehicle Usage',
        description: 'Book company vehicles out and back in with live availability tracking.',
        permissionId: 'operations-view',
      },
      {
        href: '/operations/meetings',
        label: 'Meetings',
        description: 'Manage agendas, minutes, and follow-up action items.',
        permissionId: 'operations-view',
      },
      {
        href: '/operations/weather',
        label: 'Weather',
        description: 'View aviation weather reports and forecasts.',
        permissionId: 'operations-view',
      },
      {
        href: '/operations/active-flight',
        label: 'Active Flight',
        description: 'Launch the pilot moving map and live flight tracking workspace.',
        permissionId: 'operations-view',
      },
      {
        href: '/operations/fleet-tracker',
        label: 'Fleet Tracker',
        description: 'Monitor all active aircraft positions and live school flight sessions.',
        permissionId: 'operations-view',
      },
      {
        href: '/operations/training-routes',
        label: 'Route Planner',
        description: 'Manage training and general aviation routes for planning and import.',
        permissionId: 'operations-view',
      },
    ],
  },
  {
    href: '/quick-reports',
    label: 'Quick Reports',
    icon: ClipboardPlus,
    subItems: [
      {
        href: '/quick-reports/qr-codes',
        label: 'QR Codes',
        description: 'Print the safety and technical report QR codes.',
      },
      {
        href: '/quick-reports/technical-report',
        label: 'Technical Report',
        description: 'Log a preliminary technical report for engineering follow-up.',
        permissionId: 'maintenance-view',
      },
      {
        href: '/quick-reports/safety-report',
        label: 'Safety Report',
        description: 'File a preliminary safety report for management review.',
        permissionId: 'safety-view',
      },
    ],
  },
  {
    href: '/safety',
    label: 'Safety',
    icon: AlertTriangle,
    permissionId: 'safety-view',
    subItems: [
      {
        href: '/safety/management-of-change',
        label: 'Management of Change',
        description: 'Manage changes to procedures and policies.',
        permissionId: 'moc-manage',
      },
      {
        href: '/safety/safety-files',
        label: 'Safety Files',
        description: 'Track on-site construction health and safety file readiness.',
        permissionId: 'safety-view',
      },
      {
        href: '/safety/risk-matrix',
        label: 'Risk Matrix',
        description: 'Visualize the organizational risk landscape.',
        permissionId: 'risk-matrix-view',
      },
      {
        href: '/safety/risk-register',
        label: 'Risk Register',
        description: 'View the organizational risk register.',
        permissionId: 'risk-register-view',
      },
      {
        href: '/safety/safety-indicators',
        label: 'Safety Indicators',
        description: 'Track and analyze key safety metrics.',
        permissionId: 'safety-indicators-view',
      },
      {
        href: '/safety/safety-reports',
        label: 'Safety Reports',
        description: 'View and manage safety reports.',
        permissionId: 'safety-reports-manage',
      },
    ],
  },
  {
    href: '/quality',
    label: 'Quality',
    icon: CheckSquare,
    permissionId: 'quality-view',
    subItems: [
      {
        href: '/quality/audit-checklists',
        label: 'Audit Checklists',
        description: 'Manage audit templates.',
        permissionId: 'quality-templates-manage',
      },
      {
        href: '/quality/audit-schedule',
        label: 'Audit Schedule',
        description: 'Plan and view the annual audit schedule.',
        permissionId: 'quality-audits-manage',
      },
      {
        href: '/quality/audits',
        label: 'Audits',
        description: 'View the quality assurance dashboard.',
        permissionId: 'quality-audits-view',
      },
      {
        href: '/quality/coherence-matrix',
        label: 'Coherence Matrix',
        description: 'Ensure regulatory coherence.',
        permissionId: 'quality-matrix-view',
      },
      {
        href: '/quality/risk-plan',
        label: 'Quality Risk Plan',
        description: 'Manage the organizational risk profile and quality risk plan.',
        permissionId: 'quality-risk-plan-view',
      },
      {
        href: '/quality/task-tracker',
        label: 'Task Tracker',
        description: 'Track all quality-related tasks.',
        permissionId: 'quality-tasks-view',
      },
    ],
  },
  {
    href: '/training',
    label: 'Training',
    icon: GraduationCap,
    permissionId: 'training-view',
    subItems: [
      {
        href: '/training/student-progress',
        label: 'Student Progress',
        description: 'View and manage student progress reports.',
        permissionId: 'training-debriefs-view',
      },
      {
        href: '/training/exams',
        label: 'Exams',
        description: 'Manage and track student examination results.',
        permissionId: 'training-exams-view',
      },
      {
        href: '/training/question-bank',
        label: 'Question Bank',
        description: 'Central database of aviation questions by topic.',
        permissionId: 'training-exams-manage',
      },
    ],
  },
  {
    href: '/assets',
    label: 'Assets',
    icon: Plane,
    permissionId: 'assets-view',
    subItems: [
      {
        href: '/assets/aircraft',
        label: 'Aircraft',
        description: 'Manage all aircraft in your fleet.',
        permissionId: 'assets-view',
      },
      {
        href: '/assets/vehicles',
        label: 'Vehicles',
        description: 'Manage company vehicles and ground assets.',
        permissionId: 'assets-view',
      },
      {
        href: '/assets/tools',
        label: 'Tools',
        description: 'Manage specialized tools and equipment.',
        permissionId: 'assets-view',
      },
    ],
  },
  {
    href: '/maintenance',
    label: 'Maintenance',
    icon: Wrench,
    permissionId: 'maintenance-view',
    subItems: [
      {
        href: '/maintenance/workpacks',
        label: 'Workpacks',
        description: 'Manage aircraft maintenance workpacks and job cards.',
        permissionId: 'maintenance-workpacks-view',
      },
      {
        href: '/maintenance/defects',
        label: 'Defect Reports',
        description: 'Track and clear aircraft defects and snags.',
        permissionId: 'maintenance-defects-view',
      },
      {
        href: '/maintenance/schedule',
        label: 'Maintenance Schedule',
        description: 'View upcoming required maintenance events.',
        permissionId: 'maintenance-schedule-view',
      },
    ],
  },
  {
    href: '/users',
    label: 'Users',
    icon: Users,
    permissionId: 'users-view',
    subItems: [
      {
        href: '/users/personnel',
        label: 'All Users',
        permissionId: 'users-view',
      },
    ],
  },
  {
    href: '/admin',
    label: 'Admin',
    icon: UserCog,
    permissionId: 'admin-view',
    subItems: [
      {
        href: '/admin/page-format',
        label: 'Page Format',
        description: 'Control app branding, module access, and tab visibility.',
        permissionId: 'admin-settings-manage',
      },
      {
        href: '/admin/accounting',
        label: 'Accounting & Billing',
        description: 'Review and export completed flights to Sage.',
        permissionId: 'accounting-manage',
      },
      {
        href: '/admin/roles',
        label: 'Roles',
        description: 'Create and manage user roles.',
        permissionId: 'admin-roles-manage',
      },
      {
        href: '/admin/department',
        label: 'Department',
        description: 'Manage company departments.',
        permissionId: 'admin-departments-manage',
      },
      {
        href: '/admin/external',
        label: 'External Companies',
        description: 'Manage third-party organizations.',
        permissionId: 'admin-external-orgs-manage',
      },
      {
        href: '/admin/exam-topics',
        label: 'Exam Topics',
        description: 'Manage categories for the question bank.',
        permissionId: 'admin-settings-manage',
      },
      {
        href: '/admin/training-exercises',
        label: 'Training Exercises',
        description: 'Manage the default training exercise syllabus and assessment criteria.',
        permissionId: 'admin-settings-manage',
      },
      {
        href: '/admin/document-dates',
        label: 'Thresholds & Expiry',
        description: 'Manage document expiration and inspection warnings.',
        permissionId: 'admin-settings-manage',
      },
      {
        href: '/admin/mb-config',
        label: 'M&B Configuration',
        description: 'Configure mass and balance profiles.',
        permissionId: 'admin-settings-manage',
      },
      {
        href: '/admin/overdue',
        label: 'Overdue Alerts',
        description: 'Manage settings for the overdue aircraft monitor.',
        permissionId: 'admin-settings-manage',
      },
      {
        href: '/admin/permissions',
        label: 'Permissions List',
        description: 'View all available application permissions.',
        permissionId: 'admin-permissions-view',
      },
      {
        href: '/users/access-overview',
        label: 'Access Overview',
        description: 'View a matrix of what users and roles can access.',
        permissionId: 'admin-permissions-view',
      },
    ],
  },
  {
    href: '/development',
    label: 'Development',
    icon: Code,
    permissionId: 'development-view',
    subItems: [
      {
        href: '/development',
        label: 'Development Home',
        description: 'Access development utilities and booking sequence controls.',
        permissionId: 'development-view',
      },
      {
        href: '/development/database',
        label: 'Tenant Setup',
        description: 'Manage master tenant configuration and seeder logic.',
        permissionId: 'development-view',
      },
      {
        href: '/development/logbook-parser',
        label: 'Logbook Parser',
        description: 'Parse the structure of a logbook table.',
        permissionId: 'development-view',
      },
      {
        href: '/development/ai-studio',
        label: 'AI Studio',
        description: 'Run structured AI workflows from inside the app.',
        permissionId: 'development-view',
      },
      {
        href: '/development/table-builder',
        label: 'Table Builder',
        description: 'Create and manipulate table structures.',
        permissionId: 'development-view',
      },
      {
        href: '/development/usage-estimator',
        label: 'Usage Estimator',
        description: 'Estimate Azure App Service, PostgreSQL, bandwidth, and tracking load from user activity.',
        permissionId: 'development-view',
      },
      {
        href: '/development/simulation-lab',
        label: 'Simulation Lab',
        description: 'Seed live tenant data for realistic school simulations, then inspect writes, generated records, and run history.',
        permissionId: 'development-view',
      },
      {
        href: '/development/graph-test',
        label: 'Graph Test',
        description: 'Build and tune a mass and balance envelope from scratch.',
        permissionId: 'development-view',
      },
      {
        href: '/development/moc-lab',
        label: 'MOC Lab',
        description: 'Prototype alternative management of change layouts.',
        permissionId: 'development-view',
      },
      {
        href: '/development/test',
        label: 'Welcome Email Test',
        description: 'Send a test welcome email to any address.',
        permissionId: 'development-view',
      },
    ],
  },
];
