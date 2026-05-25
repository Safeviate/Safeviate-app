'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { RiskMatrixSettings } from '@/types/risk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Check, ShieldCheck, Printer, AlertTriangle, ChevronsUpDown } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { MainPageHeader } from '@/components/page-header';
import { PAGE_FORMAT_MOBILE_DARK_BUTTON_CLASS } from '@/lib/page-format-buttons';

const defaultLikelihoods = [
  { name: 'Frequent', description: 'Likely to occur many times.', value: 5 },
  { name: 'Occasional', description: 'Likely to occur some times.', value: 4 },
  { name: 'Remote', description: 'Unlikely, but possible to occur.', value: 3 },
  { name: 'Improbable', description: 'Very unlikely to occur.', value: 2 },
  { name: 'Extremely Improbable', description: 'Almost inconceivable.', value: 1 },
];

const defaultSeverities = [
  { name: 'Catastrophic', description: 'Equipment destroyed, multiple deaths.', value: 'A' },
  { name: 'Hazardous', description: 'Large reduction in safety margins.', value: 'B' },
  { name: 'Major', description: 'Significant reduction in safety margins.', value: 'C' },
  { name: 'Minor', description: 'Nuisance, operating limitations.', value: 'D' },
  { name: 'Negligible', description: 'Little or no effect on safety.', value: 'E' },
];

const defaultColors: Record<string, string> = {
  '5A': '#ef4444', '5B': '#ef4444', '5C': '#f59e0b', '5D': '#f59e0b', '5E': '#f59e0b',
  '4A': '#ef4444', '4B': '#ef4444', '4C': '#ef4444', '4D': '#10b981', '4E': '#10b981',
  '3A': '#ef4444', '3B': '#ef4444', '3C': '#f59e0b', '3D': '#10b981', '3E': '#10b981',
  '2A': '#f59e0b', '2B': '#f59e0b', '2C': '#10b981', '2D': '#10b981', '2E': '#10b981',
  '1A': '#f59e0b', '1B': '#10b981', '1C': '#10b981', '1D': '#10b981', '1E': '#10b981',
};

