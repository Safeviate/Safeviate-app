import type { CompetencySignal, PerformanceRating, StudentProgressEntry } from '@/types/training';

export interface TrainingCompetencyDefinition {
  key: string;
  label: string;
  keywords: string[];
  nextAction: string;
  strengthBias: number;
  growthBias: number;
}

export interface TrainingCompetencyArea {
  key: string;
  label: string;
  score: number;
  sampleCount: number;
  trend: number;
  lastSeen: string | null;
  signal: CompetencySignal;
  nextAction: string;
}

export const TRAINING_COMPETENCY_DEFINITIONS: TrainingCompetencyDefinition[] = [
  {
    key: 'communication',
    label: 'Communication',
    keywords: ['communication', 'briefing', 'debrief', 'verbal', 'cockpit communication'],
    nextAction: 'Coach cockpit communication and briefing flow',
    strengthBias: 1,
    growthBias: 1,
  },
  {
    key: 'radio_work',
    label: 'Radio Work',
    keywords: ['radio', 'rt', 'phraseology', 'readback', 'frequency', 'transmission'],
    nextAction: 'Practice radio phraseology and readbacks',
    strengthBias: 1,
    growthBias: 1,
  },
  {
    key: 'atc_compliance',
    label: 'ATC Compliance',
    keywords: ['atc', 'instruction', 'clearance', 'comply', 'readback', 'hold short'],
    nextAction: 'Reinforce ATC listening and compliance discipline',
    strengthBias: 1,
    growthBias: 1.05,
  },
  {
    key: 'airmanship',
    label: 'Airmanship',
    keywords: ['airmanship', 'discipline', 'professional', 'smooth', 'anticipation'],
    nextAction: 'Reinforce airmanship habits and professionalism',
    strengthBias: 1.05,
    growthBias: 0.95,
  },
  {
    key: 'aircraft_handling',
    label: 'Aircraft Handling',
    keywords: ['handling', 'trim', 'coordination', 'control', 'altitude', 'airspeed', 'heading'],
    nextAction: 'Repeat aircraft handling drills',
    strengthBias: 1,
    growthBias: 1,
  },
  {
    key: 'checklist_discipline',
    label: 'Checklist Discipline',
    keywords: ['checklist', 'flow', 'before start', 'after landing', 'preflight check'],
    nextAction: 'Tighten checklist timing and discipline',
    strengthBias: 1,
    growthBias: 1.05,
  },
  {
    key: 'situational_awareness',
    label: 'Situational Awareness',
    keywords: ['situational awareness', 'awareness', 'traffic picture', 'position awareness', 'orientation'],
    nextAction: 'Build stronger traffic and position awareness',
    strengthBias: 1.05,
    growthBias: 1,
  },
  {
    key: 'workload_management',
    label: 'Workload Management',
    keywords: ['workload', 'task management', 'prioritise', 'prioritize', 'aviate navigate communicate'],
    nextAction: 'Coach task prioritisation under workload',
    strengthBias: 0.95,
    growthBias: 1.05,
  },
  {
    key: 'decision_making',
    label: 'Decision Making',
    keywords: ['decision', 'judgement', 'judgment', 'choice', 'diversion', 'risk call'],
    nextAction: 'Debrief decision points and safer alternatives',
    strengthBias: 0.95,
    growthBias: 1.05,
  },
  {
    key: 'navigation',
    label: 'Navigation',
    keywords: ['navigation', 'route', 'waypoint', 'track', 'heading bug', 'map reading'],
    nextAction: 'Run a navigation-focused exercise',
    strengthBias: 1,
    growthBias: 1,
  },
  {
    key: 'circuit_discipline',
    label: 'Circuit Discipline',
    keywords: ['circuit', 'pattern', 'downwind', 'base', 'final', 'join'],
    nextAction: 'Rehearse circuit spacing and profile discipline',
    strengthBias: 1,
    growthBias: 1,
  },
  {
    key: 'takeoff',
    label: 'Takeoff',
    keywords: ['takeoff', 'rotate', 'rotation', 'climb out', 'centerline'],
    nextAction: 'Repeat takeoff setup and climb-out drills',
    strengthBias: 1,
    growthBias: 1,
  },
  {
    key: 'landing',
    label: 'Landing',
    keywords: ['landing', 'flare', 'roundout', 'touchdown', 'approach stability'],
    nextAction: 'Focus on approach stability and landing consistency',
    strengthBias: 1,
    growthBias: 1,
  },
  {
    key: 'lookout',
    label: 'Lookout',
    keywords: ['lookout', 'scan', 'scanning', 'clearing turn', 'visual'],
    nextAction: 'Reinforce visual scan and lookout habits',
    strengthBias: 1.05,
    growthBias: 0.95,
  },
  {
    key: 'sop_compliance',
    label: 'SOP Compliance',
    keywords: ['sop', 'procedure', 'standard operating', 'company procedure', 'school procedure'],
    nextAction: 'Review SOP adherence and standard calls',
    strengthBias: 1,
    growthBias: 1.05,
  },
  {
    key: 'tem',
    label: 'Threat & Error Management',
    keywords: ['threat', 'error', 'tem', 'trap', 'recover', 'manage threats'],
    nextAction: 'Practice recognising and trapping threats early',
    strengthBias: 0.95,
    growthBias: 1.05,
  },
  {
    key: 'independence',
    label: 'Independence',
    keywords: ['independent', 'prompting', 'support needed', 'self-directed', 'intervention'],
    nextAction: 'Reduce instructor prompting through repetition',
    strengthBias: 1,
    growthBias: 1,
  },
  {
    key: 'professionalism',
    label: 'Professionalism',
    keywords: ['professional', 'prepared', 'punctual', 'attitude', 'discipline'],
    nextAction: 'Reinforce preparation and cockpit discipline',
    strengthBias: 1,
    growthBias: 1,
  },
];

