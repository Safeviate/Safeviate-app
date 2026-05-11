'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2, MapIcon, Navigation, AlertTriangle, Save, Search, PlaneTakeoff, Pencil } from 'lucide-react';
import { CARD_HEADER_BAND_CLASS, HEADER_ACTION_BUTTON_CLASS, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { createNavlogLegFromCoordinates } from '@/lib/flight-planner';
import { isHrefEnabledForIndustry, shouldBypassIndustryRestrictions } from '@/lib/industry-access';
import { OPERATIONS_MAP_CARD_CLASS, OPERATIONS_MAP_SURFACE_HEIGHT_CLASS } from '@/components/operations/operations-map-layout';
import type { TrainingRoute, NavlogLeg, Hazard } from '@/types/booking';
import { v4 as uuidv4 } from 'uuid';
import { formatWaypointCoordinatesDms } from '@/components/maps/waypoint-coordinate-utils';
import { BookingPlannedLegsPanel } from '@/components/bookings/booking-planned-legs-panel';

const getRouteTypeLabel = (routeType?: TrainingRoute['routeType']) =>
  routeType === 'other' ? 'Other Route' : 'Training Route';

const RoutePlannerMapLibreShell = dynamic(() => import('@/components/flight-planner/route-planner-maplibre-shell').then((module) => module.RoutePlannerMapLibreShell), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-slate-900 flex items-center justify-center text-white font-black uppercase tracking-widest text-[10px]">Loading MapLibre Engine...</div>
});

const createEmptyRoute = (): TrainingRoute => ({
  id: uuidv4(),
  name: 'New Route',
  description: '',
  routeType: 'training',
  legs: [],
  hazards: [],
  tenantId: 'safeviate',
  createdAt: new Date().toISOString(),
});

