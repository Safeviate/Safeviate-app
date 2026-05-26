'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { isPointInPolygon } from '@/lib/utils';
import { Fuel, AlertTriangle, Plane, Upload, Library, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IndustryRouteGuard } from '@/components/industry-route-guard';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { calculateFuelGallonsFromWeight, calculateFuelWeight, gallonsToLitres, getFuelPreset, type FuelType } from '@/lib/fuel';
import type { Aircraft, AircraftModelProfile } from '@/types/aircraft';
import { MainPageHeader, HEADER_ACTION_BUTTON_CLASS } from '@/components/page-header';
import { MasterMassBalanceGraph, type MassBalanceGraphPoint, type MassBalanceGraphTemplate } from '@/components/master-mass-balance-graph';

const POINT_COLORS = ['#f97316', '#3b82f6', '#eab308', '#8b5cf6', '#ec4899'];
const formatLitres = (gallons: number) => gallonsToLitres(gallons).toFixed(1);
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
type FuelStation = {
  id: number;
  name: string;
  weight: number;
  arm: number;
  type: 'standard' | 'fuel';
  gallons?: number;
  maxGallons?: number;
  fuelType?: FuelType;
  densityLbPerGallon?: number;
};

type FuelStationInput = Omit<FuelStation, 'type'> & { type?: string };

const normalizeFuelStation = (station: FuelStationInput): FuelStation => {
  if (station?.type !== 'fuel') return { ...station, type: 'standard' };
  const preset = getFuelPreset(station.fuelType);
  return {
    ...station,
    type: 'fuel',
    fuelType: station.fuelType || 'AVGAS',
    densityLbPerGallon: Number(station.densityLbPerGallon) || preset.densityLbPerGallon,
    maxGallons: Number(station.maxGallons) || 50,
  };
};

const serializeStation = (station: FuelStation) => {
  const baseStation = {
    id: Number(station.id) || 0,
    name: station.name || '',
    weight: parseFloat(String(station.weight)) || 0,
    arm: parseFloat(String(station.arm)) || 0,
    type: station.type || 'standard',
  };
  if (baseStation.type !== 'fuel') return baseStation;
  const preset = getFuelPreset(station.fuelType);
  return {
    ...baseStation,
    gallons: parseFloat(String(station.gallons)) || 0,
    maxGallons: parseFloat(String(station.maxGallons)) || 0,
    fuelType: station.fuelType || 'AVGAS',
    densityLbPerGallon: parseFloat(String(station.densityLbPerGallon)) || preset.densityLbPerGallon,
  };
};

