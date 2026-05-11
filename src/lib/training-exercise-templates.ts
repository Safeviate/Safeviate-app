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

export const TRAINING_EXERCISE_CONFIG_KEY = 'training-exercise-templates';

const buildCriteria = (
  items: Array<[key: string, label: string, competencyKey?: string]>,
): TrainingExerciseCriterionTemplate[] =>
  items.map(([key, label, competencyKey]) => ({ key, label, competencyKey }));

export const TRAINING_EXERCISE_TEMPLATES: TrainingExerciseTemplate[] = [
  {
    key: 'exer-1-familiarisation',
    label: 'Exer 1 Familiarisation with the Aircraft',
    description: 'Initial cockpit orientation, aircraft layout familiarity, and safe handling awareness around the aircraft.',
    coreCompetencyKeys: ['airmanship', 'checklist_discipline', 'situational_awareness', 'professionalism'],
    criteria: buildCriteria([
      ['cockpit_orientation', 'Cockpit orientation and aircraft layout knowledge', 'situational_awareness'],
      ['systems_familiarity', 'Aircraft systems and controls familiarity', 'aircraft_handling'],
      ['preflight_discipline', 'Pre-flight discipline and preparation', 'checklist_discipline'],
      ['safety_briefing', 'Safety awareness and cockpit briefing', 'airmanship'],
    ]),
  },
  {
    key: 'exer-1e-emergency-drills',
    label: 'Exer 1E Emergency Drills',
    description: 'Immediate emergency responses, drills, and disciplined recall of critical actions.',
    coreCompetencyKeys: ['checklist_discipline', 'workload_management', 'decision_making', 'tem'],
    criteria: buildCriteria([
      ['memory_items', 'Memory items and immediate actions', 'checklist_discipline'],
      ['drill_sequence', 'Correct drill sequence', 'workload_management'],
      ['threat_management', 'Threat recognition and prioritisation', 'tem'],
      ['communication', 'Emergency communication discipline', 'communication'],
    ]),
  },
  {
    key: 'exer-2-preparation-and-action-after-flight',
    label: 'Exer 2 Preparation for and Action After Flight',
    description: 'Preparation for flight, shutdown flow, and disciplined post-flight actions.',
    coreCompetencyKeys: ['checklist_discipline', 'professionalism', 'airmanship', 'workload_management'],
    criteria: buildCriteria([
      ['flight_preparation', 'Flight preparation and planning readiness', 'checklist_discipline'],
      ['documents', 'Documentation and aircraft readiness checks', 'professionalism'],
      ['shutdown', 'Shutdown and securing procedure', 'checklist_discipline'],
      ['post_flight_actions', 'Post-flight actions and reporting', 'airmanship'],
    ]),
  },
  {
    key: 'exer-3-air-experience',
    label: 'Exer 3 Air Experience',
    description: 'Initial airborne exposure, comfort, lookout, and basic awareness in the air environment.',
    coreCompetencyKeys: ['airmanship', 'lookout', 'situational_awareness', 'aircraft_handling'],
    criteria: buildCriteria([
      ['air_comfort', 'Comfort and orientation in the air', 'situational_awareness'],
      ['lookout_scan', 'Lookout and visual scan', 'lookout'],
      ['basic_control_awareness', 'Awareness of attitude and movement', 'aircraft_handling'],
      ['airmanship_basics', 'Basic airmanship in the air', 'airmanship'],
    ]),
  },
  {
    key: 'exer-4-effects-of-control',
    label: 'Exer 4 Effects of Control',
    description: 'Recognition of primary and secondary effects of controls and coordinated aircraft response.',
    coreCompetencyKeys: ['aircraft_handling', 'situational_awareness', 'airmanship'],
    criteria: buildCriteria([
      ['pitch_effects', 'Effects of elevator input', 'aircraft_handling'],
      ['roll_effects', 'Effects of aileron input', 'aircraft_handling'],
      ['yaw_effects', 'Effects of rudder input', 'aircraft_handling'],
      ['coordination', 'Coordination and secondary effects awareness', 'situational_awareness'],
    ]),
  },
  {
    key: 'exer-5-taxiing',
    label: 'Exer 5 Taxiing',
    description: 'Ground movement, steering control, power management, and taxi discipline.',
    coreCompetencyKeys: ['airmanship', 'lookout', 'aircraft_handling', 'sop_compliance'],
    criteria: buildCriteria([
      ['steering_control', 'Steering and directional control', 'aircraft_handling'],
      ['speed_control', 'Taxi speed and brake management', 'aircraft_handling'],
      ['taxi_lookout', 'Ground lookout and hazard awareness', 'lookout'],
      ['taxi_procedures', 'Taxi procedures and discipline', 'sop_compliance'],
    ]),
  },
  {
    key: 'exer-5e-emergencies',
    label: 'Exer 5E Emergencies',
    description: 'Emergency handling during ground operations and taxi phase.',
    coreCompetencyKeys: ['decision_making', 'workload_management', 'tem', 'communication'],
    criteria: buildCriteria([
      ['ground_emergency_response', 'Immediate response to ground emergencies', 'decision_making'],
      ['stop_or_continue', 'Stop / continue judgement', 'decision_making'],
      ['ground_coordination', 'Coordination and communication on the ground', 'communication'],
      ['threat_management', 'Threat and error management during taxi', 'tem'],
    ]),
  },
  {
    key: 'exer-6-straight-and-level',
    label: 'Exer 6 Straight and Level Flight',
    description: 'Stabilised straight and level flight with accurate attitude, trim, and scan.',
    coreCompetencyKeys: ['aircraft_handling', 'lookout', 'workload_management', 'airmanship'],
    criteria: buildCriteria([
      ['altitude_control', 'Altitude control', 'aircraft_handling'],
      ['heading_control', 'Heading control', 'aircraft_handling'],
      ['trim_use', 'Trim use and balance', 'workload_management'],
      ['lookout_scan', 'Lookout and scan discipline', 'lookout'],
    ]),
  },
  {
    key: 'exer-7-climbing',
    label: 'Exer 7 Climbing',
    description: 'Attitude, power, trim, and lookout management during climb.',
    coreCompetencyKeys: ['aircraft_handling', 'lookout', 'airmanship', 'workload_management'],
    criteria: buildCriteria([
      ['climb_attitude', 'Climb attitude and pitch control', 'aircraft_handling'],
      ['speed_control', 'Airspeed control in the climb', 'aircraft_handling'],
      ['trim_and_power', 'Trim and power coordination', 'workload_management'],
      ['climb_lookout', 'Lookout during climb', 'lookout'],
    ]),
  },
  {
    key: 'exer-8-descending',
    label: 'Exer 8 Descending',
    description: 'Controlled descent management with accurate speed, attitude, and planning.',
    coreCompetencyKeys: ['aircraft_handling', 'situational_awareness', 'workload_management', 'airmanship'],
    criteria: buildCriteria([
      ['descent_attitude', 'Descent attitude and profile', 'aircraft_handling'],
      ['speed_control', 'Airspeed control in descent', 'aircraft_handling'],
      ['planning', 'Descent planning and anticipation', 'situational_awareness'],
      ['trim_and_balance', 'Trim and balance management', 'workload_management'],
    ]),
  },
  {
    key: 'exer-9-turning',
    label: 'Exer 9 Turning',
    description: 'Entry, maintenance, and rollout from balanced medium turns.',
    coreCompetencyKeys: ['aircraft_handling', 'lookout', 'situational_awareness', 'airmanship'],
    criteria: buildCriteria([
      ['turn_entry', 'Turn entry and rate establishment', 'aircraft_handling'],
      ['balance', 'Balance and coordination', 'aircraft_handling'],
      ['rollout_accuracy', 'Rollout accuracy', 'aircraft_handling'],
      ['clearing_turns', 'Clearing turns and lookout', 'lookout'],
    ]),
  },
  {
    key: 'exer-10a-slow-flight',
    label: 'Exer 10A Slow Flight',
    description: 'Controlled handling in slow-flight conditions with awareness of aircraft cues and margins.',
    coreCompetencyKeys: ['aircraft_handling', 'situational_awareness', 'lookout', 'tem'],
    criteria: buildCriteria([
      ['configuration_control', 'Configuration and power management', 'aircraft_handling'],
      ['attitude_control', 'Attitude control in slow flight', 'aircraft_handling'],
      ['stall_awareness', 'Awareness of margins and cues', 'situational_awareness'],
      ['safety_scan', 'Safety and lookout', 'lookout'],
    ]),
  },
  {
    key: 'exer-10b-stalling',
    label: 'Exer 10B Stalling',
    description: 'Recognition, stall prevention, and disciplined recovery actions.',
    coreCompetencyKeys: ['aircraft_handling', 'situational_awareness', 'lookout', 'tem'],
    criteria: buildCriteria([
      ['setup_checks', 'Set-up and pre-manoeuvre checks', 'checklist_discipline'],
      ['cue_recognition', 'Recognition of stall cues', 'situational_awareness'],
      ['recovery', 'Correct stall recovery', 'aircraft_handling'],
      ['height_loss', 'Height loss management', 'aircraft_handling'],
    ]),
  },
  {
    key: 'exer-11-spin-avoidance',
    label: 'Exer 11 Spin Avoidance',
    description: 'Recognition of spin-entry conditions and correct avoidance technique.',
    coreCompetencyKeys: ['situational_awareness', 'aircraft_handling', 'tem', 'decision_making'],
    criteria: buildCriteria([
      ['entry_recognition', 'Recognition of spin-entry conditions', 'situational_awareness'],
      ['prevention_actions', 'Prompt avoidance actions', 'aircraft_handling'],
      ['coordinated_control', 'Coordination and balance awareness', 'aircraft_handling'],
      ['risk_judgement', 'Risk judgement and margins', 'decision_making'],
    ]),
  },
  {
    key: 'exer-12-takeoff-and-climb-to-downwind',
    label: 'Exer 12 Take Off and Climb to Downwind Position',
    description: 'Run-up, takeoff, climb-out, and positioning to downwind with correct discipline.',
    coreCompetencyKeys: ['takeoff', 'circuit_discipline', 'radio_work', 'lookout'],
    criteria: buildCriteria([
      ['takeoff_run', 'Takeoff run and directional control', 'takeoff'],
      ['rotation_and_climb', 'Rotation and climb-out profile', 'takeoff'],
      ['downwind_positioning', 'Positioning to downwind', 'circuit_discipline'],
      ['radio_calls', 'Departure and circuit radio calls', 'radio_work'],
    ]),
  },
  {
    key: 'exer-13-circuit-approach-and-landing',
    label: 'Exer 13 Circuit, Approach and Landing',
    description: 'Pattern management, approach stability, landing technique, and post-landing control.',
    coreCompetencyKeys: ['circuit_discipline', 'landing', 'radio_work', 'lookout'],
    criteria: buildCriteria([
      ['circuit_management', 'Circuit spacing and profile', 'circuit_discipline'],
      ['approach_stability', 'Approach stability', 'landing'],
      ['landing_technique', 'Landing and flare technique', 'landing'],
      ['after_landing', 'After-landing control and discipline', 'airmanship'],
    ]),
  },
  {
    key: 'exer-12-13e-emergencies',
    label: 'Exer 12/13E Emergencies',
    description: 'Emergency scenarios during takeoff, circuit, approach, and landing phases.',
    coreCompetencyKeys: ['decision_making', 'workload_management', 'tem', 'communication'],
    criteria: buildCriteria([
      ['takeoff_emergency', 'Takeoff / climb emergency response', 'decision_making'],
      ['circuit_emergency', 'Circuit emergency judgement', 'decision_making'],
      ['workload_control', 'Workload control under pressure', 'workload_management'],
      ['emergency_comms', 'Emergency communication and coordination', 'communication'],
    ]),
  },
  {
    key: 'exer-14-first-solo',
    label: 'Exer 14 First Solo',
    description: 'Solo readiness, independence, discipline, and safe execution without instructor prompting.',
    coreCompetencyKeys: ['independence', 'airmanship', 'circuit_discipline', 'decision_making'],
    criteria: buildCriteria([
      ['solo_readiness', 'Solo readiness and discipline', 'independence'],
      ['self_management', 'Self-management in the circuit', 'independence'],
      ['safe_decisions', 'Safe go / no-go decision-making', 'decision_making'],
      ['solo_airmanship', 'Professional solo airmanship', 'airmanship'],
    ]),
  },
  {
    key: 'exer-15-advanced-turning',
    label: 'Exer 15 Advanced Turning',
    description: 'Steeper and more precise turning with strong scan, balance, and recovery discipline.',
    coreCompetencyKeys: ['aircraft_handling', 'lookout', 'situational_awareness', 'workload_management'],
    criteria: buildCriteria([
      ['entry_precision', 'Precise turn entry', 'aircraft_handling'],
      ['bank_and_balance', 'Bank angle and balance control', 'aircraft_handling'],
      ['altitude_heading', 'Altitude and heading accuracy', 'aircraft_handling'],
      ['recovery_precision', 'Recovery and rollout precision', 'workload_management'],
    ]),
  },
  {
    key: 'exer-16-forced-landing-without-power',
    label: 'Exer 16 Forced Landing Without Power',
    description: 'Engine failure management, field choice, planning, and disciplined forced-landing execution.',
    coreCompetencyKeys: ['decision_making', 'navigation', 'workload_management', 'tem'],
    criteria: buildCriteria([
      ['immediate_actions', 'Immediate actions and priorities', 'workload_management'],
      ['field_selection', 'Field selection and suitability', 'decision_making'],
      ['approach_plan', 'Approach plan and profile', 'navigation'],
      ['restart_and_checks', 'Restart attempts and checks', 'checklist_discipline'],
    ]),
  },
  {
    key: 'exer-17a-low-level-flying',
    label: 'Exer 17A Low Level Flying',
    description: 'Low-level handling with strong lookout, terrain awareness, and threat management.',
    coreCompetencyKeys: ['situational_awareness', 'lookout', 'tem', 'airmanship'],
    criteria: buildCriteria([
      ['terrain_awareness', 'Terrain and obstacle awareness', 'situational_awareness'],
      ['height_discipline', 'Height and profile discipline', 'airmanship'],
      ['lookout_scan', 'Lookout and visual scanning', 'lookout'],
      ['risk_management', 'Low-level threat management', 'tem'],
    ]),
  },
  {
    key: 'exer-17b-precautionary-landing',
    label: 'Exer 17B Precautionary Landing',
    description: 'Assessment, reconnaissance, decision-making, and disciplined precautionary landing setup.',
    coreCompetencyKeys: ['decision_making', 'situational_awareness', 'navigation', 'tem'],
    criteria: buildCriteria([
      ['site_assessment', 'Landing area assessment', 'decision_making'],
      ['reconnaissance', 'Reconnaissance and inspection pattern', 'navigation'],
      ['approach_setup', 'Precautionary approach setup', 'situational_awareness'],
      ['threat_management', 'Risk and threat management', 'tem'],
    ]),
  },
  {
    key: 'exer-18a-navigation',
    label: 'Exer 18A Navigation',
    description: 'Planned navigation with route keeping, timing, and position awareness.',
    coreCompetencyKeys: ['navigation', 'situational_awareness', 'workload_management', 'decision_making'],
    criteria: buildCriteria([
      ['route_planning', 'Route planning and preparation', 'navigation'],
      ['track_keeping', 'Track keeping and timing', 'navigation'],
      ['position_awareness', 'Chart use and position awareness', 'situational_awareness'],
      ['replanning', 'Diversion and replanning judgement', 'decision_making'],
    ]),
  },
  {
    key: 'exer-18b-navigation-problems-low-level-reduced-vis',
    label: 'Exer 18B Navigation Problems at Lower Levels and in Reduced Visibility',
    description: 'Navigation problem-solving when margins are reduced by lower level operations or visibility constraints.',
    coreCompetencyKeys: ['navigation', 'decision_making', 'situational_awareness', 'tem'],
    criteria: buildCriteria([
      ['position_recovery', 'Position recovery and orientation', 'navigation'],
      ['visibility_judgement', 'Judgement in reduced visibility', 'decision_making'],
      ['terrain_clearance', 'Terrain and obstacle awareness', 'situational_awareness'],
      ['threat_management', 'Managing threats and reduced margins', 'tem'],
    ]),
  },
  {
    key: 'exer-18c-radio-navigation',
    label: 'Exer 18C Radio Navigation',
    description: 'Use of radio navigation aids, tuning, identification, and track management.',
    coreCompetencyKeys: ['navigation', 'radio_work', 'workload_management', 'situational_awareness'],
    criteria: buildCriteria([
      ['aid_setup', 'Aid selection, tuning, and identification', 'radio_work'],
      ['tracking_accuracy', 'Tracking accuracy using radio aids', 'navigation'],
      ['cross_checking', 'Instrument cross-check and interpretation', 'situational_awareness'],
      ['task_management', 'Task management while navigating', 'workload_management'],
    ]),
  },
  {
    key: 'exer-19-basic-instrument-flight',
    label: 'Exer 19 Basic Instrument Flight',
    description: 'Basic attitude instrument flying with scan discipline and control accuracy.',
    coreCompetencyKeys: ['aircraft_handling', 'workload_management', 'situational_awareness', 'independence'],
    criteria: buildCriteria([
      ['instrument_scan', 'Instrument scan discipline', 'workload_management'],
      ['attitude_control', 'Attitude and performance control', 'aircraft_handling'],
      ['limited_panel_awareness', 'Position and attitude awareness on instruments', 'situational_awareness'],
      ['prompting_level', 'Independence and prompting required', 'independence'],
    ]),
  },
];

