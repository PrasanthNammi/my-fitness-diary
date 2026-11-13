// Domain models. These are deliberately backend-agnostic so the same shapes can be
// mapped onto Supabase tables later (see src/adapters/README.md).

export type ID = string;
export type ISODate = string; // YYYY-MM-DD

// ── Profile & goals ───────────────────────────────────────────────
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';
export type Goal = 'lose' | 'maintain' | 'gain' | 'recomp';

export interface Profile {
  firstName?: string;
  lastName?: string;
  profileId?: string;
  name: string;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  targetWeightKg: number;
  trainingDaysPerWeek: number;
  waterGoalMl?: number;
}

export interface NutritionTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
}

// ── Training ──────────────────────────────────────────────────────
export type TrackingMode =
  | 'weight_reps'
  | 'reps'
  | 'time'
  | 'weight_time'
  | 'distance_time'
  | 'weight_distance'
  | 'weighted_bodyweight'
  | 'assisted_bodyweight'
  | 'floors_time'
  | 'steps_time';

export type SetType = 'warmup' | 'normal' | 'failure' | 'drop';

export type ExerciseSource = 'mfd' | 'exercisedb' | 'free-exercise-db' | 'wger' | 'custom';

export interface Exercise {
  entry?: import('../catalogue/exercise').CatalogueEntry;
  id: ID;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  source: ExerciseSource;
  sourceRef: string | null; // id in the source dataset
  tracking: TrackingMode;
  mediaUrl: string | null; // null = no media available
  instructions: string[] | null; // null = no instructions available
}

export interface SetEntry {
  suggested?: Partial<Record<'weightKg' | 'reps' | 'timeSec' | 'distanceKm' | 'floors' | 'steps', number | null>>;
  id: ID;
  type: SetType;
  weightKg: number | null;
  reps: number | null;
  timeSec: number | null;
  distanceKm: number | null;
  floors?: number | null;
  steps?: number | null;
  rpe: number | null;
  done: boolean;
  /** The faded values come from an AI suggestion the user chose to use (shown with a sparkle). */
  aiTarget?: boolean;
  /** The faded values before the AI targets were applied (restored if the suggestion is dismissed). */
  aiPrev?: SetEntry['suggested'] | null;
  /** A set the AI suggestion added (removed again on dismiss unless ticked or typed in). */
  aiAdded?: boolean;
}

export interface ExerciseBlock {
  id: ID;
  exerciseId: ID;
  tracking: TrackingMode;
  restSec: number;
  note: string;
  supersetId: string | null;
  sets: SetEntry[];
}

export interface Folder {
  id: ID;
  name: string;
  collapsed: boolean;
  createdAt: number;
}

/** Set when an AI assistant added the entry through the connector (kept as stored). */
export interface AddedBy {
  connection?: string;
  at?: string;
}

export interface Routine {
  id: ID;
  name: string;
  folderId: ID | null;
  exercises: ExerciseBlock[];
  createdAt: number;
  updatedAt: number;
  addedBy?: AddedBy;
}

/** Rest timer state is stored as timestamps so it survives navigation and reloads. */
export interface RestTimer {
  durationSec: number;
  endsAt: number | null; // running when not null
  pausedRemainingSec: number | null; // paused when not null
}

export interface ActiveWorkout {
  id: ID;
  title: string;
  routineId: ID | null;
  startedAt: number;
  exercises: ExerciseBlock[];
  clock?: { mode: 'timer' | 'stopwatch'; durationSec: number; valueMs: number; startedAt: number | null };
  timers: Record<ID, RestTimer>; // keyed by ExerciseBlock id
}

export interface Workout {
  id: ID;
  title: string;
  routineId: ID | null;
  startedAt: number;
  endedAt: number;
  exercises: ExerciseBlock[];
  addedBy?: AddedBy;
  /** Heart rate during the workout (from the MFD watch app or Health Connect). */
  heartRate?: HeartRateSeries;
}

/** Heart rate as evenly spaced averages: `bpm[i]` covers seconds i×interval to (i+1)×interval from the start (0 = no reading). */
export interface HeartRateSeries {
  interval: number;
  bpm: number[];
  avg: number;
  max: number;
  source: 'watch' | 'health';
}

