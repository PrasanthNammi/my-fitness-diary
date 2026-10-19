// Types for dist/mfd_exercises.json. Generated content; edit the Python sources, not the JSON.

export type Category = 'strength' | 'plyometrics' | 'olympic' | 'strongman' | 'cardio' | 'mobility' | 'activity' | 'core';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Tracking =
  | 'weight_reps' | 'reps' | 'weighted_bodyweight' | 'assisted_bodyweight'
  | 'time' | 'distance_time' | 'weight_distance' | 'floors_time' | 'steps_time';
export type MuscleGroup =
  | 'chest' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'lats' | 'upper_back' | 'traps' | 'lower_back'
  | 'abdominals' | 'glutes' | 'quadriceps' | 'hamstrings' | 'adductors' | 'abductors' | 'calves' | 'neck'
  | 'full_body' | 'cardio' | 'other';

export interface ExerciseImage {
  path: string;                  // relative to the app media root, e.g. "images/bench_press_barbell/start.webp"
  role: 'start' | 'end';
  source: 'free_exercise_db' | 'mfd';
  license: string | null;
  source_url: string | null;
}

export interface ExerciseAnimation {
  webp: string;                  // animated WebP, e.g. "animations/bench_press_barbell.webp" (~25-100 KB)
  gif: string | null;            // GIF fallback, 2-3x bigger; only needed where animated WebP is not supported
  source: 'mfd';
  license: string;
}

// Filled by the build from what exists in dist/app_media/. See app/media.ts for what to show.
export interface ExerciseMedia {
  animation: ExerciseAnimation | null;
  video: string | null;
  images: ExerciseImage[];
}

export interface CatalogueEntry {
  id: string;                    // permanent MFD id, e.g. "bench_press_barbell" — never reuse or rename
  name: string;
  aliases: string[];             // other names, used for import matching and search
  search_terms: string[];        // lowercase name variants for search: name, aliases, family, abbreviations ("db bench press")
  search_tags: string[];         // lowercase equipment and muscle words for search ("dumbbell", "chest")
  family_id: string;             // groups variations, e.g. "bench_press"
  family_name: string;
  is_default_variation: boolean;
  variation: string | null;      // e.g. "Dumbbell"
  category: Category;
  pattern: string;               // movement pattern key (see meta.patterns)
  mechanic: 'compound' | 'isolation' | null;
  level: Level;
  laterality: 'bilateral' | 'unilateral' | 'alternating';
  equipment: string[];           // keys of meta.equipment
  tracking: Tracking;
  muscles: { primary: string[]; secondary: string[]; stabilizers: string[] }; // keys of meta.muscles
  muscle_groups: { primary: MuscleGroup[]; secondary: MuscleGroup[] };
  description: string;
  setup: string[];
  steps: string[];
  cues: string[];
  mistakes: string[];
  breathing: string;
  safety: string[];
  variation_notes: string[];
  easier: string[];              // ids of easier alternatives
  harder: string[];              // ids of harder progressions
  alternatives: string[];        // ids of substitutes: same movement and main muscles (up to 5)
  media: ExerciseMedia;
  sources: {
    hevy: { template_id: string; title: string; type: string; primary_muscle_group: string; equipment: string } | null;
    free_exercise_db: { id: string; name: string; url: string }[];
  };
  // draft = MFD-written, awaiting expert review; reviewed = checked;
  // imported = steps from Free Exercise DB, coaching text from its MFD family or written for it, awaiting review
  review_status: 'draft' | 'reviewed' | 'imported';
}

export interface Catalogue {
  meta: {
    name: string;
    version: string;
    count: number;
    muscles: Record<string, { name: string; group: MuscleGroup }>;
    groups: Record<MuscleGroup, string>;
    equipment: Record<string, string>;
    categories: Record<Category, string>;
    patterns: Record<string, string>;
    tracking: Record<Tracking, string>;
  };
  exercises: CatalogueEntry[];
}
