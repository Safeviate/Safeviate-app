'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, BadgeAlert, ChevronDown, ClipboardCheck, MoreHorizontal, ShieldAlert, Star, TrendingDown, TriangleAlert } from 'lucide-react';
import { format } from 'date-fns';
import { useTheme } from '@/components/theme-provider';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { useOrganizationScope } from '@/hooks/use-organization-scope';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { buildTrainingCompetencyAreas } from '@/lib/training-competencies';
import { parseJsonResponse } from '@/lib/safe-json';
import {
  CARD_HEADER_ACTION_ZONE_CLASS,
  CARD_HEADER_BAND_CLASS,
  CARD_HEADER_SCOPE_ZONE_CLASS,
  HEADER_COMPACT_CONTROL_CLASS,
  HEADER_SECONDARY_BUTTON_CLASS,
  HEADER_TAB_LIST_CLASS,
  HEADER_TAB_TRIGGER_CLASS,
} from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Aircraft } from '@/types/aircraft';
import type { Booking } from '@/types/booking';
import type { AttendanceRecordData } from '@/types/attendance';
import type { QualityAudit, CorrectiveActionPlan } from '@/types/quality';
import type { Risk as SafetyRisk } from '@/types/risk';
import type { SafetyReport } from '@/types/safety-report';
import type { QuickSafetyReport, TechnicalQuickReport } from '@/types/quick-reports';
import type { InstructorHourWarningSettings, MilestoneWarning, StudentMilestoneSettings, StudentProgressReport } from '@/types/training';
import type { IndustryType } from '@/types/quality';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

type DashboardIndustry = 'ATO' | 'AOC' | 'AMO' | 'OHS';
type IndustryTab = { value: string; label: string };
type SummaryPayload = {
  aircrafts?: Aircraft[];
  bookings?: Array<Pick<Booking, 'aircraftId' | 'status' | 'instructorId' | 'studentId'> & {
    date?: string;
    preFlightData?: { hobbs?: number; fuelUpliftGallons?: number; fuelUpliftLitres?: number; oilUplift?: number };
    postFlightData?: { hobbs?: number };
  }>;
  students?: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
  }>;
  instructors?: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
  }>;
  audits?: QualityAudit[];
  reports?: SafetyReport[];
  technicalReports?: TechnicalQuickReport[];
  caps?: CorrectiveActionPlan[];
  risks?: SafetyRisk[];
  attendanceRecords?: AttendanceRecordData[];
  personnel?: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
  }>;
  totalDutyHours?: number;
  instructorDuty?: Array<{
    id: string;
    name: string;
    bookingCount: number;
    instructionHours: number;
    dutyPressure: number;
    status: 'ok' | 'pressure' | 'busy';
  }>;
  studentProgressReports?: StudentProgressReport[];
  studentMilestones?: StudentMilestoneSettings | null;
};

type FleetRow = {
  aircraft: Aircraft;
  loggedHours: number;
  targetHours: number;
  hoursOnGround: number;
  hoursInMaintenance: number;
  targetMet: boolean;
  remainingHours: number | null;
  serviceState: 'available' | 'nearing' | 'overdue';
};

type FleetPeriod = 'week' | 'month' | 'all';

type FleetTrendPoint = {
  label: string;
  flightHours: number;
  maintenanceHours: number;
  utilisationHours: number;
  utilisationPercent: number;
};

type InstructorWarningBand = {
  hours: number;
  warningHours: number;
  color?: string;
  foregroundColor?: string;
};

type InstructorLoadStatus = 'safe' | 'watch' | 'over';

type StudentLoadStatus = 'safe' | 'watch' | 'over';

type InstructorLoadRow = {
  id: string;
  name: string;
  periodFlightHours: number;
  periodDutyHours: number;
  todayFlightHours: number;
  todayDutyHours: number;
  bookingCount: number;
  dutyMinutes: number;
  nextLimitHours: number | null;
  warningHours: number | null;
  status: InstructorLoadStatus;
  hasOpenSession: boolean;
};

type StudentLoadRow = {
  id: string;
  name: string;
  totalFlightHours: number;
  recentFlightHours: number;
  lastFlightDate: string | null;
  lastDebriefDate: string | null;
  daysSinceFlight: number | null;
  daysSinceDebrief: number | null;
  utilisationShare: number;
  pacePerWeek: number;
  forecastDaysToNextMilestone: number | null;
  recommendedAction: string;
  milestoneHours: number | null;
  warningHours: number | null;
  status: StudentLoadStatus;
};

type InstructorMetrics = {
  rows: InstructorLoadRow[];
  periodLabel: string;
  totalPeriodFlightHours: number;
  totalPeriodDutyHours: number;
  totalTodayFlightHours: number;
  totalTodayDutyHours: number;
  openSessions: number;
  watchCount: number;
  overCount: number;
};

type StudentMetrics = {
  rows: StudentLoadRow[];
  periodLabel: string;
  activeStudents: number;
  newStudents: number;
  recentDebriefs: number;
  noRecentActivity: number;
  stagnatingStudents: number;
  forecastedNextMilestones: number;
  watchCount: number;
  overCount: number;
};

type CompetencyArea = {
  label: string;
  score: number;
  sampleCount: number;
  trend: number;
  signal: 'strength' | 'growth' | 'watch';
};

type SafetyMetrics = {
  openReports: number;
  openRisks: number;
  openCaps: number;
  recentReports: number;
  reportRows: Array<{
    id: string;
    title: string;
    status: string;
    dateLabel: string;
    classification: string;
    location: string;
    actionCount: number;
  }>;
  riskRows: Array<{
    id: string;
    hazard: string;
    hazardArea: string;
    status: string;
    riskCount: number;
    mitigationCount: number;
  }>;
  capRows: Array<{
    id: string;
    status: string;
    description: string;
  }>;
};

type QualityMetrics = {
  openAudits: number;
  closedAudits: number;
  openFindings: number;
  averageCompliance: number;
  openCaps: number;
  dueSoonCaps: number;
  overdueCaps: number;
  recentAudits: number;
  auditRows: Array<{
    id: string;
    title: string;
    auditNumber: string;
    status: string;
    dateLabel: string;
    complianceScore: number | null;
    findingCount: number;
  }>;
  upcomingCapRows: Array<{
    id: string;
    sourceType: 'Audit' | 'Gap Analysis';
    sourceIdentifier: string;
    description: string;
    assignee: string;
    dueDate: string;
    status: string;
  }>;
  recentCapRows: Array<{
    id: string;
    sourceType: 'Audit' | 'Gap Analysis';
    sourceIdentifier: string;
    description: string;
    assignee: string;
    openedDate: string;
    status: string;
  }>;
};

const DASHBOARD_SHELL_CLASS = 'overflow-hidden border bg-background shadow-none';
const DEFAULT_INSTRUCTOR_WARNING_BANDS: InstructorWarningBand[] = [
  { hours: 20, warningHours: 10, color: '#60a5fa', foregroundColor: '#ffffff' },
  { hours: 40, warningHours: 30, color: '#facc15', foregroundColor: '#000000' },
  { hours: 60, warningHours: 50, color: '#f97316', foregroundColor: '#ffffff' },
  { hours: 80, warningHours: 70, color: '#ef4444', foregroundColor: '#ffffff' },
];
const DEFAULT_STUDENT_MILESTONES: MilestoneWarning[] = [
  { milestone: 10, warningHours: 7 },
  { milestone: 20, warningHours: 17 },
  { milestone: 30, warningHours: 27 },
  { milestone: 40, warningHours: 37 },
];
const ATC_TABS: IndustryTab[] = [
  { value: 'fleet', label: 'Fleet' },
  { value: 'overview', label: 'Overview' },
  { value: 'instructors', label: 'Instructors' },
  { value: 'students', label: 'Students' },
  { value: 'safety', label: 'Safety' },
  { value: 'quality', label: 'Quality' },
];

const INDUSTRY_TABS: Record<DashboardIndustry, IndustryTab[]> = {
  ATO: ATC_TABS,
  AOC: [
    { value: 'overview', label: 'Overview' },
    { value: 'dispatch', label: 'Dispatch' },
    { value: 'fleet', label: 'Fleet' },
    { value: 'safety', label: 'Safety' },
    { value: 'finance', label: 'Finance' },
  ],
  AMO: [
    { value: 'overview', label: 'Overview' },
    { value: 'workpacks', label: 'Workpacks' },
    { value: 'defects', label: 'Defects' },
    { value: 'compliance', label: 'Compliance' },
    { value: 'assets', label: 'Assets' },
  ],
  OHS: [
    { value: 'overview', label: 'Overview' },
    { value: 'incidents', label: 'Incidents' },
    { value: 'hazards', label: 'Hazards' },
    { value: 'actions', label: 'Actions' },
    { value: 'compliance', label: 'Compliance' },
  ],
};

const INDUSTRY_TITLES: Record<DashboardIndustry, string> = {
  ATO: 'ATO Dashboard',
  AOC: 'Charter Operations Dashboard',
  AMO: 'Maintenance Dashboard',
  OHS: 'Safety Dashboard',
};

const INDUSTRY_DESCRIPTIONS: Record<DashboardIndustry, string> = {
  ATO: 'Fleet, instructor load, safety, and quality first. The remaining sections will be built one at a time.',
  AOC: 'The operations dashboard shell will be built section by section.',
  AMO: 'The maintenance dashboard shell will be built section by section.',
  OHS: 'The safety dashboard shell will be built section by section.',
};

const INDUSTRY_SWITCHER: IndustryTab[] = [
  { value: 'ATO', label: 'ATO' },
  { value: 'AOC', label: 'AOC' },
  { value: 'AMO', label: 'AMO' },
  { value: 'OHS', label: 'OHS' },
];

const EMPTY_NOTE = 'This section is intentionally empty for now. We will add content in the next build stage.';
const DEFAULT_FLEET_TARGET_HOURS = 20;
const FLEET_PERIOD_OPTIONS: FleetPeriod[] = ['week', 'month', 'all'];

const resolveIndustryKey = (industry?: IndustryType | string | null): DashboardIndustry => {
  if (industry === 'Aviation: Charter / Ops (AOC)') return 'AOC';
  if (industry === 'Aviation: Maintenance (AMO)') return 'AMO';
  if (industry === 'General: Occupational Health & Safety (OHS)') return 'OHS';
  return 'ATO';
};

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, 12);
};

const getServiceState = (aircraft: Aircraft) => {
  const reading = aircraft.currentTacho ?? aircraft.currentHobbs ?? 0;
  const thresholds = [aircraft.tachoAtNext50Inspection, aircraft.tachoAtNext100Inspection].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  const nextThreshold = thresholds.length > 0 ? Math.min(...thresholds) : null;

  if (nextThreshold === null) {
    return { remainingHours: null, serviceState: 'available' as const };
  }

  const remainingHours = parseFloat(Math.max(0, nextThreshold - reading).toFixed(1));

  if (reading > nextThreshold) {
    return { remainingHours: 0, serviceState: 'overdue' as const };
  }

  if (remainingHours <= 10) {
    return { remainingHours, serviceState: 'nearing' as const };
  }

  return { remainingHours, serviceState: 'available' as const };
};

const formatHours = (hours: number) => `${hours.toFixed(1)}h`;

const getPeriodLabel = (period: FleetPeriod) => {
  if (period === 'week') return 'Last 7 days';
  if (period === 'month') return 'Last 30 days';
  return 'All time';
};

const getPeriodDays = (period: FleetPeriod) => {
  if (period === 'week') return 7;
  if (period === 'month') return 30;
  return 90;
};

const getPeriodStart = (period: FleetPeriod, reference = new Date()) => {
  if (period === 'week') {
    const start = new Date(reference);
    start.setDate(reference.getDate() - 7);
    return start;
  }
  if (period === 'month') {
    const start = new Date(reference);
    start.setMonth(reference.getMonth() - 1);
    return start;
  }
  return null;
};