export const DEFAULT_TRAINING_EXERCISE_TEMPLATE_KEY = 'exer-1-familiarisation';

const sanitizeCriterion = (criterion: unknown): TrainingExerciseCriterionTemplate | null => {
  if (!criterion || typeof criterion !== 'object') return null;
  const value = criterion as Record<string, unknown>;
  if (typeof value.key !== 'string' || typeof value.label !== 'string') return null;

  return {
    key: value.key,
    label: value.label,
    competencyKey: typeof value.competencyKey === 'string' ? value.competencyKey : undefined,
  };
};

const sanitizeTemplate = (template: unknown): TrainingExerciseTemplate | null => {
  if (!template || typeof template !== 'object') return null;
  const value = template as Record<string, unknown>;
  if (
    typeof value.key !== 'string'
    || typeof value.label !== 'string'
    || typeof value.description !== 'string'
    || !Array.isArray(value.coreCompetencyKeys)
    || !Array.isArray(value.criteria)
  ) {
    return null;
  }

  const criteria = value.criteria.map(sanitizeCriterion).filter((criterion): criterion is TrainingExerciseCriterionTemplate => criterion !== null);
  return {
    key: value.key,
    label: value.label,
    description: value.description,
    coreCompetencyKeys: value.coreCompetencyKeys.filter((entry): entry is string => typeof entry === 'string'),
    criteria,
  };
};

export const resolveTrainingExerciseTemplates = (config?: Record<string, unknown> | null) => {
  const rawTemplates = config?.[TRAINING_EXERCISE_CONFIG_KEY];
  if (!Array.isArray(rawTemplates)) {
    return TRAINING_EXERCISE_TEMPLATES;
  }

  const templates = rawTemplates
    .map(sanitizeTemplate)
    .filter((template): template is TrainingExerciseTemplate => template !== null);

  return templates.length > 0 ? templates : TRAINING_EXERCISE_TEMPLATES;
};

export const getTrainingExerciseTemplateOptions = (templates: TrainingExerciseTemplate[] = TRAINING_EXERCISE_TEMPLATES) =>
  templates.map((template) => ({
    value: template.key,
    label: template.label,
  })) as Array<{ value: string; label: string }>;

export const TRAINING_EXERCISE_TEMPLATE_OPTIONS = getTrainingExerciseTemplateOptions();

export const getTrainingExerciseTemplate = (
  key?: string | null,
  templates: TrainingExerciseTemplate[] = TRAINING_EXERCISE_TEMPLATES,
) => templates.find((template) => template.key === key) || null;
