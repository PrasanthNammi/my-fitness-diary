// What to show for an exercise. Order: animation > video > photos > nothing.
// Paths in the catalogue are relative to the app media root (the contents of dist/app_media/).
// Pass `mediaRoot` as wherever you put those files: a bundled asset folder, or a CDN base URL.
import type { CatalogueEntry, ExerciseImage } from './exercise';

export type ExerciseVisual =
  | { kind: 'animation'; src: string; fallbackGif: string | null }
  | { kind: 'video'; src: string; poster?: string }
  | { kind: 'images'; frames: ExerciseImage[] }   // show as a 2-frame flip (start <-> end), or a single still
  | { kind: 'none' };

const join = (root: string, p: string) => (root ? `${root.replace(/\/$/, '')}/${p}` : p);

export function exerciseVisual(e: Pick<CatalogueEntry, 'media'>, mediaRoot = ''): ExerciseVisual {
  const m = e.media;
  if (m.animation) return { kind: 'animation', src: join(mediaRoot, m.animation.webp), fallbackGif: m.animation.gif ? join(mediaRoot, m.animation.gif) : null };
  if (m.video) return { kind: 'video', src: join(mediaRoot, m.video), poster: m.images[0] ? join(mediaRoot, m.images[0].path) : undefined };
  if (m.images.length) return { kind: 'images', frames: m.images.map((i) => ({ ...i, path: join(mediaRoot, i.path) })) };
  return { kind: 'none' };
}

// Small still for lists: the start photo; otherwise the animation itself (it is small).
export function exerciseThumbnail(e: Pick<CatalogueEntry, 'media'>, mediaRoot = ''): string | null {
  const start = e.media.images.find((i) => i.role === 'start') ?? e.media.images[0];
  if (start) return join(mediaRoot, start.path);
  return e.media.animation ? join(mediaRoot, e.media.animation.webp) : null;
}

// Credit lines for the exercise detail screen.
export function mediaCredits(e: Pick<CatalogueEntry, 'media'>): string[] {
  const out = new Set<string>();
  if (e.media.images.some((i) => i.source === 'free_exercise_db')) out.add('Photos: Free Exercise DB (public domain)');
  return [...out];
}
