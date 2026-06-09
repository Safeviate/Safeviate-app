'use client';

import { use, useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  MainPageHeader,
  HEADER_ACTION_BUTTON_CLASS,
  HEADER_COMPACT_CONTROL_CLASS,
  HEADER_SECONDARY_BUTTON_CLASS,
  CARD_HEADER_BAND_CLASS,
  HEADER_TAB_LIST_CLASS,
  HEADER_TAB_TRIGGER_CLASS,
} from '@/components/page-header';
import { BackNavButton } from '@/components/back-nav-button';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plane,
  History,
  FileText,
  Settings2,
  ArrowLeft,
  PlusCircle,
  Trash2,
  Clock,
  Gauge,
  AlertCircle,
  CalendarIcon,
  Eye,
  Pencil,
  Info,
  Wrench,
  MoreHorizontal,
  ChevronDown,
  QrCode,
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter, 
  DialogDescription,
  DialogClose
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DocumentUploader } from '@/components/document-uploader';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import type { Aircraft, AircraftComponent, AircraftDefect } from '@/types/aircraft';
import type { MaintenanceLog } from '@/types/maintenance';
import type { QuickReportWorkflowStatus, TechnicalQuickReport } from '@/types/quick-reports';
import type { QualityAudit } from '@/types/quality';
import { Separator } from '@/components/ui/separator';
import { useUserProfile } from '@/hooks/use-user-profile';
import type { DocumentExpirySettings } from '@/app/(app)/admin/document-dates/page';
import type { AircraftInspectionWarningSettings } from '@/types/inspection';
import { getContrastingTextColor, getDocumentExpiryBadgeStyle, getInspectionWarningStyle } from '@/lib/document-expiry';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';

const toNoonUtcIso = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString();

const parseLocalDate = (value?: string | null) => {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? undefined : fallback;
  }
  return new Date(year, month - 1, day, 12);
};

type AircraftDocumentUpload = {
  name: string;
  url: string;
  uploadDate: string;
  expirationDate: string | null;
};

type AircraftUsageBooking = {
  aircraftId?: string;
  date?: string;
  preFlightData?: {
    hobbs?: number;
    tacho?: number;
    fuelUpliftGallons?: number;
    fuelUpliftLitres?: number;
    oilUplift?: number;
  };
  postFlightData?: {
    hobbs?: number;
    tacho?: number;
    defects?: string;
  };
};

type UsageSummaryPayload = {
  bookings?: AircraftUsageBooking[];
};

type UsagePeriod = 'selected' | '30d' | 'all';

type UsageMetrics = {
  bookingCount: number;
  hobbsHours: number;
  tachoHours: number;
  fuelLitres: number;
  fuelGallons: number;
  oilUsed: number;
};

const formatHoursValue = (value: number) => `${value.toFixed(1)}h`;

const summarizeUsageBookings = (bookings: AircraftUsageBooking[]): UsageMetrics => ({
  bookingCount: bookings.length,
  hobbsHours: bookings.reduce((sum, booking) => {
    const pre = booking.preFlightData?.hobbs;
    const post = booking.postFlightData?.hobbs;
    if (pre === undefined || post === undefined) return sum;
    return sum + Math.max(0, post - pre);
  }, 0),
  tachoHours: bookings.reduce((sum, booking) => {
    const pre = booking.preFlightData?.tacho;
    const post = booking.postFlightData?.tacho;
    if (pre === undefined || post === undefined) return sum;
    return sum + Math.max(0, post - pre);
  }, 0),
  fuelLitres: bookings.reduce((sum, booking) => sum + (booking.preFlightData?.fuelUpliftLitres || 0), 0),
  fuelGallons: bookings.reduce((sum, booking) => sum + (booking.preFlightData?.fuelUpliftGallons || 0), 0),
  oilUsed: bookings.reduce((sum, booking) => sum + (booking.preFlightData?.oilUplift || 0), 0),
});

type UtilisationTrendPoint = {
  label: string;
  hobbsHours: number;
  tachoHours: number;
  fuelLitres: number;
  oilUsed: number;
};

type UtilisationHealthTrendPoint = {
  label: string;
  flightHours: number;
  downtimeHours: number;
  defectCount: number;
  defectRate: number;
};

type TechnicalReportAssigneeOption = {
  id: string;
  name: string;
};

type TechnicalReportDraft = {
  assignedToId: string;
  workflowStatus: QuickReportWorkflowStatus;
  managementNotes: string;
};

const TECHNICAL_REPORT_WORKFLOW_STATUSES: QuickReportWorkflowStatus[] = [
  'Preliminary',
  'Under Review',
  'Assigned',
  'Closed',
];

type DefectCategory = {
  id: string;
  label: string;
  ataLabel: string;
  keywords: string[];
};

const DEFECT_STATUSES = ['Open', 'Deferred', 'Cleared'] as const;

const DEFECT_CATEGORIES: DefectCategory[] = [
  { id: 'avionics', label: 'Avionics', ataLabel: 'ATA 22 / 23 / 31 / 34 / 42', keywords: ['radio', 'com', 'comm', 'nav', 'gps', 'transponder', 'avionics', 'intercom', 'ads-b', 'panel', 'instrument'] },
  { id: 'electrical', label: 'Electrical', ataLabel: 'ATA 24 / 33', keywords: ['electrical', 'battery', 'alternator', 'starter', 'light', 'lighting', 'wiring', 'bus', 'breaker', 'voltage'] },
  { id: 'flight-controls', label: 'Flight Controls', ataLabel: 'ATA 27', keywords: ['aileron', 'rudder', 'elevator', 'trim', 'flap', 'control', 'yoke', 'stick', 'pedal'] },
  { id: 'structure', label: 'Structure', ataLabel: 'ATA 51 / 52 / 53 / 55 / 56 / 57', keywords: ['fuselage', 'wing', 'window', 'door', 'cowling', 'structure', 'crack', 'skin', 'stabilizer', 'tail', 'fairing'] },
  { id: 'landing-gear', label: 'Landing Gear', ataLabel: 'ATA 32', keywords: ['landing gear', 'wheel', 'tyre', 'tire', 'brake', 'strut', 'shimmy', 'nose wheel', 'main wheel'] },
  { id: 'powerplant', label: 'Powerplant', ataLabel: 'ATA 71 / 72 / 73 / 74 / 76 / 77 / 78 / 79 / 80', keywords: ['engine', 'magneto', 'ignition', 'exhaust', 'cylinder', 'rpm', 'prop', 'propeller', 'oil pressure', 'cht', 'egt'] },
  { id: 'fuel-oil', label: 'Fuel / Oil', ataLabel: 'ATA 28 / 79', keywords: ['fuel', 'oil', 'leak', 'uplift', 'tank', 'sump', 'drain', 'filter'] },
  { id: 'environmental', label: 'Environmental / Protection', ataLabel: 'ATA 21 / 26 / 30 / 35', keywords: ['heat', 'cabin', 'vent', 'fire', 'smoke', 'oxygen', 'ice', 'rain', 'defrost'] },
  { id: 'other', label: 'Other / Unclassified', ataLabel: 'ATA Other', keywords: [] },
];

const COMPONENT_ATA_OPTIONS = [
  { value: 'ATA 22 / 23 / 31 / 34 / 42', label: 'Avionics' },
  { value: 'ATA 24 / 33', label: 'Electrical' },
  { value: 'ATA 27', label: 'Flight Controls' },
  { value: 'ATA 51 / 52 / 53 / 55 / 56 / 57', label: 'Structure' },
  { value: 'ATA 32', label: 'Landing Gear' },
  { value: 'ATA 71 / 72 / 73 / 74 / 76 / 77 / 78 / 79 / 80', label: 'Powerplant' },
  { value: 'ATA 28 / 79', label: 'Fuel / Oil' },
  { value: 'ATA 21 / 26 / 30 / 35', label: 'Environmental / Protection' },
  { value: 'ATA Other', label: 'Other / Unclassified' },
] as const;

const categorizeDefect = (details: string) => {
  const normalized = details.toLowerCase();
  return (
    DEFECT_CATEGORIES.find((category) =>
      category.id !== 'other' && category.keywords.some((keyword) => normalized.includes(keyword))
    ) || DEFECT_CATEGORIES[DEFECT_CATEGORIES.length - 1]
  );
};

const normalizeAircraftComponentReferences = (aircraft: Aircraft | null): Aircraft | null => {
  if (!aircraft) return aircraft;
  const currentTacho = aircraft.currentTacho || 0;
  return {
    ...aircraft,
    components: (aircraft.components || []).map((component) => {
      const installHours =
        component.installHours !== undefined
          ? component.installHours
          : Math.max(0, currentTacho - (component.tsn || component.totalTime || 0));
      const overhaulHours =
        component.overhaulHours !== undefined
          ? component.overhaulHours
          : Math.max(0, currentTacho - (component.tso || component.tsn || component.totalTime || 0));

      return {
        ...component,
        installHours,
        overhaulHours,
      };
    }),
  };
};

const defectSchema = z.object({
  title: z.string().min(1),
  details: z.string().min(1),
  categoryId: z.string().min(1),
  affectedItemType: z.enum(['aircraft', 'component']),
  componentId: z.string().optional(),
  status: z.enum(DEFECT_STATUSES),
  grounded: z.string(),
  reportedAt: z.string().min(1),
  rectifiedAt: z.string().optional(),
  rectificationAction: z.string().optional(),
  rectificationReference: z.string().optional(),
  rectifiedByName: z.string().optional(),
  rectifiedByLicense: z.string().optional(),
  rectifiedByOrganisation: z.string().optional(),
  returnToServiceRecorded: z.string().optional(),
  returnToServiceBy: z.string().optional(),
  returnToServiceReference: z.string().optional(),
}).superRefine((values, ctx) => {
  if (values.status !== 'Cleared') return;

  if (!values.rectifiedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rectified date is required when clearing a defect.', path: ['rectifiedAt'] });
  }
  if (!values.rectificationAction?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rectification action is required when clearing a defect.', path: ['rectificationAction'] });
  }
  if (!values.rectificationReference?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Reference is required when clearing a defect.', path: ['rectificationReference'] });
  }
});

type DefectValues = z.infer<typeof defectSchema>;

const editAircraftSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  type: z.string().min(1),
  initialHobbs: z.coerce.number(),
  currentHobbs: z.coerce.number(),
  initialTacho: z.coerce.number(),
  currentTacho: z.coerce.number(),
  tachoAtNext50Inspection: z.coerce.number(),
  tachoAtNext100Inspection: z.coerce.number(),
});

type EditAircraftValues = z.infer<typeof editAircraftSchema>;

const maintenanceLogSchema = z.object({
  date: z.string(),
  maintenanceType: z.string().min(1),
  details: z.string().min(1),
  reference: z.string().optional(),
  ameNo: z.string().optional(),
  amoNo: z.string().optional(),
});

type MaintenanceLogValues = z.infer<typeof maintenanceLogSchema>;

const componentSchema = z.object({
  name: z.string().min(1),
  ataChapter: z.string().min(1),
  serialNumber: z.string().min(1),
  installHours: z.coerce.number(),
  overhaulHours: z.coerce.number(),
  maxHours: z.coerce.number(),
});

type ComponentValues = z.infer<typeof componentSchema>;