const calcBreakMinutes = (record: AttendanceRecordData) => (record.breaks || []).reduce((sum, breakItem) => {
  if (typeof breakItem.minutes === 'number') return sum + Math.max(0, breakItem.minutes);
  if (breakItem.start && breakItem.end) {
    const start = new Date(breakItem.start).getTime();
    const end = new Date(breakItem.end).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
      return sum + Math.max(0, Math.round((end - start) / 60000));
    }
  }
  return sum;
}, 0);

const calcDutyMinutes = (record: AttendanceRecordData, referenceNow = Date.now()) => {
  if (!record.clockIn) return 0;
  const start = new Date(record.clockIn).getTime();
  const end = record.clockOut ? new Date(record.clockOut).getTime() : referenceNow;
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
};

const calcNetDutyMinutes = (record: AttendanceRecordData, referenceNow = Date.now()) =>
  Math.max(0, calcDutyMinutes(record, referenceNow) - calcBreakMinutes(record));

const getInstructorLoadStatus = (hours: number, bands: InstructorWarningBand[]) => {
  const ordered = [...bands].sort((a, b) => a.hours - b.hours);
  const nextBand = ordered.find((band) => hours < band.hours) || ordered.at(-1) || null;

  if (!nextBand) {
    return {
      status: 'safe' as InstructorLoadStatus,
      nextLimitHours: null as number | null,
      warningHours: null as number | null,
    };
  }

  if (hours >= nextBand.hours) {
    return {
      status: 'over' as InstructorLoadStatus,
      nextLimitHours: nextBand.hours,
      warningHours: nextBand.warningHours,
    };
  }

  return {
    status: hours >= nextBand.warningHours ? 'watch' : 'safe',
    nextLimitHours: nextBand.hours,
    warningHours: nextBand.warningHours,
  } as const;
};

const getStatusStyles = (status: InstructorLoadStatus) => {
  if (status === 'over') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'watch') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
};

const getStudentStatusStyles = (status: StudentLoadStatus) => {
  if (status === 'over') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'watch') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
};

const formatDateLabel = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);

const getDaysSince = (date: Date | null, reference = new Date()) => {
  if (!date) return null;
  const diff = reference.getTime() - date.getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const formatDaysSince = (days: number | null) => {
  if (days === null) return 'N/A';
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
};

const formatPace = (hoursPerWeek: number) => `${hoursPerWeek.toFixed(1)}h/wk`;

const getStudentRecommendation = (row: {
  status: StudentLoadStatus;
  daysSinceFlight: number | null;
  daysSinceDebrief: number | null;
  forecastDaysToNextMilestone: number | null;
}) => {
  if (row.daysSinceFlight === null) return 'Schedule first lesson';
  if (row.daysSinceFlight >= 30) return 'Re-engage student';
  if (row.daysSinceFlight >= 14) return 'Book refresher flight';
  if (row.daysSinceDebrief === null || row.daysSinceDebrief > row.daysSinceFlight) return 'Complete debrief';
  if (row.status !== 'safe') return 'Review milestone';
  if (row.forecastDaysToNextMilestone !== null && row.forecastDaysToNextMilestone <= 30) return 'Plan milestone check';
  return 'Keep current pace';
};

const getStudentCompetencySnapshot = (reports: StudentProgressReport[]) => {
  const areas = buildTrainingCompetencyAreas(reports);
  const primary = areas[0] || null;
  const signal: CompetencyArea['signal'] = primary?.signal || 'watch';
  const nextFocus = primary
    ? primary.signal === 'strength'
      ? `Keep reinforcing ${primary.label}`
      : `Next focus: ${primary.label}`
    : 'Next focus: add debrief notes';
  return {
    signal,
    headline: primary?.label || 'No competency data yet',
    score: primary?.score ?? 0,
    nextFocus,
  };
};

const getCompetencyTone = (signal: CompetencyArea['signal']) => {
  if (signal === 'strength') {
    return {
      border: 'border-emerald-200',
      bg: 'bg-emerald-50/80',
      pill: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
      bar: 'bg-emerald-500',
      label: 'Strength',
      icon: Star,
    };
  }

  if (signal === 'growth') {
    return {
      border: 'border-rose-200',
      bg: 'bg-rose-50/80',
      pill: 'bg-rose-500/10 text-rose-700 border-rose-200',
      bar: 'bg-rose-500',
      label: 'Growth area',
      icon: TrendingDown,
    };
  }

  return {
    border: 'border-amber-200',
    bg: 'bg-amber-50/80',
    pill: 'bg-amber-500/10 text-amber-700 border-amber-200',
    bar: 'bg-amber-500',
    label: 'Watch',
    icon: TrendingDown,
  };
};

const getSafetyMetrics = (summary: SummaryPayload): SafetyMetrics => {
  const reports = (Array.isArray(summary.reports) ? summary.reports : []) as SafetyReport[];
  const risks = (Array.isArray(summary.risks) ? summary.risks : []) as SafetyRisk[];
  const caps = (Array.isArray(summary.caps) ? summary.caps : []) as CorrectiveActionPlan[];
  const now = new Date();
  const recentCutoff = new Date(now);
  recentCutoff.setDate(now.getDate() - 30);

  const reportRows = [...reports]
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .slice(0, 3)
    .map((report) => ({
      id: report.id,
      title: `${report.reportNumber} · ${report.reportType}`.trim(),
      status: report.status,
      dateLabel: format(new Date(report.submittedAt), 'dd MMM yyyy'),
      classification: report.eventClassification || 'Unclassified',
      location: report.location || 'Unknown location',
      actionCount: Array.isArray(report.correctiveActions) ? report.correctiveActions.length : 0,
    }));

  const riskRows = [...risks]
    .filter((risk) => risk.status !== 'Closed' && risk.status !== 'Archived')
    .sort((a, b) => b.risks.length - a.risks.length || a.hazard.localeCompare(b.hazard))
    .slice(0, 3)
    .map((risk) => ({
      id: risk.id,
      hazard: risk.hazard,
      hazardArea: risk.hazardArea,
      status: risk.status,
      riskCount: risk.risks.length,
      mitigationCount: risk.risks.reduce((sum: number, item) => sum + item.mitigations.length, 0),
    }));

  const capRows = [...caps]
    .sort((a, b) => a.status.localeCompare(b.status))
    .slice(0, 3)
    .map((cap) => ({
      id: cap.id,
      status: cap.status,
      description: `CAP ${cap.id}`,
    }));

  return {
    openReports: reports.filter((report) => report.status !== 'Closed').length,
    openRisks: risks.filter((risk) => risk.status === 'Open').length,
    openCaps: caps.filter((cap) => cap.status !== 'Closed' && cap.status !== 'Cancelled').length,
    recentReports: reports.filter((report) => {
      const submittedAt = new Date(report.submittedAt);
      return !Number.isNaN(submittedAt.getTime()) && submittedAt >= recentCutoff;
    }).length,
    reportRows,
    riskRows,
    capRows,
  };
};

const getCapSourceDetails = (cap: CorrectiveActionPlan, audits: QualityAudit[]) => {
  const audit = audits.find((item) => item.id === cap.auditId);
  const isGapAnalysis = (audit as { analysisType?: string } | undefined)?.analysisType === 'gap-analysis';
  return {
    sourceType: isGapAnalysis ? ('Gap Analysis' as const) : ('Audit' as const),
    sourceIdentifier: audit?.auditNumber || (isGapAnalysis ? 'Unknown Gap Analysis' : 'Unknown Audit'),
    link: isGapAnalysis ? `/quality/gap-analyses/${cap.auditId}` : `/quality/audits/${cap.auditId}`,
  };
};

const getQualityMetrics = (summary: SummaryPayload, organizationScopeId: string): QualityMetrics => {
  const allAudits = (Array.isArray(summary.audits) ? summary.audits : []) as QualityAudit[];
  const audits = allAudits.filter((audit) =>
    organizationScopeId === 'internal'
      ? !audit.organizationId
      : audit.organizationId === organizationScopeId
  );
  const caps = (Array.isArray(summary.caps) ? summary.caps : []) as CorrectiveActionPlan[];
  const personnel = (Array.isArray(summary.personnel) ? summary.personnel : []) as Array<{
    id: string;
    firstName?: string;
    lastName?: string;
  }>;
  const personnelMap = new Map(
    personnel
      .filter((person) => person && typeof person.id === 'string')
      .map((person) => [person.id, `${person.firstName || ''} ${person.lastName || ''}`.trim() || person.id])
  );
  const now = new Date();
  const recentCutoff = new Date(now);
  recentCutoff.setDate(now.getDate() - 30);
  const upcomingCutoff = new Date(now);
  upcomingCutoff.setDate(now.getDate() + 30);

  const auditRows = [...audits]
    .sort((a, b) => new Date(b.auditDate).getTime() - new Date(a.auditDate).getTime())
    .slice(0, 3)
    .map((audit) => ({
      id: audit.id,
      title: audit.title,
      auditNumber: audit.auditNumber,
      status: audit.status,
      dateLabel: format(new Date(audit.auditDate), 'dd MMM yyyy'),
      complianceScore: typeof audit.complianceScore === 'number' ? audit.complianceScore : null,
      findingCount: Array.isArray(audit.findings) ? audit.findings.filter((finding) => finding.finding === 'Non Compliant').length : 0,
    }));

  const compliantScores = audits
    .map((audit) => audit.complianceScore)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));

  const openFindings = audits.reduce((sum, audit) => {
    const findings = Array.isArray(audit.findings) ? audit.findings : [];
    return sum + findings.filter((finding) => finding.finding === 'Non Compliant').length;
  }, 0);

  const scopedAuditIds = new Set(audits.map((audit) => audit.id));
  const scopedCaps = caps.filter((cap) => scopedAuditIds.has(cap.auditId));
  const openCaps = scopedCaps.filter((cap) => cap.status !== 'Closed' && cap.status !== 'Cancelled').length;
  const capActionRows = scopedCaps.flatMap((cap) => {
    const source = getCapSourceDetails(cap, audits);
    const activeActions = (cap.actions || []).filter((action) => action.status !== 'Closed' && action.status !== 'Cancelled');

    if (activeActions.length > 0) {
      return activeActions.map((action) => ({
        id: `${cap.id}:${action.id}`,
        sourceType: source.sourceType,
        sourceIdentifier: source.sourceIdentifier,
        link: source.link,
        description: action.description || cap.rootCauseAnalysis || `Corrective action ${cap.id}`,
        assignee: personnelMap.get(action.responsiblePersonId) || action.responsiblePersonId || 'Unassigned',
        dueDate: action.deadline || cap.updatedAt || cap.createdAt || now.toISOString(),
        openedDate: cap.createdAt || cap.updatedAt || now.toISOString(),
        status: action.status,
      }));
    }

    if (cap.status !== 'Closed' && cap.status !== 'Cancelled' && cap.responsiblePersonId) {
      return [{
        id: cap.id,
        sourceType: source.sourceType,
        sourceIdentifier: source.sourceIdentifier,
        link: source.link,
        description: cap.rootCauseAnalysis || `Corrective action ${cap.id}`,
        assignee: personnelMap.get(cap.responsiblePersonId) || cap.responsiblePersonId,
        dueDate: cap.updatedAt || cap.createdAt || now.toISOString(),
        openedDate: cap.createdAt || cap.updatedAt || now.toISOString(),
        status: cap.status,
      }];
    }

    return [];
  });

  const upcomingCapRows = [...capActionRows]
    .filter((row) => {
      const dueDate = parseLocalDate(row.dueDate);
      return !Number.isNaN(dueDate.getTime()) && dueDate <= upcomingCutoff;
    })
    .sort((a, b) => parseLocalDate(a.dueDate).getTime() - parseLocalDate(b.dueDate).getTime())
    .slice(0, 4);

  const recentCapRows = [...capActionRows]
    .filter((row) => {
      const openedDate = parseLocalDate(row.openedDate);
      return !Number.isNaN(openedDate.getTime()) && openedDate >= recentCutoff;
    })
    .sort((a, b) => parseLocalDate(b.openedDate).getTime() - parseLocalDate(a.openedDate).getTime())
    .slice(0, 4);
  const dueSoonCaps = capActionRows.filter((row) => {
    const dueDate = parseLocalDate(row.dueDate);
    return !Number.isNaN(dueDate.getTime()) && dueDate > now && dueDate <= upcomingCutoff;
  }).length;
  const overdueCaps = capActionRows.filter((row) => {
    const dueDate = parseLocalDate(row.dueDate);
    return !Number.isNaN(dueDate.getTime()) && dueDate < now;
  }).length;

  return {
    openAudits: audits.filter((audit) => audit.status !== 'Closed' && audit.status !== 'Archived').length,
    closedAudits: audits.filter((audit) => audit.status === 'Closed' || audit.status === 'Archived').length,
    openFindings,
    averageCompliance:
      compliantScores.length > 0 ? parseFloat((compliantScores.reduce((sum, score) => sum + score, 0) / compliantScores.length).toFixed(1)) : 0,
    openCaps,
    dueSoonCaps,
    overdueCaps,
    recentAudits: audits.filter((audit) => {
      const auditDate = new Date(audit.auditDate);
      return !Number.isNaN(auditDate.getTime()) && auditDate >= recentCutoff;
    }).length,
    auditRows,
    upcomingCapRows,
    recentCapRows,
  };
};

