// Read-only helpers over dist/mfd_exercises.json: lookup, search, families, alternatives.
// Framework-free; build one instance at app start and keep it in memory (the JSON is ~3 MB, ~400 KB gzipped).
import type { Catalogue, CatalogueEntry, MuscleGroup } from './exercise';

export interface SearchFilters {
  muscleGroup?: MuscleGroup;     // matches primary muscle groups
  equipment?: string;            // key of meta.equipment
  category?: CatalogueEntry['category'];
  includeStretches?: boolean;    // default true
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export class ExerciseCatalogue {
  readonly meta: Catalogue['meta'];
  private byId = new Map<string, CatalogueEntry>();
  private byFamily = new Map<string, CatalogueEntry[]>();
  private haystack = new Map<string, string>();
  private names = new Map<string, string[]>();

  constructor(data: Catalogue) {
    this.meta = data.meta;
    for (const e of data.exercises) {
      this.byId.set(e.id, e);
      const fam = this.byFamily.get(e.family_id) ?? [];
      fam.push(e);
      this.byFamily.set(e.family_id, fam);
      const names = [e.name, ...e.search_terms].map(fold);
      this.names.set(e.id, names);
      this.haystack.set(e.id, ' ' + [...names, ...e.search_tags.map(fold)].join(' ') + ' ');
    }
    for (const fam of this.byFamily.values()) fam.sort((a, b) => Number(b.is_default_variation) - Number(a.is_default_variation) || a.name.localeCompare(b.name));
  }

  get(id: string): CatalogueEntry | undefined { return this.byId.get(id); }
  all(): CatalogueEntry[] { return [...this.byId.values()]; }

  /** Every variation in the exercise's family, default variation first. */
  family(id: string): CatalogueEntry[] {
    const e = this.byId.get(id);
    return e ? this.byFamily.get(e.family_id) ?? [e] : [];
  }

  alternatives(id: string): CatalogueEntry[] { return this.refs(id, 'alternatives'); }
  easier(id: string): CatalogueEntry[] { return this.refs(id, 'easier'); }
  harder(id: string): CatalogueEntry[] { return this.refs(id, 'harder'); }

  /**
   * Word search over names, aliases, search_terms and search_tags. Every query word must match the start of a word
   * ("db ben" finds "Bench Press (Dumbbell)"). Ranked: a name variant starts with the query > one name variant
   * contains all words > written-for-MFD > also in Hevy's library > default variation > shorter names.
   */
  search(query: string, filters: SearchFilters = {}, limit = 50): CatalogueEntry[] {
    const words = fold(query).split(' ').filter(Boolean);
    const q = fold(query);
    const out: { e: CatalogueEntry; score: number }[] = [];
    for (const e of this.byId.values()) {
      if (filters.muscleGroup && !e.muscle_groups.primary.includes(filters.muscleGroup)) continue;
      if (filters.equipment && !e.equipment.includes(filters.equipment)) continue;
      if (filters.category && e.category !== filters.category) continue;
      if (filters.includeStretches === false && (e.pattern === 'stretch' || e.pattern === 'soft_tissue')) continue;
      const hay = this.haystack.get(e.id)!;
      if (!words.every((w) => hay.includes(' ' + w))) continue;
      const names = this.names.get(e.id)!;
      let score = 0;
      if (q && names.some((n) => n.startsWith(q))) score += 100;
      if (names.some((n) => words.every((w) => (' ' + n).includes(' ' + w)))) score += 50;
      if (e.review_status !== 'imported') score += 10;
      if (e.sources.hevy) score += 8;                     // common, everyday exercises first
      if (e.is_default_variation) score += 5;
      score -= fold(e.name).length / 20;
      out.push({ e, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.e);
  }

  private refs(id: string, key: 'alternatives' | 'easier' | 'harder'): CatalogueEntry[] {
    const e = this.byId.get(id);
    return e ? e[key].map((r) => this.byId.get(r)).filter((x): x is CatalogueEntry => !!x) : [];
  }
}