export const DEFAULT_TRAINING_COMPETENCY_KEY = 'airmanship';

export const TRAINING_COMPETENCY_OPTIONS = TRAINING_COMPETENCY_DEFINITIONS.map((competency) => ({
  value: competency.key,
  label: competency.label,
})) as Array<{ value: string; label: string }>;

export const resolveTrainingCompetencies = (entry: StudentProgressEntry) => {
  if (entry.competencyKey) {
    const normalized = entry.competencyKey.toLowerCase();
    const directMatch = TRAINING_COMPETENCY_DEFINITIONS.filter(
      (definition) => definition.key === normalized || definition.label.toLowerCase() === normalized
    );
    if (directMatch.length > 0) {
      return directMatch;
    }
  }

  const text = `${entry.exercise || ''} ${entry.comment || ''}`.toLowerCase();
  return TRAINING_COMPETENCY_DEFINITIONS.filter((definition) =>
    definition.keywords.some((keyword) => text.includes(keyword))
  );
};

const expandEntryObservations = (entry: StudentProgressEntry) => {
  const criteriaRatings = Array.isArray(entry.criteriaRatings) ? entry.criteriaRatings : [];

  if (criteriaRatings.length === 0) {
    return [entry];
  }

  return criteriaRatings.map((criterion) => ({
    ...entry,
    exercise: criterion.label || entry.exercise,
    rating: criterion.rating,
    comment: criterion.comment || entry.comment,
    competencyKey: criterion.competencyKey || entry.competencyKey,
  }));
};

export const getTrainingCompetencySignal = (
  rating: PerformanceRating,
  storedSignal?: CompetencySignal
): CompetencySignal => {
  if (storedSignal) return storedSignal;
  if (rating >= 4) return 'strength';
  if (rating <= 2) return 'growth';
  return 'watch';
};

export const buildTrainingCompetencyAreas = (
  reports: Array<{ date: string; entries: StudentProgressEntry[] }>
): TrainingCompetencyArea[] => {
  const buckets = new Map<
    string,
    {
      label: string;
      scoreTotal: number;
      sampleCount: number;
      trendTotal: number;
      signalVotes: Record<CompetencySignal, number>;
      lastSeen: string | null;
      nextAction: string;
    }
  >();

  TRAINING_COMPETENCY_DEFINITIONS.forEach((definition) => {
    buckets.set(definition.key, {
      label: definition.label,
      scoreTotal: 0,
      sampleCount: 0,
      trendTotal: 0,
      signalVotes: { strength: 0, growth: 0, watch: 0 },
      lastSeen: null,
      nextAction: definition.nextAction,
    });
  });

  const sortedReports = [...reports].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  sortedReports.forEach((report, reportIndex) => {
    const reportWeight = Math.max(0.4, 1 - reportIndex * 0.12);
    report.entries.forEach((entry) => {
      expandEntryObservations(entry).forEach((observation) => {
        const matches = resolveTrainingCompetencies(observation);
        if (matches.length === 0) return;

        matches.forEach((definition) => {
          const bucket = buckets.get(definition.key);
          if (!bucket) return;
          const normalizedRating = Math.max(0, Math.min(1, (observation.rating - 1) / 4));
          bucket.scoreTotal +=
            normalizedRating *
            100 *
            reportWeight *
            (observation.rating >= 4 ? definition.strengthBias : definition.growthBias);
          bucket.trendTotal += observation.rating;
          bucket.sampleCount += 1;
          const signal = getTrainingCompetencySignal(observation.rating, observation.competencySignal);
          bucket.signalVotes[signal] += reportWeight;
          bucket.lastSeen =
            bucket.lastSeen && new Date(bucket.lastSeen).getTime() > new Date(report.date).getTime()
              ? bucket.lastSeen
              : report.date;
        });
      });
    });
  });

  return Array.from(buckets.entries())
    .map(([key, bucket]) => {
      const averageScore = bucket.sampleCount > 0 ? bucket.scoreTotal / bucket.sampleCount : 0;
      const averageRating = bucket.sampleCount > 0 ? bucket.trendTotal / bucket.sampleCount : 0;
      const voteSignal = (Object.entries(bucket.signalVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        null) as CompetencySignal | null;
      const signal: CompetencySignal =
        voteSignal || (averageRating >= 4.2 ? 'strength' : averageRating <= 2.5 ? 'growth' : 'watch');

      return {
        key,
        label: bucket.label,
        score: parseFloat(averageScore.toFixed(1)),
        sampleCount: bucket.sampleCount,
        trend: parseFloat(averageRating.toFixed(1)),
        lastSeen: bucket.lastSeen,
        signal,
        nextAction: bucket.nextAction,
      };
    })
    .filter((area) => area.sampleCount > 0)
    .sort((a, b) => {
      if (a.signal !== b.signal) {
        if (a.signal === 'growth') return -1;
        if (b.signal === 'growth') return 1;
        if (a.signal === 'watch') return -1;
        if (b.signal === 'watch') return 1;
      }
      return a.score - b.score;
    });
};