export default function RiskMatrixPage() {
  const isMobile = useIsMobile();
  const { hasPermission } = usePermissions();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const canManage = hasPermission('risk-matrix-manage-definitions');
  const canEditColors = hasPermission('risk-matrix-edit-colors');

  const [colors, setColors] = useState<Record<string, string>>(defaultColors);
  const [likelihoods, setLikelihoods] = useState(defaultLikelihoods);
  const [severities, setSeverities] = useState(defaultSeverities);
  const [isEditingSeverity, setIsEditingSeverity] = useState(false);
  const [isEditingLikelihood, setIsEditingLikelihood] = useState(false);
  const colorInputRef = React.useRef<HTMLInputElement>(null);
  const [activeCell, setActiveCell] = useState<string | null>(null);

  const queueSave = (configuration: RiskMatrixSettings) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/api/risk-matrix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ configuration }),
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error((payload as { error?: string })?.error || 'Failed to save risk matrix settings.');
          }
        } catch (error) {
          console.error('[risk-matrix] failed to persist configuration:', error);
        }
      })();
    }, 250);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/risk-matrix', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ configuration: null }));
        const configuration = payload?.configuration;
        if (cancelled || !configuration || typeof configuration !== 'object') return;
        const parsed = configuration as Partial<{ colors: Record<string, string>; likelihoodDefinitions: typeof defaultLikelihoods; severityDefinitions: typeof defaultSeverities }>;
        if (parsed.colors) setColors(parsed.colors);
        if (parsed.likelihoodDefinitions) setLikelihoods(parsed.likelihoodDefinitions);
        if (parsed.severityDefinitions) setSeverities(parsed.severityDefinitions);
      } catch {
        // use defaults
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleColorChange = (cellId: string, newColor: string) => {
    const newColors = { ...colors, [cellId]: newColor };
    setColors(newColors);
    queueSave({ id: 'risk-matrix-config', colors: newColors, likelihoodDefinitions: likelihoods, severityDefinitions: severities });
  };

  const openColorPicker = (cellId: string) => {
    if (!canEditColors) return;
    setActiveCell(cellId);
    requestAnimationFrame(() => {
      const input = colorInputRef.current;
      if (!input) return;
      if ('showPicker' in input && typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
      input.click();
    });
  };

  const handleLikelihoodChange = (index: number, field: 'name' | 'description', value: string) => {
    const newLikelihoods = [...likelihoods];
    newLikelihoods[index] = { ...newLikelihoods[index], [field]: value };
    setLikelihoods(newLikelihoods);
    queueSave({ id: 'risk-matrix-config', colors, likelihoodDefinitions: newLikelihoods, severityDefinitions: severities });
  };

  const handleSeverityChange = (index: number, field: 'name' | 'description', value: string) => {
    const newSeverities = [...severities];
    newSeverities[index] = { ...newSeverities[index], [field]: value };
    setSeverities(newSeverities);
    queueSave({ id: 'risk-matrix-config', colors, likelihoodDefinitions: likelihoods, severityDefinitions: newSeverities });
  };

  if (!colors) return null;

  return (
    <div className="max-w-[1100px] mx-auto w-full flex flex-col h-full overflow-hidden gap-6 px-1 pb-4">
      <Card className="flex flex-col h-full overflow-hidden shadow-none border">
        <MainPageHeader
          title="Risk Matrix"
          actions={
            <Button
              variant="outline"
              size={isMobile ? 'sm' : 'sm'}
              onClick={() => window.print()}
              className={cn(
                'no-print gap-2 border-slate-300 text-[10px] font-black uppercase',
                isMobile
                  ? PAGE_FORMAT_MOBILE_DARK_BUTTON_CLASS
                  : 'h-9 px-6'
              )}
            >
              <span className="flex items-center gap-2">
                <Printer className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                Export PDF
              </span>
              {isMobile ? <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
            </Button>
          }
        />
        <CardContent className="flex-1 overflow-y-auto bg-background p-0">
          <div className="space-y-10 p-4 pb-24 sm:p-6">
            <div className="overflow-hidden rounded-xl border bg-muted/5 shadow-sm">
              <div className="w-full overflow-x-auto overflow-y-hidden [scrollbar-gutter:stable] touch-pan-x custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="min-w-[760px] px-4 py-4 sm:px-6 sm:py-6">
                  <div className="grid grid-cols-[140px_repeat(5,110px)] gap-2">
                    <div className="flex items-center justify-center p-2 bg-muted/50 rounded-lg border border-dashed text-center">
                      <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Impact</span>
                    </div>
                    {severities.map((s) => (
                      <div key={s.value} className="flex flex-col items-center justify-center p-2 bg-background rounded-lg border border-slate-200 text-center shadow-sm">
                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground/80 mb-1">{s.name}</span>
                        <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center font-black text-[10px] border-primary/20 text-primary bg-primary/5">
                          {s.value}
                        </Badge>
                      </div>
                    ))}
                    {likelihoods.map((l) => (
                      <React.Fragment key={l.value}>
                        <div className="flex items-center justify-end pr-4 text-right border-r border-dashed border-slate-300 mr-1">
                          <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-foreground">{l.name}</p>
                            <Badge variant="secondary" className="text-[9px] font-black uppercase h-4 px-2 bg-primary/10 text-primary border-none">LVL {l.value}</Badge>
                          </div>
                        </div>
                        {severities.map((s) => {
                          const cellId = `${l.value}${s.value}`;
                          const color = colors[cellId];
                          return (
                            <button
                              key={cellId}
                              onClick={() => openColorPicker(cellId)}
                              style={{ backgroundColor: color }}
                              className={cn(
                                'h-14 rounded-lg shadow-sm flex items-center justify-center font-black text-[11px] transition-all border-2 border-white/20',
                                'text-black',
                                canEditColors ? 'hover:scale-[1.03] cursor-pointer' : 'cursor-default'
                              )}
                            >
                              <span>{cellId}</span>
                            </button>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <Input
                  type="color"
                  ref={colorInputRef}
                  tabIndex={-1}
                  value={activeCell ? colors[activeCell] ?? '#000000' : '#000000'}
                  className="pointer-events-none absolute h-0 w-0 opacity-0"
                  onChange={(e) => activeCell && handleColorChange(activeCell, e.target.value)}
                  onBlur={() => setActiveCell(null)}
                />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Severity Scale
                  </h2>
                  {canManage && (
                    <Button variant="ghost" size="sm" className="h-7 px-3 text-[10px] uppercase font-black tracking-tight" onClick={() => setIsEditingSeverity(!isEditingSeverity)}>
                      {isEditingSeverity ? <><Check className="mr-2 h-3 w-3 text-green-600" /> Save</> : <><Pencil className="mr-2 h-3 w-3" /> Edit</>}
                    </Button>
                  )}
                </div>
                <div className="space-y-3">
                  {severities.map((s, index) => (
                    <div key={s.value} className="p-4 bg-muted/5 rounded-xl border border-slate-200 shadow-sm hover:bg-muted/10 transition-colors">
                      <div className="flex items-start gap-4">
                        <Badge variant="outline" className="h-10 w-10 rounded-lg flex items-center justify-center font-black text-sm shrink-0 border-slate-300">{s.value}</Badge>
                        <div className="flex-1 space-y-1.5 mt-0.5">
                          {isEditingSeverity ? (
                            <div className="space-y-2">
                              <Input value={s.name} onChange={(e) => handleSeverityChange(index, 'name', e.target.value)} className="h-8 text-[11px] font-black uppercase tracking-wider" />
                              <Textarea value={s.description} onChange={(e) => handleSeverityChange(index, 'description', e.target.value)} className="text-xs font-medium min-h-[60px] py-2 bg-background resize-none leading-relaxed" />
                            </div>
                          ) : (
                            <>
                              <p className="text-[11px] font-black uppercase tracking-widest text-foreground">{s.name}</p>
                              <p className="text-xs text-foreground/80 leading-relaxed font-medium">{s.description}</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Likelihood Scale
                  </h2>
                  {canManage && (
                    <Button variant="ghost" size="sm" className="h-7 px-3 text-[10px] uppercase font-black tracking-tight" onClick={() => setIsEditingLikelihood(!isEditingLikelihood)}>
                      {isEditingLikelihood ? <><Check className="mr-2 h-3 w-3 text-green-600" /> Save</> : <><Pencil className="mr-2 h-3 w-3" /> Edit</>}
                    </Button>
                  )}
                </div>
                <div className="space-y-3">
                  {likelihoods.map((l, index) => (
                    <div key={l.value} className="p-4 bg-muted/5 rounded-xl border border-slate-200 shadow-sm hover:bg-muted/10 transition-colors">
                      <div className="flex items-start gap-4">
                        <Badge variant="outline" className="h-10 w-10 rounded-lg flex items-center justify-center font-black text-sm shrink-0 border-slate-300">{l.value}</Badge>
                        <div className="flex-1 space-y-1.5 mt-0.5">
                          {isEditingLikelihood ? (
                            <div className="space-y-2">
                              <Input value={l.name} onChange={(e) => handleLikelihoodChange(index, 'name', e.target.value)} className="h-8 text-[11px] font-black uppercase tracking-wider" />
                              <Textarea value={l.description} onChange={(e) => handleLikelihoodChange(index, 'description', e.target.value)} className="text-xs font-medium min-h-[60px] py-2 bg-background resize-none leading-relaxed" />
                            </div>
                          ) : (
                            <>
                              <p className="text-[11px] font-black uppercase tracking-widest text-foreground">{l.name}</p>
                              <p className="text-xs text-foreground/80 leading-relaxed font-medium">{l.description}</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
