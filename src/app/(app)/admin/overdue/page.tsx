'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MainPageHeader } from '@/components/page-header';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Clock, Phone } from 'lucide-react';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

export type OverdueMonitorSettings = {
  id: string;
  isEnabled: boolean;
  thresholdMinutes: number;
  contactPhone: string;
};

const defaultSettings: OverdueMonitorSettings = {
  id: 'overdue-monitor',
  isEnabled: true,
  thresholdMinutes: 5,
  contactPhone: '555-0199',
};

export default function OverdueSettingsPage() {
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/admin/overdue' });
  const { toast } = useToast();

  const [isEnabled, setIsEnabled] = useState(defaultSettings.isEnabled);
  const [thresholdMinutes, setThresholdMinutes] = useState(defaultSettings.thresholdMinutes);
  const [contactPhone, setContactPhone] = useState(defaultSettings.contactPhone);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
        const response = await fetch('/api/tenant-config', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        const config = payload?.config && typeof payload.config === 'object' ? payload.config : {};
        const settings = (config as any)['overdue-monitor-settings'] || defaultSettings;
        setIsEnabled(settings.isEnabled);
        setThresholdMinutes(settings.thresholdMinutes);
        setContactPhone(settings.contactPhone);
    } catch (e) {
        console.error("Failed to load overdue settings", e);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    window.addEventListener('safeviate-overdue-monitor-settings-updated', loadData);
    return () => window.removeEventListener('safeviate-overdue-monitor-settings-updated', loadData);
  }, [loadData]);

  const handleSave = async () => {
    try {
        const settings: OverdueMonitorSettings = {
            id: 'overdue-monitor',
            isEnabled,
            thresholdMinutes: Number(thresholdMinutes),
            contactPhone,
        };

        await fetch('/api/tenant-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: { 'overdue-monitor-settings': settings } }),
        });
        window.dispatchEvent(new Event('safeviate-overdue-monitor-settings-updated'));

        toast({
            title: 'Settings Saved',
            description: 'The overdue aircraft monitor has been updated.',
        });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to save settings.' });
    }
  };

  if (isLoading) {
    return <div className="max-w-2xl mx-auto space-y-6 px-1 py-12"><Skeleton className="h-[400px] w-full" /></div>;
  }

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-1">
      <Card className="shadow-none border border-amber-900/20 mt-12 bg-white/50 backdrop-blur-sm">
        <MainPageHeader title="Safety Monitor Thresholds" />
        <CardContent className="space-y-8 pt-6">
          <div className="flex items-center justify-between space-x-4 rounded-xl border border-primary/10 p-5 bg-primary/5">
            <div className="space-y-1">
              <Label htmlFor="monitor-toggle" className="text-[10px] font-black uppercase text-foreground tracking-widest">Enable Safety Monitor</Label>
              <p className="text-[9px] text-foreground/75 font-black uppercase tracking-tight">
                Activate the global alert for flights past their end time.
              </p>
            </div>
            <Switch
              id="monitor-toggle"
              aria-label={isEnabled ? 'Disable safety monitor' : 'Enable safety monitor'}
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/80">
                <Clock className="h-3.5 w-3.5" />
                Alert Threshold (Minutes)
              </Label>
              <Input
                type="number"
                value={thresholdMinutes}
                onChange={(e) => setThresholdMinutes(Number(e.target.value))}
                placeholder="e.g., 5"
                className="h-12 bg-background font-black text-lg border-2"
              />
              <p className="text-[9px] text-foreground/75 font-black uppercase tracking-tight italic leading-relaxed">
                The number of minutes to wait after the scheduled end time before showing the alert.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/80">
                <Phone className="h-3.5 w-3.5" />
                Operations Fallback Number
              </Label>
              <Input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="e.g., 555-0199"
                className="h-12 bg-background font-black text-lg border-2"
              />
              <p className="text-[9px] text-foreground/75 font-black uppercase tracking-tight italic leading-relaxed">
                This number is displayed only if no specific contact numbers are found in the instructor or student profiles.
              </p>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black h-12 px-12 shadow-lg text-[11px] uppercase tracking-widest transition-all">
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
