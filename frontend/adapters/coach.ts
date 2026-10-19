// Coach adapter. The prototype returns clearly labelled sample responses.
// A real implementation must call YOUR backend (e.g. a Supabase Edge Function),
// which holds the provider API key server-side and forwards a summary of the
// user's logged data. Never put provider keys in the frontend bundle or localStorage.

import type { CoachConfig } from '../domain/types';

export interface CoachContext {
  workoutsLast14d: number;
  avgKcalLast7d: number | null;
  kcalTarget: number | null;
  proteinAvg7d: number | null;
  proteinTarget: number | null;
  weightChange28dKg: number | null;
  goalLabel: string | null;
}

export interface CoachAdapter {
  readonly connected: boolean;
  reply(question: string, ctx: CoachContext, config: CoachConfig): Promise<string>;
}

const SAMPLES: [RegExp, string][] = [
  [/protein|macro/i, 'Example: Your protein averaged 128 g against a 165 g target last week. Adding a 30 g serving at breakfast on training days would close most of that gap without changing total calories much.'],
  [/plateau|stall|bench|progress|stronger/i, 'Example: Bench press top sets have held at 67.5 kg × 8 for three sessions. Try 70 kg × 6 next session, then build back to 8 reps before adding weight again.'],
  [/weight|scale|fat|lose/i, 'Example: Your 7-day average weight is down 0.4 kg over four weeks — about 0.1 kg a week. That is slower than the pace your goal assumes; a 150 kcal reduction on rest days would bring it closer.'],
  [/sleep|recover|tired|sore/i, 'Example: Check-ins show lower energy on days after under 6 hours of sleep. Scheduling lower-body sessions after your better-sleep nights may help performance.'],
];

export const sampleCoach: CoachAdapter = {
  connected: false,
  async reply(question) {
    await new Promise((r) => setTimeout(r, 700));
    const hit = SAMPLES.find(([re]) => re.test(question));
    return hit
      ? hit[1]
      : 'Example: Once connected, I’ll look at your training, food diary and check-ins together and answer with specifics from your own logs — like which lifts are progressing and how your intake compares with your targets.';
  },
};

export const coach: CoachAdapter = sampleCoach;

export const COACH_PROMPTS = [
  'Am I eating enough protein?',
  'Why has my bench press stalled?',
  'Is my weight loss on track?',
  'How is my recovery looking?',
];
