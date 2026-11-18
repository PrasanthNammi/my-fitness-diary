// MFD 3.0 features (date of birth, targets from the latest weigh-in, smarter Hevy duplicates) are switched on per
// person: the server keeps the list (diary.mfd3_people) and answers "is 3.0 on for me?" (mfd3_enabled). The answer
// is remembered on this device so the first screen already knows it; after sign-in it is checked again, and if it
// changed the app reloads once so every screen agrees. Off unless the server says on.
import { client } from '../adapters/engine';

const KEY = 'mfd3';
const read = (): boolean => { try { return globalThis.localStorage?.getItem(KEY) === '1'; } catch { return false; } };

/** Whether MFD 3.0 is on for the person using this device (fixed for this page load). */
export const MFD3: boolean = read();

// The import code runs in its own frame (public/legacy) and asks the app window for the same answer.
try { (globalThis as any).mfdRelease = { mfd3: MFD3 }; } catch { /* not in a browser */ }

/** Ask the server again; reload once if the answer changed. Errors (offline…) keep the remembered answer. */
export async function refreshMfd3(): Promise<void> {
  const c = client();
  if (!c) return;
  const { data, error } = await c.rpc('mfd3_enabled');
  if (error || typeof data !== 'boolean') return;
  if (data === MFD3) return;
  try { localStorage.setItem(KEY, data ? '1' : '0'); } catch { return; }
  location.reload();
}
