// Tiny hash router. Routes look like "#/training/routine/<id>".
import { useSyncExternalStore } from 'react';

const read = () => location.hash.replace(/^#/, '') || '/today';
let depth = 0; // in-app history entries we pushed

window.addEventListener('popstate', () => {
  depth = Math.max(0, depth - 1);
});

export function useRoute(): string[] {
  const path = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      window.addEventListener('popstate', cb);
      return () => {
        window.removeEventListener('hashchange', cb);
        window.removeEventListener('popstate', cb);
      };
    },
    read,
  );
  return path.split('/').filter(Boolean);
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const target = '#' + path;
  if (target === location.hash) return;
  if (opts.replace) history.replaceState(null, '', target);
  else {
    history.pushState(null, '', target);
    depth++;
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.scrollTo(0, 0);
}

/** Goes back within the app if possible, otherwise replaces with a fallback route. */
export function goBack(fallback: string) {
  if (depth > 0) history.back();
  else navigate(fallback, { replace: true });
}
