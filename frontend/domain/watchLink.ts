// The watch strip on the running workout page: "Connecting" while the phone reaches the watch, "Connected" while the
// watch's workout session says it is there (about every 8 s), "Not reached" after 20 s without an answer.
export type WatchLinkState = 'connecting' | 'connected' | 'lost';

/** How long a "here" from the watch counts, and how long to wait for one before saying the watch was not reached. */
export const WATCH_STALE_MS = 20_000;

/**
 * `attemptAt`: when the phone last asked the watch to open (the page opening the workout, or "Try again").
 * `lastHere`: when the watch last said it is there (its "here" or a live heart rate), or null.
 */
export function watchLinkState(now: number, attemptAt: number, lastHere: number | null): WatchLinkState {
  if (lastHere !== null && now - lastHere < WATCH_STALE_MS) return 'connected';
  // Lost after being connected: try for another 20 s from when it went quiet.
  const since = Math.max(attemptAt, lastHere === null ? 0 : lastHere + WATCH_STALE_MS);
  return now - since < WATCH_STALE_MS ? 'connecting' : 'lost';
}
