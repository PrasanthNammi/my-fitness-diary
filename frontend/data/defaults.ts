import type { DB } from './store';
import type { Settings } from '../domain/types';
export const defaultSettings = (): Settings => ({
  weightUnit: 'kg',
  energyUnit: 'kcal',
  defaultRestSec: 90,
  coach: { provider: 'none', model: '', endpoint: '', includeTraining: true, includeNutrition: true, includeBody: true },
});

export const emptyDB = (): DB => ({
  version: 1,
  account: null,
  signedIn: false,
  profile: null,
  settings: defaultSettings(),
  folders: [],
  routines: [],
  workouts: [],
  active: null,
  customExercises: [],
  customFoods: [],
  favouriteFoodIds: [],
  diary: [],
  water: {},
  aiSuggestions: [],
  aiChanges: [],
  weights: [],
  checkins: [],
  coachThread: [],
  selectedDate: null,
});

