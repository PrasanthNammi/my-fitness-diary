// Resolve Hevy exercises (API template id or CSV title) to MFD catalogue ids.
// Same rules as mfd_catalog/matcher.py; keep both in sync.
//
// 1. user link     – the user's saved choice (custom exercises, earlier confirmations)
// 2. template id   – exact Hevy template id (API imports)
// 3. exact title   – normalised Hevy title / MFD name / unique alias (CSV imports)
// 4. suggestions   – fuzzy, same equipment only; the user confirms, then it is remembered

export interface CatalogueExercise {
  id: string;
  name: string;
  aliases: string[];
  family_name: string;
  is_default_variation: boolean;
  equipment: string[];
}
export interface HevyMap {
  by_template_id: Record<string, string>;
  by_title: Record<string, string>; // keys normalised with norm()
}
export type MatchMethod = 'user_link' | 'template_id' | 'exact_title' | 'needs_confirmation' | 'unmatched';
export interface MatchResult {
  mfdId: string | null;
  method: MatchMethod;
  confidence: number;
  suggestions: [string, number][];
}

const SYNONYMS: Record<string, string> = {
  db: 'dumbbell', dumbell: 'dumbbell', dumbbells: 'dumbbell', bb: 'barbell', kb: 'kettlebell',
  pushup: 'push up', pushups: 'push up', pullup: 'pull up', pullups: 'pull up', chinup: 'chin up',
  situp: 'sit up', situps: 'sit up', cabel: 'cable',
  flye: 'fly', flyes: 'fly', flys: 'fly', flies: 'fly', presses: 'press', crunches: 'crunch',
  'smith machine': 'smith', ohp: 'overhead press', rdl: 'romanian deadlift', bss: 'bulgarian split squat',
  crosstrainer: 'cross trainer', ez: 'ez bar',
};
const EQUIPMENT_WORDS = new Set(['barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'smith', 'band', 'plate',
  'suspension', 'bodyweight', 'trap', 'ez', 'landmine', 'bosu', 'sandbag']);
const EQUIP_TO_WORD: Record<string, string> = {
  barbell: 'barbell', dumbbell: 'dumbbell', kettlebell: 'kettlebell', cable: 'cable', machine: 'machine',
  smith_machine: 'smith', resistance_band: 'band', plate: 'plate', suspension: 'suspension', bodyweight: 'bodyweight',
  trap_bar: 'trap', ez_bar: 'ez', landmine: 'landmine', bosu_ball: 'bosu', sandbag: 'sandbag',
};
const KIND_WORDS = new Set(['assisted', 'weighted', 'single', 'incline', 'decline', 'seated', 'standing', 'lying',
  'reverse', 'close', 'wide', 'front', 'overhead', 'hammer', 'sumo', 'romanian', 'stiff', 'straight', 'bulgarian',
  'walking', 'lateral', 'jumping', 'kneeling', 'negative', 'kipping', 'rope']);

