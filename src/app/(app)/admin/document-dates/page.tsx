'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MainPageHeader } from "@/components/page-header";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Trash2, Clock, ShieldAlert, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useDebounce } from '@/hooks/use-debounce';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePermissions } from '@/hooks/use-permissions';
import type { InstructorHourWarning, InstructorHourWarningSettings, StudentMilestoneSettings } from '@/types/training';
import type { AircraftInspectionWarningSettings, HourWarning } from '@/types/inspection';

export type WarningPeriod = {
  period: number;
  color: string;
};

export type DocumentExpirySettings = {
  id: string;
  defaultColor: string;
  expiredColor: string;
  warningPeriods: WarningPeriod[];
};

const defaultPeriodColor = '#facc15'; // yellow-400
const defaultSafeColor = '#22c55e'; // green-500
const defaultExpiredColor = '#ef4444'; // red-500

const defaultMilestones = [
    { milestone: 10, warningHours: 7 },
    { milestone: 20, warningHours: 17 },
    { milestone: 30, warningHours: 27 },
    { milestone: 40, warningHours: 37 },
];

const defaultInstructorWarnings = [
  { hours: 20, warningHours: 10, color: '#60a5fa', foregroundColor: '#ffffff' },
  { hours: 40, warningHours: 30, color: '#facc15', foregroundColor: '#000000' },
  { hours: 60, warningHours: 50, color: '#f97316', foregroundColor: '#ffffff' },
  { hours: 80, warningHours: 70, color: '#ef4444', foregroundColor: '#ffffff' },
];

const defaultFiftyHourWarnings: HourWarning[] = [
    { hours: 20, color: '#60a5fa', foregroundColor: '#ffffff' },
    { hours: 10, color: '#facc15', foregroundColor: '#000000' },
    { hours: 5, color: '#f97316', foregroundColor: '#ffffff' },
    { hours: 2, color: '#ef4444', foregroundColor: '#ffffff' },
];

const defaultHundredHourWarnings: HourWarning[] = [
    { hours: 30, color: '#60a5fa', foregroundColor: '#ffffff' },
    { hours: 20, color: '#facc15', foregroundColor: '#000000' },
    { hours: 10, color: '#f97316', foregroundColor: '#ffffff' },
    { hours: 5, color: '#ef4444', foregroundColor: '#ffffff' },
];

const defaultFleetTargetHours = 20;

