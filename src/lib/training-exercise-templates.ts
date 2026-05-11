export interface TrainingExerciseCriterionTemplate {
  key: string;
  label: string;
  competencyKey?: string;
}

export interface TrainingExerciseTemplate {
  key: string;
  label: string;
  description: string;
  coreCompetencyKeys: string[];
  criteria: TrainingExerciseCriterionTemplate[];
}

export const TRAINING_EXERCISE_TEMPLATES: TrainingExerciseTemplate[] = [
  {
    key: 'general_handling',
    label: 'General Handling',
    description: 'Foundational aircraft control, coordination, trimming, and lookout during basic manoeuvring.',
    coreCompetencyKeys: ['airmanship', 'aircraft_handling', 'lookout', 'situational_awareness'],
    criteria: [
      { key: 'altitude_control', label: 'Altitude control', competencyKey: 'aircraft_handling' },
      { key: 'heading_control', label: 'Heading control', competencyKey: 'aircraft_handling' },
      { key: 'coordination', label: 'Coordination and balance', competencyKey: 'aircraft_handling' },
      { key: 'trim_use', label: 'Trim use and workload relief', competencyKey: 'workload_management' },
      { key: 'lookout_scan', label: 'Lookout and scan discipline', competencyKey: 'lookout' },
    ],
  },
  {
    key: 'circuits',
    label: 'Circuits',
    description: 'Pattern work, spacing, radio discipline, and profile management through the circuit.',
    coreCompetencyKeys: ['airmanship', 'circuit_discipline', 'radio_work', 'landing'],
    criteria: [
      { key: 'join_and_spacing', label: 'Join procedure and spacing', competencyKey: 'circuit_discipline' },
      { key: 'radio_calls', label: 'Circuit radio calls', competencyKey: 'radio_work' },
      { key: 'speed_profile', label: 'Speed and profile control', competencyKey: 'circuit_discipline' },
      { key: 'lookout_in_pattern', label: 'Lookout in the pattern', competencyKey: 'lookout' },
      { key: 'landing_execution', label: 'Approach stability and landing execution', competencyKey: 'landing' },
    ],
  },
  {
    key: 'stalls',
    label: 'Stalls',
    description: 'Recognition, prevention, and recovery from stalls with proper lookout and recovery discipline.',
    coreCompetencyKeys: ['aircraft_handling', 'situational_awareness', 'lookout', 'tem'],
    criteria: [
      { key: 'stall_setup', label: 'Set-up and pre-manoeuvre checks', competencyKey: 'checklist_discipline' },
      { key: 'recognition', label: 'Recognition of cues', competencyKey: 'situational_awareness' },
      { key: 'recovery_actions', label: 'Correct recovery actions', competencyKey: 'aircraft_handling' },
      { key: 'height_loss', label: 'Height loss management', competencyKey: 'aircraft_handling' },
      { key: 'safety_and_lookout', label: 'Safety and lookout', competencyKey: 'lookout' },
    ],
  },
  {
    key: 'forced_landing',
    label: 'Forced Landing',
    description: 'Engine failure handling, field selection, planning, and priorities under pressure.',
    coreCompetencyKeys: ['decision_making', 'situational_awareness', 'workload_management', 'tem'],
    criteria: [
      { key: 'immediate_actions', label: 'Immediate actions and priorities', competencyKey: 'workload_management' },
      { key: 'field_selection', label: 'Field selection and assessment', competencyKey: 'decision_making' },
      { key: 'plan_and_profile', label: 'Plan, pattern, and profile', competencyKey: 'navigation' },
      { key: 'checks_and_restart', label: 'Checks and restart drill', competencyKey: 'checklist_discipline' },
      { key: 'communication_brief', label: 'Communication and passenger brief', competencyKey: 'communication' },
    ],
  },
  {
    key: 'navigation',
    label: 'Navigation',
    description: 'Route keeping, timing, diversion management, and situational awareness while navigating.',
    coreCompetencyKeys: ['navigation', 'situational_awareness', 'workload_management', 'decision_making'],
    criteria: [
      { key: 'route_tracking', label: 'Route and track keeping', competencyKey: 'navigation' },
      { key: 'time_management', label: 'Timing and waypoint management', competencyKey: 'navigation' },
      { key: 'map_scan', label: 'Chart use and position awareness', competencyKey: 'situational_awareness' },
      { key: 'diversion_management', label: 'Diversion and re-planning', competencyKey: 'decision_making' },
      { key: 'workload_priorities', label: 'Workload and priorities', competencyKey: 'workload_management' },
    ],
  },
];

export const DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY = 'general_handling';

export const TRAINING_EXERCISE_TEMPLATE_OPTIONS = TRAINING_EXERCISE_TEMPLATES.map((template) => ({
  value: template.key,
  label: template.label,
})) as Array<{ value: string; label: string }>;

export const getTrainingExerciseTemplate = (key?: string | null) =>
  TRAINING_EXERCISE_TEMPLATES.find((template) => template.key === key) || null;