interface AircraftDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function AircraftDetailPage({ params }: AircraftDetailPageProps) {
  const resolvedParams = use(params);
  const isMobile = useIsMobile();
  const { tenantId } = useUserProfile();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDefectComponentId, setSelectedDefectComponentId] = useState<string | null>(null);
  const [selectedDefectId, setSelectedDefectId] = useState<string | null>(null);
  const [selectedMaintenanceLogId, setSelectedMaintenanceLogId] = useState<string | null>(null);
  const [usagePeriod, setUsagePeriod] = useState<UsagePeriod>('selected');
  const [selectedFromDate, setSelectedFromDate] = useState<Date>(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return start;
  });
  const [selectedToDate, setSelectedToDate] = useState<Date>(() => new Date());
  const [visibleGraphs, setVisibleGraphs] = useState({
    comparison: true,
    service: true,
    hours: true,
    consumption: true,
  });
  const [comparisonSeries, setComparisonSeries] = useState({ hobbs: true, tacho: true });
  const [serviceSeries, setServiceSeries] = useState({ flown: true, inService: true, available: true });
  const [hoursTrendSeries, setHoursTrendSeries] = useState({ hobbs: true, tacho: true });
  const [consumptionSeries, setConsumptionSeries] = useState({ fuel: true, oil: true });
  const aircraftId = resolvedParams.id;

  const [aircraft, setAircraft] = useState<Aircraft | null>(null);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [inspectionSettings, setInspectionSettings] = useState<AircraftInspectionWarningSettings | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummaryPayload>({});
  const [technicalReports, setTechnicalReports] = useState<TechnicalQuickReport[]>([]);
  const [qualityAudits, setQualityAudits] = useState<QualityAudit[]>([]);
  const [gapAnalyses, setGapAnalyses] = useState<QualityAudit[]>([]);
  const [technicalReportDrafts, setTechnicalReportDrafts] = useState<Record<string, TechnicalReportDraft>>({});
  const [technicalReportAssignees, setTechnicalReportAssignees] = useState<TechnicalReportAssigneeOption[]>([]);
  const [savingTechnicalReportId, setSavingTechnicalReportId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
        const [response, configResponse, summaryResponse, technicalReportsResponse, qualityAuditsResponse, gapAnalysesResponse] = await Promise.all([
          fetch(`/api/aircraft/${aircraftId}`, { cache: 'no-store' }),
          fetch('/api/tenant-config', { cache: 'no-store' }),
          fetch('/api/dashboard-summary', { cache: 'no-store' }),
          fetch('/api/technical-reports', { cache: 'no-store' }),
          fetch('/api/quality-audits', { cache: 'no-store' }),
          fetch('/api/quality-gap-analyses', { cache: 'no-store' }),
        ]);
        const payload = await response.json().catch(() => ({ aircraft: null }));
        const normalizedAircraft = normalizeAircraftComponentReferences((payload.aircraft as Aircraft | null) || null);
        setAircraft(normalizedAircraft);
        setLogs(((normalizedAircraft as Aircraft | null)?.maintenanceLogs as MaintenanceLog[] | undefined || []).slice().sort((a, b) => b.date.localeCompare(a.date)));

        const configPayload = await configResponse.json().catch(() => ({ config: null }));
        setInspectionSettings((configPayload?.config?.['inspection-warning-settings'] as AircraftInspectionWarningSettings | undefined) || null);

        const summaryPayload = await summaryResponse.json().catch(() => ({ bookings: [] }));
        setUsageSummary(summaryPayload as UsageSummaryPayload);

        const summaryPersonnel: Array<{ id?: string; firstName?: string; lastName?: string }> = Array.isArray(summaryPayload?.personnel)
          ? summaryPayload.personnel
          : [];
        setTechnicalReportAssignees(
          summaryPersonnel
            .map((person) => ({
              id: typeof person?.id === 'string' ? person.id : '',
              name: `${typeof person?.firstName === 'string' ? person.firstName : ''} ${typeof person?.lastName === 'string' ? person.lastName : ''}`.trim(),
            }))
            .filter((person) => person.id && person.name)
        );

        const technicalPayload = await technicalReportsResponse.json().catch(() => ({ reports: [] }));
        const nextTechnicalReports = Array.isArray(technicalPayload?.reports)
          ? (technicalPayload.reports as TechnicalQuickReport[])
          : [];
        setTechnicalReports(nextTechnicalReports);
        const qualityPayload = await qualityAuditsResponse.json().catch(() => ({ audits: [] }));
        const gapPayload = await gapAnalysesResponse.json().catch(() => ({ audits: [] }));
        setQualityAudits(Array.isArray(qualityPayload?.audits) ? (qualityPayload.audits as QualityAudit[]) : []);
        setGapAnalyses(Array.isArray(gapPayload?.audits) ? (gapPayload.audits as QualityAudit[]) : []);
        setTechnicalReportDrafts(
          Object.fromEntries(
            nextTechnicalReports.map((report) => [
              report.id,
              {
                assignedToId: report.assignedToId || '',
                workflowStatus: report.workflowStatus || 'Preliminary',
                managementNotes: report.managementNotes || '',
              },
            ])
          )
        );
    } catch (e) {
        console.error("Failed to load aircraft details", e);
    } finally {
        setIsLoading(false);
    }
  }, [aircraftId]);

  useEffect(() => {
    loadData();
    const events = [
      'safeviate-aircrafts-updated',
      'safeviate-inspection-warning-settings-updated',
      'safeviate-tenant-config-updated',
      'safeviate-technical-reports-updated',
    ];
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'safeviate-technical-reports-updated') {
        loadData();
      }
    };
    events.forEach(e => window.addEventListener(e, loadData));
    window.addEventListener('storage', handleStorage);
    return () => {
      events.forEach(e => window.removeEventListener(e, loadData));
      window.removeEventListener('storage', handleStorage);
    };
  }, [loadData, aircraftId]);

  const utilisationChartNow = new Date();
  const utilisationChartAircraftId = aircraft?.id ?? null;
  const utilisationChartWindowStart = (() => {
    if (usagePeriod === 'selected') {
      return new Date(
        selectedFromDate.getFullYear(),
        selectedFromDate.getMonth(),
        selectedFromDate.getDate(),
        0,
        0,
        0,
        0
      );
    }
    if (usagePeriod === '30d') {
      const start = new Date(utilisationChartNow);
      start.setDate(utilisationChartNow.getDate() - 30);
      return start;
    }
    return null;
  })();
  const utilisationChartWindowEnd = (() => {
    if (usagePeriod === 'selected') {
      return new Date(
        selectedToDate.getFullYear(),
        selectedToDate.getMonth(),
        selectedToDate.getDate(),
        23,
        59,
        59,
        999
      );
    }
    return utilisationChartNow;
  })();
  const utilisationChartNormalizedStart =
    utilisationChartWindowStart &&
    utilisationChartWindowEnd &&
    utilisationChartWindowStart > utilisationChartWindowEnd
      ? utilisationChartWindowEnd
      : utilisationChartWindowStart;
  const utilisationChartNormalizedEnd =
    utilisationChartWindowStart &&
    utilisationChartWindowEnd &&
    utilisationChartWindowStart > utilisationChartWindowEnd
      ? utilisationChartWindowStart
      : utilisationChartWindowEnd;
  const utilisationChartBookings = (usageSummary.bookings || []).filter((booking) => {
    if (booking.aircraftId !== utilisationChartAircraftId) return false;
    if (!utilisationChartWindowStart || usagePeriod === 'all') return true;
    if (!booking.date) return false;
    const bookingDate = new Date(booking.date);
    return (
      !Number.isNaN(bookingDate.getTime()) &&
      !!utilisationChartNormalizedStart &&
      !!utilisationChartNormalizedEnd &&
      bookingDate >= utilisationChartNormalizedStart &&
      bookingDate <= utilisationChartNormalizedEnd
    );
  });
  const utilisationChartDefects = (usageSummary.bookings || []).reduce<
    {
      id: string;
      dateLabel: string;
      reportedAt: string;
      rectifiedAt?: string;
      details: string;
      categoryId: string;
      categoryLabel: string;
      ataLabel: string;
      componentId?: string;
      componentName?: string;
      componentSerialNumber?: string;
      title: string;
      status: 'Open';
      grounded: boolean;
      source: 'post-flight';
    }[]
  >((allDefects, booking) => {
    if (booking.aircraftId !== utilisationChartAircraftId) return allDefects;
    const defectText = booking.postFlightData?.defects?.trim();
    if (!defectText) return allDefects;
    const defectDate = booking.date ? new Date(booking.date) : null;
    const category = categorizeDefect(defectText);
    allDefects.push({
      id: `${booking.aircraftId || utilisationChartAircraftId}-${booking.date || 'unknown'}-${defectText}`,
      dateLabel:
        defectDate && !Number.isNaN(defectDate.getTime()) ? format(defectDate, 'dd MMM yyyy') : booking.date || 'Unknown date',
      reportedAt: defectDate && !Number.isNaN(defectDate.getTime()) ? defectDate.toISOString() : utilisationChartNow.toISOString(),
      details: defectText,
      categoryId: category.id,
      categoryLabel: category.label,
      ataLabel: category.ataLabel,
      title: 'Post-flight defect',
      status: 'Open',
      grounded: false,
      source: 'post-flight',
    });
    return allDefects;
  }, []);

  const utilisationHealthTrend = useMemo<UtilisationHealthTrendPoint[]>(() => {
    const chartStart = utilisationChartWindowStart ?? new Date(utilisationChartNow.getTime() - 180 * 24 * 60 * 60 * 1000);
    const chartEnd = utilisationChartWindowEnd ?? utilisationChartNow;
    const rangeDays = Math.max(1, Math.ceil((chartEnd.getTime() - chartStart.getTime()) / 86400000));
    const bucketCount = rangeDays <= 35 ? 5 : rangeDays <= 90 ? 6 : 8;
    const bucketSizeDays = Math.max(1, Math.ceil(rangeDays / bucketCount));

    return Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = new Date(chartStart);
      bucketStart.setDate(chartStart.getDate() + index * bucketSizeDays);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + bucketSizeDays);
      const effectiveEnd = bucketEnd > chartEnd ? chartEnd : bucketEnd;

      const bucketFlights = utilisationChartBookings.filter((booking) => {
        if (!booking.date) return false;
        const bookingDate = new Date(booking.date);
        return !Number.isNaN(bookingDate.getTime()) && bookingDate >= bucketStart && bookingDate < effectiveEnd;
      });
      const bucketDefects = utilisationChartDefects.filter((defect) => {
        if (!defect.reportedAt) return false;
        const defectDate = new Date(defect.reportedAt);
        return !Number.isNaN(defectDate.getTime()) && defectDate >= bucketStart && defectDate < effectiveEnd;
      });

      const flightHours = bucketFlights.reduce((sum, booking) => {
        const pre = booking.preFlightData?.hobbs;
        const post = booking.postFlightData?.hobbs;
        if (pre === undefined || post === undefined) return sum;
        return sum + Math.max(0, post - pre);
      }, 0);

      const downtimeHours = bucketDefects.reduce((sum, defect) => {
        const reportedAt = new Date(defect.reportedAt).getTime();
        const rectifiedAt = defect.rectifiedAt ? new Date(defect.rectifiedAt).getTime() : chartEnd.getTime();
        if (Number.isNaN(reportedAt) || Number.isNaN(rectifiedAt) || rectifiedAt < reportedAt) return sum;
        return sum + Math.max(0, (rectifiedAt - reportedAt) / 3600000);
      }, 0);

      const defectCount = bucketDefects.length;
      const defectRate = flightHours > 0 ? (defectCount / flightHours) * 10 : defectCount * 10;

      return {
        label: format(bucketStart, 'dd MMM'),
        flightHours: parseFloat(flightHours.toFixed(1)),
        downtimeHours: parseFloat(downtimeHours.toFixed(1)),
        defectCount,
        defectRate: parseFloat(defectRate.toFixed(2)),
      };
    });
  }, [utilisationChartBookings, utilisationChartDefects, utilisationChartNow, utilisationChartWindowEnd, utilisationChartWindowStart]);

  const technicalReportsForAircraft = useMemo(
    () =>
      technicalReports
        .filter((report) => report.aircraftId === aircraft?.id)
        .sort((left, right) => `${right.eventDate}T${right.eventTime}`.localeCompare(`${left.eventDate}T${left.eventTime}`)),
    [technicalReports, aircraft?.id]
  );
  const openTechnicalReports = useMemo(
    () => technicalReportsForAircraft.filter((report) => (report.status || 'Open') !== 'Closed'),
    [technicalReportsForAircraft]
  );
  const qualityAuditsForAircraft = useMemo(
    () =>
      qualityAudits
        .filter((audit) => audit.assetId === aircraft?.id)
        .sort((left, right) => right.auditDate.localeCompare(left.auditDate)),
    [aircraft?.id, qualityAudits]
  );
  const gapAnalysesForAircraft = useMemo(
    () =>
      gapAnalyses
        .filter((analysis) => analysis.assetId === aircraft?.id)
        .sort((left, right) => right.auditDate.localeCompare(left.auditDate)),
    [aircraft?.id, gapAnalyses]
  );

  const setTechnicalReportDraftValue = useCallback(
    (reportId: string, patch: Partial<TechnicalReportDraft>) => {
      setTechnicalReportDrafts((current) => {
        const existing = current[reportId] || {
          assignedToId: '',
          workflowStatus: 'Preliminary' as QuickReportWorkflowStatus,
          managementNotes: '',
        };
        return {
          ...current,
          [reportId]: {
            ...existing,
            ...patch,
          },
        };
      });
    },
    []
  );

  const saveTechnicalReportManagement = useCallback(
    async (report: TechnicalQuickReport) => {
      const draft = technicalReportDrafts[report.id] || {
        assignedToId: report.assignedToId || '',
        workflowStatus: report.workflowStatus || 'Preliminary',
        managementNotes: report.managementNotes || '',
      };
      const assignedPerson =
        technicalReportAssignees.find((person) => person.id === draft.assignedToId) || null;
      setSavingTechnicalReportId(report.id);
      try {
        const nextReport: TechnicalQuickReport = {
          ...report,
          assignedToId: draft.assignedToId || null,
          assignedToName: assignedPerson?.name || null,
          workflowStatus: draft.workflowStatus,
          managementNotes: draft.managementNotes.trim() || null,
          status: draft.workflowStatus === 'Closed' ? 'Closed' : 'Open',
        };
        const response = await fetch('/api/technical-reports', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report: nextReport }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to update technical report.');
        }

        setTechnicalReports((current) =>
          current.map((entry) => (entry.id === report.id ? (payload.report as TechnicalQuickReport) : entry))
        );
        setTechnicalReportDrafts((current) => ({
          ...current,
          [report.id]: {
            assignedToId: payload.report?.assignedToId || '',
            workflowStatus: payload.report?.workflowStatus || 'Preliminary',
            managementNotes: payload.report?.managementNotes || '',
          },
        }));
        toast({
          title: 'Technical Report Updated',
          description: `${report.reportNumber} is now managed against ${aircraft?.tailNumber || 'this aircraft'}.`,
        });
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: error instanceof Error ? error.message : 'Failed to update technical report.',
        });
      } finally {
        setSavingTechnicalReportId(null);
      }
    },
    [aircraft?.tailNumber, technicalReportAssignees, technicalReportDrafts, toast]
  );

  const utilisationHealthRecommendation = useMemo(() => {
    const recent = utilisationHealthTrend.slice(-3);
    if (recent.length === 0) {
      return 'No maintenance trend data yet. Capture structured defects to activate the chart.';
    }

    const avgFlight = recent.reduce((sum, point) => sum + point.flightHours, 0) / recent.length;
    const avgDowntime = recent.reduce((sum, point) => sum + point.downtimeHours, 0) / recent.length;
    const avgDefectRate = recent.reduce((sum, point) => sum + point.defectRate, 0) / recent.length;

    if (avgDefectRate >= 1.5 || avgDowntime > Math.max(1, avgFlight)) {
      return 'Maintenance review recommended: downtime is outpacing active flying and defects are stacking up.';
    }

    if (avgDefectRate >= 0.75 || avgDowntime > avgFlight * 0.5) {
      return 'Watch the rectification cycle closely and plan proactive defect clearance capacity.';
    }

    return 'Utilisation is healthy: flight hours remain ahead of downtime and defect pressure is currently low.';
  }, [utilisationHealthTrend]);

  if (isLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full space-y-6 pt-4 px-1">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!aircraft) {
    return (
      <div className="max-w-[1100px] mx-auto w-full text-center py-20 px-1">
        <div className="flex flex-col items-center gap-4 bg-muted/5 p-12 rounded-3xl border-2 border-dashed">
            <Plane className="h-16 w-16 text-muted-foreground opacity-20" />
            <div className="space-y-1">
                <p className="text-xl font-black uppercase tracking-tight">Aircraft Not Found</p>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground italic">The requested asset could not be located in the fleet inventory.</p>
            </div>
            <div className="mt-4">
                <BackNavButton href="/assets/aircraft" text="Back to Fleet" />
            </div>
        </div>
      </div>
    );
  }

  const timeTo50 = (aircraft.tachoAtNext50Inspection || 0) - (aircraft.currentTacho || 0);
  const timeTo100 = (aircraft.tachoAtNext100Inspection || 0) - (aircraft.currentTacho || 0);
  const now = new Date();
  const usageWindowStart = (() => {
    if (usagePeriod === 'selected') {
      return new Date(
        selectedFromDate.getFullYear(),
        selectedFromDate.getMonth(),
        selectedFromDate.getDate(),
        0,
        0,
        0,
        0
      );
    }
    if (usagePeriod === '30d') {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      return start;
    }
    return null;
  })();
  const usageWindowEnd = (() => {
    if (usagePeriod === 'selected') {
      return new Date(
        selectedToDate.getFullYear(),
        selectedToDate.getMonth(),
        selectedToDate.getDate(),
        23,
        59,
        59,
        999
      );
    }
    return now;
  })();
  const normalizedUsageWindowStart =
    usageWindowStart && usageWindowEnd && usageWindowStart > usageWindowEnd ? usageWindowEnd : usageWindowStart;
  const normalizedUsageWindowEnd =
    usageWindowStart && usageWindowEnd && usageWindowStart > usageWindowEnd ? usageWindowStart : usageWindowEnd;
  const aircraftBookings = (usageSummary.bookings || []).filter((booking) => {
    if (booking.aircraftId !== aircraft.id) return false;
    if (!usageWindowStart || usagePeriod === 'all') return true;
    if (!booking.date) return false;
    const bookingDate = new Date(booking.date);
    return (
      !Number.isNaN(bookingDate.getTime()) &&
      !!normalizedUsageWindowStart &&
      !!normalizedUsageWindowEnd &&
      bookingDate >= normalizedUsageWindowStart &&
      bookingDate <= normalizedUsageWindowEnd
    );
  });
  const selectedPeriodLabel =
    usagePeriod === 'selected'
      ? `${format(selectedFromDate, 'dd MMM yyyy')} - ${format(selectedToDate, 'dd MMM yyyy')}`
      : usagePeriod === '30d'
        ? 'Last 30 days'
        : 'Lifetime';
  const totalFlightHours = aircraftBookings.reduce((sum, booking) => {
    const pre = booking.preFlightData?.hobbs;
    const post = booking.postFlightData?.hobbs;
    if (pre === undefined || post === undefined) return sum;
    return sum + Math.max(0, post - pre);
  }, 0);
  const totalFuelLitres = aircraftBookings.reduce((sum, booking) => sum + (booking.preFlightData?.fuelUpliftLitres || 0), 0);
  const totalFuelGallons = aircraftBookings.reduce((sum, booking) => sum + (booking.preFlightData?.fuelUpliftGallons || 0), 0);
  const totalOilUplift = aircraftBookings.reduce((sum, booking) => sum + (booking.preFlightData?.oilUplift || 0), 0);
  const utilisationCount = aircraftBookings.length;
  const totalTachoHours = aircraftBookings.reduce((sum, booking) => {
    const pre = booking.preFlightData?.tacho;
    const post = booking.postFlightData?.tacho;
    if (pre === undefined || post === undefined) return sum;
    return sum + Math.max(0, post - pre);
  }, 0);
  const lifetimeBookings = (usageSummary.bookings || []).filter((booking) => booking.aircraftId === aircraft.id);
  const last30DayBookings = (usageSummary.bookings || []).filter((booking) => {
    if (booking.aircraftId !== aircraft.id || !booking.date) return false;
    const bookingDate = new Date(booking.date);
    if (Number.isNaN(bookingDate.getTime())) return false;
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    return bookingDate >= start && bookingDate <= now;
  });
  const lifetimeFuelLitres = lifetimeBookings.reduce((sum, booking) => sum + (booking.preFlightData?.fuelUpliftLitres || 0), 0);
  const lifetimeFuelGallons = lifetimeBookings.reduce((sum, booking) => sum + (booking.preFlightData?.fuelUpliftGallons || 0), 0);
  const lifetimeOilUplift = lifetimeBookings.reduce((sum, booking) => sum + (booking.preFlightData?.oilUplift || 0), 0);
  const lifetimeHobbsHours = Math.max(0, (aircraft.currentHobbs || 0) - (aircraft.initialHobbs || 0));
  const lifetimeTachoHours = Math.max(0, (aircraft.currentTacho || 0) - (aircraft.initialTacho || 0));
  const nextServiceWindow = [timeTo50, timeTo100]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const last30DayMetrics = summarizeUsageBookings(last30DayBookings);
  const lifetimeMetrics = summarizeUsageBookings(lifetimeBookings);
  const utilisationTrend = aircraftBookings
    .filter((booking) => booking.date)
    .map((booking) => {
      const bookingDate = new Date(booking.date as string);
      const hobbsHours =
        booking.preFlightData?.hobbs !== undefined && booking.postFlightData?.hobbs !== undefined
          ? Math.max(0, booking.postFlightData.hobbs - booking.preFlightData.hobbs)
          : 0;
      const tachoHours =
        booking.preFlightData?.tacho !== undefined && booking.postFlightData?.tacho !== undefined
          ? Math.max(0, booking.postFlightData.tacho - booking.preFlightData.tacho)
          : 0;

      return {
        label: Number.isNaN(bookingDate.getTime()) ? booking.date || 'Flight' : format(bookingDate, 'dd MMM'),
        hobbsHours: parseFloat(hobbsHours.toFixed(1)),
        tachoHours: parseFloat(tachoHours.toFixed(1)),
        fuelLitres: parseFloat((booking.preFlightData?.fuelUpliftLitres || 0).toFixed(1)),
        oilUsed: parseFloat((booking.preFlightData?.oilUplift || 0).toFixed(1)),
      } satisfies UtilisationTrendPoint;
    })
    .slice(-8);
  const utilisationWindowComparison = [
    {
      label: 'Selected',
      hobbsHours: parseFloat(totalFlightHours.toFixed(1)),
      tachoHours: parseFloat(totalTachoHours.toFixed(1)),
    },
    {
      label: '30 Days',
      hobbsHours: parseFloat(last30DayMetrics.hobbsHours.toFixed(1)),
      tachoHours: parseFloat(last30DayMetrics.tachoHours.toFixed(1)),
    },
    {
      label: 'Lifetime',
      hobbsHours: parseFloat(lifetimeMetrics.hobbsHours.toFixed(1)),
      tachoHours: parseFloat(lifetimeMetrics.tachoHours.toFixed(1)),
    },
  ];
  const serviceCapacityComparison = [
    {
      label: 'Selected',
      flownHours: parseFloat(totalFlightHours.toFixed(1)),
      inServiceHours: parseFloat(totalTachoHours.toFixed(1)),
      availableHours: parseFloat(nextServiceWindow.toFixed(1)),
    },
    {
      label: '30 Days',
      flownHours: parseFloat(last30DayMetrics.hobbsHours.toFixed(1)),
      inServiceHours: parseFloat(last30DayMetrics.tachoHours.toFixed(1)),
      availableHours: parseFloat(nextServiceWindow.toFixed(1)),
    },
    {
      label: 'Lifetime',
      flownHours: parseFloat(lifetimeHobbsHours.toFixed(1)),
      inServiceHours: parseFloat(lifetimeTachoHours.toFixed(1)),
      availableHours: parseFloat(nextServiceWindow.toFixed(1)),
    },
  ];
  const legacyAircraftDefects = (usageSummary.bookings || []).reduce<
    {
      id: string;
      dateLabel: string;
      reportedAt: string;
      rectifiedAt?: string;
      details: string;
      categoryId: string;
      categoryLabel: string;
      ataLabel: string;
      componentId?: string;
      componentName?: string;
      componentSerialNumber?: string;
      title: string;
      status: 'Open';
      grounded: boolean;
      source: 'post-flight';
    }[]
  >((allDefects, booking) => {
    if (booking.aircraftId !== aircraft.id) return allDefects;
    const defectText = booking.postFlightData?.defects?.trim();
    if (!defectText) return allDefects;
    const defectDate = booking.date ? new Date(booking.date) : null;
    const category = categorizeDefect(defectText);
    allDefects.push({
      id: `${booking.aircraftId || aircraft.id}-${booking.date || 'unknown'}-${defectText}`,
      dateLabel:
        defectDate && !Number.isNaN(defectDate.getTime()) ? format(defectDate, 'dd MMM yyyy') : booking.date || 'Unknown date',
      reportedAt: defectDate && !Number.isNaN(defectDate.getTime()) ? defectDate.toISOString() : now.toISOString(),
      details: defectText,
      categoryId: category.id,
      categoryLabel: category.label,
      ataLabel: category.ataLabel,
      title: 'Post-flight defect',
      status: 'Open',
      grounded: false,
      source: 'post-flight',
    });
    return allDefects;
  }, []);
  const structuredAircraftDefects = (aircraft.defects || []).map((defect) => {
    const category = DEFECT_CATEGORIES.find((entry) => entry.id === defect.categoryId) || DEFECT_CATEGORIES[DEFECT_CATEGORIES.length - 1];
    const defectDate = defect.reportedAt ? new Date(defect.reportedAt) : null;
    return {
      ...defect,
      categoryId: category.id,
      categoryLabel: defect.categoryLabel || category.label,
      ataLabel: defect.ataLabel || category.ataLabel,
      dateLabel:
        defectDate && !Number.isNaN(defectDate.getTime()) ? format(defectDate, 'dd MMM yyyy') : 'Unknown date',
      source: defect.source || 'manual',
    };
  });
  const aircraftDefects = [...structuredAircraftDefects, ...legacyAircraftDefects];
  const recurringDefectCounts = aircraftDefects.reduce((counts, defect) => {
    const key = `${defect.componentId || 'aircraft'}::${defect.title.trim().toLowerCase()}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const openStructuredDefects = structuredAircraftDefects.filter((defect) => defect.status !== 'Cleared');
  const groundedDefects = openStructuredDefects.filter((defect) => defect.grounded);
  const serviceabilityState = groundedDefects.length > 0 ? 'Grounded' : openStructuredDefects.length > 0 ? 'Technical Attention Required' : 'Serviceable';
  const serviceabilityTone =
    serviceabilityState === 'Grounded'
      ? 'border-destructive/40 bg-destructive/5 text-destructive'
      : serviceabilityState === 'Technical Attention Required'
        ? 'border-amber-500/40 bg-amber-50 text-amber-700'
        : 'border-emerald-500/40 bg-emerald-50 text-emerald-700';
  const componentDefectSummary = new Map(
    (aircraft.components || []).map((component) => {
      const linkedDefects = structuredAircraftDefects.filter((defect) => defect.componentId === component.id);
      const openDefects = linkedDefects.filter((defect) => defect.status !== 'Cleared');
      const lastReported = linkedDefects
        .map((defect) => parseLocalDate(defect.reportedAt))
        .filter((date): date is Date => !!date)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return [
        component.id,
        {
          total: linkedDefects.length,
          open: openDefects.length,
          lastReported: lastReported ? format(lastReported, 'dd MMM yyyy') : null,
          recurring: linkedDefects.filter((defect) => (recurringDefectCounts.get(`${defect.componentId || 'aircraft'}::${defect.title.trim().toLowerCase()}`) || 0) > 1).length,
        },
      ];
    })
  );
  const defectIdByMaintenanceLogId = new Map(
    structuredAircraftDefects
      .filter((defect) => !!defect.linkedMaintenanceLogId)
      .map((defect) => [defect.linkedMaintenanceLogId!, defect.id])
  );
  const groupedAircraftDefects = DEFECT_CATEGORIES.map((category) => ({
    ...category,
    defects: aircraftDefects.filter(
      (defect) =>
        defect.categoryId === category.id &&
        (!selectedDefectComponentId || defect.componentId === selectedDefectComponentId)
    ),
  })).filter((category) => category.defects.length > 0);

  return (
    <div className={cn("max-w-[1100px] mx-auto w-full flex flex-col pt-4 px-1", isMobile ? "min-h-0 overflow-y-auto" : "h-full overflow-hidden")}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className={cn("w-full flex-1 flex flex-col", isMobile ? "overflow-visible" : "overflow-hidden")}>
        
        <div className={cn("flex-1 pb-10", isMobile ? "overflow-visible" : "overflow-y-auto no-scrollbar")}>
          <Card className="shadow-none border rounded-xl overflow-hidden flex flex-col">
            <MainPageHeader
                title={aircraft.tailNumber}
                description={`${aircraft.make} ${aircraft.model}`}
                className="[&>div:first-child>div:first-child]:px-2 [&>div:first-child>div:first-child]:py-0 [&>div:first-child>div:first-child]:min-h-11 [&_.main-page-header__header]:h-11 [&_.main-page-header__header]:min-h-11 [&_.main-page-header__header]:items-center [&_.main-page-header__actions]:py-0"
                actions={
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <BackNavButton href="/assets/aircraft" text="Back to Fleet" />
                    <Button asChild variant="outline" className="h-8 px-3 text-[10px] font-black uppercase tracking-widest border-slate-300">
                      <Link href={`/assets/aircraft/${aircraft.id}/qr-code`}>
                        <QrCode className="mr-1.5 h-3.5 w-3.5" />
                        QR Code
                      </Link>
                    </Button>
                    <EditAircraftDialog aircraft={aircraft} tenantId={tenantId || ''} />
                  </div>
                }
              />

            <ResponsiveTabRow
              value={activeTab}
              onValueChange={setActiveTab}
              placeholder="Select Aircraft Section"
              centerTabs
              className={cn(CARD_HEADER_BAND_CLASS, 'bg-transparent overflow-hidden')}
              options={[
                { value: 'overview', label: 'Overview' },
                { value: 'utilisation', label: 'Utilisation' },
                { value: 'maintenance', label: 'Maintenance' },
                { value: 'defects', label: 'Defect List' },
                { value: 'components', label: 'Components' },
                { value: 'documents', label: 'Documents' },
              ]}
            />
            <div className={cn(CARD_HEADER_BAND_CLASS, 'bg-transparent')}>
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-lg border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]', serviceabilityTone)}>
                    {serviceabilityState}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Open defects {openStructuredDefects.length}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Grounded {groundedDefects.length}
                  </span>
                </div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Aircraft technical status
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <TabsContent value="overview" className={cn("mt-0 outline-none", isMobile ? "min-h-0" : "h-full overflow-y-auto no-scrollbar")}>
                <CardContent className="p-4 sm:p-6 space-y-6">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="shadow-none border overflow-hidden">
                      <CardHeader className="border-b bg-muted/20 px-4 py-3">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <Info className="h-3.5 w-3.5" />
                          Specifications
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-3 px-4 py-4">
                        <DetailItem label="Manufacturer" value={aircraft.make} />
                        <DetailItem label="Model" value={aircraft.model} />
                        <DetailItem label="Engine Type" value={aircraft.type || 'N/A'} />
                      </CardContent>
                    </Card>

                    <Card className="shadow-none border overflow-hidden">
                      <CardHeader className="border-b bg-muted/20 px-4 py-3">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5" />
                          Hobbs Meter
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-3 px-4 py-4">
                        <DetailItem label="Initial Hobbs" value={(aircraft.initialHobbs || 0).toFixed(1)} />
                        <DetailItem label="Current Hobbs" value={(aircraft.currentHobbs || 0).toFixed(1)} />
                      </CardContent>
                    </Card>

                    <Card className="shadow-none border overflow-hidden">
                      <CardHeader className="border-b bg-muted/20 px-4 py-3">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <Gauge className="h-3.5 w-3.5" />
                          Tacho Meter
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-3 px-4 py-4">
                        <DetailItem label="Initial Tacho" value={(aircraft.initialTacho || 0).toFixed(1)} />
                        <DetailItem label="Current Tacho" value={(aircraft.currentTacho || 0).toFixed(1)} />
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="shadow-none border overflow-hidden">
                    <CardHeader className="border-b bg-muted/20 px-4 py-3">
                      <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <ArrowLeft className="h-4 w-4 rotate-180" />
                          Inspection Service Targets
                      </h3>
                    </CardHeader>
                    <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                      <DetailItem label="Next 50h Tacho" value={(aircraft.tachoAtNext50Inspection || 0).toFixed(1)} />
                      <DetailItem label="Next 100h Tacho" value={(aircraft.tachoAtNext100Inspection || 0).toFixed(1)} />
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">To 50h Inspection</p>
                        <Badge
                          variant="outline"
                          style={getInspectionWarningStyle(timeTo50, '50', inspectionSettings) || undefined}
                          className="font-mono font-black text-sm h-10 px-6 rounded-lg shadow-sm border-2"
                        >
                          {timeTo50.toFixed(1)}h
                        </Badge>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">To 100h Inspection</p>
                        <Badge
                          variant="outline"
                          style={getInspectionWarningStyle(timeTo100, '100', inspectionSettings) || undefined}
                          className="font-mono font-black text-sm h-10 px-6 rounded-lg shadow-sm border-2"
                        >
                          {timeTo100.toFixed(1)}h
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </TabsContent>

              <TabsContent value="utilisation" className={cn("mt-0 outline-none", isMobile ? "min-h-0" : "h-full overflow-hidden")}>
                <CardContent className="p-4 sm:p-6 space-y-6 max-h-[calc(100vh-16rem)] overflow-y-auto no-scrollbar">
                  <Card className="shadow-none border overflow-hidden">
                    <CardHeader className="border-b bg-muted/20 px-4 py-3">
                      <div className="flex flex-col gap-3">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <Gauge className="h-3.5 w-3.5" />
                          Utilisation and Consumption
                        </h3>
                      </div>
                    </CardHeader>
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
                                <span className="truncate">Graphs</span>
                              </span>
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="center" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                            <DropdownMenuCheckboxItem
                              checked={visibleGraphs.comparison}
                              onCheckedChange={() => setVisibleGraphs((current) => ({ ...current, comparison: !current.comparison }))}
                              className="text-[10px] font-bold uppercase"
                            >
                              Compare Windows
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              checked={visibleGraphs.service}
                              onCheckedChange={() => setVisibleGraphs((current) => ({ ...current, service: !current.service }))}
                              className="text-[10px] font-bold uppercase"
                            >
                              Service Capacity
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              checked={visibleGraphs.hours}
                              onCheckedChange={() => setVisibleGraphs((current) => ({ ...current, hours: !current.hours }))}
                              className="text-[10px] font-bold uppercase"
                            >
                              Hours Trend
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                              checked={visibleGraphs.consumption}
                              onCheckedChange={() => setVisibleGraphs((current) => ({ ...current, consumption: !current.consumption }))}
                              className="text-[10px] font-bold uppercase"
                            >
                              Consumption
                            </DropdownMenuCheckboxItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <div className="flex w-full flex-wrap items-center justify-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Graphs</span>
                          <button
                            type="button"
                            onClick={() => setVisibleGraphs((current) => ({ ...current, comparison: !current.comparison }))}
                            className={cn(
                              HEADER_TAB_TRIGGER_CLASS,
                              visibleGraphs.comparison ? 'border-foreground text-foreground' : 'border-input text-muted-foreground opacity-60'
                            )}
                          >
                            Compare Windows
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisibleGraphs((current) => ({ ...current, service: !current.service }))}
                            className={cn(
                              HEADER_TAB_TRIGGER_CLASS,
                              visibleGraphs.service ? 'border-foreground text-foreground' : 'border-input text-muted-foreground opacity-60'
                            )}
                          >
                            Service Capacity
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisibleGraphs((current) => ({ ...current, hours: !current.hours }))}
                            className={cn(
                              HEADER_TAB_TRIGGER_CLASS,
                              visibleGraphs.hours ? 'border-foreground text-foreground' : 'border-input text-muted-foreground opacity-60'
                            )}
                          >
                            Hours Trend
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisibleGraphs((current) => ({ ...current, consumption: !current.consumption }))}
                            className={cn(
                              HEADER_TAB_TRIGGER_CLASS,
                              visibleGraphs.consumption ? 'border-foreground text-foreground' : 'border-input text-muted-foreground opacity-60'
                            )}
                          >
                            Consumption
                          </button>
                        </div>
                      )}
                    </div>
                    <div className={cn(CARD_HEADER_BAND_CLASS, 'bg-transparent border-b')}>
                      {isMobile ? (
                        <div className="space-y-2">
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
                                    {usagePeriod === 'selected' ? 'Selected Period' : usagePeriod === '30d' ? 'Last 30 Days' : 'Lifetime'}
                                  </span>
                                </span>
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                              {(['selected', '30d', 'all'] as UsagePeriod[]).map((period) => (
                                <DropdownMenuCheckboxItem
                                  key={period}
                                  checked={usagePeriod === period}
                                  onCheckedChange={() => setUsagePeriod(period)}
                                  className="text-[10px] font-bold uppercase"
                                >
                                  {period === 'selected' ? 'Selected Period' : period === '30d' ? 'Last 30 Days' : 'Lifetime'}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <div className="grid grid-cols-1 gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className={cn(
                                    HEADER_TAB_TRIGGER_CLASS,
                                    'w-full justify-center',
                                    usagePeriod === 'selected' ? 'border-foreground text-foreground' : 'border-input text-muted-foreground'
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                  {format(selectedFromDate, 'dd MMM yyyy')}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="center">
                                <CustomCalendar
                                  selectedDate={selectedFromDate}
                                  onDateSelect={(date) => {
                                    setSelectedFromDate(date);
                                    setUsagePeriod('selected');
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className={cn(
                                    HEADER_TAB_TRIGGER_CLASS,
                                    'w-full justify-center',
                                    usagePeriod === 'selected' ? 'border-foreground text-foreground' : 'border-input text-muted-foreground'
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                  {format(selectedToDate, 'dd MMM yyyy')}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="center">
                                <CustomCalendar
                                  selectedDate={selectedToDate}
                                  onDateSelect={(date) => {
                                    setSelectedToDate(date);
                                    setUsagePeriod('selected');
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      ) : (
                        <div className="flex w-full flex-wrap items-center justify-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Period</span>
                          {(['selected', '30d', 'all'] as UsagePeriod[]).map((period) => (
                            <button
                              key={period}
                              type="button"
                              onClick={() => setUsagePeriod(period)}
                              className={cn(
                                HEADER_TAB_TRIGGER_CLASS,
                                usagePeriod === period ? 'border-foreground text-foreground' : 'border-input text-muted-foreground'
                              )}
                            >
                              {period === 'selected' ? 'Selected Period' : period === '30d' ? 'Last 30 Days' : 'Lifetime'}
                            </button>
                          ))}
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  HEADER_TAB_TRIGGER_CLASS,
                                  'min-w-[150px] justify-center',
                                  usagePeriod === 'selected' ? 'border-foreground text-foreground' : 'border-input text-muted-foreground'
                                )}
                              >
                                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                {format(selectedFromDate, 'dd MMM yyyy')}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="center">
                              <CustomCalendar
                                selectedDate={selectedFromDate}
                                onDateSelect={(date) => {
                                  setSelectedFromDate(date);
                                  setUsagePeriod('selected');
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">to</span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  HEADER_TAB_TRIGGER_CLASS,
                                  'min-w-[150px] justify-center',
                                  usagePeriod === 'selected' ? 'border-foreground text-foreground' : 'border-input text-muted-foreground'
                                )}
                              >
                                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                {format(selectedToDate, 'dd MMM yyyy')}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="center">
                              <CustomCalendar
                                selectedDate={selectedToDate}
                                onDateSelect={(date) => {
                                  setSelectedToDate(date);
                                  setUsagePeriod('selected');
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                    </div>
                    <CardContent className="space-y-6 p-4">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <UtilisationStatCard
                          title="Total Time"
                          value={formatHoursValue(lifetimeHobbsHours)}
                          detail={`Hobbs lifetime`}
                          supporting={`Tacho lifetime ${formatHoursValue(lifetimeTachoHours)}`}
                        />
                        <UtilisationStatCard
                          title={`Time Over ${selectedPeriodLabel}`}
                          value={formatHoursValue(totalFlightHours)}
                          detail="Hobbs logged in bookings"
                          supporting={`Tacho ${formatHoursValue(totalTachoHours)}`}
                        />
                        <UtilisationStatCard
                          title="Hours Flown"
                          value={formatHoursValue(totalFlightHours)}
                          detail={`${utilisationCount} completed bookings`}
                          supporting={`Current window ${selectedPeriodLabel.toUpperCase()}`}
                        />
                        <UtilisationStatCard
                          title="Time Available For Service"
                          value={formatHoursValue(nextServiceWindow)}
                          detail="Nearest inspection window"
                          supporting={`50h: ${formatHoursValue(Math.max(0, timeTo50))}  100h: ${formatHoursValue(Math.max(0, timeTo100))}`}
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <UtilisationStatCard
                          title="Time In Service"
                          value={formatHoursValue(lifetimeTachoHours)}
                          detail="Tacho lifetime"
                          supporting={`Current Tacho ${(aircraft.currentTacho || 0).toFixed(1)}`}
                        />
                        <UtilisationStatCard
                          title="Total Fuel Used"
                          value={`${lifetimeFuelLitres.toFixed(1)}L`}
                          detail={`${lifetimeFuelGallons.toFixed(1)} gal lifetime`}
                          supporting="All recorded uplift"
                        />
                        <UtilisationStatCard
                          title={`Fuel Over ${selectedPeriodLabel}`}
                          value={`${totalFuelLitres.toFixed(1)}L`}
                          detail={`${totalFuelGallons.toFixed(1)} gal in window`}
                          supporting="Selected analysis period"
                        />
                        <UtilisationStatCard
                          title={`Oil Over ${selectedPeriodLabel}`}
                          value={`${totalOilUplift.toFixed(1)}`}
                          detail={`Lifetime ${lifetimeOilUplift.toFixed(1)}`}
                          supporting="All recorded oil uplift"
                        />
                      </div>

                      <Card className="shadow-none border overflow-hidden">
                        <CardHeader className="border-b bg-muted/10 px-4 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Flight, Downtime and Defect Rate</h4>
                              <CardDescription className="text-xs">
                                Flight time versus defect downtime, with defect rate shown per 10 flight hours.
                              </CardDescription>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.16em]">
                              Ops recommendation
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4">
                          <div className="h-[280px]">
                            {utilisationHealthTrend.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={utilisationHealthTrend} margin={{ top: 8, right: 24, left: -16, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                                  <YAxis yAxisId="left" tickLine={false} axisLine={false} fontSize={11} />
                                  <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} fontSize={11} />
                                  <Tooltip
                                    formatter={(value: number, name: string) => {
                                      if (name === 'flightHours') return [`${value.toFixed(1)}h`, 'Flight Hours'];
                                      if (name === 'downtimeHours') return [`${value.toFixed(1)}h`, 'Defect Downtime'];
                                      if (name === 'defectRate') return [`${value.toFixed(2)}`, 'Defect Rate / 10h'];
                                      if (name === 'defectCount') return [`${value}`, 'Defect Count'];
                                      return [value, name];
                                    }}
                                  />
                                  <Bar yAxisId="left" dataKey="flightHours" fill="#1d4ed8" radius={[6, 6, 0, 0]} name="flightHours" />
                                  <Bar yAxisId="left" dataKey="downtimeHours" fill="#f97316" radius={[6, 6, 0, 0]} name="downtimeHours" />
                                  <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="defectRate"
                                    stroke="#7c3aed"
                                    strokeWidth={2.5}
                                    dot={{ r: 4 }}
                                    activeDot={{ r: 6 }}
                                    name="defectRate"
                                  />
                                </ComposedChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-muted/5 text-sm text-muted-foreground">
                                No utilisation trend data in this window yet.
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{utilisationHealthRecommendation}</p>
                        </CardContent>
                      </Card>

                      {visibleGraphs.comparison ? (
                      <Card className="shadow-none border overflow-hidden">
                        <CardHeader className="border-b bg-muted/10 px-4 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Window Comparison</h4>
                              <CardDescription className="text-xs">
                                Compare Hobbs and Tacho hours across the selected, 30-day, and lifetime windows.
                              </CardDescription>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setComparisonSeries((current) => ({ ...current, hobbs: !current.hobbs }))}
                                className={cn(HEADER_TAB_TRIGGER_CLASS, !comparisonSeries.hobbs && 'opacity-50')}
                              >
                                Hobbs
                              </button>
                              <button
                                type="button"
                                onClick={() => setComparisonSeries((current) => ({ ...current, tacho: !current.tacho }))}
                                className={cn(HEADER_TAB_TRIGGER_CLASS, !comparisonSeries.tacho && 'opacity-50')}
                              >
                                Tacho
                              </button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4">
                          <div className="h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={utilisationWindowComparison} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                                <YAxis tickLine={false} axisLine={false} fontSize={11} />
                                <Tooltip
                                  formatter={(value: number, name: string) => [`${value.toFixed(1)}h`, name === 'hobbsHours' ? 'Hobbs' : 'Tacho']}
                                />
                                {comparisonSeries.hobbs ? (
                                  <Line type="monotone" dataKey="hobbsHours" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                ) : null}
                                {comparisonSeries.tacho ? (
                                  <Line type="monotone" dataKey="tachoHours" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                ) : null}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                      ) : null}

                      {visibleGraphs.service ? (
                      <Card className="shadow-none border overflow-hidden">
                        <CardHeader className="border-b bg-muted/10 px-4 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Service Capacity</h4>
                              <CardDescription className="text-xs">
                                Compare hours flown, time in service, and hours remaining to the next service window.
                              </CardDescription>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setServiceSeries((current) => ({ ...current, flown: !current.flown }))}
                                className={cn(HEADER_TAB_TRIGGER_CLASS, !serviceSeries.flown && 'opacity-50')}
                              >
                                Flown
                              </button>
                              <button
                                type="button"
                                onClick={() => setServiceSeries((current) => ({ ...current, inService: !current.inService }))}
                                className={cn(HEADER_TAB_TRIGGER_CLASS, !serviceSeries.inService && 'opacity-50')}
                              >
                                In Service
                              </button>
                              <button
                                type="button"
                                onClick={() => setServiceSeries((current) => ({ ...current, available: !current.available }))}
                                className={cn(HEADER_TAB_TRIGGER_CLASS, !serviceSeries.available && 'opacity-50')}
                              >
                                Available
                              </button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4">
                          <div className="h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={serviceCapacityComparison} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                                <YAxis tickLine={false} axisLine={false} fontSize={11} />
                                <Tooltip
                                  formatter={(value: number, name: string) => [
                                    `${value.toFixed(1)}h`,
                                    name === 'flownHours' ? 'Hours Flown' : name === 'inServiceHours' ? 'Time In Service' : 'Available For Service',
                                  ]}
                                />
                                {serviceSeries.flown ? (
                                  <Line type="monotone" dataKey="flownHours" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                ) : null}
                                {serviceSeries.inService ? (
                                  <Line type="monotone" dataKey="inServiceHours" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                ) : null}
                                {serviceSeries.available ? (
                                  <Line type="monotone" dataKey="availableHours" stroke="#b45309" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                ) : null}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                      ) : null}

                      <div className="grid gap-4 xl:grid-cols-2">
                        {visibleGraphs.hours ? (
                        <Card className="shadow-none border overflow-hidden">
                          <CardHeader className="border-b bg-muted/10 px-4 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Hours Trend</h4>
                                <CardDescription className="text-xs">
                                  Hobbs and Tacho movement across the current utilisation window.
                                </CardDescription>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setHoursTrendSeries((current) => ({ ...current, hobbs: !current.hobbs }))}
                                  className={cn(HEADER_TAB_TRIGGER_CLASS, !hoursTrendSeries.hobbs && 'opacity-50')}
                                >
                                  Hobbs
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setHoursTrendSeries((current) => ({ ...current, tacho: !current.tacho }))}
                                  className={cn(HEADER_TAB_TRIGGER_CLASS, !hoursTrendSeries.tacho && 'opacity-50')}
                                >
                                  Tacho
                                </button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4">
                            <div className="h-[240px]">
                              {utilisationTrend.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={utilisationTrend} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                                    <Tooltip
                                      formatter={(value: number, name: string) => [`${value.toFixed(1)}h`, name === 'hobbsHours' ? 'Hobbs' : 'Tacho']}
                                    />
                                    {hoursTrendSeries.hobbs ? (
                                      <Line type="monotone" dataKey="hobbsHours" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                    ) : null}
                                    {hoursTrendSeries.tacho ? (
                                      <Line type="monotone" dataKey="tachoHours" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                    ) : null}
                                  </LineChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-muted/5 text-sm text-muted-foreground">
                                  No booking trend data in this window.
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                        ) : null}

                        {visibleGraphs.consumption ? (
                        <Card className="shadow-none border overflow-hidden">
                          <CardHeader className="border-b bg-muted/10 px-4 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Consumption Trend</h4>
                                <CardDescription className="text-xs">
                                  Fuel and oil uplift by booking in the current utilisation window.
                                </CardDescription>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setConsumptionSeries((current) => ({ ...current, fuel: !current.fuel }))}
                                  className={cn(HEADER_TAB_TRIGGER_CLASS, !consumptionSeries.fuel && 'opacity-50')}
                                >
                                  Fuel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConsumptionSeries((current) => ({ ...current, oil: !current.oil }))}
                                  className={cn(HEADER_TAB_TRIGGER_CLASS, !consumptionSeries.oil && 'opacity-50')}
                                >
                                  Oil
                                </button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4">
                            <div className="h-[240px]">
                              {utilisationTrend.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={utilisationTrend} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                                    <Tooltip
                                      formatter={(value: number, name: string) => [value.toFixed(1), name === 'fuelLitres' ? 'Fuel (L)' : 'Oil']}
                                    />
                                    {consumptionSeries.fuel ? (
                                      <Line type="monotone" dataKey="fuelLitres" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                    ) : null}
                                    {consumptionSeries.oil ? (
                                      <Line type="monotone" dataKey="oilUsed" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                    ) : null}
                                  </LineChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-muted/5 text-sm text-muted-foreground">
                                  No fluid-usage trend data in this window.
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </TabsContent>

              <TabsContent value="maintenance" className={cn("mt-0 outline-none", isMobile ? "min-h-0" : "h-full overflow-y-auto no-scrollbar")}>
                <MaintenanceTab
                  aircraft={aircraft}
                  aircraftId={aircraftId}
                  tenantId={tenantId || ''}
                  logs={logs || []}
                  isLoading={isLoading}
                  selectedLogId={selectedMaintenanceLogId}
                  linkedDefectIdByLogId={defectIdByMaintenanceLogId}
                  onViewLinkedDefect={(defectId) => {
                    setSelectedDefectId(defectId);
                    setActiveTab('defects');
                  }}
                />
              </TabsContent>

              <TabsContent value="defects" className={cn("mt-0 outline-none", isMobile ? "min-h-0" : "h-full overflow-y-auto no-scrollbar")}>
                <CardContent className="p-4 sm:p-6">
                  <Card id="technical-report-notifications" className="mb-4 overflow-hidden border shadow-none scroll-mt-16">
                    <CardHeader className="border-b bg-muted/20 px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                            <History className="h-3.5 w-3.5" />
                            Quality Review History
                          </h3>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                            Audits and gap analyses linked to this aircraft will appear here.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="h-6 px-2 text-[10px] font-black uppercase tracking-widest">
                            {qualityAuditsForAircraft.length} audits
                          </Badge>
                          <Badge variant="outline" className="h-6 px-2 text-[10px] font-black uppercase tracking-widest">
                            {gapAnalysesForAircraft.length} gap analyses
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {qualityAuditsForAircraft.length === 0 && gapAnalysesForAircraft.length === 0 ? (
                        <div className="flex min-h-[160px] flex-col items-center justify-center gap-4 bg-muted/5 px-6 py-10 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-background">
                            <History className="h-5 w-5 text-muted-foreground/60" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-bold uppercase tracking-wider text-foreground">No linked quality reviews</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest italic text-muted-foreground">
                              Link this aircraft in an audit or gap analysis to build its quality history here.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {qualityAuditsForAircraft.map((audit) => (
                            <div key={audit.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{audit.auditNumber}</span>
                                  <Badge variant="outline" className="text-[10px] uppercase tracking-widest">Audit</Badge>
                                  <Badge variant={audit.status === 'Closed' ? 'default' : audit.status === 'Finalized' ? 'secondary' : 'outline'} className="text-[10px] uppercase tracking-widest">
                                    {audit.status}
                                  </Badge>
                                </div>
                                <div className="mt-2 text-sm font-black text-foreground">{audit.title}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                  <span>{format(parseLocalDate(audit.auditDate) || new Date(audit.auditDate), 'dd MMM yyyy')}</span>
                                  <span>{audit.scope}</span>
                                </div>
                              </div>
                              <Button asChild type="button" size="sm" variant="outline" className="h-8 px-3 text-[10px] font-black uppercase">
                                <Link href={`/quality/audits/${audit.id}`}>Open Audit</Link>
                              </Button>
                            </div>
                          ))}
                          {gapAnalysesForAircraft.map((analysis) => (
                            <div key={analysis.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{analysis.auditNumber}</span>
                                  <Badge variant="outline" className="text-[10px] uppercase tracking-widest">Gap Analysis</Badge>
                                  <Badge variant={analysis.status === 'Closed' ? 'default' : analysis.status === 'Finalized' ? 'secondary' : 'outline'} className="text-[10px] uppercase tracking-widest">
                                    {analysis.status}
                                  </Badge>
                                </div>
                                <div className="mt-2 text-sm font-black text-foreground">{analysis.title}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                  <span>{format(parseLocalDate(analysis.auditDate) || new Date(analysis.auditDate), 'dd MMM yyyy')}</span>
                                  <span>{analysis.scope}</span>
                                </div>
                              </div>
                              <Button asChild type="button" size="sm" variant="outline" className="h-8 px-3 text-[10px] font-black uppercase">
                                <Link href={`/quality/gap-analyses/${analysis.id}`}>Open Gap Analysis</Link>
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="mb-4 overflow-hidden border shadow-none">
                    <CardHeader className="border-b bg-muted/20 px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Preliminary Technical Report
                          </h3>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                            Open preliminary technical reports for this aircraft that still need follow-up.
                          </p>
                        </div>
                        <Badge variant="outline" className="h-6 px-2 text-[10px] font-black uppercase tracking-widest">
                          {openTechnicalReports.length} open
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4">
                      {openTechnicalReports.length > 0 ? (
                        <div className="divide-y rounded-xl border bg-background">
                          {openTechnicalReports.slice(0, 3).map((report) => (
                            <div key={report.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.35fr)_repeat(2,minmax(0,0.8fr))] md:items-center">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black uppercase tracking-tight">
                                  {report.reportNumber} · {report.title || report.summary}
                                </p>
                                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                  {report.location || 'Unknown location'} · Filed by {report.submittedByName}
                                </p>
                              </div>
                              <div className="rounded-lg border bg-muted/5 px-3 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                                <Badge variant={report.status === 'Closed' ? 'default' : 'destructive'} className="mt-2 text-[10px] uppercase tracking-widest">
                                  {report.status}
                                </Badge>
                              </div>
                              <div className="rounded-lg border bg-muted/5 px-3 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Filed</p>
                                <p className="mt-1 text-sm font-black">
                                  {format(parseLocalDate(report.eventDate) || new Date(report.eventDate), 'dd MMM yyyy')}
                                </p>
                                <Button asChild variant="link" className="mt-1 h-auto px-0 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                                  <Link href={`#technical-report-${report.id}`}>Open preliminary technical report</Link>
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed bg-muted/5 px-6 py-8 text-center">
                          <p className="text-sm font-black uppercase tracking-wider text-foreground">No open preliminary technical report notifications</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="mb-4 overflow-hidden border shadow-none">
                    <CardHeader className="border-b bg-muted/20 px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                            <FileText className="h-3.5 w-3.5" />
                            Preliminary Technical Report
                          </h3>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                            Open preliminary technical reports for this aircraft can be reviewed and managed here.
                          </p>
                        </div>
                        <Badge variant="outline" className="h-6 px-2 text-[10px] font-black uppercase tracking-widest">
                          {technicalReportsForAircraft.length} open
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {technicalReportsForAircraft.length > 0 ? (
                        <div className="divide-y">
                          {technicalReportsForAircraft.map((report) => {
                            const draft = technicalReportDrafts[report.id] || {
                              assignedToId: report.assignedToId || '',
                              workflowStatus: report.workflowStatus || 'Preliminary',
                              managementNotes: report.managementNotes || '',
                            };

                            return (
                              <div key={report.id} id={`technical-report-${report.id}`} className="space-y-4 px-4 py-4 scroll-mt-16">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{report.reportNumber}</span>
                                      {report.urgency ? (
                                        <Badge variant={report.urgency === 'High' ? 'destructive' : report.urgency === 'Medium' ? 'secondary' : 'outline'} className="text-[10px] uppercase tracking-widest">
                                          {report.urgency}
                                        </Badge>
                                      ) : null}
                                      <Badge variant={draft.workflowStatus === 'Closed' ? 'default' : 'outline'} className="text-[10px] uppercase tracking-widest">
                                        {draft.workflowStatus}
                                      </Badge>
                                      {report.grounded ? (
                                        <Badge variant="destructive" className="text-[10px] uppercase tracking-widest">
                                          Grounding recommended
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <div className="mt-2 text-sm font-black text-foreground">{report.title || report.summary}</div>
                                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                      <span>{format(parseLocalDate(report.eventDate) || new Date(report.eventDate), 'dd MMM yyyy')}</span>
                                      <span>{report.eventTime}</span>
                                      <span>{report.location}</span>
                                      <span>Filed by {report.submittedByName}</span>
                                      {report.systemOrComponent ? <span>{report.systemOrComponent}</span> : null}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 px-3 text-[10px] font-black uppercase"
                                    disabled={savingTechnicalReportId === report.id}
                                    onClick={() => void saveTechnicalReportManagement(report)}
                                  >
                                    {savingTechnicalReportId === report.id ? 'Saving...' : 'Save Management Update'}
                                  </Button>
                                </div>

                                <p className="text-sm font-medium text-foreground">{report.summary}</p>
                                {report.immediateAction ? (
                                  <div className="rounded-lg border bg-muted/5 px-3 py-2">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Immediate Action</p>
                                    <p className="mt-1 text-sm font-medium text-foreground">{report.immediateAction}</p>
                                  </div>
                                ) : null}

                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Assigned To</label>
                                    <Select
                                      value={draft.assignedToId || 'unassigned'}
                                      onValueChange={(value) =>
                                        setTechnicalReportDraftValue(report.id, {
                                          assignedToId: value === 'unassigned' ? '' : value,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-10 font-bold">
                                        <SelectValue placeholder="Assign report" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {technicalReportAssignees.map((person) => (
                                          <SelectItem key={person.id} value={person.id}>
                                            {person.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Workflow Status</label>
                                    <Select
                                      value={draft.workflowStatus}
                                      onValueChange={(value) =>
                                        setTechnicalReportDraftValue(report.id, {
                                          workflowStatus: value as QuickReportWorkflowStatus,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-10 font-bold">
                                        <SelectValue placeholder="Select workflow status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {TECHNICAL_REPORT_WORKFLOW_STATUSES.map((status) => (
                                          <SelectItem key={status} value={status}>
                                            {status}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Management Notes</label>
                                  <Textarea
                                    value={draft.managementNotes}
                                    onChange={(event) =>
                                      setTechnicalReportDraftValue(report.id, {
                                        managementNotes: event.target.value,
                                      })
                                    }
                                    className="min-h-[88px] p-3"
                                    placeholder="Capture assignment notes, engineering direction, or follow-up actions."
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex min-h-[180px] flex-col items-center justify-center gap-4 bg-muted/5 px-6 py-10 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-background">
                            <FileText className="h-5 w-5 text-muted-foreground/60" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-bold uppercase tracking-wider text-foreground">No linked preliminary technical reports</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest italic text-muted-foreground">
                              Preliminary technical reports tied to this aircraft will appear here for engineering management.
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="shadow-none border overflow-hidden">
                    <CardHeader className="border-b bg-muted/20 px-4 py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                            <Wrench className="h-3.5 w-3.5" />
                            Defect List
                          </h3>
                          {selectedDefectComponentId ? (
                            <button
                              type="button"
                              onClick={() => setSelectedDefectComponentId(null)}
                              className={cn(HEADER_TAB_TRIGGER_CLASS, 'h-8')}
                            >
                              Clear Component Filter
                            </button>
                          ) : null}
                        </div>
                        <AddDefectDialog aircraft={aircraft} tenantId={tenantId || ''} />
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {groupedAircraftDefects.length > 0 ? (
                        <div className="divide-y">
                          {groupedAircraftDefects.map((category) => (
                            <div key={category.id}>
                              <div className="border-b bg-muted/10 px-4 py-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                                    {category.label}
                                  </div>
                                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                                    {category.ataLabel}
                                  </div>
                                </div>
                              </div>
                              <div className="divide-y">
                                {category.defects.map((defect) => (
                                  <div
                                    key={defect.id}
                                    className={cn(
                                      "flex flex-col gap-2 px-4 py-3",
                                      selectedDefectId === defect.id && "bg-primary/5 ring-2 ring-inset ring-primary/30"
                                    )}
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                                        {defect.dateLabel}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={defect.status === 'Cleared' ? 'secondary' : defect.status === 'Deferred' ? 'outline' : 'destructive'} className="text-[10px] uppercase tracking-widest">
                                          {defect.status}
                                        </Badge>
                                        {defect.grounded ? (
                                          <Badge variant="destructive" className="text-[10px] uppercase tracking-widest">
                                            Grounded
                                          </Badge>
                                        ) : null}
                                        {defect.source === 'post-flight' ? (
                                          <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
                                            Legacy
                                          </Badge>
                                        ) : null}
                                        {defect.componentName ? (
                                          <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
                                            {defect.componentName}
                                          </Badge>
                                        ) : null}
                                        {(recurringDefectCounts.get(`${defect.componentId || 'aircraft'}::${defect.title.trim().toLowerCase()}`) || 0) > 1 ? (
                                          <Badge variant="outline" className="text-[10px] uppercase tracking-widest border-amber-500 text-amber-700">
                                            Recurring
                                          </Badge>
                                        ) : null}
                                        {defect.source !== 'post-flight' ? (
                                          <EditDefectDialog aircraft={aircraft} defect={defect} tenantId={tenantId || ''} />
                                        ) : null}
                                        {defect.source !== 'post-flight' && defect.linkedMaintenanceLogId ? (
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 px-3 text-[10px] font-black uppercase border-slate-300"
                                            onClick={() => {
                                              setSelectedDefectId(defect.id);
                                              setSelectedMaintenanceLogId(defect.linkedMaintenanceLogId ?? null);
                                              setActiveTab('maintenance');
                                            }}
                                          >
                                            View Rectification
                                          </Button>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="text-xs font-black uppercase tracking-[0.16em] text-primary">
                                      {defect.title}
                                    </div>
                                    <p className="line-clamp-3 text-sm font-medium text-foreground">{defect.details}</p>
                                    {defect.status === 'Cleared' && defect.rectificationAction ? (
                                      <div className="rounded-lg border bg-muted/5 px-3 py-2">
                                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                                          Rectification
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-foreground">{defect.rectificationAction}</p>
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                                          {defect.rectifiedAt ? <span>Cleared {format(parseLocalDate(defect.rectifiedAt) || new Date(defect.rectifiedAt), 'dd MMM yyyy')}</span> : null}
                                          {defect.rectificationReference ? <span>Ref {defect.rectificationReference}</span> : null}
                                          {defect.returnToServiceRecorded ? <span>RTS Recorded</span> : null}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 bg-muted/5 px-6 py-10 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-background">
                            <Wrench className="h-5 w-5 text-muted-foreground/60" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-bold uppercase tracking-wider text-foreground">No logged defects</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest italic text-muted-foreground">
                              Post-flight defect reports for this aircraft will appear here.
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CardContent>
              </TabsContent>

              <TabsContent value="components" className={cn("mt-0 outline-none", isMobile ? "min-h-0" : "h-full overflow-y-auto no-scrollbar")}>
                <ComponentsTab
                  aircraft={aircraft}
                  tenantId={tenantId || ''}
                  componentDefectSummary={componentDefectSummary}
                  onViewComponentDefects={(componentId) => {
                    setSelectedDefectComponentId(componentId);
                    setActiveTab('defects');
                  }}
                />
              </TabsContent>

              <TabsContent value="documents" className={cn("mt-0 outline-none", isMobile ? "min-h-0" : "h-full overflow-y-auto no-scrollbar")}>
                <DocumentsTab aircraft={aircraft} tenantId={tenantId || ''} />
              </TabsContent>
            </div>
          </Card>
        </div>
      </Tabs>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground opacity-70">{label}</p>
      <p className="text-sm font-black text-foreground uppercase">{value}</p>
    </div>
  );
}

function UtilisationStatCard({
  title,
  value,
  detail,
  supporting,
}: {
  title: string;
  value: string;
  detail: string;
  supporting: string;
}) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{title}</p>
      <p className="mt-3 text-3xl font-black text-foreground">{value}</p>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{detail}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{supporting}</p>
    </div>
  );
}

function MaintenanceTab({
  aircraft,
  aircraftId,
  tenantId,
  logs,
  isLoading,
  selectedLogId,
  linkedDefectIdByLogId,
  onViewLinkedDefect,
}: {
  aircraft: Aircraft;
  aircraftId: string;
  tenantId: string;
  logs: MaintenanceLog[];
  isLoading: boolean;
  selectedLogId?: string | null;
  linkedDefectIdByLogId: Map<string, string>;
  onViewLinkedDefect: (defectId: string) => void;
}) {
  const maintenanceWindows = ((aircraft.maintenanceWindows || []).slice()).sort((a, b) => a.fromDate.localeCompare(b.fromDate));

  return (
    <div className="flex flex-col h-full">
      <div className="bg-muted/5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-8 shrink-0">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight">Maintenance History</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-75">All recorded technical maintenance events and major inspections.</p>
        </div>
        <AddMaintenanceLogDialog aircraftId={aircraftId} tenantId={tenantId} />
      </div>
      <div className="flex-1 overflow-auto bg-background">
        {maintenanceWindows.length > 0 ? (
          <div className="border-b bg-muted/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                Scheduled Maintenance Windows
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {maintenanceWindows.map((window) => (
                <div key={window.id} className="rounded-lg border bg-background px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-black uppercase tracking-[-0.01em] text-foreground">
                        {window.title}
                      </div>
                      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                        {format(parseLocalDate(window.fromDate) || new Date(window.fromDate), 'dd MMM yyyy')} to {format(parseLocalDate(window.toDate) || new Date(window.toDate), 'dd MMM yyyy')}
                      </div>
                    </div>
                    <Badge variant="outline" className="rounded-lg text-[10px] font-black uppercase border-amber-300 bg-amber-50 text-amber-700">
                      {window.status || 'Scheduled'}
                    </Badge>
                  </div>
                  {window.notes ? (
                    <div className="mt-3 text-sm font-medium text-foreground">
                      {window.notes}
                    </div>
                  ) : null}
                  <div className="mt-3 flex justify-end">
                    <Button asChild type="button" variant="outline" size="sm" className="h-8 px-3 text-[10px] font-black uppercase border-slate-300">
                      <Link href={`/bookings/schedule?date=${window.fromDate}&aircraftId=${aircraft.id}`}>
                        Open In Schedule
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <ResponsiveCardGrid
          items={logs}
          isLoading={isLoading}
          className="p-4"
          gridClassName="sm:grid-cols-2 xl:grid-cols-3"
          renderItem={(log) => {
            const linkedDefectId = linkedDefectIdByLogId.get(log.id);
            return (
              <Card
                key={log.id}
                className={cn(
                  "overflow-hidden border shadow-none transition-shadow hover:shadow-sm",
                  selectedLogId === log.id && "ring-2 ring-primary/40 border-primary/40"
                )}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">
                      {format(parseLocalDate(log.date) || new Date(log.date), 'dd MMM yyyy')}
                    </CardTitle>
                    <CardDescription className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {log.reference || 'No reference recorded'}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="rounded-lg text-[10px] font-black uppercase border-slate-300 bg-background">
                    {log.maintenanceType}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4 px-4 py-4">
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Details</p>
                    <p className="mt-1 text-sm italic text-foreground">"{log.details}"</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">AME Credentials</p>
                      <p className={cn("mt-1 text-sm font-semibold", log.ameNo ? "text-foreground" : "text-muted-foreground italic")}>
                        {log.ameNo || 'Not recorded'}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">AMO Credentials</p>
                      <p className={cn("mt-1 text-sm font-semibold", log.amoNo ? "text-foreground" : "text-muted-foreground italic")}>
                        {log.amoNo || 'Not recorded'}
                      </p>
                    </div>
                  </div>
                  {linkedDefectId ? (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-[10px] font-black uppercase border-slate-300"
                        onClick={() => onViewLinkedDefect(linkedDefectId)}
                      >
                        Back To Defect
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          }}
          emptyState={(
            <div className="flex min-h-[360px] flex-col items-center justify-center border-b bg-muted/5 p-8 text-center text-muted-foreground">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border bg-background">
                <History className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-bold uppercase tracking-wider text-foreground">
                  {maintenanceWindows.length > 0 ? 'No maintenance history recorded for this asset.' : 'No maintenance activity recorded for this asset.'}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest italic">
                  {isLoading ? 'Decrypting maintenance logs...' : maintenanceWindows.length > 0 ? 'Scheduled windows are shown above. Add the first maintenance event to begin the log.' : 'Add the first maintenance event or schedule window to begin the record.'}
                </p>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}

function ComponentsTab({
  aircraft,
  tenantId,
  componentDefectSummary,
  onViewComponentDefects,
}: {
  aircraft: Aircraft;
  tenantId: string;
  componentDefectSummary: Map<string, { total: number; open: number; lastReported: string | null; recurring: number }>;
  onViewComponentDefects: (componentId: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-muted/5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-8 shrink-0">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight">Component Lifecycle</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-75">Track service intervals and remaining hours for critical serialized parts.</p>
        </div>
        <AddComponentDialog aircraft={aircraft} tenantId={tenantId} />
      </div>
      <div className="flex-1 overflow-auto bg-background">
        <ResponsiveCardGrid
          items={aircraft.components || []}
          isLoading={false}
          className="p-4"
          gridClassName="sm:grid-cols-2 xl:grid-cols-3"
          renderItem={(comp) => {
            const currentTacho = aircraft.currentTacho || 0;
            const derivedTsn = Math.max(0, currentTacho - (comp.installHours || 0));
            const overhaulReference = comp.overhaulHours ?? comp.installHours ?? 0;
            const derivedTso = Math.max(0, currentTacho - overhaulReference);
            const derivedTotalTime = derivedTsn;
            const remaining = comp.maxHours - derivedTotalTime;
            const defectSummary = componentDefectSummary.get(comp.id) || { total: 0, open: 0, lastReported: null, recurring: 0 };
            return (
              <Card key={comp.id} className="overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">
                      {comp.name}
                    </CardTitle>
                    <CardDescription className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Serial {comp.serialNumber}
                    </CardDescription>
                    <CardDescription className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {comp.ataChapter || 'ATA Other'}
                    </CardDescription>
                  </div>
                  <Badge variant={remaining < 50 ? "destructive" : "outline"} className="rounded-lg font-mono font-black text-[10px] h-8 px-3 border-2 shadow-sm uppercase">
                    {remaining.toFixed(1)}h left
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4 px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Defect Reports</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{defectSummary.total}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Open Defects</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{defectSummary.open}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Last Reported</p>
                      <p className={cn("mt-1 text-sm font-semibold", defectSummary.lastReported ? "text-foreground" : "text-muted-foreground italic")}>
                        {defectSummary.lastReported || 'No reports'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      Recurring defects {defectSummary.recurring}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-[10px] font-black uppercase border-slate-300"
                      onClick={() => onViewComponentDefects(comp.id)}
                    >
                      View Defects
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">TSN</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{derivedTsn.toFixed(1)}h</p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Derived from current aircraft tacho</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">TSO</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{derivedTso.toFixed(1)}h</p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Derived from overhaul tacho reference</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Remaining</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{remaining.toFixed(1)}h</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Limit</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{comp.maxHours.toFixed(1)}h</p>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Aircraft Tacho Basis</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{currentTacho.toFixed(1)}h</p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Installed at {(comp.installHours || 0).toFixed(1)}h  Overhauled at {(comp.overhaulHours ?? comp.installHours ?? 0).toFixed(1)}h</p>
                  </div>
                </CardContent>
              </Card>
            );
          }}
          emptyState={(
            <div className="flex min-h-[360px] flex-col items-center justify-center border-b bg-muted/5 p-8 text-center text-muted-foreground">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border bg-background">
                <Settings2 className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-bold uppercase tracking-wider text-foreground">No serialized components tracked for this session.</p>
                <p className="text-[10px] font-bold uppercase tracking-widest italic">Add the first part to start tracking lifecycle usage.</p>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}

function DocumentsTab({ aircraft, tenantId }: { aircraft: Aircraft; tenantId: string }) {
  const { toast } = useToast();
  const [viewingDoc, setViewingDoc] = useState<{ name: string; url: string } | null>(null);
  
  const [expirySettings, setExpirySettings] = useState<DocumentExpirySettings | null>(null);

  const loadExpirySettings = useCallback(() => {
    void fetch('/api/tenant-config', { cache: 'no-store' })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => {
        const settings = payload?.config?.['document-expiry-settings'] as DocumentExpirySettings | undefined;
        setExpirySettings(
          settings || {
            id: 'document-expiry',
            defaultColor: '#22c55e',
            expiredColor: '#ef4444',
            warningPeriods: [],
          }
        );
      })
      .catch(() =>
        setExpirySettings({
          id: 'document-expiry',
          defaultColor: '#22c55e',
          expiredColor: '#ef4444',
          warningPeriods: [],
        })
      );
  }, []);

  useEffect(() => {
    loadExpirySettings();
    const events = ['safeviate-document-expiry-settings-updated', 'safeviate-tenant-config-updated'];
    events.forEach((eventName) => window.addEventListener(eventName, loadExpirySettings));
    return () => events.forEach((eventName) => window.removeEventListener(eventName, loadExpirySettings));
  }, [loadExpirySettings]);

  const handleDocUpload = async (newDoc: AircraftDocumentUpload) => {
    try {
        const response = await fetch(`/api/aircraft/${aircraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aircraft: { ...aircraft, documents: [...(aircraft.documents || []), newDoc] } }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to update aircraft documents.');
        window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
        toast({ title: 'Document Added', description: `"${newDoc.name}" has been uploaded.` });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Upload Failed', description: 'Failed to update aircraft document list.' });
    }
  };

  const handleDeleteDoc = async (docName: string) => {
    try {
        const response = await fetch(`/api/aircraft/${aircraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aircraft: { ...aircraft, documents: (aircraft.documents || []).filter(d => d.name !== docName) } }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to remove document.');
        window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
        toast({ title: 'Document Removed' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to remove document.' });
    }
  };

  const handleExpirationDateChange = async (docName: string, date: Date | undefined) => {
    try {
        const updatedDocuments = (aircraft.documents || []).map((doc) =>
          doc.name === docName
            ? { ...doc, expirationDate: date ? new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString() : null }
            : doc
        );
        const response = await fetch(`/api/aircraft/${aircraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aircraft: { ...aircraft, documents: updatedDocuments } }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to update expiry date.');
        window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
        toast({
          title: 'Expiry Date Updated',
          description: date ? `"${docName}" expiry updated.` : `"${docName}" expiry cleared.`,
        });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Update Failed', description: 'Failed to save expiry date.' });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-muted/5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-8 shrink-0">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight">Technical Library</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-75">Aircraft certifications, insurance, and manufacturer manuals.</p>
        </div>
        <DocumentUploader
          onDocumentUploaded={handleDocUpload}
          trigger={(open) => (
            <Button size="sm" onClick={() => open()} variant="outline" className="gap-2 h-10 px-8 text-[10px] font-black uppercase border-slate-300 shadow-sm bg-background">
              <PlusCircle className="h-4 w-4" /> Add Document
            </Button>
          )}
        />
      </div>
      <div className="flex-1 overflow-auto bg-background">
        <ResponsiveCardGrid
          items={aircraft.documents || []}
          isLoading={false}
          className="p-4"
          gridClassName="sm:grid-cols-2 xl:grid-cols-3"
          renderItem={(doc) => {
            const expiryStyle = getDocumentExpiryBadgeStyle(doc.expirationDate, expirySettings);
            return (
              <Card key={doc.name} className="overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">
                      {doc.name}
                    </CardTitle>
                    <CardDescription className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Uploaded {format(new Date(doc.uploadDate), 'dd MMM yyyy')}
                    </CardDescription>
                  </div>
                  <div className="rounded-lg border bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-primary">
                    Document
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Uploaded</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{format(new Date(doc.uploadDate), 'dd MMM yyyy')}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Expiration</p>
                      <p className={cn("mt-1 text-sm font-semibold", !doc.expirationDate && "text-muted-foreground italic")}>
                        {doc.expirationDate ? format(parseLocalDate(doc.expirationDate) || new Date(doc.expirationDate), 'dd MMM yyyy') : 'No expiry set'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-10 w-full justify-start gap-2 border-2 shadow-sm uppercase text-[10px] font-black",
                            !doc.expirationDate && "text-muted-foreground italic border-dashed"
                          )}
                          style={doc.expirationDate && expiryStyle ? {
                            backgroundColor: expiryStyle.borderColor || '#ffffff',
                            borderColor: expiryStyle.borderColor || '#ffffff',
                            color: getContrastingTextColor(expiryStyle.borderColor || '#ffffff'),
                          } : undefined}
                        >
                          <CalendarIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {doc.expirationDate ? format(parseLocalDate(doc.expirationDate) || new Date(doc.expirationDate), 'dd MMM yyyy') : 'Set Expiry Date'}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-2xl border-2 shadow-2xl overflow-hidden" align="start">
                        <CustomCalendar
                          selectedDate={doc.expirationDate ? parseLocalDate(doc.expirationDate) : undefined}
                          onDateSelect={(date) => handleExpirationDateChange(doc.name, date)}
                        />
                      </PopoverContent>
                    </Popover>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="icon" className="h-10 w-10 hover:bg-primary hover:text-primary-foreground border-slate-300 shadow-sm transition-all" onClick={() => setViewingDoc({ name: doc.name, url: doc.url })}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-10 w-10 text-destructive hover:bg-destructive hover:text-destructive-foreground border-slate-300 shadow-sm transition-all" onClick={() => handleDeleteDoc(doc.name)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }}
          emptyState={(
            <div className="flex min-h-[360px] flex-col items-center justify-center border-b bg-muted/5 p-8 text-center text-muted-foreground">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border bg-background">
                <FileText className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-bold uppercase tracking-wider text-foreground">No technical certifications uploaded.</p>
                <p className="text-[10px] font-bold uppercase tracking-widest italic">Add the first document to start the aircraft library.</p>
              </div>
            </div>
          )}
        />
      </div>

      <Dialog open={!!viewingDoc} onOpenChange={(open) => !open && setViewingDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight">{viewingDoc?.name}</DialogTitle>
            <DialogDescription className="text-xs uppercase tracking-widest">Document Preview</DialogDescription>
          </DialogHeader>
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border bg-muted/20">
            {viewingDoc && <img src={viewingDoc.url} alt={viewingDoc.name} className="h-full w-full object-contain" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Modals ---

function EditAircraftDialog({ aircraft, tenantId }: { aircraft: Aircraft; tenantId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<EditAircraftValues>({
    resolver: zodResolver(editAircraftSchema),
    defaultValues: {
      make: aircraft.make || '',
      model: aircraft.model || '',
      type: aircraft.type || 'Single-Engine',
      initialHobbs: aircraft.initialHobbs || 0,
      currentHobbs: aircraft.currentHobbs || 0,
      initialTacho: aircraft.initialTacho || 0,
      currentTacho: aircraft.currentTacho || 0,
      tachoAtNext50Inspection: aircraft.tachoAtNext50Inspection || 0,
      tachoAtNext100Inspection: aircraft.tachoAtNext100Inspection || 0,
    }
  });

  const onSubmit = async (values: EditAircraftValues) => {
    try {
        const response = await fetch(`/api/aircraft/${aircraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aircraft: { ...aircraft, ...values } }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to save aircraft configuration.');
        window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
        
        toast({ title: 'Asset Updated', description: `Configuration for ${aircraft.tailNumber} has been synchronized.` });
        setIsOpen(false);
    } catch (e) {
        toast({ variant: 'destructive', title: 'Update Failed', description: 'Failed to save asset configuration.' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-10 px-8 text-[10px] font-black uppercase border-slate-300 shadow-sm bg-background">
          <Pencil className="h-3.5 w-3.5" /> Edit Specs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-8">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight">Edit Physical Specifications</DialogTitle>
          <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Update the technical offsets and meter readings for {aircraft.tailNumber}.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pt-6">
            <div className="grid grid-cols-2 gap-6">
              <FormField control={form.control} name="make" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Manufacturer</FormLabel><FormControl><Input className="h-11 font-bold" {...field} /></FormControl></FormItem> )}/>
              <FormField control={form.control} name="model" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Model</FormLabel><FormControl><Input className="h-11 font-bold" {...field} /></FormControl></FormItem> )}/>
              <FormField control={form.control} name="type" render={({ field }) => ( 
                <FormItem className="col-span-2">
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Engine Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Single-Engine">Single-Engine</SelectItem>
                      <SelectItem value="Multi-Engine">Multi-Engine</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem> 
              )}/>
            </div>
            
            <Separator />
            
            <div className="grid grid-cols-2 gap-x-12 gap-y-6">
              <FormField control={form.control} name="initialHobbs" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest opacity-60">Initial Hobbs</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-bold" {...field} /></FormControl></FormItem> )}/>
              <FormField control={form.control} name="currentHobbs" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Current Hobbs</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-black" {...field} /></FormControl></FormItem> )}/>
              <FormField control={form.control} name="initialTacho" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest opacity-60">Initial Tacho</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-bold" {...field} /></FormControl></FormItem> )}/>
              <FormField control={form.control} name="currentTacho" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Current Tacho</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-black" {...field} /></FormControl></FormItem> )}/>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-12 bg-primary/5 p-6 rounded-2xl border border-primary/20">
              <FormField control={form.control} name="tachoAtNext50Inspection" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest text-primary">Next 50h Tacho Target</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-black text-primary border-primary/30" {...field} /></FormControl></FormItem> )}/>
              <FormField control={form.control} name="tachoAtNext100Inspection" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest text-primary">Next 100h Tacho Target</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-black text-primary border-primary/30" {...field} /></FormControl></FormItem> )}/>
            </div>

            <DialogFooter className="pt-4">
              <DialogClose asChild><Button variant="outline" className="h-11 px-10 text-[10px] font-black uppercase border-slate-300 shadow-sm">Cancel</Button></DialogClose>
              <Button type="submit" className="h-11 px-10 text-[10px] font-black uppercase shadow-lg">Save Configuration</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddMaintenanceLogDialog({ aircraftId, tenantId }: { aircraftId: string; tenantId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<MaintenanceLogValues>({
    resolver: zodResolver(maintenanceLogSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      maintenanceType: 'Scheduled Inspection',
      details: '',
      reference: '',
      ameNo: '',
      amoNo: '',
    }
  });

  const onSubmit = async (values: MaintenanceLogValues) => {
    try {
        const currentResponse = await fetch(`/api/aircraft/${aircraftId}`, { cache: 'no-store' });
        const currentPayload = await currentResponse.json().catch(() => ({ aircraft: null }));
        const logs = ((currentPayload.aircraft?.maintenanceLogs as MaintenanceLog[]) || []).slice();

        const newLog: MaintenanceLog = {
            ...values,
            id: crypto.randomUUID(),
            aircraftId,
        };

        const nextLogs = [newLog, ...logs];
        const response = await fetch(`/api/aircraft/${aircraftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aircraft: { ...currentPayload.aircraft, maintenanceLogs: nextLogs } }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to save maintenance log.');
        window.dispatchEvent(new Event('safeviate-aircrafts-updated'));

        toast({ title: 'Log Registered', description: 'Maintenance event has been documented in the permanent record.' });
        setIsOpen(false);
        form.reset();
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to record maintenance event.' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 h-10 px-8 text-[10px] font-black uppercase shadow-lg">
          <PlusCircle className="h-4 w-4" /> Register Service Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl rounded-3xl p-8">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight">Technical Record Entry</DialogTitle>
          <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Document the details of the technical intervention or inspection.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="date" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Entry Date</FormLabel><FormControl><Input type="date" className="h-11 font-bold" {...field} /></FormControl></FormItem> )}/>
                <FormField control={form.control} name="maintenanceType" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Event Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Scheduled Inspection">Scheduled Inspection</SelectItem><SelectItem value="Defect Rectification">Defect Rectification</SelectItem><SelectItem value="Component Change">Component Change</SelectItem><SelectItem value="Service Bulletin">Service Bulletin</SelectItem></SelectContent></Select></FormItem> )}/>
            </div>
            <FormField control={form.control} name="reference" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Reference / Release #</FormLabel><FormControl><Input placeholder="Internal Release # or AMO Reference..." className="h-11 font-mono font-bold" {...field} /></FormControl></FormItem> )}/>
            <FormField control={form.control} name="details" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Technical Intervention Details</FormLabel><FormControl><Textarea className="min-h-[120px] font-medium p-4 bg-muted/5 border-2" placeholder="Describe the work performed, defects cleared, or components replaced..." {...field} /></FormControl></FormItem> )}/>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="ameNo" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">AME License Number</FormLabel><FormControl><Input className="h-11 font-black text-sm text-primary" {...field} /></FormControl></FormItem> )}/>
              <FormField control={form.control} name="amoNo" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">AMO Certification #</FormLabel><FormControl><Input className="h-11 font-black text-sm" {...field} /></FormControl></FormItem> )}/>
            </div>
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button variant="outline" className="h-11 px-8 text-[10px] font-black uppercase border-slate-300">Cancel</Button></DialogClose>
              <Button type="submit" className="h-11 px-8 text-[10px] font-black uppercase shadow-lg">Commit To Record</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddComponentDialog({ aircraft, tenantId }: { aircraft: Aircraft; tenantId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<ComponentValues>({
    resolver: zodResolver(componentSchema),
    defaultValues: {
      name: '',
      ataChapter: 'ATA Other',
      serialNumber: '',
      installHours: aircraft.currentTacho || 0,
      overhaulHours: aircraft.currentTacho || 0,
      maxHours: 2000,
    }
  });

  const onSubmit = async (values: ComponentValues) => {
    try {
        const currentResponse = await fetch(`/api/aircraft/${aircraft.id}`, { cache: 'no-store' });
        const currentPayload = await currentResponse.json().catch(() => ({ aircraft: null }));
        const currentAircraft = currentPayload.aircraft as Aircraft | null;
        const newComponent = {
          ...values,
          id: crypto.randomUUID(),
          installDate: toNoonUtcIso(new Date()),
          tsn: 0,
          tso: 0,
          totalTime: 0,
        };
        const response = await fetch(`/api/aircraft/${aircraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aircraft: { ...currentAircraft, components: [...(currentAircraft?.components || []), newComponent] } }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to add component.');
        window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
        
        toast({ title: 'Component Tracked', description: `Lifecycle monitoring enabled for ${values.name}.` });
        setIsOpen(false);
        form.reset();
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to add component to tracking list.' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 h-10 px-8 text-[10px] font-black uppercase shadow-lg bg-background text-foreground border-2 hover:bg-muted">
          <PlusCircle className="h-4 w-4" /> Monitor Serialized Part
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl rounded-3xl p-8">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight">Serialized Component Lifecycle</DialogTitle>
          <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Register a component using Tacho reference points so TSN, TSO, and remaining life calculate automatically.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Component Name</FormLabel><FormControl><Input placeholder="e.g., Engine, Propeller" className="h-11 font-bold" {...field} /></FormControl></FormItem> )}/>
                <FormField control={form.control} name="serialNumber" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Serial Number</FormLabel><FormControl><Input className="h-11 font-mono font-black uppercase" {...field} /></FormControl></FormItem> )}/>
            </div>
            <FormField control={form.control} name="ataChapter" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black uppercase tracking-widest">ATA Classification</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {COMPONENT_ATA_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} ({option.value})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}/>
            <div className="grid grid-cols-2 gap-6 bg-muted/10 p-6 rounded-2xl border-2 shadow-inner">
              <FormField control={form.control} name="installHours" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest opacity-70">Installed At Tacho</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-black" {...field} /></FormControl></FormItem> )}/>
              <FormField control={form.control} name="overhaulHours" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest opacity-70">Overhauled At Tacho</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-black" {...field} /></FormControl></FormItem> )}/>
              <FormField control={form.control} name="maxHours" render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-black uppercase tracking-widest">Service Life Limit</FormLabel><FormControl><Input type="number" step="0.1" className="h-11 font-mono font-black text-destructive" {...field} /></FormControl></FormItem> )}/>
            </div>
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button variant="outline" className="h-11 px-10 text-[10px] font-black uppercase border-slate-300 shadow-sm">Cancel</Button></DialogClose>
              <Button type="submit" className="h-11 px-10 text-[10px] font-black uppercase shadow-lg">Enable Tracking</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddDefectDialog({ aircraft, tenantId }: { aircraft: Aircraft; tenantId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<DefectValues>({
    resolver: zodResolver(defectSchema),
    defaultValues: {
      title: '',
      details: '',
      categoryId: 'other',
      affectedItemType: 'aircraft',
      componentId: '',
      status: 'Open',
      grounded: 'no',
      reportedAt: format(new Date(), 'yyyy-MM-dd'),
      rectifiedAt: '',
      rectificationAction: '',
      rectificationReference: '',
      rectifiedByName: '',
      rectifiedByLicense: '',
      rectifiedByOrganisation: '',
      returnToServiceRecorded: 'no',
      returnToServiceBy: '',
      returnToServiceReference: '',
    },
  });

  const onSubmit = async (values: DefectValues) => {
    try {
      const category = DEFECT_CATEGORIES.find((entry) => entry.id === values.categoryId) || DEFECT_CATEGORIES[DEFECT_CATEGORIES.length - 1];
      const linkedComponent =
        values.affectedItemType === 'component' ? (aircraft.components || []).find((component) => component.id === values.componentId) : undefined;
      const rectifiedAtIso = values.status === 'Cleared' && values.rectifiedAt ? toNoonUtcIso(new Date(values.rectifiedAt)) : undefined;
      const linkedMaintenanceLogId = values.status === 'Cleared' ? crypto.randomUUID() : undefined;
      const nextDefect: AircraftDefect = {
        id: crypto.randomUUID(),
        title: values.title,
        details: values.details,
        categoryId: category.id,
        categoryLabel: category.label,
        ataLabel: category.ataLabel,
        componentId: linkedComponent?.id,
        componentName: linkedComponent?.name,
        componentSerialNumber: linkedComponent?.serialNumber,
        status: values.status,
        grounded: values.grounded === 'yes',
        reportedAt: toNoonUtcIso(new Date(values.reportedAt)),
        rectifiedAt: rectifiedAtIso,
        rectificationAction: values.status === 'Cleared' ? values.rectificationAction?.trim() : undefined,
        rectificationReference: values.status === 'Cleared' ? values.rectificationReference?.trim() : undefined,
        rectifiedByName: values.status === 'Cleared' ? values.rectifiedByName?.trim() : undefined,
        rectifiedByLicense: values.status === 'Cleared' ? values.rectifiedByLicense?.trim() : undefined,
        rectifiedByOrganisation: values.status === 'Cleared' ? values.rectifiedByOrganisation?.trim() : undefined,
        returnToServiceRecorded: values.status === 'Cleared' ? values.returnToServiceRecorded === 'yes' : undefined,
        returnToServiceBy: values.status === 'Cleared' && values.returnToServiceRecorded === 'yes' ? values.returnToServiceBy?.trim() : undefined,
        returnToServiceReference: values.status === 'Cleared' && values.returnToServiceRecorded === 'yes' ? values.returnToServiceReference?.trim() : undefined,
        linkedMaintenanceLogId,
        source: 'manual',
      };
      const nextMaintenanceLogs =
        values.status === 'Cleared' && rectifiedAtIso
          ? [
              {
                id: linkedMaintenanceLogId!,
                aircraftId: aircraft.id,
                date: format(parseLocalDate(rectifiedAtIso) || new Date(rectifiedAtIso), 'yyyy-MM-dd'),
                maintenanceType: 'Defect Rectification',
                details: `${values.title}: ${values.rectificationAction?.trim() || ''}`.trim(),
                reference: values.rectificationReference?.trim() || '',
                ameNo: values.rectifiedByLicense?.trim() || '',
                amoNo: values.rectifiedByOrganisation?.trim() || '',
              } satisfies MaintenanceLog,
              ...((aircraft.maintenanceLogs as MaintenanceLog[] | undefined) || []),
            ]
          : ((aircraft.maintenanceLogs as MaintenanceLog[] | undefined) || []);

      const response = await fetch(`/api/aircraft/${aircraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft: {
            ...aircraft,
            defects: [nextDefect, ...(aircraft.defects || [])],
            maintenanceLogs: nextMaintenanceLogs,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to save defect.');
      window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
      toast({ title: 'Defect Logged', description: 'The defect has been added to the aircraft defect list.' });
      form.reset({
        title: '',
        details: '',
        categoryId: 'other',
        affectedItemType: 'aircraft',
        componentId: '',
        status: 'Open',
        grounded: 'no',
        reportedAt: format(new Date(), 'yyyy-MM-dd'),
        rectifiedAt: '',
        rectificationAction: '',
        rectificationReference: '',
        rectifiedByName: '',
        rectifiedByLicense: '',
        rectifiedByOrganisation: '',
        returnToServiceRecorded: 'no',
        returnToServiceBy: '',
        returnToServiceReference: '',
      });
      setIsOpen(false);
    } catch {
      toast({ variant: 'destructive', title: 'Save Failed', description: 'Failed to record aircraft defect.' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 h-9 px-6 text-[10px] font-black uppercase shadow-sm">
          <PlusCircle className="h-3.5 w-3.5" /> Add Defect
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl rounded-3xl p-8">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight">Aircraft Defect Entry</DialogTitle>
          <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Record a structured defect against the aircraft using ATA-style categories.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black uppercase tracking-widest">Title</FormLabel>
                <FormControl><Input className="h-11 font-bold" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="details" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black uppercase tracking-widest">Defect Details</FormLabel>
                <FormControl><Textarea className="min-h-[72px] p-3" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="affectedItemType" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Affected Item</FormLabel>
                  <Select onValueChange={(value) => {
                    field.onChange(value);
                    if (value !== 'component') {
                      form.setValue('componentId', '');
                    }
                  }} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="aircraft">Aircraft General</SelectItem>
                      <SelectItem value="component">Tracked Component</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="categoryId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {DEFECT_CATEGORIES.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            {form.watch('affectedItemType') === 'component' ? (
              <FormField control={form.control} name="componentId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Component</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue placeholder="Select component" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {(aircraft.components || []).map((component) => (
                        <SelectItem key={component.id} value={component.id}>
                          {component.name} ({component.serialNumber})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {DEFECT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="grounded" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Grounded</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="reportedAt" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Reported Date</FormLabel>
                  <FormControl><Input type="date" className="h-11 font-bold" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>
            {form.watch('status') === 'Cleared' ? (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Rectification</div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="rectifiedAt" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">Rectified Date</FormLabel>
                        <FormControl><Input type="date" className="h-11 font-bold" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="rectificationReference" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">Reference / Release</FormLabel>
                        <FormControl><Input className="h-11 font-mono font-bold" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="rectificationAction" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest">Rectification Action</FormLabel>
                      <FormControl><Textarea className="min-h-[72px] p-3" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="rectifiedByName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">Rectified By</FormLabel>
                        <FormControl><Input className="h-11 font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="rectifiedByLicense" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">License</FormLabel>
                        <FormControl><Input className="h-11 font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="rectifiedByOrganisation" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">Organisation</FormLabel>
                        <FormControl><Input className="h-11 font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="returnToServiceRecorded" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">Return To Service</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="no">No</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="returnToServiceBy" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">RTS By</FormLabel>
                        <FormControl><Input className="h-11 font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="returnToServiceReference" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">RTS Reference</FormLabel>
                        <FormControl><Input className="h-11 font-mono font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>
              </>
            ) : null}
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button variant="outline" className="h-11 px-8 text-[10px] font-black uppercase border-slate-300">Cancel</Button></DialogClose>
              <Button type="submit" className="h-11 px-8 text-[10px] font-black uppercase shadow-lg">Save Defect</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditDefectDialog({ aircraft, defect, tenantId }: { aircraft: Aircraft; defect: AircraftDefect; tenantId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<DefectValues>({
    resolver: zodResolver(defectSchema),
    defaultValues: {
      title: defect.title,
      details: defect.details,
      categoryId: defect.categoryId,
      affectedItemType: defect.componentId ? 'component' : 'aircraft',
      componentId: defect.componentId || '',
      status: defect.status,
      grounded: defect.grounded ? 'yes' : 'no',
      reportedAt: format(parseLocalDate(defect.reportedAt) || new Date(), 'yyyy-MM-dd'),
      rectifiedAt: defect.rectifiedAt ? format(parseLocalDate(defect.rectifiedAt) || new Date(), 'yyyy-MM-dd') : '',
      rectificationAction: defect.rectificationAction || '',
      rectificationReference: defect.rectificationReference || '',
      rectifiedByName: defect.rectifiedByName || '',
      rectifiedByLicense: defect.rectifiedByLicense || '',
      rectifiedByOrganisation: defect.rectifiedByOrganisation || '',
      returnToServiceRecorded: defect.returnToServiceRecorded ? 'yes' : 'no',
      returnToServiceBy: defect.returnToServiceBy || '',
      returnToServiceReference: defect.returnToServiceReference || '',
    },
  });

  const onSubmit = async (values: DefectValues) => {
    try {
      const category = DEFECT_CATEGORIES.find((entry) => entry.id === values.categoryId) || DEFECT_CATEGORIES[DEFECT_CATEGORIES.length - 1];
      const linkedComponent =
        values.affectedItemType === 'component' ? (aircraft.components || []).find((component) => component.id === values.componentId) : undefined;
      const existingLogs = ((aircraft.maintenanceLogs as MaintenanceLog[] | undefined) || []).slice();
      const rectifiedAtIso = values.status === 'Cleared' && values.rectifiedAt ? toNoonUtcIso(new Date(values.rectifiedAt)) : undefined;
      const maintenanceLogId = defect.linkedMaintenanceLogId || (values.status === 'Cleared' ? crypto.randomUUID() : undefined);
      const nextDefects = (aircraft.defects || []).map((entry) =>
        entry.id === defect.id
          ? {
              ...entry,
              title: values.title,
              details: values.details,
              categoryId: category.id,
              categoryLabel: category.label,
              ataLabel: category.ataLabel,
              componentId: linkedComponent?.id,
              componentName: linkedComponent?.name,
              componentSerialNumber: linkedComponent?.serialNumber,
              status: values.status,
              grounded: values.grounded === 'yes',
              reportedAt: toNoonUtcIso(new Date(values.reportedAt)),
              rectifiedAt: rectifiedAtIso,
              rectificationAction: values.status === 'Cleared' ? values.rectificationAction?.trim() : undefined,
              rectificationReference: values.status === 'Cleared' ? values.rectificationReference?.trim() : undefined,
              rectifiedByName: values.status === 'Cleared' ? values.rectifiedByName?.trim() : undefined,
              rectifiedByLicense: values.status === 'Cleared' ? values.rectifiedByLicense?.trim() : undefined,
              rectifiedByOrganisation: values.status === 'Cleared' ? values.rectifiedByOrganisation?.trim() : undefined,
              returnToServiceRecorded: values.status === 'Cleared' ? values.returnToServiceRecorded === 'yes' : undefined,
              returnToServiceBy: values.status === 'Cleared' && values.returnToServiceRecorded === 'yes' ? values.returnToServiceBy?.trim() : undefined,
              returnToServiceReference: values.status === 'Cleared' && values.returnToServiceRecorded === 'yes' ? values.returnToServiceReference?.trim() : undefined,
              linkedMaintenanceLogId: values.status === 'Cleared' ? maintenanceLogId : undefined,
            }
          : entry
      );
      const nextMaintenanceLogs =
        values.status === 'Cleared' && rectifiedAtIso
          ? [
              {
                id: maintenanceLogId!,
                aircraftId: aircraft.id,
                date: format(parseLocalDate(rectifiedAtIso) || new Date(rectifiedAtIso), 'yyyy-MM-dd'),
                maintenanceType: 'Defect Rectification',
                details: `${values.title}: ${values.rectificationAction?.trim() || ''}`.trim(),
                reference: values.rectificationReference?.trim() || '',
                ameNo: values.rectifiedByLicense?.trim() || '',
                amoNo: values.rectifiedByOrganisation?.trim() || '',
              } satisfies MaintenanceLog,
              ...existingLogs.filter((log) => log.id !== maintenanceLogId),
            ]
          : existingLogs.filter((log) => log.id !== defect.linkedMaintenanceLogId);

      const response = await fetch(`/api/aircraft/${aircraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft: {
            ...aircraft,
            defects: nextDefects,
            maintenanceLogs: nextMaintenanceLogs,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to update defect.');
      window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
      toast({
        title: values.status === 'Cleared' ? 'Defect Closed' : 'Defect Updated',
        description: values.status === 'Cleared' ? 'The defect has been marked as cleared.' : 'The defect entry has been updated.',
      });
      setIsOpen(false);
    } catch {
      toast({ variant: 'destructive', title: 'Update Failed', description: 'Failed to update aircraft defect.' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-3 text-[10px] font-black uppercase border-slate-300">
          <Pencil className="mr-1.5 h-3 w-3" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl rounded-3xl p-8">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight">Edit Defect</DialogTitle>
          <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Update the defect details or mark it as cleared.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black uppercase tracking-widest">Title</FormLabel>
                <FormControl><Input className="h-11 font-bold" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="details" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black uppercase tracking-widest">Defect Details</FormLabel>
                <FormControl><Textarea className="min-h-[72px] p-3" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="affectedItemType" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Affected Item</FormLabel>
                  <Select onValueChange={(value) => {
                    field.onChange(value);
                    if (value !== 'component') {
                      form.setValue('componentId', '');
                    }
                  }} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="aircraft">Aircraft General</SelectItem>
                      <SelectItem value="component">Tracked Component</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="categoryId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {DEFECT_CATEGORIES.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            {form.watch('affectedItemType') === 'component' ? (
              <FormField control={form.control} name="componentId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Component</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue placeholder="Select component" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {(aircraft.components || []).map((component) => (
                        <SelectItem key={component.id} value={component.id}>
                          {component.name} ({component.serialNumber})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {DEFECT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="grounded" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Grounded</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="reportedAt" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest">Reported Date</FormLabel>
                  <FormControl><Input type="date" className="h-11 font-bold" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>
            {form.watch('status') === 'Cleared' ? (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Rectification</div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="rectifiedAt" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">Rectified Date</FormLabel>
                        <FormControl><Input type="date" className="h-11 font-bold" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="rectificationReference" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">Reference / Release</FormLabel>
                        <FormControl><Input className="h-11 font-mono font-bold" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="rectificationAction" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest">Rectification Action</FormLabel>
                      <FormControl><Textarea className="min-h-[72px] p-3" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="rectifiedByName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">Rectified By</FormLabel>
                        <FormControl><Input className="h-11 font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="rectifiedByLicense" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">License</FormLabel>
                        <FormControl><Input className="h-11 font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="rectifiedByOrganisation" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">Organisation</FormLabel>
                        <FormControl><Input className="h-11 font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="returnToServiceRecorded" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">Return To Service</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="no">No</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="returnToServiceBy" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">RTS By</FormLabel>
                        <FormControl><Input className="h-11 font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="returnToServiceReference" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest">RTS Reference</FormLabel>
                        <FormControl><Input className="h-11 font-mono font-bold" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>
              </>
            ) : null}
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button variant="outline" className="h-11 px-8 text-[10px] font-black uppercase border-slate-300">Cancel</Button></DialogClose>
              <Button type="submit" className="h-11 px-8 text-[10px] font-black uppercase shadow-lg">
                {form.watch('status') === 'Cleared' ? 'Close Defect' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
