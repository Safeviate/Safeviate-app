import type { StudentProgressCriterionRating, StudentProgressReport } from '@/types/training';
import {
  TRAINING_EXERCISE_TEMPLATES,
  type TrainingExerciseTemplate,
} from '@/lib/training-exercise-templates';

export type ExerciseProgressStatus =
  | 'not_started'
  | 'introduced'
  | 'practising'
  | 'consolidating'
  | 'competent'
  | 'needs_review';

export type ExerciseTrend = 'improving' | 'steady' | 'declining';

export type ReadinessSignal = 'ready' | 'watch' | 'blocked';

export interface ExerciseCriterionInsight {
  key: string;
  label: string;
  averageRating: number;
  latestRating: number;
  attemptCount: number;
  lastComment?: string;
}

export interface ExerciseProgressSummary {
  templateKey: string;
  label: string;
  description: string;
  attemptCount: number;
  latestRating: number | null;
  averageRating: number | null;
  lastFlown: string | null;
  trend: ExerciseTrend;
  status: ExerciseProgressStatus;
  strengths: ExerciseCriterionInsight[];
  focusCriteria: ExerciseCriterionInsight[];
  latestComment?: string;
}

export interface ExerciseReadinessFlag {
  key: string;
  label: string;
  signal: ReadinessSignal;
  detail: string;
}

export interface ExerciseCurrencyItem {
  key: string;
  label: string;
  lastFlown: string | null;
  daysSince: number | null;
}