const WBCalculator = () => {
  const { toast } = useToast();

  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<AircraftModelProfile[]>([]);

  const [graphConfig, setGraphConfig] = useState({
    modelName: "Piper PA-28-180",
    xMin: 80, xMax: 94,
    yMin: 1295, yMax: 2600,
    envelope: [{ x: 82, y: 1400 }, { x: 82, y: 1950 }, { x: 86.5, y: 2450 }, { x: 93, y: 2450 }, { x: 93, y: 1400 }, { x: 82, y: 1400 }]
  });

  const [basicEmpty, setBasicEmpty] = useState({ weight: 1416, moment: 120360, arm: 85.0 });
  const [stations, setStations] = useState<FuelStation[]>([
    { id: 2, name: "Pilot & Front Pax", weight: 340, arm: 85.5, type: 'standard' },
    { id: 3, name: "Fuel", weight: 288, arm: 95.0, type: 'fuel', gallons: 48, maxGallons: 50, fuelType: 'AVGAS', densityLbPerGallon: 6.0 },
    { id: 4, name: "Rear Pax", weight: 0, arm: 118.1, type: 'standard' },
    { id: 5, name: "Baggage", weight: 0, arm: 142.8, type: 'standard' },
  ]);

  const [results, setResults] = useState({ cg: 0, weight: 0, isSafe: false });
  const [templateName, setTemplateName] = useState('');
  const [isSaveTemplateDialogOpen, setIsSaveTemplateDialogOpen] = useState(false);
  const [isSaveAircraftDialogOpen, setIsSaveAircraftDialogOpen] = useState(false);
  const [isLoadAircraftDialogOpen, setIsLoadAircraftDialogOpen] = useState(false);
  const [isLoadTemplateDialogOpen, setIsLoadTemplateDialogOpen] = useState(false);
  const [loadedAircraft, setLoadedAircraft] = useState<Aircraft | null>(null);

  const loadData = useCallback(async () => {
    try {
        const [aircraftResponse, configResponse] = await Promise.all([
          fetch('/api/dashboard-summary', { cache: 'no-store' }),
          fetch('/api/tenant-config', { cache: 'no-store' }),
        ]);
        const [aircraftPayload, configPayload] = await Promise.all([
          aircraftResponse.json().catch(() => ({})),
          configResponse.json().catch(() => ({})),
        ]);
        setAircrafts(Array.isArray(aircraftPayload?.aircrafts) ? aircraftPayload.aircrafts : []);
        const config = configPayload?.config && typeof configPayload.config === 'object' ? configPayload.config as { 'mass-and-balance-templates'?: AircraftModelProfile[] } : {};
        setSavedTemplates(Array.isArray(config['mass-and-balance-templates']) ? config['mass-and-balance-templates'] || [] : []);
    } catch (e) {
        console.error("Failed to load M&B data", e);
    }
  }, []);

  useEffect(() => {
    void loadData();
    window.addEventListener('safeviate-aircrafts-updated', loadData);
    window.addEventListener('safeviate-mb-templates-updated', loadData);
    return () => {
        window.removeEventListener('safeviate-aircrafts-updated', loadData);
        window.removeEventListener('safeviate-mb-templates-updated', loadData);
    };
  }, [loadData]);

  useEffect(() => {
    let totalMom = parseFloat(String(basicEmpty.moment)) || 0;
    let totalWt = parseFloat(String(basicEmpty.weight)) || 0;
    stations.forEach(st => {
      const wt = parseFloat(String(st.weight)) || 0;
      const arm = parseFloat(String(st.arm)) || 0;
      totalWt += wt;
      totalMom += (wt * arm);
    });
    const cg = totalWt > 0 ? (totalMom / totalWt) : 0;
    const roundedCg = parseFloat(cg.toFixed(2));
    const roundedWeight = parseFloat(totalWt.toFixed(1));
    const safe = graphConfig.envelope.length > 2 ? isPointInPolygon({ x: roundedCg, y: roundedWeight }, graphConfig.envelope) : false;
    setResults({ cg: roundedCg, weight: roundedWeight, isSafe: safe });
  }, [stations, basicEmpty, graphConfig.envelope]);

  const handleBasicEmptyChange = (field: string, value: string) => {
    const val = parseFloat(value) || 0;
    if (field === 'weight') setBasicEmpty({ ...basicEmpty, weight: val, moment: parseFloat((val * basicEmpty.arm).toFixed(2)) });
    else if (field === 'moment') setBasicEmpty({ ...basicEmpty, moment: val, arm: basicEmpty.weight > 0 ? parseFloat((val / basicEmpty.weight).toFixed(2)) : 0 });
    else if (field === 'arm') setBasicEmpty({ ...basicEmpty, arm: val, moment: parseFloat((basicEmpty.weight * val).toFixed(2)) });
  };

  const handleFuelChange = (id: number, field: string, value: string) => {
    const val = parseFloat(value) || 0;
    setStations(stations.map(s => {
      if (s.id !== id) return s;
      const f = normalizeFuelStation(s);
      const den = f.densityLbPerGallon || 6.0;
      const max = Math.max(f.maxGallons || 0, 0);
      if (field === 'gallons') {
        const gal = clamp(val, 0, max);
        return { ...f, gallons: gal, weight: parseFloat(calculateFuelWeight(gal, den).toFixed(1)) };
      }
      if (field === 'weight') {
        const gal = clamp(calculateFuelGallonsFromWeight(val, den), 0, max);
        return { ...f, weight: parseFloat(calculateFuelWeight(gal, den).toFixed(1)), gallons: parseFloat(gal.toFixed(1)) };
      }
      if (field === 'maxGallons') {
        const newMax = Math.max(val, 0);
        const gal = clamp(f.gallons || 0, 0, newMax);
        return { ...f, maxGallons: newMax, gallons: parseFloat(gal.toFixed(1)), weight: parseFloat(calculateFuelWeight(gal, den).toFixed(1)) };
      }
      return { ...s, [field]: val };
    }));
  };

  const handleFuelTypeChange = (id: number, fuelType: FuelType) => {
    setStations(stations.map(s => {
      if (s.id !== id) return s;
      const preset = getFuelPreset(fuelType);
      const f = normalizeFuelStation(s);
      return { ...f, fuelType, densityLbPerGallon: preset.densityLbPerGallon, weight: parseFloat(calculateFuelWeight(f.gallons || 0, preset.densityLbPerGallon).toFixed(1)) };
    }));
  };

  const handleAutoFit = () => {
    if (graphConfig.envelope.length < 2) return;
    const xValues = graphConfig.envelope.map(p => p.x);
    const minX = Math.floor(Math.min(...xValues) - 1);
    const maxX = Math.ceil(Math.max(...xValues) + 1);
    setGraphConfig(prev => ({ ...prev, xMin: minX, xMax: maxX }));
  };

  const handleEnvelopePointChange = (index: number, field: 'x' | 'y', value: string) => {
    const val = parseFloat(value) || 0;
    const newEnvelope = [...graphConfig.envelope];
    newEnvelope[index] = { ...newEnvelope[index], [field]: val };
    setGraphConfig({ ...graphConfig, envelope: newEnvelope });
  };

  const addEnvelopePoint = () => {
    const lastPoint = graphConfig.envelope[graphConfig.envelope.length - 1] || { x: 80, y: 1500 };
    setGraphConfig({
      ...graphConfig,
      envelope: [...graphConfig.envelope, { x: lastPoint.x, y: lastPoint.y }]
    });
  };

  const removeEnvelopePoint = (index: number) => {
    setGraphConfig({
      ...graphConfig,
      envelope: graphConfig.envelope.filter((_, i) => i !== index)
    });
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      const id = templateName.trim().toLowerCase().replace(/\s+/g, '-');
      const newTemplate: AircraftModelProfile = {
        id, profileName: templateName.trim(), emptyWeight: basicEmpty.weight, emptyWeightMoment: basicEmpty.moment,
        xMin: graphConfig.xMin, xMax: graphConfig.xMax, yMin: graphConfig.yMin, yMax: graphConfig.yMax,
        cgEnvelope: graphConfig.envelope.map(p => ({ x: p.x, y: p.y })), stations: stations.map(serializeStation)
      };
      
      const nextTemplates = [...savedTemplates.filter(t => t.id !== id), newTemplate];
      await fetch('/api/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { 'mass-and-balance-templates': nextTemplates } }),
      });
      window.dispatchEvent(new Event('safeviate-mb-templates-updated'));
      
      toast({ title: 'Template Saved' });
      setTemplateName('');
      setIsSaveTemplateDialogOpen(false);
    } catch (e) { toast({ variant: 'destructive', title: 'Save Failed' }); }
  };

  const handleSaveToAircraft = async (aircraftId: string) => {
    try {
        const ac = aircrafts.find(a => a.id === aircraftId);
        if (!ac) return;
        const response = await fetch(`/api/aircraft/${aircraftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...ac,
            emptyWeight: basicEmpty.weight,
            emptyWeightMoment: basicEmpty.moment,
            maxTakeoffWeight: graphConfig.yMax,
            maxLandingWeight: graphConfig.yMax,
            cgEnvelope: graphConfig.envelope.map(p => ({ weight: p.y, cg: p.x })),
            stations: stations.map(serializeStation),
          }),
        });
        if (!response.ok) throw new Error('Failed to save aircraft');
        window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
        toast({ title: 'Saved to Aircraft' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Save Failed' });
    }
    setIsSaveAircraftDialogOpen(false);
  };

  const handleLoadFromAircraft = (aircraft: Aircraft) => {
    if (!aircraft.emptyWeight || !aircraft.cgEnvelope) return;
    const env = aircraft.cgEnvelope.map(p => ({ x: p.cg, y: p.weight }));
    setGraphConfig({ modelName: aircraft.model, xMin: Math.min(...env.map(p => p.x)) - 2, xMax: Math.max(...env.map(p => p.x)) + 2, yMin: Math.min(...env.map(p => p.y)) - 100, yMax: Math.max(...env.map(p => p.y)) + 100, envelope: env });
    setBasicEmpty({ weight: aircraft.emptyWeight, moment: aircraft.emptyWeightMoment || 0, arm: aircraft.emptyWeight > 0 ? parseFloat(((aircraft.emptyWeightMoment || 0) / aircraft.emptyWeight).toFixed(2)) : 0 });
    setStations((aircraft.stations || []).map(normalizeFuelStation));
    setLoadedAircraft(aircraft);
    setIsLoadAircraftDialogOpen(false);
  };

  const handleLoadTemplate = (t: AircraftModelProfile) => {
    setGraphConfig({ modelName: t.profileName, xMin: t.xMin, xMax: t.xMax, yMin: t.yMin, yMax: t.yMax, envelope: (t.cgEnvelope || []).map(p => ({ x: p.x, y: p.y })) });
    setBasicEmpty({ weight: t.emptyWeight, moment: t.emptyWeightMoment, arm: t.emptyWeight > 0 ? parseFloat((t.emptyWeightMoment / t.emptyWeight).toFixed(2)) : 0 });
    setStations((t.stations || []).map(normalizeFuelStation));
    setLoadedAircraft(null);
    setIsLoadTemplateDialogOpen(false);
  };

  const envelope = graphConfig.envelope;
  const graphTemplate = useMemo<MassBalanceGraphTemplate>(() => ({
    id: loadedAircraft?.id || graphConfig.modelName.toLowerCase().replace(/\s+/g, '-'),
    name: loadedAircraft ? `${loadedAircraft.make} ${loadedAircraft.model}` : graphConfig.modelName,
    family: loadedAircraft?.tailNumber || loadedAircraft?.make || 'Configurator',
    xLabel: 'CG (inches)',
    yLabel: 'Gross Weight (lbs)',
    xDomain: [graphConfig.xMin, graphConfig.xMax],
    yDomain: [graphConfig.yMin, graphConfig.yMax],
    envelope: envelope.map((point, index) => ({
      ...point,
      color: ['#f97316', '#3b82f6', '#eab308', '#8b5cf6', '#ec4899'][index % 5],
    })) as MassBalanceGraphPoint[],
    currentPoint: { x: results.cg, y: results.weight },
  }), [loadedAircraft, graphConfig.modelName, graphConfig.xMin, graphConfig.xMax, graphConfig.yMin, graphConfig.yMax, envelope, results.cg, results.weight]);

  return (
    <div className="flex h-full flex-col overflow-hidden gap-4 px-1">
      <Card className="flex flex-col h-full overflow-hidden shadow-none border">
        <div className="sticky top-0 z-30 bg-card border-b">
          <MainPageHeader 
            title="Mass & Balance Configurator"
            actions={
              <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                <Button variant="outline" size="sm" onClick={() => setIsLoadTemplateDialogOpen(true)} className="h-9 border-slate-300 text-[10px] font-black uppercase"><Library size={14} className="mr-2" /> Templates</Button>
                <Button variant="outline" size="sm" onClick={() => setIsLoadAircraftDialogOpen(true)} className="h-9 border-slate-300 text-[10px] font-black uppercase"><Upload size={14} className="mr-2" /> Load AC</Button>
                <Button variant="default" size="sm" onClick={() => setIsSaveAircraftDialogOpen(true)} className={HEADER_ACTION_BUTTON_CLASS}><Plane size={14} className="mr-2" /> Commit to AC</Button>
              </div>
            }
          />
        </div>

        <CardContent className="flex-1 p-0 overflow-hidden bg-muted/5 min-w-0">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_350px] h-full overflow-hidden min-w-0">
                <div className="h-full min-w-0 border-r bg-background overflow-hidden">
                  <div className="p-6 min-w-0">
                    <MasterMassBalanceGraph
                      template={graphTemplate}
                      currentPoint={{ x: results.cg, y: results.weight }}
                      showLayoutBadge={false}
                      inlineTitle
                      showCompactMetrics={false}
                      compactHeightMode="tight"
                    />
                  </div>
                </div>

                <ScrollArea className="h-full min-w-0">
                  <div className="p-6 space-y-8 pb-24 min-w-0">
                <section className="space-y-4">
                  <h2 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" /> Basic Empty Weight</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-[9px] uppercase font-bold text-foreground/75">Weight (lbs)</Label><Input aria-label="Basic empty weight (lbs)" type="number" value={basicEmpty.weight} onChange={(e) => handleBasicEmptyChange('weight', e.target.value)} className="h-9 font-bold bg-background" /></div>
                    <div className="space-y-1.5"><Label className="text-[9px] uppercase font-bold text-foreground/75">Arm (in)</Label><Input aria-label="Basic empty arm (in)" type="number" value={basicEmpty.arm} onChange={(e) => handleBasicEmptyChange('arm', e.target.value)} className="h-9 font-bold bg-background" /></div>
                  </div>
                </section>

                <Separator />

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" /> Loading Stations</h2>
                    <Button variant="outline" size="icon" aria-label="Add loading station" onClick={() => setStations([...stations, { id: Date.now(), name: 'New Item', weight: 0, arm: 0, type: 'standard' }])} className="h-7 w-7 border-slate-300"><Plus size={14} /></Button>
                  </div>
                  <div className="space-y-3">
                    {stations.map(s => (
                      <div key={s.id} className="p-3 border rounded-lg bg-background space-y-2 relative group">
                        <Button variant="ghost" size="icon" aria-label={`Remove station ${s.name || s.id}`} onClick={() => setStations(stations.filter(st => st.id !== s.id))} className="h-6 w-6 absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-destructive"><Trash2 size={12} /></Button>
                        <div className="flex items-center gap-2">
                          {s.type === 'fuel' ? <Fuel size={14} className="text-yellow-500" /> : <Plane size={14} className="text-primary" />}
                          <Input value={s.name} onChange={(e) => setStations(stations.map(st => st.id === s.id ? { ...st, name: e.target.value } : st))} className="h-7 border-none shadow-none font-black uppercase text-[10px] p-0 focus-visible:ring-0" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1"><Label className="text-[8px] uppercase font-bold text-foreground/75">Wt (lbs)</Label><Input aria-label={`${s.name} weight (lbs)`} type="number" value={s.weight} onChange={(e) => s.type === 'fuel' ? handleFuelChange(s.id, 'weight', e.target.value) : setStations(stations.map(st => st.id === s.id ? { ...st, weight: Number(e.target.value) } : st))} className="h-8 text-xs font-bold" /></div>
                          <div className="space-y-1"><Label className="text-[8px] uppercase font-bold text-foreground/75">Arm (in)</Label><Input aria-label={`${s.name} arm (in)`} type="number" value={s.arm} onChange={(e) => setStations(stations.map(st => st.id === s.id ? { ...st, arm: Number(e.target.value) } : st))} className="h-8 text-xs font-bold" /></div>
                        </div>
                        {s.type === 'fuel' && (
                          <div className="space-y-2 pt-1 border-t mt-1">
                            <div className="flex justify-between items-center text-[9px] font-black uppercase text-foreground/75">
                      <span>{s.gallons || 0} GAL / {formatLitres(s.gallons || 0)} L</span>
                              <span>Max: {s.maxGallons}</span>
                            </div>
                            <input aria-label={`${s.name} fuel gallons`} type="range" min="0" max={s.maxGallons || 50} step="0.1" value={s.gallons || 0} onChange={(e) => handleFuelChange(s.id, 'gallons', e.target.value)} className="w-full h-1 bg-muted-foreground/20 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <Separator />

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" /> Envelope Definition
                    </h2>
                    <Button variant="outline" size="icon" onClick={addEnvelopePoint} className="h-7 w-7 border-slate-300">
                      <Plus size={14} />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {graphConfig.envelope.map((p, index) => (
                      <div key={index} className="p-3 border rounded-lg bg-background space-y-2 relative group transition-colors hover:border-primary/20">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                               <div className="w-2 h-2 rounded-full" style={{ backgroundColor: POINT_COLORS[index % POINT_COLORS.length] }} />
                               <span className="text-[9px] font-black uppercase tracking-widest text-foreground/75">Point {index + 1}</span>
                            </div>
                            <Button 
                               variant="ghost" 
                               size="icon" 
                               onClick={() => removeEnvelopePoint(index)} 
                               aria-label={`Remove envelope point ${index + 1}`}
                               className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                               <Trash2 size={12} />
                            </Button>
                         </div>
                         <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                               <Label className="text-[8px] uppercase font-bold text-foreground/75">CG (in)</Label>
                               <Input 
                                  aria-label={`Envelope point ${index + 1} CG`}
                                  type="number" 
                                  step="0.01"
                                  value={p.x} 
                                  onChange={(e) => handleEnvelopePointChange(index, 'x', e.target.value)} 
                                  className="h-8 text-xs font-bold" 
                               />
                            </div>
                            <div className="space-y-1">
                               <Label className="text-[8px] uppercase font-bold text-foreground/75">Weight (lbs)</Label>
                               <Input 
                                  aria-label={`Envelope point ${index + 1} weight`}
                                  type="number" 
                                  value={p.y} 
                                  onChange={(e) => handleEnvelopePointChange(index, 'y', e.target.value)} 
                                  className="h-8 text-xs font-bold" 
                               />
                            </div>
                         </div>
                      </div>
                    ))}
                    {graphConfig.envelope.length === 0 && (
                      <div className="text-center py-6 border-2 border-dashed rounded-xl bg-muted/5">
                        <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2 opacity-50" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground/75">No limits defined</p>
                      </div>
                    )}
                  </div>
                </section>

                <Separator />

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" /> Chart Scaling</h2>
                    <Button variant="outline" size="sm" onClick={handleAutoFit} className="h-7 px-3 text-[9px] font-black uppercase border-slate-300">Auto-Fit</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                    <div className="space-y-1.5"><Label className="text-[9px] uppercase font-bold">Min CG</Label><Input type="number" value={graphConfig.xMin} onChange={(e) => setGraphConfig({...graphConfig, xMin: Number(e.target.value)})} className="h-8 text-xs font-bold" /></div>
                    <div className="space-y-1.5"><Label className="text-[9px] uppercase font-bold">Max CG</Label><Input type="number" value={graphConfig.xMax} onChange={(e) => setGraphConfig({...graphConfig, xMax: Number(e.target.value)})} className="h-8 text-xs font-bold" /></div>
                    <div className="space-y-1.5"><Label className="text-[9px] uppercase font-bold">Min Wt</Label><Input type="number" value={graphConfig.yMin} onChange={(e) => setGraphConfig({...graphConfig, yMin: Number(e.target.value)})} className="h-8 text-xs font-bold" /></div>
                    <div className="space-y-1.5"><Label className="text-[9px] uppercase font-bold">Max Wt</Label><Input type="number" value={graphConfig.yMax} onChange={(e) => setGraphConfig({...graphConfig, yMax: Number(e.target.value)})} className="h-8 text-xs font-bold" /></div>
                  </div>
                </section>
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isLoadTemplateDialogOpen} onOpenChange={setIsLoadTemplateDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Load Template</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(savedTemplates || []).map(t => (
              <Button key={t.id} variant="ghost" className="w-full justify-start font-black uppercase text-xs" onClick={() => handleLoadTemplate(t)}>{t.profileName}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isLoadAircraftDialogOpen} onOpenChange={setIsLoadAircraftDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Load Aircraft M&B</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(aircrafts || []).map(ac => (
              <Button key={ac.id} variant="ghost" className="w-full justify-start font-black uppercase text-xs" onClick={() => handleLoadFromAircraft(ac)} disabled={!ac.emptyWeight}>{ac.tailNumber} ({ac.model})</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveAircraftDialogOpen} onOpenChange={setIsSaveAircraftDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Commit to Aircraft</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(aircrafts || []).map(ac => (
              <Button key={ac.id} variant="ghost" className="w-full justify-start font-black uppercase text-xs" onClick={() => handleSaveToAircraft(ac.id)}>{ac.tailNumber}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default function MassBalanceConfigPage() {
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/admin/mb-config' });
  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }
  return (
    <IndustryRouteGuard
      sectionLabel="M&B Configuration"
      description="Mass and balance configuration is only available for flight-operations tenants."
      backHref="/admin"
    >
      <WBCalculator />
    </IndustryRouteGuard>
  );
}
