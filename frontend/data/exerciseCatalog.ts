// Display labels for the unified catalogue and historical source metadata.

import type { ExerciseSource } from '../domain/types';

export const SOURCE_LABEL: Record<ExerciseSource, string> = {
  mfd: 'MFD',
  exercisedb: 'ExerciseDB',
  'free-exercise-db': 'Free Exercise DB',
  wger: 'wger',
  custom: 'Custom',
};
export const SOURCE_ORDER: ExerciseSource[] = ['mfd','custom'];

export const MUSCLES = [
  'Chest', 'Back', 'Lats', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Abs',
  'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Full body', 'Cardio',
];
export const EQUIPMENT = [
  'Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Kettlebell', 'Smith machine', 'EZ bar', 'Band', 'None',
];