export function norm(input: string): string {
  let s = input.toLowerCase().replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.split(' ').map((w) => SYNONYMS[w] ?? w).join(' ');
  for (const [k, v] of Object.entries(SYNONYMS)) if (k.includes(' ')) s = s.split(k).join(v);
  return s
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

// Python's difflib.SequenceMatcher.ratio (Ratcliff/Obershelp), used for parity with the build tooling.
function seqRatio(a: string, b: string): number {
  const matches = (a1: number, a2: number, b1: number, b2: number): number => {
    let best = 0, bi = 0, bj = 0;
    const lens: number[] = new Array(b2 - b1 + 1).fill(0);
    for (let i = a1; i < a2; i++) {
      let prev = 0;
      for (let j = b1; j < b2; j++) {
        const tmp = lens[j - b1 + 1];
        if (a[i] === b[j]) {
          lens[j - b1 + 1] = prev + 1;
          if (lens[j - b1 + 1] > best) {
            best = lens[j - b1 + 1];
            bi = i - best + 1;
            bj = j - best + 1;
          }
        } else lens[j - b1 + 1] = 0;
        prev = tmp;
      }
    }
    if (!best) return 0;
    return best + matches(a1, bi, b1, bj) + matches(bi + best, a2, bj + best, b2);
  };
  const total = a.length + b.length;
  return total ? (2 * matches(0, a.length, 0, b.length)) / total : 1;
}

export class HevyMatcher {
  private eq = new Map<string, Set<string>>();
  private names: [string, string][] = [];
  private user: Record<string, string>;

  constructor(catalogue: CatalogueExercise[], private map: HevyMap, userLinks: Record<string, string> = {}) {
    this.user = { ...userLinks };
    for (const e of catalogue) {
      this.eq.set(e.id, new Set(e.equipment.map((q) => EQUIP_TO_WORD[q]).filter(Boolean)));
      for (const n of [e.name, ...e.aliases]) this.names.push([e.id, norm(n)]);
      if (e.is_default_variation) this.names.push([e.id, norm(e.family_name)]);
    }
  }

  match(title: string, templateId?: string | null): MatchResult {
    const key = norm(title ?? '');
    if (templateId && this.user[templateId]) return this.hit(this.user[templateId], 'user_link');
    if (this.user[`title:${key}`]) return this.hit(this.user[`title:${key}`], 'user_link');
    if (templateId && this.map.by_template_id[templateId]) return this.hit(this.map.by_template_id[templateId], 'template_id');
    if (this.map.by_title[key]) return this.hit(this.map.by_title[key], 'exact_title');
    const suggestions = this.suggest(title, 5);
    return suggestions.length
      ? { mfdId: null, method: 'needs_confirmation', confidence: suggestions[0][1], suggestions }
      : { mfdId: null, method: 'unmatched', confidence: 0, suggestions: [] };
  }

  suggest(title: string, n = 5): [string, number][] {
    const q = norm(title);
    const qt = new Set(q.split(' '));
    const qEq = [...qt].filter((w) => EQUIPMENT_WORDS.has(w));
    const qKind = new Set([...qt].filter((w) => KIND_WORDS.has(w)));
    const scored = new Map<string, number>();
    for (const [id, name] of this.names) {
      const nt = new Set(name.split(' '));
      const nEq = new Set([...[...nt].filter((w) => EQUIPMENT_WORDS.has(w)), ...(this.eq.get(id) ?? [])]);
      if (qEq.length && !qEq.every((w) => nEq.has(w))) continue; // never suggest other equipment
      const nKind = new Set([...nt].filter((w) => KIND_WORDS.has(w)));
      const diff = [...qKind].filter((w) => !nKind.has(w)).length + [...nKind].filter((w) => !qKind.has(w)).length;
      const penalty = 0.1 * Math.min(3, diff);
      const inter = [...qt].filter((w) => nt.has(w)).length;
      const union = new Set([...qt, ...nt]).size;
      const score = Math.max(0, 0.55 * seqRatio(q, name) + 0.45 * (inter / Math.max(1, union)) - penalty);
      if (score > (scored.get(id) ?? 0)) scored.set(id, score);
    }
    return [...scored.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .filter(([, s]) => s >= 0.45)
      .map(([id, s]) => [id, Math.round(s * 1000) / 1000] as [string, number]);
  }

  /** Save the user's confirmation; returns the updated links to persist. */
  remember(mfdId: string, templateId?: string | null, title?: string | null): Record<string, string> {
    if (templateId) this.user[templateId] = mfdId;
    if (title) this.user[`title:${norm(title)}`] = mfdId;
    return { ...this.user };
  }

  private hit(mfdId: string, method: MatchMethod): MatchResult {
    return { mfdId, method, confidence: 1, suggestions: [] };
  }
}

// ── Hevy CSV export parsing ──────────────────────────────────────
// Column names differ between export versions, so look for the exercise column by several names.
const TITLE_COLUMNS = ['exercise_title', 'Exercise Name', 'exercise_name', 'Exercise'];

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

/** Distinct exercise titles in a Hevy CSV export, each resolved to the catalogue. */
export function matchCsvExercises(csvText: string, matcher: HevyMatcher) {
  const rows = parseCsv(csvText);
  const col = TITLE_COLUMNS.find((c) => rows.length && c in rows[0]);
  if (!col) throw new Error('No exercise column found in this CSV. Is it a Hevy workout export?');
  const titles = [...new Set(rows.map((r) => r[col]).filter(Boolean))];
  return titles.map((t) => ({ title: t, ...matcher.match(t) }));
}
