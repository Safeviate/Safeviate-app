'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { MainPageHeader } from "@/components/page-header";
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Trash2, Settings2, Target } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

export type FeatureSettings = {
  id: string;
  preFlightChecklistRequired: boolean;
  enableExternalCompanyTabs: boolean;
  betaNdaRequired: boolean;
};

export type FindingLevel = {
  id: string;
  name: string;
  color: string;
  foregroundColor: string;
};

export type FindingLevelsSettings = {
  id: string;
  levels: FindingLevel[];
};

const defaultFindingLevels: FindingLevel[] = [
    { id: 'obs', name: 'Observation', color: '#3b82f6', foregroundColor: '#ffffff' },
    { id: 'lvl1', name: 'Level 1', color: '#ef4444', foregroundColor: '#ffffff' },
    { id: 'lvl2', name: 'Level 2', color: '#f97316', foregroundColor: '#ffffff' },
    { id: 'lvl3', name: 'Level 3', color: '#facc15', foregroundColor: '#000000' },
];

export default function FeaturesPage() {
  const { toast } = useToast();
  
  const [featureSettings, setFeatureSettings] = useState<FeatureSettings | null>(null);
  const [findingLevelsSettings, setFindingLevelsSettings] = useState<FindingLevelsSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [newLevelName, setNewLevelName] = useState('');
  const [newLevelColor, setNewLevelColor] = useState('#808080');
  const [newLevelForegroundColor, setNewLevelForegroundColor] = useState('#ffffff');
  const [levelColors, setLevelColors] = useState<Record<string, { bg: string, fg: string }>>({});
  
  const debouncedLevelColors = useDebounce(levelColors, 500);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
        const response = await fetch('/api/tenant-config', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        const config = payload?.config && typeof payload.config === 'object' ? payload.config : {};

        const defFeatures = { id: 'features', preFlightChecklistRequired: true, enableExternalCompanyTabs: true, betaNdaRequired: true };
        const defLevels = { id: 'finding-levels', levels: defaultFindingLevels };
        const featureConfig = (config['feature-settings'] && typeof config['feature-settings'] === 'object' ? config['feature-settings'] : defFeatures) as typeof defFeatures;
        const levelsConfig = (config['finding-levels-settings'] && typeof config['finding-levels-settings'] === 'object' ? config['finding-levels-settings'] : defLevels) as typeof defLevels;

        setFeatureSettings(featureConfig);
        setFindingLevelsSettings(levelsConfig);
        const initialColors = (levelsConfig.levels || []).reduce((acc: Record<string, { bg: string, fg: string }>, l: { id: string; color: string; foregroundColor?: string }) => {
            acc[l.id] = { bg: l.color, fg: l.foregroundColor || '#ffffff' };
            return acc;
        }, {} as Record<string, { bg: string, fg: string }>);
        setLevelColors(initialColors);
    } catch (e) {
        console.error("Failed to load feature data", e);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const events = ['safeviate-feature-settings-updated', 'safeviate-finding-levels-updated'];
    events.forEach(e => window.addEventListener(e, loadData));
    return () => events.forEach(e => window.removeEventListener(e, loadData));
  }, [loadData]);

  useEffect(() => {
      if (!findingLevelsSettings?.levels || Object.keys(debouncedLevelColors).length === 0 || isLoading) return;

      const hasChanged = findingLevelsSettings.levels.some(l => 
        (l.color !== debouncedLevelColors[l.id]?.bg && debouncedLevelColors[l.id]?.bg) ||
        (l.foregroundColor !== debouncedLevelColors[l.id]?.fg && debouncedLevelColors[l.id]?.fg)
      );

      if (hasChanged) {
        const newLevels = findingLevelsSettings.levels.map(l => ({
            ...l,
            color: debouncedLevelColors[l.id]?.bg || l.color,
            foregroundColor: debouncedLevelColors[l.id]?.fg || l.foregroundColor
        }));
        const nextSettings = { ...findingLevelsSettings, levels: newLevels };
        fetch('/api/tenant-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              'feature-settings': featureSettings,
              'finding-levels-settings': nextSettings,
              'finding-levels': newLevels,
            },
          }),
        }).catch(() => {});
        window.dispatchEvent(new Event('safeviate-finding-levels-updated'));
      }
  }, [debouncedLevelColors, findingLevelsSettings, isLoading]);

  const handleToggleChange = (feature: keyof Omit<FeatureSettings, 'id'>, value: boolean) => {
    const nextSettings = { ...(featureSettings || { id: 'features', preFlightChecklistRequired: true, enableExternalCompanyTabs: true, betaNdaRequired: true }), [feature]: value };
    setFeatureSettings(nextSettings);
    fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          'feature-settings': nextSettings,
          'finding-levels-settings': findingLevelsSettings,
          'finding-levels': findingLevelsSettings?.levels || defaultFindingLevels,
        },
      }),
    }).catch(() => {});
    window.dispatchEvent(new Event('safeviate-feature-settings-updated'));
  };
  
  const handleAddLevel = () => {
    if (!newLevelName.trim()) {
      toast({ variant: 'destructive', title: 'Invalid Name', description: 'Please enter a name for the finding level.' });
      return;
    }

    const currentLevels = findingLevelsSettings?.levels || defaultFindingLevels;
    if (currentLevels.some(l => l.name.toLowerCase() === newLevelName.trim().toLowerCase())) {
       toast({ variant: 'destructive', title: 'Duplicate Level', description: `A finding level named "${newLevelName}" already exists.` });
       return;
    }

    const newLevel: FindingLevel = {
        id: newLevelName.trim().toLowerCase().replace(/\s+/g, '-'),
        name: newLevelName.trim(),
        color: newLevelColor,
        foregroundColor: newLevelForegroundColor,
    };

    const updatedLevels = [...currentLevels, newLevel];
    const nextSettings = { ...(findingLevelsSettings || { id: 'finding-levels', levels: [] }), levels: updatedLevels };
    fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          'feature-settings': featureSettings,
          'finding-levels-settings': nextSettings,
          'finding-levels': updatedLevels,
        },
      }),
    }).catch(() => {});
    window.dispatchEvent(new Event('safeviate-finding-levels-updated'));

    toast({ title: 'Finding Level Added', description: `Level "${newLevel.name}" has been added.` });
    setNewLevelName('');
    setNewLevelColor('#808080');
    setNewLevelForegroundColor('#ffffff');
  }

  const handleRemoveLevel = (levelIdToRemove: string) => {
    const currentLevels = findingLevelsSettings?.levels || defaultFindingLevels;
    const updatedLevels = currentLevels.filter(l => l.id !== levelIdToRemove);
    const nextSettings = { ...(findingLevelsSettings || { id: 'finding-levels', levels: [] }), levels: updatedLevels };
    fetch('/api/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          'feature-settings': featureSettings,
          'finding-levels-settings': nextSettings,
          'finding-levels': updatedLevels,
        },
      }),
    }).catch(() => {});
    window.dispatchEvent(new Event('safeviate-finding-levels-updated'));
    toast({ title: 'Finding Level Removed' });
  };

  const handleLevelColorChange = (levelId: string, type: 'bg' | 'fg', color: string) => {
    setLevelColors(prev => ({...prev, [levelId]: { ...prev[levelId], [type]: color }}));
  }

  if (isLoading) {
      return (
          <div className="max-w-[1100px] mx-auto w-full px-1 pt-4 space-y-6">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-64 w-full" />
          </div>
      )
  }

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full px-1 pt-4 overflow-hidden pb-10">
      <Card className="flex flex-col shadow-none border overflow-hidden">
        <MainPageHeader title="Feature Management" />
        <CardContent className="p-4 lg:p-6 space-y-8 bg-muted/5">

          <section className="space-y-4">
            <div className="space-y-1">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Global Features
                </h3>
                <p className="text-xs text-muted-foreground italic font-medium">Enable or disable specific application workflows for your organization.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col justify-between space-y-4 rounded-xl border p-5 bg-background shadow-sm">
                    <div className='space-y-1.5'>
                        <Label htmlFor="checklist-required" className="text-sm font-black uppercase tracking-tight">
                            Enforce Checklist Completion
                        </Label>
                        <p className='text-xs text-muted-foreground leading-relaxed font-medium'>
                            If enabled, a pre-flight check must be completed before the next booking for an aircraft can be actioned.
                        </p>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-4 border-t">
                        <span className="text-[10px] font-black uppercase text-muted-foreground">Status</span>
                        <Switch
                            id="checklist-required"
                            checked={featureSettings?.preFlightChecklistRequired ?? true}
                            onCheckedChange={(value) => handleToggleChange('preFlightChecklistRequired', value)}
                        />
                    </div>
                </div>

                <div className="flex flex-col justify-between space-y-4 rounded-xl border p-5 bg-background shadow-sm">
                    <div className='space-y-1.5'>
                        <Label htmlFor="org-tabs" className="text-sm font-black uppercase tracking-tight">
                            Enable Multi-Company Scoping
                        </Label>
                        <p className='text-xs text-muted-foreground leading-relaxed font-medium'>
                            If enabled, administrators will see tabs to toggle views between internal and external organizations in key modules.
                        </p>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-4 border-t">
                        <span className="text-[10px] font-black uppercase text-muted-foreground">Status</span>
                        <Switch
                            id="org-tabs"
                            checked={featureSettings?.enableExternalCompanyTabs ?? true}
                            onCheckedChange={(value) => handleToggleChange('enableExternalCompanyTabs', value)}
                        />
                    </div>
                </div>

                <div className="flex flex-col justify-between space-y-4 rounded-xl border p-5 bg-background shadow-sm">
                    <div className='space-y-1.5'>
                        <Label htmlFor="beta-nda-required" className="text-sm font-black uppercase tracking-tight">
                            Require Beta NDA
                        </Label>
                        <p className='text-xs text-muted-foreground leading-relaxed font-medium'>
                            If enabled, testers must accept the beta NDA before they can sign in. Disable this when the beta gate should be open.
                        </p>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-4 border-t">
                        <span className="text-[10px] font-black uppercase text-muted-foreground">Status</span>
                        <Switch
                            id="beta-nda-required"
                            checked={featureSettings?.betaNdaRequired ?? true}
                            onCheckedChange={(value) => handleToggleChange('betaNdaRequired', value)}
                        />
                    </div>
                </div>
            </div>
          </section>

          <Separator />
          
          <section className="space-y-4">
            <div className="space-y-1">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Audit Finding Levels
                </h3>
                <p className="text-xs text-muted-foreground italic font-medium">Define the names and colors for audit finding classifications.</p>
            </div>

            <div className="rounded-xl border bg-background overflow-hidden">
                <div className="p-4 border-b bg-muted/10 space-y-3">
                    <Label htmlFor="new-level-name" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">New Finding Level</Label>
                    <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                        <Input
                            id="new-level-name"
                            value={newLevelName}
                            onChange={(e) => setNewLevelName(e.target.value)}
                            placeholder="e.g., Observation, Level 1"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddLevel()}
                            className="h-10 font-bold uppercase tracking-tight flex-1 min-w-[200px]"
                        />
                        <div className="flex items-center gap-2 border rounded-lg p-1 px-2 h-10 bg-background shrink-0 shadow-sm">
                            <Label htmlFor="new-level-color" className="text-[9px] font-black uppercase">BG</Label>
                            <Input id="new-level-color" type="color" value={newLevelColor} onChange={(e) => setNewLevelColor(e.target.value)} className="p-0 h-6 w-6 border-none cursor-pointer rounded-sm"/>
                            <Separator orientation="vertical" className="h-4 mx-1" />
                            <Label htmlFor="new-level-fg-color" className="text-[9px] font-black uppercase">FG</Label>
                            <Input id="new-level-fg-color" type="color" value={newLevelForegroundColor} onChange={(e) => setNewLevelForegroundColor(e.target.value)} className="p-0 h-6 w-6 border-none cursor-pointer rounded-sm"/>
                        </div>
                        <Button onClick={handleAddLevel} className="h-10 px-6 text-[10px] font-black uppercase tracking-tight shrink-0 shadow-md">
                            <PlusCircle className="mr-2 h-4 w-4" /> Add
                        </Button>
                    </div>
                </div>
                
                <div className="p-4 space-y-3">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                        Current Levels
                    </h4>
                    <div className="flex flex-col gap-2 p-2 border rounded-xl min-h-[100px] bg-muted/5">
                        {(findingLevelsSettings?.levels || defaultFindingLevels).length > 0 ? (
                            (findingLevelsSettings?.levels || defaultFindingLevels).map((level) => (
                                <div key={level.id} className="flex items-center justify-between p-3 rounded-lg border bg-background shadow-sm hover:border-slate-300 transition-colors">
                                    <Badge style={{ 
                                        backgroundColor: levelColors[level.id]?.bg || level.color, 
                                        color: levelColors[level.id]?.fg || level.foregroundColor 
                                      }} className="text-xs font-black uppercase tracking-widest py-1 px-4 border-none shadow-sm">
                                        {level.name}
                                    </Badge>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5 border rounded-md p-1 bg-muted/20">
                                            <Label className="text-[8px] font-black uppercase px-1">BG</Label>
                                            <div className="relative h-6 w-6 rounded border shadow-sm cursor-pointer" style={{ backgroundColor: levelColors[level.id]?.bg || level.color }}>
                                                <Input
                                                    type="color"
                                                    value={levelColors[level.id]?.bg || level.color}
                                                    onChange={(e) => handleLevelColorChange(level.id, 'bg', e.target.value)}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer p-0"
                                                />
                                            </div>
                                            <Separator orientation="vertical" className="h-4 mx-0.5" />
                                            <Label className="text-[8px] font-black uppercase px-1">FG</Label>
                                            <div className="relative h-6 w-6 rounded border shadow-sm cursor-pointer" style={{ backgroundColor: levelColors[level.id]?.fg || level.foregroundColor }}>
                                                <Input
                                                    type="color"
                                                    value={levelColors[level.id]?.fg || level.foregroundColor}
                                                    onChange={(e) => handleLevelColorChange(level.id, 'fg', e.target.value)}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer p-0"
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                            onClick={() => handleRemoveLevel(level.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            <span className="sr-only">Remove {level.name}</span>
                                        </Button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex items-center justify-center h-24">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-40">No finding levels configured.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
