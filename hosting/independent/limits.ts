export interface RateGate { allow(key: string): Promise<boolean> }
// Bounded per-isolate protection for local rehearsal. NOT a distributed quota.
// Reject new keys at capacity instead of evicting active callers to reset limits.
export function localRateGate(limit = 60, windowMs = 60_000, capacity = 1024, now = Date.now): RateGate {
  const entries = new Map<string, {count: number; until: number}>();
  return {async allow(key) {
    const time = now();
    for (const [id, entry] of entries) if (entry.until <= time) entries.delete(id);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= capacity) return false;
      entry = {count: 0, until: time + windowMs}; entries.set(key, entry);
    }
    return ++entry.count <= limit;
  }};
}
export async function tokenKey(token: string) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return Array.from(hash, n => n.toString(16).padStart(2, '0')).join('');
}