type ExerciseAttempt = {
  date: string;
  timestamp: number;
  rating: number;
  comment?: string;
  criteria: StudentProgressCriterionRating[];
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const round1 = (value: number) => parseFloat(value.toFixed(1));

const daysSince = (value?: string | null, reference = new Date()) => {
  const date = parseDate(value);
  if (!date) return null;
  const diff = reference.getTime() - date.getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const deriveTrend = (attempts: ExerciseAttempt[]): ExerciseTrend => {
  if (attempts.length < 2) return 'steady';
  const latestWindow = attempts.slice(0, Math.min(2, attempts.length));
  const priorWindow = attempts.slice(2, Math.min(4, attempts.length));
  const latestAverage = latestWindow.reduce((sum, item) => sum + item.rating, 0) / latestWindow.length;
  const baseline = priorWindow.length > 0
    ? priorWindow.reduce((sum, item) => sum + item.rating, 0) / priorWindow.length
    : attempts[attempts.length - 1].rating;
  const delta = latestAverage - baseline;
  if (delta >= 0.5) return 'improving';
  if (delta <= -0.5) return 'declining';
  return 'steady';
};

const deriveStatus = (attempts: ExerciseAttempt[], trend: ExerciseTrend): ExerciseProgressStatus => {
  if (attempts.length === 0) return 'not_started';
  if (attempts.length === 1) return 'introduced';

  const latest = attempts[0].rating;
  const average = attempts.reduce((sum, item) => sum + item.rating, 0) / attempts.length;
  const recentLowRatings = attempts.slice(0, Math.min(2, attempts.length)).filter((item) => item.rating <= 2).length;

  if (latest <= 2 || recentLowRatings >= 1 || trend === 'declining') {
    return 'needs_review';
  }
  if (average >= 4.2 && latest >= 4) {
    return 'competent';
  }
  if (average >= 3.5) {
    return 'consolidating';
  }
  return 'practising';
};

const buildCriterionInsights = (attempts: ExerciseAttempt[]) => {
  const criterionMap = new Map<
    string,
    {
      key: string;
      label: string;
      ratings: number[];
      latestRating: number;
      lastComment?: string;
    }
  >();

  attempts.forEach((attempt, attemptIndex) => {
    attempt.criteria.forEach((criterion) => {
      const criterionKey = criterion.key || criterion.id || criterion.label;
      const existing = criterionMap.get(criterionKey);
      if (existing) {
        existing.ratings.push(criterion.rating);
        if (attemptIndex === 0) {
          existing.latestRating = criterion.rating;
          existing.lastComment = criterion.comment;
        }
        return;
      }
      criterionMap.set(criterionKey, {
        key: criterionKey,
        label: criterion.label,
        ratings: [criterion.rating],
        latestRating: criterion.rating,
        lastComment: criterion.comment,
      });
    });
  });

  return Array.from(criterionMap.values()).map((criterion) => ({
    key: criterion.key,
    label: criterion.label,
    averageRating: round1(criterion.ratings.reduce((sum, value) => sum + value, 0) / criterion.ratings.length),
    latestRating: criterion.latestRating,
    attemptCount: criterion.ratings.length,
    lastComment: criterion.lastComment,
  }));
};

const buildAttemptsForTemplate = (reports: StudentProgressReport[], templateKey: string): ExerciseAttempt[] =>
  reports
    .flatMap((report) =>
      report.entries
        .filter((entry) => entry.exerciseTemplateKey === templateKey)
        .map((entry) => {
          const date = report.date;
          const parsed = parseDate(date);
          return {
            date,
            timestamp: parsed?.getTime() || 0,
            rating: entry.rating,
            comment: entry.comment,
            criteria: Array.isArray(entry.criteriaRatings) ? entry.criteriaRatings : [],
          } satisfies ExerciseAttempt;
        }),
    )
    .sort((a, b) => b.timestamp - a.timestamp);

export const buildExerciseProgressSummary = (
  reports: StudentProgressReport[],
  templates: TrainingExerciseTemplate[] = TRAINING_EXERCISE_TEMPLATES,
): ExerciseProgressSummary[] =>
  templates.map((template) => {
    const attempts = buildAttemptsForTemplate(reports, template.key);
    const latestRating = attempts[0]?.rating ?? null;
    const averageRating = attempts.length > 0
      ? round1(attempts.reduce((sum, attempt) => sum + attempt.rating, 0) / attempts.length)
      : null;
    const trend = deriveTrend(attempts);
    const criterionInsights = buildCriterionInsights(attempts);
    const strengths = criterionInsights
      .filter((criterion) => criterion.averageRating >= 4)
      .sort((a, b) => b.averageRating - a.averageRating)
      .slice(0, 3);
    const focusCriteria = criterionInsights
      .filter((criterion) => criterion.averageRating <= 3.2 || criterion.latestRating <= 2)
      .sort((a, b) => a.averageRating - b.averageRating)
      .slice(0, 3);

    return {
      templateKey: template.key,
      label: template.label,
      description: template.description,
      attemptCount: attempts.length,
      latestRating,
      averageRating,
      lastFlown: attempts[0]?.date ?? null,
      trend,
      status: deriveStatus(attempts, trend),
      strengths,
      focusCriteria,
      latestComment: attempts[0]?.comment,
    } satisfies ExerciseProgressSummary;
  });

export const buildExerciseCurrencySummary = (
  summaries: ExerciseProgressSummary[],
  exerciseKeys: string[],
): ExerciseCurrencyItem[] =>
  exerciseKeys.map((exerciseKey) => {
    const summary = summaries.find((item) => item.templateKey === exerciseKey);
    return {
      key: exerciseKey,
      label: summary?.label || exerciseKey,
      lastFlown: summary?.lastFlown || null,
      daysSince: daysSince(summary?.lastFlown || null),
    };
  });

export const buildExerciseReadinessFlags = (
  summaries: ExerciseProgressSummary[],
): ExerciseReadinessFlag[] => {
  const byKey = new Map(summaries.map((summary) => [summary.templateKey, summary]));

  const circuit = byKey.get('exer-13-circuit-approach-and-landing');
  const takeoff = byKey.get('exer-12-takeoff-and-climb-to-downwind');
  const circuitEmergencies = byKey.get('exer-12-13e-emergencies');
  const forcedLanding = byKey.get('exer-16-forced-landing-without-power');
  const navigation = byKey.get('exer-18a-navigation');
  const instrument = byKey.get('exer-19-basic-instrument-flight');

  const isSoloReady = !!takeoff
    && !!circuit
    && !!circuitEmergencies
    && ['consolidating', 'competent'].includes(takeoff.status)
    && ['consolidating', 'competent'].includes(circuit.status)
    && circuit.latestRating !== null
    && circuit.latestRating >= 4
    && takeoff.latestRating !== null
    && takeoff.latestRating >= 4
    && circuitEmergencies.status !== 'needs_review';

  const needsCircuitConsolidation = !circuit || ['introduced', 'practising', 'needs_review'].includes(circuit.status);
  const emergencyReviewDue = [circuitEmergencies, forcedLanding]
    .filter(Boolean)
    .some((summary) => !summary || summary.status === 'needs_review' || (daysSince(summary.lastFlown) ?? 999) > 45);
  const navigationReady = !!takeoff
    && !!circuit
    && ['consolidating', 'competent'].includes(takeoff.status)
    && ['consolidating', 'competent'].includes(circuit.status)
    && (!forcedLanding || forcedLanding.status !== 'needs_review');
  const instrumentCurrent = instrument && (daysSince(instrument.lastFlown) ?? 999) <= 60;

  return [
    {
      key: 'first-solo',
      label: 'First Solo Readiness',
      signal: isSoloReady ? 'ready' : needsCircuitConsolidation ? 'blocked' : 'watch',
      detail: isSoloReady
        ? 'Circuit, takeoff, and emergency handling are trending at a safe pre-solo level.'
        : needsCircuitConsolidation
          ? 'Continue circuit consolidation before releasing the student for first solo.'
          : 'Close out the remaining gaps in circuit emergency handling before solo release.',
    },
    {
      key: 'emergency-discipline',
      label: 'Emergency Drill Discipline',
      signal: emergencyReviewDue ? 'watch' : 'ready',
      detail: emergencyReviewDue
        ? 'Emergency exercises are stale or still showing weak ratings and should be revisited.'
        : 'Emergency drill currency looks healthy across the recent exercise set.',
    },
    {
      key: 'navigation-readiness',
      label: 'Navigation Readiness',
      signal: navigationReady ? (navigation?.attemptCount ? 'ready' : 'watch') : 'blocked',
      detail: navigationReady
        ? navigation?.attemptCount
          ? 'Navigation prerequisites are stable and the student has already started navigation work.'
          : 'Handling and circuit foundations look stable enough to begin navigation exercises.'
        : 'Navigation should wait until takeoff, circuit, and forced-landing control are more consistent.',
    },
    {
      key: 'instrument-currency',
      label: 'Instrument Currency',
      signal: instrumentCurrent ? 'ready' : 'watch',
      detail: instrumentCurrent
        ? 'Basic instrument exposure is still current.'
        : 'Instrument exposure is stale or not yet started, so a refresher will be useful before relying on it.',
    },
  ];
};

export const getExerciseStatusMeta = (status: ExerciseProgressStatus) => {
  switch (status) {
    case 'competent':
      return {
        label: 'Competent',
        badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
      };
    case 'consolidating':
      return {
        label: 'Consolidating',
        badge: 'bg-sky-500/10 text-sky-700 border-sky-200',
      };
    case 'practising':
      return {
        label: 'Practising',
        badge: 'bg-amber-500/10 text-amber-700 border-amber-200',
      };
    case 'introduced':
      return {
        label: 'Introduced',
        badge: 'bg-violet-500/10 text-violet-700 border-violet-200',
      };
    case 'needs_review':
      return {
        label: 'Needs Review',
        badge: 'bg-rose-500/10 text-rose-700 border-rose-200',
      };
    default:
      return {
        label: 'Not Started',
        badge: 'bg-slate-500/10 text-slate-700 border-slate-200',
      };
  }
};

export const getTrendMeta = (trend: ExerciseTrend) => {
  switch (trend) {
    case 'improving':
      return { label: 'Improving', tone: 'text-emerald-700' };
    case 'declining':
      return { label: 'Declining', tone: 'text-rose-700' };
    default:
      return { label: 'Steady', tone: 'text-amber-700' };
  }
};

