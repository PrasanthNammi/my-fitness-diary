// Vibrations beyond the set tick: a new personal record gets a short celebratory buzz (with the crown). In the
// Android app the app vibrates (also in silent mode, mid-workout); in a browser, where the phone allows it.
import { getDB } from '../data/store';
import { inApp, tell } from './native';

export function celebrate() {
  if (getDB().settings.vibrate === false) return;
  if (inApp()) tell('vibrate', { kind: 'record' });
  else navigator.vibrate?.([70, 60, 70, 60, 70, 90, 260]);
}