export default function DocumentDatesPage() {
  const { toast } = useToast();
  const { hasPermission, isLoading: isPermissionsLoading } = usePermissions();
  const canManage = hasPermission('admin-settings-manage');
  
  const [expirySettings, setExpirySettings] = useState<DocumentExpirySettings | null>(null);
  const [milestoneSettings, setMilestoneSettings] = useState<StudentMilestoneSettings | null>(null);
  const [instructorWarningSettings, setInstructorWarningSettings] = useState<InstructorHourWarningSettings | null>(null);
  const [inspectionSettings, setInspectionSettings] = useState<AircraftInspectionWarningSettings | null>(null);
  const [fleetTargetHours, setFleetTargetHours] = useState(String(defaultFleetTargetHours));
  const [isLoading, setIsLoading] = useState(true);

  const [newPeriod, setNewPeriod] = useState('');
  const [newPeriodColor, setNewPeriodColor] = useState(defaultPeriodColor);
  const [defaultColorState, setDefaultColorState] = useState(defaultSafeColor);
  const [expiredColorState, setExpiredColorState] = useState(defaultExpiredColor);
  const [periodColors, setPeriodColors] = useState<Record<number, string>>({});
  
  const [milestoneState, setMilestoneState] = useState(defaultMilestones);
  const [instructorWarningState, setInstructorWarningState] = useState<InstructorHourWarning[]>(defaultInstructorWarnings);
  const [fiftyHourWarnings, setFiftyHourWarnings] = useState<HourWarning[]>([]);
  const [hundredHourWarnings, setHundredHourWarnings] = useState<HourWarning[]>([]);
  
  const [newFiftyHour, setNewFiftyHour] = useState('');
  const [newFiftyHourColor, setNewFiftyHourColor] = useState('#facc15');
  const [newFiftyHourFgColor, setNewFiftyHourFgColor] = useState('#000000');
  const [newHundredHour, setNewHundredHour] = useState('');
  const [newHundredHourColor, setNewHundredHourColor] = useState('#f97316');
  const [newHundredHourFgColor, setNewHundredHourFgColor] = useState('#ffffff');
  const [newInstructorHour, setNewInstructorHour] = useState('');
  const [newInstructorWarningHour, setNewInstructorWarningHour] = useState('');
  const [newInstructorColor, setNewInstructorColor] = useState('#60a5fa');
  const [newInstructorFgColor, setNewInstructorFgColor] = useState('#ffffff');

  const persistTenantConfig = useCallback(async (config: Record<string, unknown>) => {
    const response = await fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage = typeof payload === 'object' && payload && 'error' in payload && typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : 'Failed to save tenant configuration.';
      throw new Error(errorMessage);
    }
    return payload;
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
        const response = await fetch('/api/tenant-config', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        const config = payload?.config && typeof payload.config === 'object' ? (payload.config as Record<string, unknown>) : {};

        const readSection = <T,>(key: string, fallback: T): T => {
          const section = config[key];
          return section && typeof section === 'object' ? (section as T) : fallback;
        };

        const exp = readSection<DocumentExpirySettings>('document-expiry-settings', { id: 'document-expiry', defaultColor: defaultSafeColor, expiredColor: defaultExpiredColor, warningPeriods: [] });
        const mile = readSection<StudentMilestoneSettings>('student-milestone-settings', { id: 'student-milestones', milestones: defaultMilestones });
        const inst = readSection<InstructorHourWarningSettings>('instructor-hour-warnings', { id: 'instructor-hour-warnings', warnings: defaultInstructorWarnings });
        const insp = readSection<AircraftInspectionWarningSettings>('inspection-warning-settings', { id: 'inspection-warnings', fiftyHourWarnings: defaultFiftyHourWarnings, oneHundredHourWarnings: defaultHundredHourWarnings });
        const fleetTarget = readSection<number>('fleet-target-hours', defaultFleetTargetHours);

        setExpirySettings(exp);
        setDefaultColorState(exp.defaultColor || defaultSafeColor);
        setExpiredColorState(exp.expiredColor || defaultExpiredColor);
        setPeriodColors((exp.warningPeriods || []).reduce<Record<number, string>>((acc, p) => {
          acc[p.period] = p.color;
          return acc;
        }, {}));

        setMilestoneSettings(mile);
        setMilestoneState(mile.milestones || defaultMilestones);

        const normalizedInstructorWarnings = (inst.warnings || defaultInstructorWarnings).map((warning) => ({
          hours: warning.hours,
          warningHours: warning.warningHours,
          color: warning.color || '#60a5fa',
          foregroundColor: warning.foregroundColor || '#ffffff',
        }));
        const normalizedInstructorSettings: InstructorHourWarningSettings = { ...inst, warnings: normalizedInstructorWarnings };
        setInstructorWarningSettings(normalizedInstructorSettings);
        setInstructorWarningState(normalizedInstructorWarnings);

        setInspectionSettings(insp);
        setFiftyHourWarnings(insp.fiftyHourWarnings || []);
        setHundredHourWarnings(insp.oneHundredHourWarnings || []);
        setFleetTargetHours(String(fleetTarget || defaultFleetTargetHours));
    } catch (e) {
        console.error("Failed to load settings", e);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    window.addEventListener('safeviate-document-expiry-settings-updated', loadData);
    window.addEventListener('safeviate-student-milestone-settings-updated', loadData);
    window.addEventListener('safeviate-instructor-hour-warnings-updated', loadData);
    window.addEventListener('safeviate-inspection-warning-settings-updated', loadData);
    return () => {
        window.removeEventListener('safeviate-document-expiry-settings-updated', loadData);
        window.removeEventListener('safeviate-student-milestone-settings-updated', loadData);
        window.removeEventListener('safeviate-instructor-hour-warnings-updated', loadData);
        window.removeEventListener('safeviate-inspection-warning-settings-updated', loadData);
    };
  }, [loadData]);

  if (isPermissionsLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full px-1 pt-4">
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="max-w-[1100px] mx-auto w-full px-1 pt-4">
        <Card className="border shadow-none">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Access restricted for this tenant view.
          </CardContent>
        </Card>
      </div>
    );
  }

  const debouncedDefaultColor = useDebounce(defaultColorState, 500);
  const debouncedExpiredColor = useDebounce(expiredColorState, 500);
  const debouncedPeriodColors = useDebounce(periodColors, 500);
  const debouncedMilestoneState = useDebounce(milestoneState, 500);
  const debouncedInstructorWarningState = useDebounce(instructorWarningState, 500);
  const debouncedFleetTargetHours = useDebounce(fleetTargetHours, 500);

  useEffect(() => {
     if (isLoading || !expirySettings) return;
     if (expirySettings.defaultColor !== debouncedDefaultColor) {
         fetch('/api/tenant-config', {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ config: { 'document-expiry-settings': { ...expirySettings, defaultColor: debouncedDefaultColor }, 'student-milestone-settings': milestoneSettings, 'inspection-warning-settings': inspectionSettings } }),
         }).catch(() => {});
         window.dispatchEvent(new Event('safeviate-document-expiry-settings-updated'));
     }
  }, [debouncedDefaultColor, isLoading, expirySettings]);

  useEffect(() => {
    if (isLoading || !expirySettings) return;
    if (expirySettings.expiredColor !== debouncedExpiredColor) {
        fetch('/api/tenant-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: { 'document-expiry-settings': { ...expirySettings, expiredColor: debouncedExpiredColor }, 'student-milestone-settings': milestoneSettings, 'inspection-warning-settings': inspectionSettings } }),
        }).catch(() => {});
        window.dispatchEvent(new Event('safeviate-document-expiry-settings-updated'));
    }
 }, [debouncedExpiredColor, isLoading, expirySettings]);

 useEffect(() => {
     if (isLoading || !expirySettings || Object.keys(debouncedPeriodColors).length === 0) return;
    const newPeriods = (expirySettings.warningPeriods || []).map((p) => ({ ...p, color: debouncedPeriodColors[p.period] || p.color }));
    if (JSON.stringify(expirySettings.warningPeriods) !== JSON.stringify(newPeriods)) {
        fetch('/api/tenant-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: { 'document-expiry-settings': { ...expirySettings, warningPeriods: newPeriods }, 'student-milestone-settings': milestoneSettings, 'inspection-warning-settings': inspectionSettings } }),
        }).catch(() => {});
        window.dispatchEvent(new Event('safeviate-document-expiry-settings-updated'));
    }
 }, [debouncedPeriodColors, isLoading, expirySettings]);

 useEffect(() => {
    if (isLoading || !milestoneSettings) return;
    if (JSON.stringify(milestoneSettings.milestones) !== JSON.stringify(debouncedMilestoneState)) {
        fetch('/api/tenant-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: { 'document-expiry-settings': expirySettings, 'student-milestone-settings': { ...milestoneSettings, milestones: debouncedMilestoneState }, 'instructor-hour-warnings': instructorWarningSettings, 'inspection-warning-settings': inspectionSettings } }),
        }).catch(() => {});
        window.dispatchEvent(new Event('safeviate-student-milestone-settings-updated'));
    }
 }, [debouncedMilestoneState, isLoading, milestoneSettings]);

 useEffect(() => {
    if (isLoading || !instructorWarningSettings) return;
    if (JSON.stringify(instructorWarningSettings.warnings) !== JSON.stringify(debouncedInstructorWarningState)) {
        fetch('/api/tenant-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: { 'document-expiry-settings': expirySettings, 'student-milestone-settings': milestoneSettings, 'instructor-hour-warnings': { ...instructorWarningSettings, warnings: debouncedInstructorWarningState }, 'inspection-warning-settings': inspectionSettings } }),
        }).catch(() => {});
        window.dispatchEvent(new Event('safeviate-instructor-hour-warnings-updated'));
    }
 }, [debouncedInstructorWarningState, isLoading, instructorWarningSettings]);

  useEffect(() => {
    if (isLoading) return;
    const parsed = parseInt(debouncedFleetTargetHours, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return;
    fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          'document-expiry-settings': expirySettings,
          'student-milestone-settings': milestoneSettings,
          'instructor-hour-warnings': instructorWarningSettings,
          'inspection-warning-settings': inspectionSettings,
          'fleet-target-hours': parsed,
        },
      }),
    }).catch(() => {});
  }, [debouncedFleetTargetHours, isLoading]);

  const handleAddPeriod = async () => {
    const period = parseInt(newPeriod, 10);
    if (isNaN(period) || period <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Number', description: 'Please enter a positive number of days.' });
      return;
    }
    if (!expirySettings) {
      toast({ variant: 'destructive', title: 'Save Failed', description: 'Expiry settings are not loaded yet.' });
      return;
    }
    const currentPeriods = expirySettings?.warningPeriods || [];
    if (currentPeriods.some((p) => p.period === period)) {
      toast({ variant: 'destructive', title: 'Duplicate Period', description: `The warning period for ${period} days already exists.` });
      return;
    }
    const updatedWarningPeriods = [...currentPeriods, { period, color: newPeriodColor }].sort((a, b) => a.period - b.period);
    const updatedExpirySettings: DocumentExpirySettings = { ...expirySettings, warningPeriods: updatedWarningPeriods };
    try {
      await persistTenantConfig({
        'document-expiry-settings': updatedExpirySettings,
        'student-milestone-settings': milestoneSettings,
        'instructor-hour-warnings': instructorWarningSettings,
        'inspection-warning-settings': inspectionSettings,
      });
      setExpirySettings(updatedExpirySettings);
      setPeriodColors((prev) => ({ ...prev, [period]: newPeriodColor }));
      window.dispatchEvent(new Event('safeviate-document-expiry-settings-updated'));
      toast({ title: 'Warning Period Added', description: `${period} days has been added.` });
      setNewPeriod('');
      setNewPeriodColor(defaultPeriodColor);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Save Failed', description: error instanceof Error ? error.message : 'Failed to save warning period.' });
    }
  };

  const handleRemovePeriod = async (periodToRemove: number) => {
    if (!expirySettings) {
      toast({ variant: 'destructive', title: 'Save Failed', description: 'Expiry settings are not loaded yet.' });
      return;
    }
    const newPeriods = (expirySettings?.warningPeriods || []).filter((p) => p.period !== periodToRemove);
    const updatedExpirySettings: DocumentExpirySettings = { ...expirySettings, warningPeriods: newPeriods };
    try {
      await persistTenantConfig({
        'document-expiry-settings': updatedExpirySettings,
        'student-milestone-settings': milestoneSettings,
        'instructor-hour-warnings': instructorWarningSettings,
        'inspection-warning-settings': inspectionSettings,
      });
      setExpirySettings(updatedExpirySettings);
      setPeriodColors((prev) => {
        const next = { ...prev };
        delete next[periodToRemove];
        return next;
      });
      window.dispatchEvent(new Event('safeviate-document-expiry-settings-updated'));
      toast({ title: 'Warning Period Removed', description: `${periodToRemove} days has been removed.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Save Failed', description: error instanceof Error ? error.message : 'Failed to remove warning period.' });
    }
  };
  
  const handleMilestoneWarningChange = (milestoneValue: number, warningHours: string) => {
    const hours = parseInt(warningHours, 10);
    if (!isNaN(hours)) {
        setMilestoneState(prev => prev.map(m => m.milestone === milestoneValue ? { ...m, warningHours: hours } : m));
    }
  }

  const handleInstructorWarningChange = (hours: number, warningHours: string) => {
    const parsed = parseInt(warningHours, 10);
    if (!isNaN(parsed)) {
      setInstructorWarningState((prev) =>
        prev.map((warning) => (warning.hours === hours ? { ...warning, warningHours: parsed } : warning))
      );
    }
  };

  const handleAddInstructorWarning = () => {
    const maxHours = parseInt(newInstructorHour || '0', 10);
    const warningHours = parseInt(newInstructorWarningHour || '0', 10);
    if (isNaN(maxHours) || maxHours <= 0 || isNaN(warningHours) || warningHours < 0 || warningHours >= maxHours) {
      toast({ variant: 'destructive', title: 'Invalid Number', description: 'Please enter valid instructor hour values.' });
      return;
    }
    if (!instructorWarningSettings) {
      toast({ variant: 'destructive', title: 'Save Failed', description: 'Instructor warning settings are not loaded yet.' });
      return;
    }
    if (instructorWarningSettings.warnings.some((w) => w.hours === maxHours)) {
      toast({ variant: 'destructive', title: 'Duplicate Threshold', description: `A threshold at ${maxHours} hours already exists.` });
      return;
    }
    const next = [...instructorWarningSettings.warnings, { hours: maxHours, warningHours, color: newInstructorColor, foregroundColor: newInstructorFgColor }].sort((a, b) => a.hours - b.hours);
    const updatedInstructorSettings: InstructorHourWarningSettings = { ...instructorWarningSettings, warnings: next };
    fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { 'document-expiry-settings': expirySettings, 'student-milestone-settings': milestoneSettings, 'instructor-hour-warnings': updatedInstructorSettings, 'inspection-warning-settings': inspectionSettings } }),
    }).catch(() => {});
    setInstructorWarningSettings(updatedInstructorSettings);
    setInstructorWarningState(next);
    window.dispatchEvent(new Event('safeviate-instructor-hour-warnings-updated'));
    toast({ title: 'Instructor Hour Threshold Added', description: `Threshold at ${maxHours} hours has been added.` });
    setNewInstructorHour('');
    setNewInstructorWarningHour('');
    setNewInstructorColor('#60a5fa');
    setNewInstructorFgColor('#ffffff');
  };

  const handleRemoveInstructorWarning = (hours: number) => {
    if (!instructorWarningSettings) {
      return;
    }
    const next = instructorWarningSettings.warnings.filter((warning) => warning.hours !== hours);
    const updatedInstructorSettings: InstructorHourWarningSettings = { ...instructorWarningSettings, warnings: next };
    fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { 'document-expiry-settings': expirySettings, 'student-milestone-settings': milestoneSettings, 'instructor-hour-warnings': updatedInstructorSettings, 'inspection-warning-settings': inspectionSettings } }),
    }).catch(() => {});
    setInstructorWarningSettings(updatedInstructorSettings);
    setInstructorWarningState(next);
    window.dispatchEvent(new Event('safeviate-instructor-hour-warnings-updated'));
    toast({ title: 'Instructor Hour Threshold Removed' });
  };

  const updateInstructorWarningColor = (hours: number, field: 'color' | 'foregroundColor', value: string) => {
    if (!instructorWarningSettings) {
      return;
    }
    const next = instructorWarningSettings.warnings.map((warning) => (warning.hours === hours ? { ...warning, [field]: value } : warning));
    const updatedInstructorSettings: InstructorHourWarningSettings = { ...instructorWarningSettings, warnings: next };
    fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { 'document-expiry-settings': expirySettings, 'student-milestone-settings': milestoneSettings, 'instructor-hour-warnings': updatedInstructorSettings, 'inspection-warning-settings': inspectionSettings } }),
    }).catch(() => {});
    setInstructorWarningSettings(updatedInstructorSettings);
    setInstructorWarningState(next);
    window.dispatchEvent(new Event('safeviate-instructor-hour-warnings-updated'));
  };

  const handleAddInspectionWarning = (type: '50hr' | '100hr') => {
    const is50hr = type === '50hr';
    const hoursStr = is50hr ? newFiftyHour : newHundredHour;
    const newBgColor = is50hr ? newFiftyHourColor : newHundredHourColor;
    const newFgColor = is50hr ? newFiftyHourFgColor : newHundredHourFgColor;
    const hours = parseInt(hoursStr, 10);

    if (isNaN(hours) || hours <= 0) {
        toast({ variant: 'destructive', title: 'Invalid Number', description: 'Please enter a positive number of hours.' });
        return;
    }

    const fieldKey = is50hr ? 'fiftyHourWarnings' : 'oneHundredHourWarnings';
    const currentWarnings = inspectionSettings?.[fieldKey] || [];
    if (currentWarnings.some((w) => w.hours === hours)) {
        toast({ variant: 'destructive', title: 'Duplicate Warning', description: `A warning for ${hours} hours already exists.` });
        return;
    }

    const updatedWarnings = [...currentWarnings, { hours, color: newBgColor, foregroundColor: newFgColor }].sort((a, b) => b.hours - a.hours);
    fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { 'document-expiry-settings': expirySettings, 'student-milestone-settings': milestoneSettings, 'instructor-hour-warnings': instructorWarningSettings, 'inspection-warning-settings': { ...inspectionSettings, [fieldKey]: updatedWarnings } } }),
    }).catch(() => {});
    window.dispatchEvent(new Event('safeviate-inspection-warning-settings-updated'));

    toast({ title: 'Inspection Warning Added' });

    if (is50hr) {
        setNewFiftyHour('');
        setNewFiftyHourColor('#facc15');
        setNewFiftyHourFgColor('#000000');
    } else {
        setNewHundredHour('');
        setNewHundredHourColor('#f97316');
        setNewHundredHourFgColor('#ffffff');
    }
  };

  const handleRemoveInspectionWarning = (type: '50hr' | '100hr', hoursToRemove: number) => {
    const fieldKey = type === '50hr' ? 'fiftyHourWarnings' : 'oneHundredHourWarnings';
    const newWarnings = (inspectionSettings?.[fieldKey] || []).filter((w) => w.hours !== hoursToRemove);
    fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { 'document-expiry-settings': expirySettings, 'student-milestone-settings': milestoneSettings, 'instructor-hour-warnings': instructorWarningSettings, 'inspection-warning-settings': { ...inspectionSettings, [fieldKey]: newWarnings } } }),
    }).catch(() => {});
    window.dispatchEvent(new Event('safeviate-inspection-warning-settings-updated'));
    toast({ title: 'Inspection Warning Removed' });
  };

  const updateInspectionWarningColor = (type: '50hr' | '100hr', hours: number, field: 'color' | 'foregroundColor', value: string) => {
    const fieldKey = type === '50hr' ? 'fiftyHourWarnings' : 'oneHundredHourWarnings';
    const updated = (inspectionSettings?.[fieldKey] || []).map((w) => w.hours === hours ? { ...w, [field]: value } : w);
    fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { 'document-expiry-settings': expirySettings, 'student-milestone-settings': milestoneSettings, 'instructor-hour-warnings': instructorWarningSettings, 'inspection-warning-settings': { ...inspectionSettings, [fieldKey]: updated } } }),
    }).catch(() => {});
    window.dispatchEvent(new Event('safeviate-inspection-warning-settings-updated'));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 h-full px-1">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full overflow-hidden gap-4 px-1">
      <Card className="flex flex-col h-full overflow-hidden shadow-none border">
        <MainPageHeader title="Threshold & Expiry" />

        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-10 pb-24">
              
              {/* --- Section 1: Documents & Milestones --- */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Document Expiry Warnings */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    <h2 className="font-black text-[10px] uppercase tracking-widest text-primary">Document Expiry Warnings</h2>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold text-foreground/75">Default Safe Color</Label>
                      <div className='flex items-center gap-3 p-2 border rounded-lg bg-background'>
                        <div className="relative h-6 w-6 rounded-full border cursor-pointer" style={{ backgroundColor: defaultColorState }}>
                          <Input type="color" value={defaultColorState} onChange={(e) => setDefaultColorState(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer p-0" />
                        </div>
                        <span className="text-[10px] font-black uppercase text-foreground/75">Status OK</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold text-foreground/75">Expired Color</Label>
                      <div className='flex items-center gap-3 p-2 border rounded-lg bg-background'>
                        <div className="relative h-6 w-6 rounded-full border cursor-pointer" style={{ backgroundColor: expiredColorState }}>
                          <Input type="color" value={expiredColorState} onChange={(e) => setExpiredColorState(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer p-0" />
                        </div>
                        <span className="text-[10px] font-black uppercase text-foreground/75">Expired</span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label className="text-[10px] uppercase font-bold text-foreground/75">New Warning Period</Label>
                    <div className="flex gap-2">
                      <Input type="number" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} placeholder="Days..." className="h-10 font-bold" onKeyDown={(e) => e.key === 'Enter' && handleAddPeriod()} />
                      <Input type="color" value={newPeriodColor} onChange={(e) => setNewPeriodColor(e.target.value)} className="p-1 h-10 w-12 shrink-0 border" />
                      <Button onClick={handleAddPeriod} className="h-10 px-6 font-black uppercase text-[10px]">Add</Button>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-muted/5 p-4 shadow-inner">
                    <h4 className="text-[9px] font-black uppercase tracking-widest mb-3 text-foreground/90">Active Warning Periods</h4>
                    <div className="space-y-2">
                      {(expirySettings?.warningPeriods || []).length > 0 ? (
                        (expirySettings?.warningPeriods || []).map(({ period, color }) => (
                          <div key={period} className="flex items-center justify-between p-3 rounded-xl bg-background border shadow-sm group hover:border-primary/20 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="relative h-6 w-6 rounded-full border" style={{ backgroundColor: periodColors[period] || color }}>
                                <Input type="color" value={periodColors[period] || color} onChange={(e) => setPeriodColors(prev => ({...prev, [period]: e.target.value}))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer p-0" />
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-tight text-foreground/90">{period} DAYS BEFORE EXPIRY</span>
                            </div>
                            <Button size="icon" variant="ghost" aria-label={`Remove ${period} day warning period`} className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemovePeriod(period)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] font-bold text-foreground/90 text-center py-6 italic uppercase tracking-widest bg-background/50 rounded-lg">No warning periods defined.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Student Hour Milestones */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <h2 className="font-black text-[10px] uppercase tracking-widest text-primary">Student Hour Milestones</h2>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {milestoneState.map(({ milestone, warningHours }) => (
                      <div key={milestone} className="flex items-center justify-between p-4 border rounded-xl bg-background shadow-sm hover:border-primary/20 transition-colors">
                        <div>
                          <p className="text-sm font-black uppercase">{milestone} Hour Goal</p>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-foreground/75">Primary training milestone</p>
                        </div>
                        <div className="flex items-center gap-3 bg-muted/20 p-2 rounded-lg border">
                          <Label className="text-[9px] font-black uppercase text-foreground/75">Warn at:</Label>
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              value={warningHours}
                              onChange={(e) => handleMilestoneWarningChange(milestone, e.target.value)}
                              className="w-16 h-8 text-xs font-black text-center px-1"
                            />
                            <span className="text-[9px] font-bold uppercase text-foreground/75">hrs</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
                    <p className="text-[9px] font-black uppercase leading-relaxed text-primary italic">
                      Warning hours determine when the milestone progress bar changes color in the student profile view to indicate a target is approaching.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* --- Section 1b: Instructor Hour Warnings --- */}
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h2 className="font-black text-[10px] uppercase tracking-widest text-primary">Instructor Hour Warnings</h2>
                </div>

                <div className="space-y-3 p-5 border rounded-2xl bg-muted/5 shadow-inner">
                  <p className="text-[9px] font-black uppercase tracking-widest text-foreground/75">
                    Set warning bands for instructor hours so admin and dashboard views can flag approaching load before it becomes pressure.
                  </p>

                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto_auto] gap-2">
                    <Input
                      type="number"
                      value={newInstructorHour}
                      onChange={(e) => setNewInstructorHour(e.target.value)}
                      placeholder="Instructor hours..."
                      className="h-10 font-bold"
                    />
                    <Input
                      type="number"
                      value={newInstructorWarningHour}
                      onChange={(e) => setNewInstructorWarningHour(e.target.value)}
                      placeholder="Warn at hours..."
                      className="h-10 font-bold"
                    />
                    <div className="flex gap-1 bg-background border rounded-md p-1 px-2">
                      <Label className="text-[8px] uppercase font-black pt-2 pr-1 text-foreground/75">BG</Label>
                      <Input type="color" value={newInstructorColor} onChange={(e) => setNewInstructorColor(e.target.value)} className="p-0 h-8 w-8 border-none" />
                      <Separator orientation="vertical" className="h-4 mt-2 mx-1" />
                      <Label className="text-[8px] uppercase font-black pt-2 pr-1 text-foreground/75">FG</Label>
                      <Input type="color" value={newInstructorFgColor} onChange={(e) => setNewInstructorFgColor(e.target.value)} className="p-0 h-8 w-8 border-none" />
                    </div>
                    <Button onClick={handleAddInstructorWarning} className="h-10 px-6 font-black uppercase text-[10px]">Add</Button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 mt-4">
                    {(instructorWarningState || []).length > 0 ? instructorWarningState.map(({ hours, warningHours, color, foregroundColor }) => (
                      <div key={hours} className="flex items-center justify-between p-3 rounded-xl bg-background border shadow-sm group hover:border-primary/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <Badge style={{ backgroundColor: color, color: foregroundColor }} className="border-none font-black text-[10px] px-4 py-1.5 uppercase">
                            {hours} HOUR THRESHOLD
                          </Badge>
                          <span className="text-[10px] font-black uppercase tracking-widest text-foreground/75">
                            Warn at {warningHours} hours
                          </span>
                        </div>
                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex gap-1.5 p-1 bg-muted/20 rounded-md border">
                            <Input type="color" value={color || '#60a5fa'} onChange={(e) => updateInstructorWarningColor(hours, 'color', e.target.value)} className="p-0 h-5 w-5 rounded-full border-none shadow-none" />
                            <Input type="color" value={foregroundColor || '#ffffff'} onChange={(e) => updateInstructorWarningColor(hours, 'foregroundColor', e.target.value)} className="p-0 h-5 w-5 rounded-full border-none shadow-none" />
                          </div>
                          <Button size="icon" variant="ghost" aria-label={`Remove instructor warning at ${hours} hours`} className="h-8 w-8 text-destructive" onClick={() => handleRemoveInstructorWarning(hours)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )) : (
                      <div className="h-24 border-2 border-dashed rounded-xl flex items-center justify-center text-[10px] uppercase font-black tracking-widest bg-background/50 text-foreground/75">
                        No instructor hour warnings defined
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* --- Section 1c: Fleet Target Hours --- */}
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <h2 className="font-black text-[10px] uppercase tracking-widest text-primary">Fleet Target Hours</h2>
                </div>

                <div className="space-y-3 p-5 border rounded-2xl bg-muted/5 shadow-inner">
                  <p className="text-[9px] font-black uppercase tracking-widest text-foreground/75">
                    Set the target hours used by the ATO fleet utilisation summary.
                  </p>
                  <div className="flex items-center gap-3">
                    <Label className="text-[9px] font-black uppercase text-foreground/75">Target hours</Label>
                    <Input
                      type="number"
                      min={1}
                      value={fleetTargetHours}
                      onChange={(e) => setFleetTargetHours(e.target.value)}
                      className="w-28 h-8 text-xs font-black text-center px-1"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* --- Section 2: Aircraft Inspection Warnings --- */}
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <h2 className="font-black text-[10px] uppercase tracking-widest text-primary">Aircraft Inspection Warnings</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* 50 Hour Inspection */}
                  <div className="space-y-4 p-5 border rounded-2xl bg-muted/5 relative overflow-hidden shadow-inner">
                    <div className="absolute top-0 right-0 p-3 bg-primary/10 rounded-bl-2xl">
                      <span className="text-[9px] font-black uppercase tracking-widest text-primary">50H Cycle</span>
                    </div>
                    
                    <div className="space-y-3">
                      <Label className="text-[10px] uppercase font-black tracking-widest text-foreground/75">New Threshold</Label>
                      <div className="flex gap-2">
                        <Input value={newFiftyHour} onChange={(e) => setNewFiftyHour(e.target.value)} placeholder="Hours..." className="h-10 bg-background font-bold" />
                        <div className="flex gap-1 bg-background border rounded-md p-1 px-2">
                          <Label className="text-[8px] uppercase font-black pt-2 pr-1 text-foreground/75">BG</Label>
                          <Input type="color" value={newFiftyHourColor} onChange={(e) => setNewFiftyHourColor(e.target.value)} className="p-0 h-8 w-8 border-none" />
                          <Separator orientation="vertical" className="h-4 mt-2 mx-1" />
                          <Label className="text-[8px] uppercase font-black pt-2 pr-1 text-foreground/75">FG</Label>
                          <Input type="color" value={newFiftyHourFgColor} onChange={(e) => setNewFiftyHourFgColor(e.target.value)} className="p-0 h-8 w-8 border-none" />
                        </div>
                        <Button onClick={() => handleAddInspectionWarning('50hr')} className="h-10 px-6 font-black uppercase text-[10px]">Add</Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 mt-4">
                      {fiftyHourWarnings.length > 0 ? fiftyHourWarnings.map(({ hours, color, foregroundColor }) => (
                        <div key={hours} className="flex items-center justify-between p-3 rounded-xl bg-background border shadow-sm group hover:border-primary/20 transition-colors">
                          <Badge style={{ backgroundColor: color, color: foregroundColor }} className="border-none font-black text-[10px] px-4 py-1.5 uppercase">
                            {hours} HRS REMAINING
                          </Badge>
                          <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex gap-1.5 p-1 bg-muted/20 rounded-md border">
                              <Input type="color" value={color} onChange={(e) => updateInspectionWarningColor('50hr', hours, 'color', e.target.value)} className="p-0 h-5 w-5 rounded-full border-none shadow-none" />
                              <Input type="color" value={foregroundColor} onChange={(e) => updateInspectionWarningColor('50hr', hours, 'foregroundColor', e.target.value)} className="p-0 h-5 w-5 rounded-full border-none shadow-none" />
                            </div>
                            <Button size="icon" variant="ghost" aria-label={`Remove 50 hour warning at ${hours} hours`} className="h-8 w-8 text-destructive" onClick={() => handleRemoveInspectionWarning('50hr', hours)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )) : (
                        <div className="h-24 border-2 border-dashed rounded-xl flex items-center justify-center text-[10px] uppercase font-black tracking-widest bg-background/50 text-foreground/75">
                          No thresholds defined
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 100 Hour Inspection */}
                  <div className="space-y-4 p-5 border rounded-2xl bg-muted/5 relative overflow-hidden shadow-inner">
                    <div className="absolute top-0 right-0 p-3 bg-primary/10 rounded-bl-2xl">
                      <span className="text-[9px] font-black uppercase tracking-widest text-primary">100H Cycle</span>
                    </div>
                    
                    <div className="space-y-3">
                      <Label className="text-[10px] uppercase font-black tracking-widest text-foreground/75">New Threshold</Label>
                      <div className="flex gap-2">
                        <Input value={newHundredHour} onChange={(e) => setNewHundredHour(e.target.value)} placeholder="Hours..." className="h-10 bg-background font-bold" />
                        <div className="flex gap-1 bg-background border rounded-md p-1 px-2">
                          <Label className="text-[8px] uppercase font-black pt-2 pr-1 text-foreground/75">BG</Label>
                          <Input type="color" value={newHundredHourColor} onChange={(e) => setNewHundredHourColor(e.target.value)} className="p-0 h-8 w-8 border-none" />
                          <Separator orientation="vertical" className="h-4 mt-2 mx-1" />
                          <Label className="text-[8px] uppercase font-black pt-2 pr-1 text-foreground/75">FG</Label>
                          <Input type="color" value={newHundredHourFgColor} onChange={(e) => setNewHundredHourFgColor(e.target.value)} className="p-0 h-8 w-8 border-none" />
                        </div>
                        <Button onClick={() => handleAddInspectionWarning('100hr')} className="h-10 px-6 font-black uppercase text-[10px]">Add</Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 mt-4">
                      {hundredHourWarnings.length > 0 ? hundredHourWarnings.map(({ hours, color, foregroundColor }) => (
                        <div key={hours} className="flex items-center justify-between p-3 rounded-xl bg-background border shadow-sm group hover:border-primary/20 transition-colors">
                          <Badge style={{ backgroundColor: color, color: foregroundColor }} className="border-none font-black text-[10px] px-4 py-1.5 uppercase">
                            {hours} HRS REMAINING
                          </Badge>
                          <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex gap-1.5 p-1 bg-muted/20 rounded-md border">
                              <Input type="color" value={color} onChange={(e) => updateInspectionWarningColor('100hr', hours, 'color', e.target.value)} className="p-0 h-5 w-5 rounded-full border-none shadow-none" />
                              <Input type="color" value={foregroundColor} onChange={(e) => updateInspectionWarningColor('100hr', hours, 'foregroundColor', e.target.value)} className="p-0 h-5 w-5 rounded-full border-none shadow-none" />
                            </div>
                            <Button size="icon" variant="ghost" aria-label={`Remove 100 hour warning at ${hours} hours`} className="h-8 w-8 text-destructive" onClick={() => handleRemoveInspectionWarning('100hr', hours)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )) : (
                        <div className="h-24 border-2 border-dashed rounded-xl flex items-center justify-center text-[10px] uppercase font-black tracking-widest bg-background/50 text-foreground/75">
                          No thresholds defined
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