export default function TrainingRoutesPage() {
  const { tenant, isLoading: isTenantLoading } = useTenantConfig();
  const { uiMode } = useTheme();
  const [routes, setRoutes] = useState<TrainingRoute[]>([]);
  const [activeRoute, setActiveRoute] = useState<TrainingRoute | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hazardToEdit, setHazardToEdit] = useState<{ lat: number; lng: number } | null>(null);
  const [hazardNote, setHazardNote] = useState('');
  const [search, setSearch] = useState('');
  const [isMapZoomPanelOpen, setIsMapZoomPanelOpen] = useState(false);
  const [isMapLayersPanelOpen, setIsMapLayersPanelOpen] = useState(false);
  const [routePlannerBaseStyle, setRoutePlannerBaseStyle] = useState<'light' | 'satellite'>('light');
  const isModern = uiMode === 'modern';
  const routePlannerCompactButtonClass =
    'h-8 rounded-md px-3 text-[9px] font-black uppercase tracking-[0.08em] shadow-none gap-1.5 shrink-0';
  const routePlannerSecondaryButtonClass = cn(
    routePlannerCompactButtonClass,
    'border border-input bg-background text-foreground hover:bg-muted/50',
  );
  const routePlannerPrimaryButtonClass = cn(
    routePlannerCompactButtonClass,
    'border border-slate-900 bg-slate-900 text-white hover:bg-slate-800',
  );

  useEffect(() => {
    const loadRoutes = async () => {
        try {
          const res = await fetch('/api/training-routes', { cache: 'no-store' });
          const data = await res.json();
        const nextRoutes = Array.isArray(data.routes)
          ? data.routes.map((route: TrainingRoute) => ({
              ...route,
              routeType: route.routeType === 'other' ? 'other' : 'training',
            }))
          : [];
        setRoutes(nextRoutes);
        if (!activeRoute && nextRoutes.length > 0) setActiveRoute(nextRoutes[0]);
        } catch {
          setRoutes([]);
        }
    };
    loadRoutes();
  }, []);

  const persistRoute = async (route: TrainingRoute, method: 'POST' | 'PATCH') => {
    const res = await fetch('/api/training-routes', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to save route.');
  };

  const handleCreateNew = useCallback(() => {
    const newRoute = createEmptyRoute();
    setActiveRoute(newRoute);
    setIsEditing(true);
  }, []);

  const handleAddWaypoint = useCallback((lat: number, lon: number, identifier?: string, frequencies?: string, layerInfo?: string) => {
    if (!isEditing) return;
    setActiveRoute((current) => {
      if (!current) return current;
      const newLeg = createNavlogLegFromCoordinates(
        current.legs,
        lat,
        lon,
        identifier || `WP ${current.legs.length + 1}`,
        frequencies,
        layerInfo,
      );
      return { ...current, legs: [...current.legs, newLeg] };
    });
  }, [isEditing]);

  const handleMoveWaypoint = useCallback((legId: string, lat: number, lon: number) => {
    if (!isEditing) return;
    setActiveRoute((current) => {
      if (!current) return current;

      const movedLegs = current.legs.map((leg) =>
        leg.id === legId ? { ...leg, latitude: lat, longitude: lon } : leg
      );

      const recalculatedLegs = movedLegs.map((leg, index) => {
        const rebuiltLeg = createNavlogLegFromCoordinates(
          movedLegs.slice(0, index),
          leg.latitude ?? 0,
          leg.longitude ?? 0,
          leg.waypoint?.replace(/-\d+$/, '') || 'PNT',
          leg.frequencies,
          leg.layerInfo,
          leg.notes,
        );

        return {
          ...leg,
          ...rebuiltLeg,
          id: leg.id,
        };
      });

      return { ...current, legs: recalculatedLegs };
    });
  }, [isEditing]);

  const handleWaypointNotesChange = useCallback((legId: string, nextNotes: string) => {
    if (!isEditing) return;
    setActiveRoute((current) => {
      if (!current) return current;
      return {
        ...current,
        legs: current.legs.map((leg) => (leg.id === legId ? { ...leg, notes: nextNotes } : leg)),
      };
    });
  }, [isEditing]);

  const handleAddHazardRequest = useCallback((lat: number, lng: number) => {
    setHazardToEdit({ lat, lng });
    setHazardNote('');
  }, []);

  const confirmAddHazard = () => {
    if (!hazardToEdit || !activeRoute) return;
    const newHazard: Hazard = { id: uuidv4(), lat: hazardToEdit.lat, lng: hazardToEdit.lng, note: hazardNote, severity: 'medium' };
    setActiveRoute({ ...activeRoute, hazards: [...activeRoute.hazards, newHazard] });
    setHazardToEdit(null);
  };

  const handleSave = async () => {
    if (!activeRoute) return;
    try {
      const exists = routes.some((route) => route.id === activeRoute.id);
      await persistRoute(activeRoute, exists ? 'PATCH' : 'POST');
      const nextRoutes = exists ? routes.map((route) => (route.id === activeRoute.id ? activeRoute : route)) : [activeRoute, ...routes];
      setRoutes(nextRoutes);
      setIsEditing(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (routeId: string) => {
    try {
      await fetch(`/api/training-routes?id=${routeId}`, { method: 'DELETE' });
      const nextRoutes = routes.filter((route) => route.id !== routeId);
      setRoutes(nextRoutes);
      if (activeRoute?.id === routeId) {
        setActiveRoute(nextRoutes[0] ?? createEmptyRoute());
        setIsEditing(nextRoutes.length === 0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredRoutes = useMemo(
    () => routes.filter((route) => route.name.toLowerCase().includes(search.toLowerCase()) || route.description.toLowerCase().includes(search.toLowerCase())),
    [routes, search]
  );

  if (isTenantLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed bg-background px-6 py-12 text-center">
        <div className="space-y-4">
          <PlaneTakeoff className="mx-auto h-8 w-8 text-slate-400" />
          <p className="text-sm font-black uppercase tracking-widest">Loading Route Planner</p>
        </div>
      </div>
    );
  }

  if (
    !shouldBypassIndustryRestrictions(tenant?.id) &&
    !isHrefEnabledForIndustry('/operations/training-routes', tenant?.industry) &&
    !(tenant?.enabledMenus?.includes('/operations/training-routes') ?? false)
  ) {
    return (
      <Card className="mx-auto w-full max-w-3xl border shadow-none">
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-black uppercase tracking-tight">Route Planner Unavailable</h1>
            <p className="text-sm text-muted-foreground">Route planning is only available for aviation tenants.</p>
          </div>
          <Button asChild variant="outline" className="font-black uppercase">
            <Link href="/operations">Back to Operations</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('mx-auto flex h-full min-h-0 w-full lg:max-w-[1100px] flex-1 flex-col gap-4 overflow-hidden px-1 pt-4', isModern && 'gap-4')}>
      <Card className={cn(OPERATIONS_MAP_CARD_CLASS, isModern && 'border-slate-200/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.08)]')}>
        <CardHeader className={cn(CARD_HEADER_BAND_CLASS, isModern && 'bg-transparent')}>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              onClick={handleCreateNew}
              className={cn(routePlannerPrimaryButtonClass, isModern && 'border-slate-200 bg-slate-800 text-white hover:bg-slate-700')}
            >
              <Plus size={14} className="mr-2" /> New Route
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0">
          <div className={cn('grid h-full min-h-0 grid-cols-1 grid-rows-[42svh_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_350px] lg:grid-rows-none lg:h-full', OPERATIONS_MAP_SURFACE_HEIGHT_CLASS)}>
              <div className={cn('relative order-1 z-20 flex h-full min-h-0 flex-col overflow-hidden bg-slate-900', isModern && 'bg-white')}>
                <RoutePlannerMapLibreShell
                  key={`route-planner-${routePlannerBaseStyle}`}
                  legs={activeRoute?.legs || []}
                  hazards={activeRoute?.hazards || []}
                  baseStyle={routePlannerBaseStyle}
                  onBaseStyleChange={setRoutePlannerBaseStyle}
                  isEditing={isEditing}
                  onAddWaypoint={handleAddWaypoint}
                  onMoveWaypoint={handleMoveWaypoint}
                  onAddHazard={handleAddHazardRequest}
                  isZoomPanelOpen={isMapZoomPanelOpen}
                  isLayersPanelOpen={isMapLayersPanelOpen}
                  onZoomPanelOpenChange={setIsMapZoomPanelOpen}
                  onLayersPanelOpenChange={setIsMapLayersPanelOpen}
                  />
            </div>

            <div className={cn('relative order-2 z-10 flex h-full min-h-0 flex-col overflow-hidden border-t bg-background lg:border-l lg:border-t-0', OPERATIONS_MAP_SURFACE_HEIGHT_CLASS, isModern && 'border-slate-200/80 bg-white')}>
              {activeRoute ? (
                <ScrollArea className="h-full flex-1 overscroll-contain">
                  <div className="space-y-8 p-6 pb-12">
                    <div className={cn('space-y-4 border-b pb-6', isModern && 'border-slate-200/80')}>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Route Profile</p>
                      <div className="flex items-center gap-2">
                        {!isEditing ? (
                          <Button variant="outline" onClick={() => setIsEditing(true)} className={HEADER_SECONDARY_BUTTON_CLASS}><Pencil size={14} className="mr-2" /> Edit</Button>
                        ) : null}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(activeRoute.id)}><Trash2 size={14} /></Button>
                        <Button onClick={handleSave} disabled={!isEditing} className={HEADER_ACTION_BUTTON_CLASS}><Save size={14} className="mr-2" /> Save</Button>
                      </div>
                    </div>
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-[9px] font-black uppercase text-muted-foreground">Saved Routes</label>
                          <Select
                            value={activeRoute?.id ?? ''}
                            onValueChange={(routeId) => {
                              const selectedRoute = routes.find((route) => route.id === routeId) || null;
                              setActiveRoute(selectedRoute);
                              setIsEditing(false);
                            }}
                          >
                            <SelectTrigger className="h-9 text-[10px] font-black uppercase">
                              <SelectValue placeholder={routes.length ? 'Select saved route' : 'No saved routes'} />
                            </SelectTrigger>
                            <SelectContent>
                              {routes.map((route) => (
                                <SelectItem key={route.id} value={route.id}>
                                  {route.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[9px] font-black uppercase text-muted-foreground">Route Name</label>
                          <Input value={activeRoute.name} onChange={(e) => setActiveRoute({ ...activeRoute, name: e.target.value })} className="h-9 text-xs font-black uppercase" readOnly={!isEditing} />
                        </div>
                        <div>
                          <label className="mb-1 block text-[9px] font-black uppercase text-muted-foreground">Route Type</label>
                          <Select
                            value={activeRoute.routeType || 'training'}
                            onValueChange={(value) => setActiveRoute({ ...activeRoute, routeType: value === 'other' ? 'other' : 'training' })}
                            disabled={!isEditing}
                          >
                            <SelectTrigger className="h-9 text-xs font-black uppercase">
                              <SelectValue placeholder="Select route type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="training">Training Route</SelectItem>
                              <SelectItem value="other">Other Route</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[9px] font-black uppercase text-muted-foreground">Description / Notes</label>
                          <Textarea value={activeRoute.description} onChange={(e) => setActiveRoute({ ...activeRoute, description: e.target.value })} className="min-h-[60px] text-[10px] font-bold" readOnly={!isEditing} placeholder="Route notes, sector details, frequency requirements, etc." />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-8">
                      <section className="space-y-4">
                        <BookingPlannedLegsPanel
                          legs={activeRoute.legs}
                          onRemoveLeg={(legId) => setActiveRoute({ ...activeRoute, legs: activeRoute.legs.filter((item) => item.id !== legId) })}
                          emptyMessage="Add another waypoint to show legs"
                          isEditing={isEditing}
                          onWaypointChange={(legId, nextWaypoint) => {
                            setActiveRoute((current) => {
                              if (!current) return current;
                              return {
                                ...current,
                                legs: current.legs.map((leg) => (leg.id === legId ? { ...leg, waypoint: nextWaypoint } : leg)),
                              };
                            });
                          }}
                          onWaypointNotesChange={handleWaypointNotesChange}
                        />
                      </section>
                      <Separator />
                      <section className="space-y-4">
                        <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-destructive"><div className="h-2 w-2 rounded-full bg-destructive" /> Safety Hazards</h3>
                        <div className="space-y-2">
                          {activeRoute.hazards.map((hazard) => (
                            <div key={hazard.id} className="group relative space-y-2 rounded-xl border border-destructive/10 bg-destructive/5 p-3 transition-all hover:border-destructive/30">
                              <div className="flex items-center justify-between">
                                <Badge variant="destructive" className="h-4 text-[8px] font-black uppercase">Alert</Badge>
                                {isEditing && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive opacity-0 transition-opacity group-hover:opacity-100" onClick={() => setActiveRoute({ ...activeRoute, hazards: activeRoute.hazards.filter((item) => item.id !== hazard.id) })}><Trash2 size={12} /></Button>}
                              </div>
                              <Textarea value={hazard.note} onChange={(e) => setActiveRoute({ ...activeRoute, hazards: activeRoute.hazards.map((item) => item.id === hazard.id ? { ...item, note: e.target.value } : item) })} className="h-16 resize-none border-none bg-transparent p-0 text-[10px] font-bold leading-relaxed shadow-none focus-visible:ring-0" placeholder="Hazard description..." readOnly={!isEditing} />
                              <p className="font-mono text-[8px] font-black text-destructive/60">{formatWaypointCoordinatesDms(hazard.lat, hazard.lng)}</p>
                            </div>
                          ))}
                          {activeRoute.hazards.length === 0 && <div className="rounded-xl border border-dashed bg-muted/5 py-8 text-center"><AlertTriangle className="mx-auto mb-2 h-6 w-6 opacity-40 text-muted-foreground" /><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mark hazards from the map</p></div>}
                        </div>
                      </section>
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex h-full flex-col items-center justify-center space-y-4 p-12 text-center opacity-40">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><MapIcon size={32} /></div>
                  <div className="max-w-xs">
                    <p className="text-xs font-black uppercase tracking-tight">Select a Route</p>
                    <p className="mt-2 text-[10px] font-bold leading-relaxed">Choose a route from the list or create a new one to begin planning.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!hazardToEdit} onOpenChange={() => setHazardToEdit(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest"><AlertTriangle className="h-4 w-4 text-destructive" /> Mark Safety Hazard</DialogTitle>
            <DialogDescription>Describe the hazard and save it with the route.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground">Hazard Description</label>
              <Textarea value={hazardNote} onChange={(e) => setHazardNote(e.target.value)} placeholder="Describe the hazard..." className="min-h-[100px] text-xs font-bold" />
            </div>
            <p className="text-center font-mono text-[9px] font-bold text-muted-foreground">Target: {hazardToEdit ? formatWaypointCoordinatesDms(hazardToEdit.lat, hazardToEdit.lng) : 'N/A'}</p>
          </div>
            <DialogFooter>
            <DialogClose asChild><Button variant="outline" className={HEADER_SECONDARY_BUTTON_CLASS}>Cancel</Button></DialogClose>
            <Button onClick={confirmAddHazard} className={HEADER_ACTION_BUTTON_CLASS}>Add Marker</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


