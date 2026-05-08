'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { formatWaypointCoordinatesDms } from '@/components/maps/waypoint-coordinate-utils';
import {
  getWaypointDetailGroups,
  getWaypointDetailTone,
  getWaypointDetailToneClass,
} from '@/components/maps/waypoint-detail-lines';
import { cn } from '@/lib/utils';
import type { NavlogLeg } from '@/types/booking';
import { Navigation, Trash2 } from 'lucide-react';

interface BookingPlannedLegsPanelProps {
  legs: NavlogLeg[];
  onRemoveLeg?: (legId: string) => void;
  emptyMessage?: string;
  isEditing?: boolean;
  onWaypointChange?: (legId: string, nextWaypoint: string) => void;
  onWaypointNotesChange?: (legId: string, nextNotes: string) => void;
  headingLabel?: string;
  activeLegIndex?: number;
  initialFuelOnBoard?: number;
}

export function BookingPlannedLegsPanel({
  legs,
  onRemoveLeg,
  emptyMessage = 'Add another waypoint to show legs',
  isEditing = false,
  onWaypointChange,
  onWaypointNotesChange,
  headingLabel = 'Planned Legs',
  activeLegIndex,
  initialFuelOnBoard,
}: BookingPlannedLegsPanelProps) {
  const [expandedLegId, setExpandedLegId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const previousLegCountRef = useRef(legs.length);
  const firstLeg = legs[0];
  const showPendingWaypointCard = legs.length === 1 && Boolean(firstLeg);

  useEffect(() => {
    const previousLegCount = previousLegCountRef.current;
    previousLegCountRef.current = legs.length;

    setNoteDrafts((current) => {
      const next = { ...current };
      for (const leg of legs) {
        if (!(leg.id in next)) {
          next[leg.id] = leg.notes ?? '';
        }
      }
      return next;
    });

    setExpandedLegId((current) => {
      if (current && legs.some((leg) => leg.id === current)) {
        return current;
      }

      if (previousLegCount === 1 && legs.length > 1) {
        return legs[1]?.id ?? null;
      }

      return null;
    });
  }, [legs]);

  const handleSaveNotes = useCallback((legId: string) => {
    if (!onWaypointNotesChange) return;
    const nextNotes = (noteDrafts[legId] ?? '').trim();
    setNoteDrafts((current) => ({ ...current, [legId]: nextNotes }));
    onWaypointNotesChange(legId, nextNotes);
  }, [noteDrafts, onWaypointNotesChange]);

  const formatHeadingValue = (value: number | undefined, suffix = '°') =>
    value === undefined || Number.isNaN(value) ? '-' : `${Math.round(((value % 360) + 360) % 360)}${suffix}`;

  const formatSignedHeadingValue = (value: number | undefined) =>
    value === undefined || Number.isNaN(value) ? '-' : `${value >= 0 ? '+' : '-'}${Math.abs(Math.round(value))}°`;

  const formatDistanceValue = (value: number | undefined) =>
    value === undefined || Number.isNaN(value) ? '-' : `${value.toFixed(1)} NM`;

  const formatGroundSpeedValue = (value: number | undefined) =>
    value === undefined || Number.isNaN(value) ? '-' : `${Math.round(value)}`;

  const formatMinutesValue = (value: number | undefined) => {
    if (value === undefined || Number.isNaN(value) || value <= 0) return '-';
    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);
    return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}` : `${minutes}`;
  };

  const renderNavlogMetric = (label: string, value: string, valueClassName = 'text-slate-900') => (
    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={cn('mt-0.5 text-[10px] font-black leading-tight', valueClassName)}>{value}</p>
    </div>
  );

  return (
    <section className="min-w-0 space-y-2 overflow-hidden">
      <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
        {headingLabel}
      </h3>

      <div className="min-w-0 space-y-1.5">
        {showPendingWaypointCard && firstLeg ? (
          (() => {
            const toneClass = getWaypointDetailToneClass(getWaypointDetailTone(firstLeg));
            const detailGroups = getWaypointDetailGroups(firstLeg);

            return (
              <Card className={cn('group w-full max-w-full overflow-hidden rounded-xl border bg-background shadow-none transition-colors hover:bg-muted/20')}>
                <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1 text-left">
                    <p className="break-words text-[11px] font-black uppercase leading-tight text-slate-900">
                      {firstLeg.waypoint || 'WP 1'}
                    </p>
                    <p className="mt-1 break-words font-mono text-[8px] leading-tight text-slate-500">
                      {formatWaypointCoordinatesDms(firstLeg.latitude, firstLeg.longitude)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">1/1</span>
                    {onRemoveLeg ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => onRemoveLeg(firstLeg.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="border-t border-slate-200 px-3 py-1.5">
                  <div className="space-y-0.5 pt-2">
                    <p className={cn('text-[8px] font-black uppercase tracking-[0.12em]', toneClass.label)}>Waypoint details</p>
                    {detailGroups.length > 0 ? (
                      <div className="space-y-0.5">
                        {detailGroups.map((group, groupIndex) => {
                          const groupClass = getWaypointDetailToneClass(group.tone);
                          return (
                            <p
                              key={`${firstLeg.id}-detail-${groupIndex}`}
                              className={cn('break-words text-[9px] font-semibold leading-tight', groupClass.text)}
                            >
                              {group.entries.map((entry, entryIndex) => {
                                const entryClass = getWaypointDetailToneClass(entry.tone);
                                return (
                                  <span key={`${firstLeg.id}-detail-${groupIndex}-${entryIndex}`} className={entryClass.text}>
                                    {entryIndex > 0 ? <span className="mx-1 text-slate-300">{'•'}</span> : null}
                                    {entry.text}
                                  </span>
                                );
                              })}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="break-words whitespace-pre-wrap text-[9px] font-semibold leading-tight text-slate-700">
                        Map Position
                      </p>
                    )}
                  </div>
                  {(onWaypointNotesChange || firstLeg.notes) ? (
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">NOTES</p>
                      {firstLeg.notes?.trim() ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-[10px] font-semibold leading-tight text-slate-700">
                          {firstLeg.notes.trim()}
                        </p>
                      ) : null}
                      {onWaypointNotesChange ? (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            value={noteDrafts[firstLeg.id] ?? firstLeg.notes ?? ''}
                            onChange={(event) => setNoteDrafts((current) => ({ ...current, [firstLeg.id]: event.target.value }))}
                            placeholder="Add waypoint notes..."
                            className="min-h-[54px] resize-none border-slate-200 bg-white/90 px-2 py-1.5 text-[10px] font-semibold leading-tight text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-400"
                          />
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-7 rounded-md border-slate-200 px-2.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600 hover:bg-slate-50"
                              onClick={() => handleSaveNotes(firstLeg.id)}
                            >
                              Save Note
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })()
        ) : null}

        {legs.slice(1).map((leg, i) => {
          const fromLeg = legs[i];
          const fromWaypoint = fromLeg?.waypoint || `WP ${i + 1}`;
          const toWaypoint = leg.waypoint || `WP ${i + 2}`;
          const fromNotes = fromLeg?.notes?.trim();
          const toNotes = leg.notes?.trim();
          const remainingFuel =
            initialFuelOnBoard === undefined
              ? undefined
              : initialFuelOnBoard -
                legs.slice(1, i + 2).reduce((sum, currentLeg) => sum + (currentLeg.tripFuel ?? 0), 0);
          const distanceLabel = `${(leg.distance ?? 0).toFixed(1)} NM`;
          const trackLabel = `${(((leg.magneticHeading ?? 0) + 180) % 360).toFixed(0)}°`;
          const fromToneClass = getWaypointDetailToneClass(getWaypointDetailTone(fromLeg));
          const toToneClass = getWaypointDetailToneClass(getWaypointDetailTone(leg));
          const fromDetailGroups = getWaypointDetailGroups(fromLeg);
          const toDetailGroups = getWaypointDetailGroups(leg);
          const isExpanded = expandedLegId === leg.id;
          const isActiveLeg = activeLegIndex === i + 1;

          return (
            <Card
              key={leg.id}
              className={cn(
                'group w-full max-w-full overflow-hidden rounded-xl border bg-background shadow-none transition-colors hover:bg-muted/20',
                isActiveLeg ? 'border-emerald-500 bg-emerald-50/70' : ''
              )}
            >
              <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setExpandedLegId((current) => (current === leg.id ? null : leg.id))}
                >
                  <p className="break-words text-[11px] font-black uppercase leading-tight text-slate-900">
                    {fromWaypoint} to {toWaypoint}
                  </p>
                  <p className="mt-1 break-words font-mono text-[8px] leading-tight text-slate-500">
                    {formatWaypointCoordinatesDms(leg.latitude, leg.longitude)}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right leading-none">
                    <span className="block text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">
                      {distanceLabel} • {trackLabel}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {isActiveLeg ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                        Active
                      </span>
                    ) : null}
                    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      {legs.length > 1 ? `${i + 1}/${legs.length - 1}` : 'Leg'}
                    </span>
                  </div>
                  {onRemoveLeg ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => onRemoveLeg(leg.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="border-t border-slate-200 px-3 py-1.5">
                {isExpanded ? (
                  <div className="pt-2">
                    {isEditing && onWaypointChange ? (
                      <div className="mb-2 space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                          From {fromWaypoint}
                        </p>
                        <input
                          value={leg.waypoint}
                          onChange={(event) => onWaypointChange(leg.id, event.target.value)}
                          className="h-6 w-full max-w-[16rem] rounded-none border-none bg-transparent p-0 text-[11px] font-black uppercase text-slate-900 shadow-none outline-none focus-visible:ring-0"
                          placeholder={`WP ${i + 2}`}
                        />
                      </div>
                    ) : null}
                    {fromDetailGroups.length > 0 ? (
                      <div className="space-y-0.5">
                        <p className={cn('text-[8px] font-black uppercase tracking-[0.12em]', fromToneClass.label)}>
                          From {fromWaypoint}
                        </p>
                        <div className="space-y-0.5">
                          {fromDetailGroups.map((group, groupIndex) => {
                            const groupClass = getWaypointDetailToneClass(group.tone);
                            return (
                              <p
                                key={`${leg.id}-from-detail-${groupIndex}`}
                                className={cn('break-words text-[9px] font-semibold leading-tight', groupClass.text)}
                              >
                                {group.entries.map((entry, entryIndex) => {
                                  const entryClass = getWaypointDetailToneClass(entry.tone);
                                  return (
                                    <span key={`${leg.id}-from-detail-${groupIndex}-${entryIndex}`} className={entryClass.text}>
                                      {entryIndex > 0 ? <span className="mx-1 text-slate-300">{'•'}</span> : null}
                                      {entry.text}
                                    </span>
                                  );
                                })}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    {toDetailGroups.length > 0 ? (
                      <div className="mt-2 space-y-0.5">
                        <p className={cn('text-[8px] font-black uppercase tracking-[0.12em]', toToneClass.label)}>
                          To {toWaypoint}
                        </p>
                        <div className="space-y-0.5">
                          {toDetailGroups.map((group, groupIndex) => {
                            const groupClass = getWaypointDetailToneClass(group.tone);
                            return (
                              <p
                                key={`${leg.id}-to-detail-${groupIndex}`}
                                className={cn('break-words text-[9px] font-semibold leading-tight', groupClass.text)}
                              >
                                {group.entries.map((entry, entryIndex) => {
                                  const entryClass = getWaypointDetailToneClass(entry.tone);
                                  return (
                                    <span key={`${leg.id}-to-detail-${groupIndex}-${entryIndex}`} className={entryClass.text}>
                                      {entryIndex > 0 ? <span className="mx-1 text-slate-300">{'•'}</span> : null}
                                      {entry.text}
                                    </span>
                                  );
                                })}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {renderNavlogMetric('TC', formatHeadingValue(leg.trueCourse))}
                        {renderNavlogMetric('WCA', formatSignedHeadingValue(leg.wca))}
                        {renderNavlogMetric('TH', formatHeadingValue(leg.trueHeading))}
                        {renderNavlogMetric(
                          'VAR',
                          leg.variation === undefined || Number.isNaN(leg.variation)
                            ? '-'
                            : `${Math.abs(Math.round(leg.variation))}°${leg.variation >= 0 ? 'E' : 'W'}`
                        )}
                        {renderNavlogMetric('MH', formatHeadingValue(leg.magneticHeading), 'text-primary')}
                        {renderNavlogMetric('DIST', formatDistanceValue(leg.distance))}
                        {renderNavlogMetric('GS', formatGroundSpeedValue(leg.groundSpeed))}
                        {renderNavlogMetric('ETE', formatMinutesValue(leg.ete))}
                        {renderNavlogMetric('CUM', formatMinutesValue(leg.cumulativeEte))}
                        {renderNavlogMetric(
                          'FUEL',
                          leg.tripFuel === undefined || Number.isNaN(leg.tripFuel) ? '-' : `${leg.tripFuel.toFixed(1)}`
                        )}
                        {renderNavlogMetric(
                          'REM',
                          remainingFuel === undefined || Number.isNaN(remainingFuel) ? '-' : `${Math.max(0, remainingFuel).toFixed(1)}`
                        )}
                      </div>
                    </div>

                    {(fromNotes || toNotes) ? (
                      <div className="mt-2 border-t border-slate-200 pt-2">
                        <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">NOTES</p>
                        {fromNotes ? (
                          <div className="space-y-0.5">
                            <p className={cn('text-[8px] font-black uppercase tracking-[0.12em]', fromToneClass.label)}>
                              From {fromWaypoint}
                            </p>
                            <p className="whitespace-pre-wrap break-words text-[10px] font-semibold leading-tight text-slate-700">
                              {fromNotes}
                            </p>
                          </div>
                        ) : null}
                        {toNotes ? (
                          <div className="mt-2 space-y-0.5">
                            <p className={cn('text-[8px] font-black uppercase tracking-[0.12em]', toToneClass.label)}>
                              To {toWaypoint}
                            </p>
                            <p className="whitespace-pre-wrap break-words text-[10px] font-semibold leading-tight text-slate-700">
                              {toNotes}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {isExpanded && onWaypointNotesChange ? (
                      <div className="mt-2 border-t border-slate-200 pt-2">
                        <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">NOTES</p>
                        <div className="mt-1 space-y-2">
                            <Textarea
                              value={noteDrafts[leg.id] ?? leg.notes ?? ''}
                              onChange={(event) => setNoteDrafts((current) => ({ ...current, [leg.id]: event.target.value }))}
                              placeholder="Add waypoint notes..."
                              className="min-h-[54px] resize-none border-slate-200 bg-white/90 px-2 py-1.5 text-[10px] font-semibold leading-tight text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-400"
                            />
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                className="h-7 rounded-md border-slate-200 px-2.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600 hover:bg-slate-50"
                                onClick={() => handleSaveNotes(leg.id)}
                              >
                                Save Note
                              </Button>
                            </div>
                        </div>
                      </div>
                    ) : null}

                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}

        {legs.length === 0 || legs.length === 1 ? (
          <Card className="rounded-xl border border-dashed bg-muted/5 py-8 text-center shadow-none">
            <Navigation className="mx-auto mb-2 h-6 w-6 text-muted-foreground opacity-50" />
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{emptyMessage}</p>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
