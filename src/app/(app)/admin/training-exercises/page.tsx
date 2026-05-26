'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MainPageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ChevronDown, PlusCircle, RotateCcw, Save, Trash2 } from 'lucide-react';
import {
  TRAINING_EXERCISE_CONFIG_KEY,
  TRAINING_EXERCISE_TEMPLATES,
  type TrainingExerciseCriterionTemplate,
  type TrainingExerciseTemplate,
  resolveTrainingExerciseTemplates,
} from '@/lib/training-exercise-templates';
import { TRAINING_COMPETENCY_OPTIONS } from '@/lib/training-competencies';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

const cloneTemplates = (templates: TrainingExerciseTemplate[]) =>
  templates.map((template) => ({
    ...template,
    coreCompetencyKeys: [...template.coreCompetencyKeys],
    criteria: template.criteria.map((criterion) => ({ ...criterion })),
  }));

export default function AdminTrainingExercisesPage() {
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/admin/training-exercises' });
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [templates, setTemplates] = useState<TrainingExerciseTemplate[]>(() => cloneTemplates(TRAINING_EXERCISE_TEMPLATES));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/tenant-config', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      const config = payload?.config && typeof payload.config === 'object'
        ? (payload.config as Record<string, unknown>)
        : null;
      setTemplates(cloneTemplates(resolveTrainingExerciseTemplates(config)));
    } catch (error) {
      console.error('Failed to load training exercise settings', error);
      setTemplates(cloneTemplates(TRAINING_EXERCISE_TEMPLATES));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setExpandedKeys((current) => {
      const validKeys = current.filter((key) => templates.some((template) => template.key === key));
      if (validKeys.length > 0) return validKeys;
      return templates[0] ? [templates[0].key] : [];
    });
  }, [templates]);

  const exerciseCountLabel = useMemo(
    () => `${templates.length} exercise${templates.length === 1 ? '' : 's'}`,
    [templates.length],
  );

  const updateTemplate = (index: number, patch: Partial<TrainingExerciseTemplate>) => {
    setTemplates((current) =>
      current.map((template, templateIndex) => (
        templateIndex === index
          ? { ...template, ...patch }
          : template
      )),
    );
  };

  const toggleCoreCompetency = (index: number, competencyKey: string) => {
    setTemplates((current) =>
      current.map((template, templateIndex) => {
        if (templateIndex !== index) return template;
        const nextKeys = template.coreCompetencyKeys.includes(competencyKey)
          ? template.coreCompetencyKeys.filter((key) => key !== competencyKey)
          : [...template.coreCompetencyKeys, competencyKey];
        return {
          ...template,
          coreCompetencyKeys: nextKeys,
        };
      }),
    );
  };

  const addExercise = () => {
    const nextExerciseKey = `exercise-${Date.now()}`;
    setTemplates((current) => [
      ...current,
      {
        key: nextExerciseKey,
        label: 'New Exercise',
        description: '',
        coreCompetencyKeys: ['airmanship'],
        criteria: [
          {
            key: 'criterion-1',
            label: 'New criterion',
            competencyKey: 'airmanship',
          },
        ],
      },
    ]);
    setExpandedKeys((current) => [...current, nextExerciseKey]);
  };

  const removeExercise = (index: number) => {
    setTemplates((current) => current.filter((_, templateIndex) => templateIndex !== index));
  };

  const updateCriterion = (exerciseIndex: number, criterionIndex: number, patch: Partial<TrainingExerciseCriterionTemplate>) => {
    setTemplates((current) =>
      current.map((template, templateIndex) => {
        if (templateIndex !== exerciseIndex) return template;
        return {
          ...template,
          criteria: template.criteria.map((criterion, index) => (
            index === criterionIndex ? { ...criterion, ...patch } : criterion
          )),
        };
      }),
    );
  };

  const addCriterion = (exerciseIndex: number) => {
    setTemplates((current) =>
      current.map((template, templateIndex) => {
        if (templateIndex !== exerciseIndex) return template;
        return {
          ...template,
          criteria: [
            ...template.criteria,
            {
              key: `criterion-${template.criteria.length + 1}`,
              label: 'New criterion',
              competencyKey: template.coreCompetencyKeys[0] || 'airmanship',
            },
          ],
        };
      }),
    );
  };

  const removeCriterion = (exerciseIndex: number, criterionIndex: number) => {
    setTemplates((current) =>
      current.map((template, templateIndex) => {
        if (templateIndex !== exerciseIndex) return template;
        return {
          ...template,
          criteria: template.criteria.filter((_, index) => index !== criterionIndex),
        };
      }),
    );
  };

  const saveTemplates = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            [TRAINING_EXERCISE_CONFIG_KEY]: templates,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string })?.error || 'Failed to save training exercises.');
      }
      window.dispatchEvent(new Event('safeviate-tenant-config-updated'));
      toast({
        title: 'Training exercises saved',
        description: 'The exercise syllabus and default assessment criteria are now available to booking and debrief flows.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save training exercises.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefault = () => {
    setTemplates(cloneTemplates(TRAINING_EXERCISE_TEMPLATES));
    setExpandedKeys(TRAINING_EXERCISE_TEMPLATES[0] ? [TRAINING_EXERCISE_TEMPLATES[0].key] : []);
    toast({
      title: 'Default syllabus restored locally',
      description: 'Review the reset list, then click Save to publish it for the tenant.',
    });
  };

  const toggleExpanded = (templateKey: string) => {
    setExpandedKeys((current) => (
      current.includes(templateKey)
        ? current.filter((key) => key !== templateKey)
        : [...current, templateKey]
    ));
  };

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto w-full px-1 pt-4 space-y-6">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return (
    <div
      className={cn(
        'max-w-[1200px] mx-auto w-full flex flex-col gap-6 px-1 pt-4',
        isMobile ? 'min-h-0 overflow-y-auto pb-4' : 'h-full overflow-hidden pb-10',
      )}
    >
      <Card className="flex min-h-0 flex-1 flex-col shadow-none border overflow-hidden">
        <MainPageHeader
          title="Training Exercises"
          description="Manage the school-standard exercise syllabus and the default assessment criteria instructors start from."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="h-10 rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.16em]">
                {exerciseCountLabel}
              </Badge>
              <Button type="button" variant="outline" className="h-10 gap-2" onClick={resetToDefault}>
                <RotateCcw className="h-4 w-4" /> Reset to defaults
              </Button>
              <Button type="button" className="h-10 gap-2" onClick={saveTemplates} disabled={isSaving}>
                <Save className="h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Exercises'}
              </Button>
            </div>
          )}
        />
        <CardContent className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden bg-muted/5 p-4 lg:p-6">
          <section className="rounded-xl border bg-background p-4 space-y-3">
            <div className="space-y-1">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-primary">How this works</h3>
              <p className="text-sm text-muted-foreground">
                These exercises are the default choices shown on Training Flight bookings and the instructor debrief. Instructors can still add extra custom criteria inside the debrief when a specific flight needs it.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={addExercise}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Exercise
            </Button>
          </section>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <div className="space-y-4">
            {templates.map((template, templateIndex) => (
              <Card key={`${template.key}-${templateIndex}`} className="shadow-none border overflow-hidden">
                <CardContent className="p-0">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(template.key)}
                    className="flex w-full items-start justify-between gap-3 border-b bg-background px-4 py-4 text-left transition-colors hover:bg-muted/30 lg:px-5"
                  >
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Exercise {templateIndex + 1}</p>
                      <p className="text-sm font-semibold">{template.label}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {template.criteria.length} criteria
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform',
                          expandedKeys.includes(template.key) ? 'rotate-180' : 'rotate-0',
                        )}
                      />
                    </div>
                  </button>

                  {expandedKeys.includes(template.key) ? (
                    <div className="space-y-5 p-4 lg:p-5">
                      <div className="flex items-start justify-end">
                        <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeExercise(templateIndex)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Exercise Key</Label>
                          <div className="rounded-md border bg-muted/40 px-3 py-2">
                            <p className="font-mono text-sm text-slate-700">{template.key}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Technical ID used by booking, debrief, and analytics. Keep this stable once the exercise is in use.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Exercise Label</Label>
                          <Input
                            value={template.label}
                            onChange={(event) => updateTemplate(templateIndex, { label: event.target.value })}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Description</Label>
                        <Textarea
                          rows={2}
                          value={template.description}
                          onChange={(event) => updateTemplate(templateIndex, { description: event.target.value })}
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Core Competency Focus</Label>
                          <p className="text-xs text-muted-foreground">These stay as the school-standard competency emphasis for the exercise.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {TRAINING_COMPETENCY_OPTIONS.map((option) => {
                            const isSelected = template.coreCompetencyKeys.includes(option.value);
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => toggleCoreCompetency(templateIndex, option.value)}
                                className={cn(
                                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                                  isSelected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                                )}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-4 border-t pt-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Default Assessment Criteria</p>
                            <p className="text-sm text-muted-foreground">These rows are the default criteria instructors will see before adding any flight-specific custom criteria.</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => addCriterion(templateIndex)}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Criterion
                          </Button>
                        </div>

                        <div className="space-y-3">
                          {template.criteria.map((criterion, criterionIndex) => (
                            <div key={`${criterion.key}-${criterionIndex}`} className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_1.4fr_auto]">
                              <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Criterion Key</Label>
                                <div className="rounded-md border bg-muted/40 px-3 py-2">
                                  <p className="font-mono text-sm text-slate-700">{criterion.key}</p>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Technical ID used by the debrief and analytics. Keep this stable once in use.
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Criterion Label</Label>
                                <Input
                                  value={criterion.label}
                                  onChange={(event) => updateCriterion(templateIndex, criterionIndex, { label: event.target.value })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Competency</Label>
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={criterion.competencyKey || 'none'}
                                    onValueChange={(value) => updateCriterion(templateIndex, criterionIndex, { competencyKey: value === 'none' ? undefined : value })}
                                  >
                                    <SelectTrigger className="min-w-[200px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No mapped competency</SelectItem>
                                      {TRAINING_COMPETENCY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeCriterion(templateIndex, criterionIndex)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