const formatTrendLabel = (date: Date, period: FleetPeriod) => {
  if (period === 'all') {
    return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(date);
  }

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
};

const buildTrendBuckets = (period: FleetPeriod) => {
  const now = new Date();
  const buckets: Date[] = [];

  if (period === 'week') {
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      buckets.push(date);
    }
    return buckets;
  }

  if (period === 'month') {
    for (let i = 4; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - i * 7);
      buckets.push(date);
    }
    return buckets;
  }

  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setMonth(now.getMonth() - i);
    buckets.push(date);
  }

  return buckets;
};

export default function DashboardPage() {
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/dashboard' });
  const { uiMode } = useTheme();
  const { tenant } = useTenantConfig();
  const { scopedOrganizationId } = useOrganizationScope({ viewAllPermissionId: 'quality-audits-view-all' });
  const isMobile = useIsMobile();
  const [activeIndustry, setActiveIndustry] = useState<DashboardIndustry>('ATO');
  const [activeTab, setActiveTab] = useState('fleet');
  const [summary, setSummary] = useState<SummaryPayload>({});
  const [quickSafetyReports, setQuickSafetyReports] = useState<QuickSafetyReport[]>([]);
  const [fleetTargetHours, setFleetTargetHours] = useState(DEFAULT_FLEET_TARGET_HOURS);
  const [fleetPeriod, setFleetPeriod] = useState<FleetPeriod>('month');
  const [instructorPeriod, setInstructorPeriod] = useState<FleetPeriod>('month');
  const [studentPeriod, setStudentPeriod] = useState<FleetPeriod>('month');
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTargetLoading, setIsTargetLoading] = useState(true);

  const isModern = uiMode === 'modern';
  const tenantIndustry = useMemo(() => resolveIndustryKey(tenant?.industry), [tenant?.industry]);
  const tabs = INDUSTRY_TABS[activeIndustry];

  useEffect(() => {
    setActiveIndustry(tenantIndustry);
  }, [tenantIndustry]);

  useEffect(() => {
    setActiveTab(activeIndustry === 'ATO' ? 'fleet' : tabs[0]?.value ?? 'overview');
  }, [activeIndustry, tabs]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const [summaryResponse, quickSafetyResponse] = await Promise.all([
          fetch('/api/dashboard-summary', { cache: 'no-store' }),
          fetch('/api/quick-safety-reports', { cache: 'no-store' }),
        ]);
        const payload = (await parseJsonResponse<SummaryPayload>(summaryResponse)) ?? {};
        const quickSafetyPayload = await quickSafetyResponse.json().catch(() => ({ reports: [] }));
        if (!cancelled) {
          setSummary(payload);
          setQuickSafetyReports(Array.isArray(quickSafetyPayload?.reports) ? quickSafetyPayload.reports : []);
        }
      } catch {
        if (!cancelled) setSummary({});
        if (!cancelled) setQuickSafetyReports([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    const handleTechnicalReportUpdate = () => {
      void load();
    };
    const handleQuickSafetyReportUpdate = () => {
      void load();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'safeviate-technical-reports-updated' || event.key === 'safeviate-quick-safety-reports-updated') {
        void load();
      }
    };
    window.addEventListener('safeviate-technical-reports-updated', handleTechnicalReportUpdate);
    window.addEventListener('safeviate-quick-safety-reports-updated', handleQuickSafetyReportUpdate);
    window.addEventListener('safeviate-safety-reports-updated', handleQuickSafetyReportUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-technical-reports-updated', handleTechnicalReportUpdate);
      window.removeEventListener('safeviate-quick-safety-reports-updated', handleQuickSafetyReportUpdate);
      window.removeEventListener('safeviate-safety-reports-updated', handleQuickSafetyReportUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  useEffect(() => {
    let cancelled = false;

    const loadFleetTarget = async () => {
      setIsTargetLoading(true);
      try {
        const response = await fetch('/api/tenant-config', { cache: 'no-store' });
        const payload = response.ok ? await response.json().catch(() => ({})) : {};
        const config = payload?.config && typeof payload.config === 'object' ? (payload.config as Record<string, unknown>) : null;
        const value = config?.['fleet-target-hours'];
        const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : DEFAULT_FLEET_TARGET_HOURS;
        if (!cancelled && Number.isFinite(parsed) && parsed > 0) {
          setFleetTargetHours(parsed);
        }
      } catch {
        if (!cancelled) setFleetTargetHours(DEFAULT_FLEET_TARGET_HOURS);
      } finally {
        if (!cancelled) setIsTargetLoading(false);
      }
    };

    void loadFleetTarget();
    return () => {
      cancelled = true;
    };
  }, []);

  const instructorWarningBands = useMemo<InstructorWarningBand[]>(() => {
    const config = tenant as Record<string, unknown> | null;
    const rawWarnings = config?.['instructor-hour-warnings'];

    if (!rawWarnings || typeof rawWarnings !== 'object') {
      return DEFAULT_INSTRUCTOR_WARNING_BANDS;
    }

    const warnings = Array.isArray((rawWarnings as { warnings?: unknown }).warnings)
      ? ((rawWarnings as { warnings: unknown[] }).warnings)
      : [];

    const normalized = warnings.reduce<InstructorWarningBand[]>((acc, warning) => {
      if (!warning || typeof warning !== 'object') return acc;
      const candidate = warning as Record<string, unknown>;
      const hours = typeof candidate.hours === 'number' ? candidate.hours : Number(candidate.hours);
      const warningHours = typeof candidate.warningHours === 'number' ? candidate.warningHours : Number(candidate.warningHours);
      if (!Number.isFinite(hours) || !Number.isFinite(warningHours) || hours <= 0 || warningHours < 0 || warningHours >= hours) {
        return acc;
      }
      acc.push({
        hours,
        warningHours,
        color: typeof candidate.color === 'string' ? candidate.color : undefined,
        foregroundColor: typeof candidate.foregroundColor === 'string' ? candidate.foregroundColor : undefined,
      });
      return acc;
    }, []).sort((a, b) => a.hours - b.hours);

    return normalized.length > 0 ? normalized : DEFAULT_INSTRUCTOR_WARNING_BANDS;
  }, [tenant]);

  const instructorMetrics = useMemo<InstructorMetrics>(() => {
    const instructors: Array<{ id: string; firstName?: string; lastName?: string }> = Array.isArray(summary.instructors)
      ? summary.instructors
      : [];
    const bookings = Array.isArray(summary.bookings) ? summary.bookings : [];
    const attendanceRecords = Array.isArray(summary.attendanceRecords) ? summary.attendanceRecords : [];
    const periodStart = getPeriodStart(instructorPeriod);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);

    const periodBookings = periodStart
      ? bookings.filter((booking) => {
          if (!booking.date) return false;
          const bookingDate = new Date(booking.date);
          return !Number.isNaN(bookingDate.getTime()) && bookingDate >= periodStart && bookingDate <= new Date();
        })
      : bookings;

    const todayBookings = bookings.filter((booking) => {
      if (!booking.date) return false;
      const bookingDate = new Date(booking.date);
      return !Number.isNaN(bookingDate.getTime()) && bookingDate >= todayStart && bookingDate < tomorrowStart;
    });

    const periodAttendance = periodStart
      ? attendanceRecords.filter((record) => {
          if (!record.clockIn) return false;
          const clockIn = new Date(record.clockIn);
          return !Number.isNaN(clockIn.getTime()) && clockIn >= periodStart && clockIn <= new Date();
        })
      : attendanceRecords;

    const todayAttendance = attendanceRecords.filter((record) => {
      if (!record.clockIn) return false;
      const clockIn = new Date(record.clockIn);
      return !Number.isNaN(clockIn.getTime()) && clockIn >= todayStart && clockIn < tomorrowStart;
    });

    const rows: InstructorLoadRow[] = instructors.map((instructor) => {
      const periodInstructorBookings = periodBookings.filter((booking) => booking.instructorId === instructor.id);
      const todayInstructorBookings = todayBookings.filter((booking) => booking.instructorId === instructor.id);
      const periodInstructorAttendance = periodAttendance.filter((record) => record.personnelId === instructor.id);
      const todayInstructorAttendance = todayAttendance.filter((record) => record.personnelId === instructor.id);

      const periodFlightHours = periodInstructorBookings.reduce((sum, booking) => {
        const pre = booking.preFlightData?.hobbs;
        const post = booking.postFlightData?.hobbs;
        if (pre === undefined || post === undefined) return sum;
        return sum + Math.max(0, post - pre);
      }, 0);

      const todayFlightHours = todayInstructorBookings.reduce((sum, booking) => {
        const pre = booking.preFlightData?.hobbs;
        const post = booking.postFlightData?.hobbs;
        if (pre === undefined || post === undefined) return sum;
        return sum + Math.max(0, post - pre);
      }, 0);

      const periodDutyMinutes = periodInstructorAttendance.reduce((sum, record) => sum + calcNetDutyMinutes(record, Date.now()), 0);
      const todayDutyMinutes = todayInstructorAttendance.reduce((sum, record) => sum + calcNetDutyMinutes(record, Date.now()), 0);
      const dailyStatus = getInstructorLoadStatus(todayFlightHours, instructorWarningBands);
      const hasOpenSession = periodInstructorAttendance.some((record) => record.status === 'clocked_in' && !record.clockOut);

      return {
        id: instructor.id,
        name: `${instructor.firstName || ''} ${instructor.lastName || ''}`.trim() || instructor.id,
        periodFlightHours: parseFloat(periodFlightHours.toFixed(1)),
        periodDutyHours: parseFloat((periodDutyMinutes / 60).toFixed(1)),
        todayFlightHours: parseFloat(todayFlightHours.toFixed(1)),
        todayDutyHours: parseFloat((todayDutyMinutes / 60).toFixed(1)),
        bookingCount: periodInstructorBookings.length,
        dutyMinutes: periodDutyMinutes,
        nextLimitHours: dailyStatus.nextLimitHours,
        warningHours: dailyStatus.warningHours,
        status: dailyStatus.status,
        hasOpenSession,
      };
    });

    rows.sort((a: InstructorLoadRow, b: InstructorLoadRow) => b.todayFlightHours - a.todayFlightHours || b.periodFlightHours - a.periodFlightHours);

    const totalPeriodFlightHours = rows.reduce((sum, row) => sum + row.periodFlightHours, 0);
    const totalPeriodDutyHours = rows.reduce((sum, row) => sum + row.periodDutyHours, 0);
    const totalTodayFlightHours = rows.reduce((sum, row) => sum + row.todayFlightHours, 0);
    const totalTodayDutyHours = rows.reduce((sum, row) => sum + row.todayDutyHours, 0);
    const openSessions = rows.filter((row) => row.hasOpenSession).length;
    const watchCount = rows.filter((row) => row.status === 'watch').length;
    const overCount = rows.filter((row) => row.status === 'over').length;

    return {
      rows,
      periodLabel: getPeriodLabel(instructorPeriod),
      totalPeriodFlightHours: parseFloat(totalPeriodFlightHours.toFixed(1)),
      totalPeriodDutyHours: parseFloat(totalPeriodDutyHours.toFixed(1)),
      totalTodayFlightHours: parseFloat(totalTodayFlightHours.toFixed(1)),
      totalTodayDutyHours: parseFloat(totalTodayDutyHours.toFixed(1)),
      openSessions,
      watchCount,
      overCount,
    };
  }, [instructorPeriod, instructorWarningBands, summary.attendanceRecords, summary.bookings, summary.instructors]);

  const studentMilestones = useMemo<MilestoneWarning[]>(() => {
    const settings = summary.studentMilestones;
    const milestones = settings && Array.isArray(settings.milestones) ? settings.milestones : DEFAULT_STUDENT_MILESTONES;
    return milestones
      .map((entry) => ({
        milestone: typeof entry.milestone === 'number' ? entry.milestone : Number(entry.milestone),
        warningHours: typeof entry.warningHours === 'number' ? entry.warningHours : Number(entry.warningHours),
      }))
      .filter((entry) => Number.isFinite(entry.milestone) && Number.isFinite(entry.warningHours) && entry.milestone > 0 && entry.warningHours >= 0 && entry.warningHours < entry.milestone)
      .sort((a, b) => a.milestone - b.milestone);
  }, [summary.studentMilestones]);

  const studentMetrics = useMemo<StudentMetrics>(() => {
    const students: Array<{ id: string; firstName?: string; lastName?: string }> = Array.isArray(summary.students)
      ? summary.students
      : [];
    const bookings = Array.isArray(summary.bookings) ? summary.bookings : [];
    const reports = Array.isArray(summary.studentProgressReports) ? summary.studentProgressReports : [];
    const periodStart = getPeriodStart(studentPeriod);
    const now = new Date();
    const periodBookings = periodStart
      ? bookings.filter((booking) => {
          if (!booking.date) return false;
          const bookingDate = new Date(booking.date);
          return !Number.isNaN(bookingDate.getTime()) && bookingDate >= periodStart && bookingDate <= now;
        })
      : bookings;
    const recentCutoff = new Date(now);
    recentCutoff.setDate(now.getDate() - 30);
    const inactiveCutoff = new Date(now);
    inactiveCutoff.setDate(now.getDate() - 45);
    const reportCutoff = periodStart || recentCutoff;
    const periodDays = getPeriodDays(studentPeriod);

    const rows: StudentLoadRow[] = students.map((student) => {
      const studentBookings = bookings.filter((booking) => booking.studentId === student.id);
      const periodStudentBookings = periodBookings.filter((booking) => booking.studentId === student.id);
      const studentReports = reports.filter((report) => report.studentId === student.id);
      const totalFlightHours = studentBookings.reduce((sum, booking) => {
        const pre = booking.preFlightData?.hobbs;
        const post = booking.postFlightData?.hobbs;
        if (pre === undefined || post === undefined) return sum;
        return sum + Math.max(0, post - pre);
      }, 0);
      const recentFlightHours = periodStudentBookings.reduce((sum, booking) => {
        const pre = booking.preFlightData?.hobbs;
        const post = booking.postFlightData?.hobbs;
        if (pre === undefined || post === undefined) return sum;
        return sum + Math.max(0, post - pre);
      }, 0);
      const lastFlightDate = studentBookings
        .map((booking) => booking.date ? new Date(booking.date) : null)
        .filter((date): date is Date => date !== null && !Number.isNaN(date.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0] || null;
      const lastDebriefDate = studentReports
        .map((report) => new Date(report.date))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0] || null;
      const daysSinceFlight = getDaysSince(lastFlightDate, now);
      const daysSinceDebrief = getDaysSince(lastDebriefDate, now);
      const utilisationShare = totalFlightHours > 0 ? parseFloat(((recentFlightHours / totalFlightHours) * 100).toFixed(1)) : 0;
      const nextMilestone = studentMilestones.find((milestone) => totalFlightHours < milestone.milestone) || null;
      const pacePerWeek = periodDays > 0 ? parseFloat(((recentFlightHours / periodDays) * 7).toFixed(1)) : 0;
      const forecastDaysToNextMilestone = nextMilestone && recentFlightHours > 0
        ? Math.max(0, Math.ceil(((nextMilestone.milestone - totalFlightHours) / recentFlightHours) * periodDays))
        : null;
      const status: StudentLoadStatus = !nextMilestone
        ? 'over'
        : totalFlightHours >= nextMilestone.warningHours
          ? 'watch'
          : 'safe';
      const recommendedAction = getStudentRecommendation({
        status,
        daysSinceFlight,
        daysSinceDebrief,
        forecastDaysToNextMilestone,
      });

      return {
        id: student.id,
        name: `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.id,
        totalFlightHours: parseFloat(totalFlightHours.toFixed(1)),
        recentFlightHours: parseFloat(recentFlightHours.toFixed(1)),
        lastFlightDate: lastFlightDate ? lastFlightDate.toISOString() : null,
        lastDebriefDate: lastDebriefDate ? lastDebriefDate.toISOString() : null,
        daysSinceFlight,
        daysSinceDebrief,
        utilisationShare,
        pacePerWeek,
        forecastDaysToNextMilestone,
        recommendedAction,
        milestoneHours: nextMilestone ? nextMilestone.milestone : null,
        warningHours: nextMilestone ? nextMilestone.warningHours : null,
        status,
      };
    });

    rows.sort((a: StudentLoadRow, b: StudentLoadRow) => {
      if (a.status !== b.status) {
        if (a.status === 'over') return -1;
        if (b.status === 'over') return 1;
        if (a.status === 'watch') return -1;
        if (b.status === 'watch') return 1;
      }
      return b.recentFlightHours - a.recentFlightHours || b.totalFlightHours - a.totalFlightHours;
    });

    const activeStudents = rows.filter((row) => row.recentFlightHours > 0).length;
    const newStudents = rows.filter((row) => {
      if (!row.lastFlightDate || !periodStart) return false;
      const lastFlight = new Date(row.lastFlightDate);
      return !Number.isNaN(lastFlight.getTime()) && lastFlight >= periodStart && row.totalFlightHours <= row.recentFlightHours;
    }).length;
    const recentDebriefs = rows.filter((row) => {
      if (!row.lastDebriefDate) return false;
      const lastDebrief = new Date(row.lastDebriefDate);
      return !Number.isNaN(lastDebrief.getTime()) && lastDebrief >= reportCutoff;
    }).length;
    const stagnatingStudents = rows.filter((row) => row.daysSinceFlight !== null && row.daysSinceFlight >= 30).length;
    const forecastedNextMilestones = rows.filter((row) => row.forecastDaysToNextMilestone !== null && row.forecastDaysToNextMilestone <= 30).length;
    const noRecentActivity = rows.filter((row) => {
      if (!row.lastFlightDate) return true;
      const lastFlight = new Date(row.lastFlightDate);
      return Number.isNaN(lastFlight.getTime()) || lastFlight < inactiveCutoff;
    }).length;
    const watchCount = rows.filter((row) => row.status === 'watch').length;
    const overCount = rows.filter((row) => row.status === 'over').length;

    return {
      rows,
      periodLabel: getPeriodLabel(studentPeriod),
      activeStudents,
      newStudents,
      recentDebriefs,
      noRecentActivity,
      stagnatingStudents,
      forecastedNextMilestones,
      watchCount,
      overCount,
    };
  }, [studentPeriod, studentMilestones, summary.bookings, summary.studentProgressReports, summary.students]);

  const fleetRows = useMemo<FleetRow[]>(() => {
    const aircrafts = Array.isArray(summary.aircrafts) ? summary.aircrafts : [];
    const bookings = Array.isArray(summary.bookings) ? summary.bookings : [];
    const targetHours = fleetTargetHours;
    const now = new Date();
    const periodStart = (() => {
      if (fleetPeriod === 'week') {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        return start;
      }
      if (fleetPeriod === 'month') {
        const start = new Date(now);
        start.setMonth(now.getMonth() - 1);
        return start;
      }
      return null;
    })();
    const filteredBookings = periodStart
      ? bookings.filter((booking) => {
          if (!booking.date) return false;
          const bookingDate = new Date(booking.date);
          return !Number.isNaN(bookingDate.getTime()) && bookingDate >= periodStart && bookingDate <= now;
        })
      : bookings;

    return aircrafts
      .map((aircraft) => {
        const loggedHours = filteredBookings.reduce((sum, booking) => {
          if (booking.aircraftId !== aircraft.id) return sum;
          const pre = booking.preFlightData?.hobbs;
          const post = booking.postFlightData?.hobbs;
          if (pre === undefined || post === undefined) return sum;
          return sum + Math.max(0, post - pre);
        }, 0);

        const service = getServiceState(aircraft);
        const hoursOnGround = parseFloat(Math.max(targetHours - loggedHours, 0).toFixed(1));
        const hoursInMaintenance = parseFloat(
          (service.serviceState === 'overdue' ? Math.max(loggedHours - targetHours, 0) : 0).toFixed(1)
        );

        return {
          aircraft,
          loggedHours: parseFloat(loggedHours.toFixed(1)),
          targetHours,
          hoursOnGround,
          hoursInMaintenance,
          targetMet: loggedHours >= targetHours,
          remainingHours: service.remainingHours,
          serviceState: service.serviceState,
        };
      })
      .sort((a, b) => b.loggedHours - a.loggedHours);
  }, [fleetPeriod, fleetTargetHours, summary.aircrafts, summary.bookings]);

  useEffect(() => {
    if (!selectedAircraftId && fleetRows[0]?.aircraft.id) {
      setSelectedAircraftId(fleetRows[0].aircraft.id);
    }
  }, [fleetRows, selectedAircraftId]);

  const fleetTrend = useMemo<FleetTrendPoint[]>(() => {
    const bookings = Array.isArray(summary.bookings) ? summary.bookings : [];
    const buckets = buildTrendBuckets(fleetPeriod);
    const now = new Date();
    const bucketed = buckets.map((bucketStart) => {
      const bucketEnd = new Date(bucketStart);
      if (fleetPeriod === 'all') {
        bucketEnd.setMonth(bucketStart.getMonth() + 1);
      } else if (fleetPeriod === 'month') {
        bucketEnd.setDate(bucketStart.getDate() + 7);
      } else {
        bucketEnd.setDate(bucketStart.getDate() + 1);
      }
      return {
        start: bucketStart,
        end: bucketEnd > now ? now : bucketEnd,
      };
    });

    return bucketed.map(({ start, end }) => {
      const relevantBookings = bookings.filter((booking) => {
        if (!booking.date) return false;
        const bookingDate = new Date(booking.date);
        return !Number.isNaN(bookingDate.getTime()) && bookingDate >= start && bookingDate < end;
      });

      const flightHours = relevantBookings.reduce((sum, booking) => {
        const pre = booking.preFlightData?.hobbs;
        const post = booking.postFlightData?.hobbs;
        if (pre === undefined || post === undefined) return sum;
        return sum + Math.max(0, post - pre);
      }, 0);

      const maintenanceHours = relevantBookings.reduce((sum, booking) => {
        const pre = booking.preFlightData?.hobbs;
        const post = booking.postFlightData?.hobbs;
        if (pre === undefined || post === undefined) return sum;
        const logged = Math.max(0, post - pre);
        return sum + Math.max(0, logged * 0.15);
      }, 0);

      const utilisationHours = Math.max(0, flightHours + maintenanceHours);
      const utilisationPercent = fleetTargetHours > 0 ? Math.min(100, (flightHours / fleetTargetHours) * 100) : 0;

      return {
        label: formatTrendLabel(start, fleetPeriod),
        flightHours: parseFloat(flightHours.toFixed(1)),
        maintenanceHours: parseFloat(maintenanceHours.toFixed(1)),
        utilisationHours: parseFloat(utilisationHours.toFixed(1)),
        utilisationPercent: parseFloat(utilisationPercent.toFixed(1)),
      };
    });
  }, [fleetPeriod, fleetTargetHours, summary.bookings]);

  const fleetTotals = useMemo(() => {
    const inService = fleetRows.filter((row) => row.serviceState === 'available').length;
    const nearingService = fleetRows.filter((row) => row.serviceState === 'nearing').length;
    const overdueService = fleetRows.filter((row) => row.serviceState === 'overdue').length;
    const totalHours = fleetRows.reduce((sum, row) => sum + row.loggedHours, 0);
    const totalTargetHours = fleetRows.reduce((sum, row) => sum + row.targetHours, 0);
    const bookings = Array.isArray(summary.bookings) ? summary.bookings : [];
    const totalFuelLitres = bookings.reduce((sum, booking) => sum + (booking.preFlightData?.fuelUpliftLitres || 0), 0);
    const totalFuelGallons = bookings.reduce((sum, booking) => sum + (booking.preFlightData?.fuelUpliftGallons || 0), 0);
    const totalOilUplift = bookings.reduce((sum, booking) => sum + (booking.preFlightData?.oilUplift || 0), 0);
    const averageUtilisation = fleetRows.length > 0 ? totalHours / fleetRows.length : 0;
    const highestUtilized = fleetRows[0];
    const lowestUtilized = fleetRows.at(-1);
    const metTargetCount = fleetRows.filter((row) => row.targetMet).length;

    return {
      inService,
      nearingService,
      overdueService,
      totalHours: parseFloat(totalHours.toFixed(1)),
      totalTargetHours: parseFloat(totalTargetHours.toFixed(1)),
      totalFuelLitres: parseFloat(totalFuelLitres.toFixed(1)),
      totalFuelGallons: parseFloat(totalFuelGallons.toFixed(1)),
      totalOilUplift: parseFloat(totalOilUplift.toFixed(1)),
      averageUtilisation: parseFloat(averageUtilisation.toFixed(1)),
      metTargetCount,
      highestUtilized,
      lowestUtilized,
    };
  }, [fleetRows, summary.bookings]);

  const targetHoursLabel = isTargetLoading ? 'Loading...' : formatHours(fleetTargetHours);
  const selectedAircraft = fleetRows.find((row) => row.aircraft.id === selectedAircraftId) || fleetRows[0] || null;
  const selectedAircraftTrend = useMemo<FleetTrendPoint[]>(() => {
    if (!selectedAircraft) return [];
    const bookings = Array.isArray(summary.bookings) ? summary.bookings : [];
    const now = new Date();
    const buckets = buildTrendBuckets(fleetPeriod).map((bucketStart) => {
      const bucketEnd = new Date(bucketStart);
      if (fleetPeriod === 'all') {
        bucketEnd.setMonth(bucketStart.getMonth() + 1);
      } else if (fleetPeriod === 'month') {
        bucketEnd.setDate(bucketStart.getDate() + 7);
      } else {
        bucketEnd.setDate(bucketStart.getDate() + 1);
      }
      return {
        start: bucketStart,
        end: bucketEnd > now ? now : bucketEnd,
      };
    });

    return buckets.map(({ start, end }) => {
      const relevantBookings = bookings.filter((booking) => {
        if (booking.aircraftId !== selectedAircraft.aircraft.id || !booking.date) return false;
        const bookingDate = new Date(booking.date);
        return !Number.isNaN(bookingDate.getTime()) && bookingDate >= start && bookingDate < end;
      });

      const flightHours = relevantBookings.reduce((sum, booking) => {
        const pre = booking.preFlightData?.hobbs;
        const post = booking.postFlightData?.hobbs;
        if (pre === undefined || post === undefined) return sum;
        return sum + Math.max(0, post - pre);
      }, 0);

      const maintenanceHours = relevantBookings.reduce((sum, booking) => {
        const pre = booking.preFlightData?.hobbs;
        const post = booking.postFlightData?.hobbs;
        if (pre === undefined || post === undefined) return sum;
        const logged = Math.max(0, post - pre);
        return sum + Math.max(0, logged * 0.15);
      }, 0);

      const utilisationHours = Math.max(0, flightHours + maintenanceHours);
      const utilisationPercent = fleetTargetHours > 0 ? Math.min(100, (flightHours / fleetTargetHours) * 100) : 0;

      return {
        label: formatTrendLabel(start, fleetPeriod),
        flightHours: parseFloat(flightHours.toFixed(1)),
        maintenanceHours: parseFloat(maintenanceHours.toFixed(1)),
        utilisationHours: parseFloat(utilisationHours.toFixed(1)),
        utilisationPercent: parseFloat(utilisationPercent.toFixed(1)),
      };
    });
  }, [fleetPeriod, fleetTargetHours, selectedAircraft, summary.bookings]);

  const activeIndustryLabel = INDUSTRY_SWITCHER.find((item) => item.value === activeIndustry)?.label || activeIndustry;
  const activeTabLabel = tabs.find((tab) => tab.value === activeTab)?.label || tabs[0]?.label || 'Overview';
  const openTechnicalReports = useMemo(
    () => (Array.isArray(summary.technicalReports) ? summary.technicalReports : []).filter((report) => (report.status || 'Open') !== 'Closed'),
    [summary.technicalReports]
  );
  const openQuickSafetyReports = useMemo(
    () =>
      quickSafetyReports.filter(
        (report) => (report.status || 'Open') !== 'Closed' && !report.linkedSafetyReportId
      ),
    [quickSafetyReports]
  );
  const quickReportAttentionCount = openTechnicalReports.length + openQuickSafetyReports.length;
  const renderIndustryLabel = (industry: DashboardIndustry, label: string) => (
    <span className="flex items-center gap-2">
      <span>{label}</span>
      {industry === 'ATO' && quickReportAttentionCount > 0 ? (
        <Badge variant="destructive" className="h-5 px-2 text-[9px] font-black uppercase tracking-widest">
          {quickReportAttentionCount}
        </Badge>
      ) : null}
    </span>
  );
  const renderTabLabel = (tab: IndustryTab) => (
    <span className="flex items-center gap-2">
      <span>{tab.label}</span>
      {tab.value === 'safety' && quickReportAttentionCount > 0 ? (
        <Badge variant="destructive" className="h-5 px-2 text-[9px] font-black uppercase tracking-widest">
          {quickReportAttentionCount}
        </Badge>
      ) : null}
    </span>
  );

  return (
    <div
      className={cn(
        'mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col gap-6 overflow-hidden',
        isModern && 'gap-7 px-2 md:px-1'
      )}
    >
      {quickReportAttentionCount > 0 ? (
        <Card className={cn('border-amber-300 bg-amber-50/80 shadow-none', isModern && 'border-amber-300/80 bg-amber-50/70')}>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-tight text-amber-950">Quick Reports Need Attention</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-amber-900/80">
                {openTechnicalReports.length} preliminary technical report{openTechnicalReports.length === 1 ? '' : 's'}
                {openQuickSafetyReports.length > 0
                  ? ` and ${openQuickSafetyReports.length} quick safety report${openQuickSafetyReports.length === 1 ? '' : 's'}`
                  : ''}{' '}
                are waiting for review.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-amber-300 bg-white text-[10px] font-black uppercase text-amber-950">
                Technical {openTechnicalReports.length}
              </Badge>
              {openQuickSafetyReports.length > 0 ? (
                <Badge variant="outline" className="border-amber-300 bg-white text-[10px] font-black uppercase text-amber-950">
                  Safety {openQuickSafetyReports.length}
                </Badge>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="border-amber-300 bg-white text-[10px] font-black uppercase text-amber-950 hover:bg-amber-100"
                onClick={() => {
                  setActiveIndustry('ATO');
                  setActiveTab('safety');
                }}
              >
                Review Quick Reports
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card className={cn(DASHBOARD_SHELL_CLASS, 'flex min-h-0 flex-1 flex-col', isModern && 'border-slate-200/80 bg-white/95')}>
        <CardHeader className={cn(CARD_HEADER_BAND_CLASS, 'sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80', isModern && 'bg-white/95 supports-[backdrop-filter]:bg-white/85')}>
          <div className={CARD_HEADER_SCOPE_ZONE_CLASS}>
            <CardTitle className="text-sm font-black uppercase tracking-tight">{INDUSTRY_TITLES[activeIndustry]}</CardTitle>
            <CardDescription className="mt-1 text-xs">
              {INDUSTRY_DESCRIPTIONS[activeIndustry]}
              <span className="ml-2 font-black uppercase tracking-[0.18em] text-foreground/70">Active: {activeTabLabel}</span>
              {activeIndustry === 'ATO' ? (
                <span className="ml-2 font-black uppercase tracking-[0.18em] text-foreground/70">
                  Period: {fleetPeriod === 'week' ? 'Last 7 days' : fleetPeriod === 'month' ? 'Last 30 days' : 'All time'}
                </span>
              ) : null}
            </CardDescription>
          </div>
          <div className={CARD_HEADER_ACTION_ZONE_CLASS}>
            {isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      HEADER_SECONDARY_BUTTON_CLASS,
                      HEADER_COMPACT_CONTROL_CLASS,
                      'w-full justify-between text-foreground hover:bg-accent/40'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{activeIndustryLabel}</span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                  {INDUSTRY_SWITCHER.map((item) => (
                    <DropdownMenuItem
                      key={item.value}
                      onClick={() => setActiveIndustry(item.value as DashboardIndustry)}
                      className="text-[10px] font-bold uppercase"
                    >
                      {renderIndustryLabel(item.value as DashboardIndustry, item.label)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Tabs value={activeIndustry} onValueChange={(value) => setActiveIndustry(value as DashboardIndustry)} className="w-full md:w-auto">
                <TabsList className={HEADER_TAB_LIST_CLASS}>
                  {INDUSTRY_SWITCHER.map((item) => (
                    <TabsTrigger key={item.value} value={item.value} className={HEADER_TAB_TRIGGER_CLASS}>
                      {renderIndustryLabel(item.value as DashboardIndustry, item.label)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 p-0">
          <Tabs key={activeIndustry} value={activeTab} onValueChange={setActiveTab} className="flex h-full min-h-0 flex-col">
            <div className={cn(CARD_HEADER_BAND_CLASS, 'bg-transparent flex justify-center')}>
              {isMobile ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        HEADER_SECONDARY_BUTTON_CLASS,
                        HEADER_COMPACT_CONTROL_CLASS,
                        'w-full justify-between text-foreground hover:bg-accent/40'
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{activeTabLabel}</span>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                  {tabs.map((tab) => (
                    <DropdownMenuItem
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className="text-[10px] font-bold uppercase"
                    >
                      {tab.label}
                      {tab.value === 'safety' && quickReportAttentionCount > 0 ? ` (${quickReportAttentionCount})` : ''}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <TabsList className={cn(HEADER_TAB_LIST_CLASS, 'border-0 bg-transparent px-0 py-0 justify-center')}>
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className={HEADER_TAB_TRIGGER_CLASS}>
                    {renderTabLabel(tab)}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}
            </div>

            {activeIndustry === 'ATO' && activeTab === 'fleet' ? (
              <div className={cn(CARD_HEADER_BAND_CLASS, 'bg-transparent')}>
                {isMobile ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          HEADER_SECONDARY_BUTTON_CLASS,
                          HEADER_COMPACT_CONTROL_CLASS,
                          'w-full justify-between text-foreground hover:bg-accent/40'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {fleetPeriod === 'week' ? '7 Days' : fleetPeriod === 'month' ? '30 Days' : 'All Time'}
                          </span>
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                      {FLEET_PERIOD_OPTIONS.map((period) => (
                        <DropdownMenuItem
                          key={period}
                          onClick={() => setFleetPeriod(period)}
                          className="text-[10px] font-bold uppercase"
                        >
                          {period === 'week' ? '7 Days' : period === 'month' ? '30 Days' : 'All Time'}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="flex w-full flex-wrap items-center justify-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Period</span>
                    {FLEET_PERIOD_OPTIONS.map((period) => (
                      <button
                        key={period}
                        type="button"
                        onClick={() => setFleetPeriod(period)}
                        className={cn(
                          HEADER_COMPACT_CONTROL_CLASS,
                          fleetPeriod === period ? 'border-foreground text-foreground' : 'border-input text-muted-foreground'
                        )}
                      >
                        {period === 'week' ? '7 Days' : period === 'month' ? '30 Days' : 'All Time'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {activeIndustry === 'ATO' && activeTab === 'instructors' ? (
              <div className={cn(CARD_HEADER_BAND_CLASS, 'bg-transparent')}>
                {isMobile ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          HEADER_SECONDARY_BUTTON_CLASS,
                          HEADER_COMPACT_CONTROL_CLASS,
                          'w-full justify-between text-foreground hover:bg-accent/40'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {instructorPeriod === 'week' ? '7 Days' : instructorPeriod === 'month' ? '30 Days' : 'All Time'}
                          </span>
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                      {FLEET_PERIOD_OPTIONS.map((period) => (
                        <DropdownMenuItem
                          key={period}
                          onClick={() => setInstructorPeriod(period)}
                          className="text-[10px] font-bold uppercase"
                        >
                          {period === 'week' ? '7 Days' : period === 'month' ? '30 Days' : 'All Time'}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="flex w-full flex-wrap items-center justify-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Period</span>
                    {FLEET_PERIOD_OPTIONS.map((period) => (
                      <button
                        key={period}
                        type="button"
                        onClick={() => setInstructorPeriod(period)}
                        className={cn(
                          HEADER_COMPACT_CONTROL_CLASS,
                          instructorPeriod === period ? 'border-foreground text-foreground' : 'border-input text-muted-foreground'
                        )}
                      >
                        {period === 'week' ? '7 Days' : period === 'month' ? '30 Days' : 'All Time'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {activeIndustry === 'ATO' && activeTab === 'students' ? (
              <div className={cn(CARD_HEADER_BAND_CLASS, 'bg-transparent')}>
                {isMobile ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          HEADER_SECONDARY_BUTTON_CLASS,
                          HEADER_COMPACT_CONTROL_CLASS,
                          'w-full justify-between text-foreground hover:bg-accent/40'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {studentPeriod === 'week' ? '7 Days' : studentPeriod === 'month' ? '30 Days' : 'All Time'}
                          </span>
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                      {FLEET_PERIOD_OPTIONS.map((period) => (
                        <DropdownMenuItem
                          key={period}
                          onClick={() => setStudentPeriod(period)}
                          className="text-[10px] font-bold uppercase"
                        >
                          {period === 'week' ? '7 Days' : period === 'month' ? '30 Days' : 'All Time'}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="flex w-full flex-wrap items-center justify-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Period</span>
                    {FLEET_PERIOD_OPTIONS.map((period) => (
                      <button
                        key={period}
                        type="button"
                        onClick={() => setStudentPeriod(period)}
                        className={cn(
                          HEADER_COMPACT_CONTROL_CLASS,
                          studentPeriod === period ? 'border-foreground text-foreground' : 'border-input text-muted-foreground'
                        )}
                      >
                        {period === 'week' ? '7 Days' : period === 'month' ? '30 Days' : 'All Time'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <ScrollArea className="h-full flex-1">
              <div className="p-6 pb-10 md:p-8 md:pb-10">
                {activeIndustry === 'ATO' ? (
                  <>
                    <TabsContent value="fleet" className="m-0 space-y-6">
                      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                        <Card className={cn(DASHBOARD_SHELL_CLASS, 'flex min-h-[460px] flex-col', isModern && 'border-slate-200/80 bg-white/95')}>
                          <CardHeader className="border-b bg-muted/5 px-4 py-3">
                            <CardTitle className="text-sm font-black uppercase tracking-tight">Fleet Overview</CardTitle>
                            <CardDescription className="text-xs">Aircraft readiness, fuel, oil, and utilisation at a glance.</CardDescription>
                          </CardHeader>
                          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                            <StatTile label="In Service" value={String(fleetTotals.inService)} hint="Aircraft ready for training" />
                            <StatTile label="Nearing Service" value={String(fleetTotals.nearingService)} hint="Within warning band" />
                            <StatTile label="Overdue" value={String(fleetTotals.overdueService)} hint="Past service threshold" />
                            <StatTile label="Fleet Hours" value={formatHours(fleetTotals.totalHours)} hint="Logged flight time" />
                            <StatTile label="Fuel Uplift" value={`${fleetTotals.totalFuelLitres.toFixed(1)}L`} hint={`${fleetTotals.totalFuelGallons.toFixed(1)} gal logged`} />
                            <StatTile label="Oil Uplift" value={`${fleetTotals.totalOilUplift.toFixed(1)}`} hint="Logged oil uplift" />
                            <StatTile label="Avg Utilisation" value={formatHours(fleetTotals.averageUtilisation)} hint="Average per aircraft" />
                            <StatTile label="Target Met" value={String(fleetTotals.metTargetCount)} hint="Aircraft meeting target" />
                          </CardContent>
                        </Card>

                        <Card className={cn(DASHBOARD_SHELL_CLASS, 'flex min-h-[460px] flex-col', isModern && 'border-slate-200/80 bg-white/95')}>
                          <CardHeader className="border-b bg-muted/5 px-4 py-3">
                            <CardTitle className="text-sm font-black uppercase tracking-tight">Aircraft Selector</CardTitle>
                            <CardDescription className="text-xs">Pick an aircraft card to open its utilisation detail.</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3 p-4">
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {fleetRows.slice(0, 6).map((row) => {
                                const isSelected = selectedAircraftId === row.aircraft.id;
                                return (
                                  <Link
                                    key={row.aircraft.id}
                                    href={`/assets/aircraft/${row.aircraft.id}`}
                                    className={cn(
                                      'block rounded-2xl border p-3 text-left transition-colors',
                                      isSelected ? 'border-foreground bg-foreground/5' : 'border-input bg-background hover:border-foreground/40'
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-black uppercase tracking-tight">{row.aircraft.tailNumber}</p>
                                        <p className="text-[10px] font-medium uppercase text-muted-foreground">
                                          {row.aircraft.make} {row.aircraft.model}
                                        </p>
                                      </div>
                                      <Badge
                                        variant={row.targetMet ? 'default' : 'secondary'}
                                        className="text-[10px] font-black uppercase"
                                      >
                                        {row.targetMet ? 'Met' : 'Below'}
                                      </Badge>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                                      <span>Utilisation</span>
                                      <span className="font-black text-foreground">{formatHours(row.loggedHours)}</span>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>

                            <div className="h-[240px]">
                              {isLoading || isTargetLoading ? (
                                <Skeleton className="h-full w-full" />
                              ) : selectedAircraftTrend.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <ComposedChart data={selectedAircraftTrend} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                                    <Tooltip
                                      formatter={(value: number, name: string) => {
                                        if (name === 'utilisationPercent') return [`${value}%`, 'Utilisation'];
                                        return [`${value.toFixed(1)}h`, name];
                                      }}
                                    />
                                    <Area type="monotone" dataKey="flightHours" name="Flight time" stroke="#1d4ed8" fill="#1d4ed8" fillOpacity={0.12} strokeWidth={2} />
                                    <Line type="monotone" dataKey="maintenanceHours" name="Maintenance time" stroke="#f97316" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="utilisationPercent" name="Utilisation %" stroke="#16a34a" strokeWidth={2} dot={false} />
                                  </ComposedChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-muted/5 text-sm text-muted-foreground">
                                  No trend data available yet.
                                </div>
                              )}
                            </div>
                            {selectedAircraft ? (
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                Showing {selectedAircraft.aircraft.tailNumber} for the selected period.
                              </p>
                            ) : null}
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    {tabs.filter((tab) => tab.value !== 'fleet').map((tab) => (
                      <TabsContent key={tab.value} value={tab.value} className="m-0">
                        {tab.value === 'overview' ? (
                          <InstructorOverviewCard modern={isModern} metrics={instructorMetrics} summary={summary} />
                        ) : tab.value === 'instructors' ? (
                          <InstructorLoadCard modern={isModern} metrics={instructorMetrics} />
                        ) : tab.value === 'students' ? (
                          <StudentOverviewCard modern={isModern} metrics={studentMetrics} summary={summary} />
                        ) : tab.value === 'safety' ? (
                          <SafetyOverviewCard modern={isModern} summary={summary} />
                        ) : tab.value === 'quality' ? (
                          <QualityOverviewCard modern={isModern} summary={summary} organizationScopeId={scopedOrganizationId} />
                        ) : (
                          <StageCard tabLabel={tab.label} modern={isModern} />
                        )}
                      </TabsContent>
                    ))}
                  </>
                ) : (
                  tabs.map((tab) => (
                    <TabsContent key={tab.value} value={tab.value} className="m-0">
                      {tab.value === 'overview' ? (
                        <InstructorOverviewCard modern={isModern} metrics={instructorMetrics} summary={summary} />
                      ) : tab.value === 'instructors' ? (
                        <InstructorLoadCard modern={isModern} metrics={instructorMetrics} />
                      ) : tab.value === 'students' ? (
                        <StudentOverviewCard modern={isModern} metrics={studentMetrics} summary={summary} />
                      ) : tab.value === 'safety' ? (
                        <SafetyOverviewCard modern={isModern} summary={summary} />
                      ) : tab.value === 'quality' ? (
                        <QualityOverviewCard modern={isModern} summary={summary} organizationScopeId={scopedOrganizationId} />
                      ) : (
                        <StageCard tabLabel={tab.label} modern={isModern} />
                      )}
                    </TabsContent>
                  ))
                )}
              </div>
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex min-h-[128px] flex-col justify-between rounded-2xl border bg-muted/5 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="mt-2 text-[10px] font-medium uppercase text-muted-foreground">{hint}</p>
    </div>
  );
}

function StageCard({ tabLabel, modern }: { tabLabel: string; modern: boolean }) {
  return (
    <Card className={cn(DASHBOARD_SHELL_CLASS, 'min-h-[calc(100vh-18rem)]', modern && 'border-slate-200/80 bg-white/95')}>
      <CardHeader
        className={cn(
          'sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          modern && 'bg-white/95 supports-[backdrop-filter]:bg-white/85'
        )}
      >
        <CardTitle className="text-sm font-black uppercase tracking-tight">{tabLabel}</CardTitle>
        <CardDescription className="text-xs">{EMPTY_NOTE}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-[280px] items-center justify-center p-6">
        <div className="max-w-xl rounded-2xl border border-dashed border-card-border/70 bg-muted/5 px-6 py-10 text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground/80">{tabLabel} scaffold ready</p>
          <p className="mt-3 text-sm text-muted-foreground">
            We will build this section separately so the dashboard stays clean and focused by industry.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function InstructorOverviewCard({
  modern,
  metrics,
  summary,
}: {
  modern: boolean;
  metrics: InstructorMetrics;
  summary: SummaryPayload;
}) {
  const topRows = metrics.rows.slice(0, 3);
  const technicalNotifications = (Array.isArray(summary.technicalReports) ? summary.technicalReports : [])
    .filter((report) => (report.status || 'Open') !== 'Closed')
    .sort((left, right) => `${right.eventDate}T${right.eventTime}`.localeCompare(`${left.eventDate}T${left.eventTime}`))
    .slice(0, 4);

  return (
    <Card className={cn(DASHBOARD_SHELL_CLASS, 'min-h-[calc(100vh-18rem)]', modern && 'border-slate-200/80 bg-white/95')}>
      <CardHeader
        className={cn(
          'sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          modern && 'bg-white/95 supports-[backdrop-filter]:bg-white/85'
        )}
      >
        <CardTitle className="text-sm font-black uppercase tracking-tight">Instructor Snapshot</CardTitle>
        <CardDescription className="text-xs">
          Daily flight load and duty pressure at a glance for {metrics.periodLabel.toLowerCase()}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Today Flight" value={formatHours(metrics.totalTodayFlightHours)} hint="Current daily training load" />
          <StatTile label="Today Duty" value={formatHours(metrics.totalTodayDutyHours)} hint="Attendance-based duty time" />
          <StatTile label="Watch" value={String(metrics.watchCount)} hint="Near daily limit" />
          <StatTile label="Over" value={String(metrics.overCount)} hint="Above warning band" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border bg-background">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/5 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-tight">Top Instructor Load</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Sorted by today's flight hours.
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] font-black uppercase">
                {metrics.rows.length} instructors
              </Badge>
            </div>
            <div className="divide-y">
              {topRows.length > 0 ? (
                topRows.map((row) => {
                  const statusClass = getStatusStyles(row.status);
                  return (
                    <div key={row.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-tight">{row.name}</p>
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {row.hasOpenSession ? 'Active session' : 'No open session'}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Today Flight</p>
                        <p className="mt-1 text-sm font-black">{formatHours(row.todayFlightHours)}</p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Period Flight</p>
                        <p className="mt-1 text-sm font-black">{formatHours(row.periodFlightHours)}</p>
                      </div>
                      <div className={cn('rounded-lg border px-3 py-3', statusClass)}>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em]">
                          {row.status === 'over' ? 'Over' : row.status === 'watch' ? 'Watch' : 'Safe'}
                        </p>
                        <p className="mt-1 text-sm font-black">
                          {row.warningHours !== null ? `Warn at ${row.warningHours}h` : 'No warning band'}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No instructor activity yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-background p-4">
            <p className="text-sm font-black uppercase tracking-tight">Quick Read</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              A simple summary for the duty team.
            </p>
            <div className="mt-4 space-y-3">
              <SummaryLine label="Flight period" value={formatHours(metrics.totalPeriodFlightHours)} />
              <SummaryLine label="Duty period" value={formatHours(metrics.totalPeriodDutyHours)} />
              <SummaryLine label="Open sessions" value={String(metrics.openSessions)} />
              <SummaryLine label="Near limit" value={String(metrics.watchCount)} />
              <SummaryLine label="Over limit" value={String(metrics.overCount)} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-background">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-tight">Preliminary Technical Report Notifications</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Open preliminary technical reports needing company follow-up.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] font-black uppercase">
              {technicalNotifications.length} open
            </Badge>
          </div>
          <div className="divide-y">
            {technicalNotifications.length > 0 ? (
              technicalNotifications.map((report) => (
                <div key={report.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,0.8fr))] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black uppercase tracking-tight">
                      {report.reportNumber} · {report.title || report.summary}
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {report.aircraftLabel || 'Aircraft not set'} · {report.location || 'Unknown location'}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                    <Badge variant={report.status === 'Closed' ? 'default' : 'destructive'} className="mt-2 text-[10px] font-black uppercase">
                      {report.status}
                    </Badge>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Filed</p>
                    <p className="mt-1 text-sm font-black">{format(parseLocalDate(report.eventDate) || new Date(report.eventDate), 'dd MMM yyyy')}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No open preliminary technical reports right now.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentOverviewCard({ modern, metrics, summary }: { modern: boolean; metrics: StudentMetrics; summary: SummaryPayload }) {
  const riskRows = metrics.rows.filter((row) => row.status !== 'safe').slice(0, 4);

  return (
    <Card className={cn(DASHBOARD_SHELL_CLASS, 'min-h-[calc(100vh-18rem)]', modern && 'border-slate-200/80 bg-white/95')}>
      <CardHeader
        className={cn(
          'sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          modern && 'bg-white/95 supports-[backdrop-filter]:bg-white/85'
        )}
      >
        <CardTitle className="text-sm font-black uppercase tracking-tight">Student Snapshot</CardTitle>
        <CardDescription className="text-xs">
          Progress, recency, and milestone pressure for {metrics.periodLabel.toLowerCase()}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Active Students" value={String(metrics.activeStudents)} hint="Students flown in the period" />
          <StatTile label="New Students" value={String(metrics.newStudents)} hint="First flight in the period" />
          <StatTile label="Recent Debriefs" value={String(metrics.recentDebriefs)} hint="Reports captured recently" />
          <StatTile label="No Activity" value={String(metrics.noRecentActivity)} hint="No recent flight activity" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border bg-background">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/5 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-tight">Students at Risk</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Milestone pressure and missing recent activity.
                </p>
              </div>
              <Badge
                variant={metrics.overCount > 0 ? 'destructive' : metrics.watchCount > 0 ? 'secondary' : 'outline'}
                className="text-[10px] font-black uppercase"
              >
                {metrics.overCount > 0 ? `${metrics.overCount} over` : metrics.watchCount > 0 ? `${metrics.watchCount} watch` : 'Clear'}
              </Badge>
            </div>

            <div className="divide-y">
              {riskRows.length > 0 ? (
                riskRows.map((row) => {
                  const statusClass = getStudentStatusStyles(row.status);
                  const lastFlight = row.lastFlightDate ? new Date(row.lastFlightDate) : null;
                  const lastDebrief = row.lastDebriefDate ? new Date(row.lastDebriefDate) : null;
                  const studentReports = Array.isArray(summary.studentProgressReports)
                    ? summary.studentProgressReports.filter((report) => report.studentId === row.id)
                    : [];
                  const competency = getStudentCompetencySnapshot(studentReports);
                  const tone = getCompetencyTone(competency.signal);
                  const MeterIcon = tone.icon;

                  return (
                    <div
                      key={row.id}
                      className={cn(
                        'grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.35fr)_repeat(5,minmax(0,0.74fr))] md:items-center',
                        row.status !== 'safe' && 'bg-muted/20'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-tight">{row.name}</p>
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {lastFlight
                            ? `Last flight ${formatDateLabel(lastFlight)}${lastDebrief ? ` - Debrief ${formatDateLabel(lastDebrief)}` : ''}`
                            : 'No flight yet'}
                        </p>
                        <div className={cn('mt-3 rounded-xl border p-3', tone.border, tone.bg)}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <MeterIcon className="h-4 w-4 text-current" />
                                <p className="text-[10px] font-black uppercase tracking-[0.16em]">Strength / Growth</p>
                              </div>
                              <p className="mt-1 text-sm font-black">{competency.headline}</p>
                            </div>
                            <Badge variant="outline" className={cn('text-[10px] font-black uppercase tracking-[0.16em]', tone.pill)}>
                              {tone.label}
                            </Badge>
                          </div>
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                              <span>Avg score</span>
                              <span>{Math.round(competency.score)} / 100</span>
                            </div>
                            <Progress value={Math.min(Math.max(competency.score, 0), 100)} indicatorClassName={tone.bar} className="h-1.5" />
                            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                              {competency.nextFocus}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Recent Hours</p>
                        <p className="mt-1 text-sm font-black">{formatHours(row.recentFlightHours)}</p>
                      </div>

                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Since Flight</p>
                        <p className="mt-1 text-sm font-black">{formatDaysSince(row.daysSinceFlight)}</p>
                      </div>

                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Since Debrief</p>
                        <p className="mt-1 text-sm font-black">{formatDaysSince(row.daysSinceDebrief)}</p>
                      </div>

                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Pace</p>
                        <p className="mt-1 text-sm font-black">{formatPace(row.pacePerWeek)}</p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {row.forecastDaysToNextMilestone !== null ? `${row.forecastDaysToNextMilestone} days to next milestone` : 'Forecast unavailable'}
                        </p>
                      </div>

                      <div className={cn('rounded-lg border px-3 py-3', statusClass)}>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em]">
                          {row.status === 'over' ? 'At risk' : row.status === 'watch' ? 'Watch' : 'Safe'}
                        </p>
                        <p className="mt-1 text-sm font-black">
                          {row.milestoneHours !== null ? `Next ${row.milestoneHours}h` : 'No milestone'}
                        </p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em]">
                          Utilisation {row.utilisationShare.toFixed(1)}%
                        </p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em]">
                          {row.recommendedAction}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No student risk data available yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-background p-4">
            <p className="text-sm font-black uppercase tracking-tight">Student Quick Read</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Recent movement and milestone pressure.
            </p>
            <div className="mt-4 space-y-3">
              <SummaryLine label="Watch" value={String(metrics.watchCount)} />
              <SummaryLine label="Over" value={String(metrics.overCount)} />
              <SummaryLine label="Stagnant" value={String(metrics.stagnatingStudents)} />
              <SummaryLine label="Forecast due" value={String(metrics.forecastedNextMilestones)} />
              <SummaryLine label="Recent debriefs" value={String(metrics.recentDebriefs)} />
              <SummaryLine label="No recent activity" value={String(metrics.noRecentActivity)} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SafetyOverviewCard({ modern, summary }: { modern: boolean; summary: SummaryPayload }) {
  const metrics = getSafetyMetrics(summary);
  const SafetyIcon = ShieldAlert;
  const reports = metrics.reportRows;
  const risks = metrics.riskRows;
  const technicalNotifications = (Array.isArray(summary.technicalReports) ? summary.technicalReports : [])
    .filter((report) => (report.status || 'Open') !== 'Closed')
    .sort((left, right) => `${right.eventDate}T${right.eventTime}`.localeCompare(`${left.eventDate}T${left.eventTime}`))
    .slice(0, 4);

  return (
    <Card className={cn(DASHBOARD_SHELL_CLASS, 'min-h-[calc(100vh-18rem)]', modern && 'border-slate-200/80 bg-white/95')}>
      <CardHeader
        className={cn(
          'sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          modern && 'bg-white/95 supports-[backdrop-filter]:bg-white/85'
        )}
      >
        <div className="flex items-center gap-2">
          <SafetyIcon className="h-4 w-4 text-amber-600" />
          <CardTitle className="text-sm font-black uppercase tracking-tight">Safety Snapshot</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Open reports, risk pressure, and active corrective actions in one place.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Open Reports" value={String(metrics.openReports)} hint="Reports still active" />
          <StatTile label="Open Hazards" value={String(metrics.openRisks)} hint="Risk items requiring attention" />
          <StatTile label="Open CAPs" value={String(metrics.openCaps)} hint="Corrective actions in flight" />
          <StatTile label="Recent Reports" value={String(metrics.recentReports)} hint="Submitted in the last 30 days" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border bg-background">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/5 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-tight">Recent Safety Reports</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Submitted reports and escalation status.
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] font-black uppercase">
                {reports.length} shown
              </Badge>
            </div>
            <div className="divide-y">
              {reports.length > 0 ? (
                reports.map((report) => (
                  <div key={report.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.8fr))] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black uppercase tracking-tight">{report.title}</p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        {report.location} · {report.dateLabel}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                      <Badge variant="outline" className="mt-2 text-[10px] font-black uppercase">
                        {report.status}
                      </Badge>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Classification</p>
                      <p className="mt-1 text-sm font-black">{report.classification}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">CAPs</p>
                      <p className="mt-1 text-sm font-black">{report.actionCount}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No safety reports have been logged yet.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border bg-background p-4">
              <p className="text-sm font-black uppercase tracking-tight">Safety Quick Read</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Simple oversight for the duty team.
              </p>
              <div className="mt-4 space-y-3">
                <SummaryLine label="Open reports" value={String(metrics.openReports)} />
                <SummaryLine label="Open hazards" value={String(metrics.openRisks)} />
                <SummaryLine label="Open CAPs" value={String(metrics.openCaps)} />
                <SummaryLine label="Recent reports" value={String(metrics.recentReports)} />
              </div>
            </div>

            <div className="rounded-2xl border bg-background">
              <div className="flex items-center justify-between gap-3 border-b bg-muted/5 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight">Preliminary Technical Reports</p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Aircraft-linked reports filed through QR or quick intake.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] font-black uppercase">
                  {technicalNotifications.length} open
                </Badge>
              </div>
              <div className="divide-y">
                {technicalNotifications.length > 0 ? (
                  technicalNotifications.map((report) => (
                    <div key={report.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.8fr))] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-tight">{report.aircraftLabel || 'Aircraft not set'}</p>
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {report.reportNumber} Â· {report.title || report.summary}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                        <Badge variant={report.status === 'Closed' ? 'default' : 'destructive'} className="mt-2 text-[10px] font-black uppercase">
                          {report.status}
                        </Badge>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Filed</p>
                        <p className="mt-1 text-sm font-black">{format(parseLocalDate(report.eventDate) || new Date(report.eventDate), 'dd MMM yyyy')}</p>
                        <Button asChild variant="link" className="mt-1 h-auto px-0 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                          <Link href={`/quick-reports/technical-report/${report.id}`}>
                            Open technical report
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No open preliminary technical reports right now.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-background">
              <div className="flex items-center justify-between gap-3 border-b bg-muted/5 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight">Open Hazards</p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Current risk register pressure.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] font-black uppercase">
                  {risks.length} shown
                </Badge>
              </div>
              <div className="divide-y">
                {risks.length > 0 ? (
                  risks.map((risk) => (
                    <div key={risk.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.8fr))] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-tight">{risk.hazard}</p>
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {risk.hazardArea}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                        <p className="mt-1 text-sm font-black">{risk.status}</p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Risks / Mitigations</p>
                        <p className="mt-1 text-sm font-black">
                          {risk.riskCount} / {risk.mitigationCount}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No open hazards have been logged yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QualityOverviewCard({ modern, summary, organizationScopeId }: { modern: boolean; summary: SummaryPayload; organizationScopeId: string }) {
  const metrics = getQualityMetrics(summary, organizationScopeId);
  const QualityIcon = ClipboardCheck;

  return (
    <Card className={cn(DASHBOARD_SHELL_CLASS, 'min-h-[calc(100vh-18rem)]', modern && 'border-slate-200/80 bg-white/95')}>
      <CardHeader
        className={cn(
          'sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          modern && 'bg-white/95 supports-[backdrop-filter]:bg-white/85'
        )}
      >
        <div className="flex items-center gap-2">
          <QualityIcon className="h-4 w-4 text-blue-600" />
          <CardTitle className="text-sm font-black uppercase tracking-tight">Quality Snapshot</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Audit progress, open findings, and corrective action flow for the current tenant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Open Audits" value={String(metrics.openAudits)} hint="Audits not yet closed" />
          <StatTile label="Closed Audits" value={String(metrics.closedAudits)} hint="Finalised or archived" />
          <StatTile label="Open Findings" value={String(metrics.openFindings)} hint="Non-compliant items raised" />
          <StatTile label="Avg Score" value={`${metrics.averageCompliance.toFixed(1)}%`} hint="Average compliance score" />
          <StatTile label="CAP Due Soon" value={String(metrics.dueSoonCaps)} hint="Actions due in the next 30 days" />
          <StatTile label="CAP Overdue" value={String(metrics.overdueCaps)} hint="Action deadlines already passed" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border bg-background">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/5 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-tight">Recent Audits</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Latest audit activity and compliance score.
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] font-black uppercase">
                {metrics.recentAudits} recent
              </Badge>
            </div>
            <div className="divide-y">
              {metrics.auditRows.length > 0 ? (
                metrics.auditRows.map((audit) => (
                  <div key={audit.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black uppercase tracking-tight">{audit.title}</p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        {audit.auditNumber} · {audit.dateLabel}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                      <Badge variant="outline" className="mt-2 text-[10px] font-black uppercase">
                        {audit.status}
                      </Badge>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Score</p>
                      <p className="mt-1 text-sm font-black">
                        {audit.complianceScore !== null ? `${audit.complianceScore.toFixed(1)}%` : 'N/A'}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Findings</p>
                      <p className="mt-1 text-sm font-black">{audit.findingCount}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No quality audits have been recorded yet.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {(metrics.overdueCaps > 0 || metrics.dueSoonCaps > 0) && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-background px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-tight text-amber-900">Corrective action attention required</p>
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-amber-800">
                      {metrics.overdueCaps > 0
                        ? `${metrics.overdueCaps} overdue corrective action${metrics.overdueCaps === 1 ? '' : 's'} need follow-up.`
                        : `${metrics.dueSoonCaps} corrective action${metrics.dueSoonCaps === 1 ? '' : 's'} are due soon.`}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="h-8 w-fit border-amber-300 text-[10px] font-black uppercase">
                    <Link href="/quality/task-tracker">Open Task Tracker</Link>
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-2xl border bg-background p-4">
              <p className="text-sm font-black uppercase tracking-tight">Quality Quick Read</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Audit and corrective action flow.
              </p>
              <div className="mt-4 space-y-3">
                <SummaryLine label="Open audits" value={String(metrics.openAudits)} />
                <SummaryLine label="Open findings" value={String(metrics.openFindings)} />
                <SummaryLine label="Open CAPs" value={String(metrics.openCaps)} />
                <SummaryLine label="CAP due soon" value={String(metrics.dueSoonCaps)} />
                <SummaryLine label="CAP overdue" value={String(metrics.overdueCaps)} />
                <SummaryLine label="Avg compliance" value={`${metrics.averageCompliance.toFixed(1)}%`} />
              </div>
            </div>

            <div className="rounded-2xl border bg-background">
              <div className="flex items-center justify-between gap-3 border-b bg-muted/5 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight">Upcoming CAP Deadlines</p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Actions due in the next 30 days.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] font-black uppercase">
                  {metrics.upcomingCapRows.length} shown
                </Badge>
              </div>
              <div className="divide-y">
                {metrics.upcomingCapRows.length > 0 ? (
                  metrics.upcomingCapRows.map((action) => (
                    <div key={action.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.8fr))] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-tight">{action.description}</p>
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {action.sourceType} · {action.sourceIdentifier}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Assignee</p>
                        <p className="mt-1 text-sm font-black">{action.assignee}</p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Do by</p>
                        <p className="mt-1 text-sm font-black">{format(parseLocalDate(action.dueDate), 'dd MMM yyyy')}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No corrective action deadlines are due soon.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-background">
              <div className="flex items-center justify-between gap-3 border-b bg-muted/5 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight">New Corrective Actions</p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Recently opened CAP actions and plans.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] font-black uppercase">
                  {metrics.recentCapRows.length} shown
                </Badge>
              </div>
              <div className="divide-y">
                {metrics.recentCapRows.length > 0 ? (
                  metrics.recentCapRows.map((action) => (
                    <div key={action.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.8fr))] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-tight">{action.description}</p>
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {action.sourceType} · {action.sourceIdentifier} · Opened {format(parseLocalDate(action.openedDate), 'dd MMM yyyy')}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Assignee</p>
                        <p className="mt-1 text-sm font-black">{action.assignee}</p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                        <p className="mt-1 text-sm font-black">{action.status}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No new corrective actions have been opened yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InstructorLoadCard({ modern, metrics }: { modern: boolean; metrics: InstructorMetrics }) {
  return (
    <Card className={cn(DASHBOARD_SHELL_CLASS, 'min-h-[calc(100vh-18rem)]', modern && 'border-slate-200/80 bg-white/95')}>
      <CardHeader
        className={cn(
          'sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          modern && 'bg-white/95 supports-[backdrop-filter]:bg-white/85'
        )}
      >
        <CardTitle className="text-sm font-black uppercase tracking-tight">Instructor Load</CardTitle>
        <CardDescription className="text-xs">
          Duty period, flight time, and daily pressure for {metrics.periodLabel.toLowerCase()}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Period Flight" value={formatHours(metrics.totalPeriodFlightHours)} hint={`Across ${metrics.rows.length} instructors`} />
          <StatTile label="Period Duty" value={formatHours(metrics.totalPeriodDutyHours)} hint="Attendance clocked time" />
          <StatTile label="Today Flight" value={formatHours(metrics.totalTodayFlightHours)} hint="Used for daily pressure" />
          <StatTile label="Today Duty" value={formatHours(metrics.totalTodayDutyHours)} hint={`${metrics.openSessions} open sessions`} />
        </div>

        <div className="rounded-2xl border bg-background">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-tight">Instructor Watchlist</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Ordered by today's flight time.
              </p>
            </div>
            <Badge
              variant={metrics.overCount > 0 ? 'destructive' : metrics.watchCount > 0 ? 'secondary' : 'outline'}
              className="text-[10px] font-black uppercase"
            >
              {metrics.overCount > 0 ? `${metrics.overCount} over` : metrics.watchCount > 0 ? `${metrics.watchCount} watch` : 'Clear'}
            </Badge>
          </div>

          <div className="divide-y">
            {metrics.rows.length > 0 ? (
              metrics.rows.map((row) => {
                const statusClass = getStatusStyles(row.status);
                const statusLabel = row.status === 'over' ? 'Over limit' : row.status === 'watch' ? 'Nearing limit' : 'On track';

                return (
                  <div
                    key={row.id}
                    className={cn(
                      'grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.8fr))] md:items-center',
                      row.status !== 'safe' && 'bg-muted/20'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black uppercase tracking-tight">{row.name}</p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        {row.hasOpenSession ? 'Active duty session' : 'No open session'}
                        {row.status === 'over'
                          ? ' - Above highest band'
                          : row.nextLimitHours
                            ? ` - Next limit ${row.nextLimitHours}h`
                            : ''}
                      </p>
                    </div>

                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Today Flight</p>
                      <p className="mt-1 text-sm font-black">{formatHours(row.todayFlightHours)}</p>
                    </div>

                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Period Flight</p>
                      <p className="mt-1 text-sm font-black">{formatHours(row.periodFlightHours)}</p>
                    </div>

                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Period Duty</p>
                      <p className="mt-1 text-sm font-black">{formatHours(row.periodDutyHours)}</p>
                    </div>

                    <div className={cn('rounded-lg border px-3 py-3', statusClass)}>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em]">{statusLabel}</p>
                      <p className="mt-1 text-sm font-black">
                        {row.warningHours !== null ? `Warn at ${row.warningHours}h` : 'No warning band'}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No instructor data available yet.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/5 px-3 py-2">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <span className="text-sm font-black">{value}</span>
    </div>
  );
}