// ── Nutrition ─────────────────────────────────────────────────────
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export type RefUnit = 'g' | 'ml' | 'serving';
export type PortionUnit = 'g' | 'ml' | 'serving';

export interface Food {
  id: ID;
  name: string;
  brand: string | null;
  barcode: string | null;
  origin: 'sample' | 'custom';
  refAmount: number; // nutrition values below are per refAmount of refUnit
  refUnit: RefUnit;
  servingSize: number | null; // in g/ml, only meaningful when refUnit is g/ml
  servingLabel: string | null; // e.g. "1 slice"
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  // null = not provided on the label (different from a real 0)
  sugars: number | null;
  saturates: number | null;
  fibre: number | null;
  salt: number | null;
  ingredients: string | null;
}

export interface DiaryEntry {
  id: ID;
  date: ISODate;
  meal: Meal;
  food: Food; // snapshot so history survives edits/deletes
  amount: number;
  unit: PortionUnit;
  createdAt: number;
  addedBy?: AddedBy;
}

// ── Body & recovery ───────────────────────────────────────────────
export interface WeightEntry {
  id: ID;
  date: ISODate;
  kg: number;
  addedBy?: AddedBy;
  /** Came from Samsung Health (Health Connect); a weight typed in MFD has none and is never replaced. */
  source?: 'health';
  /** Body fat % from Samsung Health on that day. */
  bodyFat?: number;
}

/**
 * A dated check-in, stored in the same shape the older screens used: recovery (sleep in hours, steps,
 * energy and soreness 1–5, a note) and/or body measurements in cm. Older entries may hold numbers as text.
 */
export interface CheckIn {
  id: ID;
  date: ISODate;
  sleep?: number | string | null; // hours
  steps?: number | string | null;
  energy?: number | null; // 1–5
  soreness?: number | null; // 1–5
  waist?: number | string | null; // cm
  chest?: number | string | null;
  hips?: number | string | null;
  arms?: number | string | null;
  note?: string;
  /** From Samsung Health (Health Connect): resting heart rate (bpm), HRV (ms) and the night's sleep stages. */
  restingHr?: number | null;
  hrv?: number | null;
  sleepStages?: SleepStages | null;
}

/** The night's main sleep by stage (minutes), with when it started and ended (epoch ms). */
export interface SleepStages { deep: number; light: number; rem: number; awake: number; start: number; end: number }

// ── Coach ─────────────────────────────────────────────────────────
export interface CoachMessage {
  id: ID;
  role: 'user' | 'coach';
  text: string;
  sample: boolean;
  createdAt: number;
}

export type CoachProvider = 'none' | 'anthropic' | 'openai' | 'custom';

export interface CoachConfig {
  provider: CoachProvider;
  model: string;
  endpoint: string;
  includeTraining: boolean;
  includeNutrition: boolean;
  includeBody: boolean;
}

// ── Account & settings ────────────────────────────────────────────
export interface Account {
  name: string;
  email: string;
  mode: 'demo' | 'device';
  createdAt: number;
}

export interface Settings {
  favouriteFoods?: Food[];
  weightUnit: 'kg' | 'lb';
  energyUnit: 'kcal' | 'kJ';
  defaultRestSec: number;
  coach: CoachConfig;
  /** Keep the screen on while the workout screen is open (default on). */
  keepAwake?: boolean;
  /** Vibrate when a set is ticked and when rest ends (default on). */
  vibrate?: boolean;
  /** Body measurements shown in centimetres or inches (stored in cm). */
  lengthUnit?: 'cm' | 'in';
  /** First day of the week: 1 Monday (default), 0 Sunday, 6 Saturday. */
  weekStart?: 0 | 1 | 6;
  /** AI additions hidden from the AI lists ("kind:id"; not undone). */
  aiHidden?: string[];
  /** Plate calculator: the bar and plates at the user's gym, in `unit`. */
  plates?: { unit: 'kg' | 'lb'; bar: number; plates: number[] };
  /** Days whose Samsung Health weight was deleted in MFD (not added again). */
  healthWeightSkip?: string[];
}
