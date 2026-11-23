/**
 * What the Friends screens already know, kept while the app is open (and the people list on this device), so opening
 * Friends again shows it at once and only refreshes quietly in the background, instead of starting empty each time.
 * - One feed (lib/socialFeed) and one photo-link cache per account for the whole session: photo links stay the same
 *   for their 15 minutes, so the phone shows photos from its own cache instead of downloading them again.
 * - Profiles, friend links and blocks are saved per account, like the feed, so even a fresh app open shows names.
 */
import {SocialFeed} from './socialFeed';
import {SignedImages} from './socialData';

export type People = {profiles: any[]; links: any[]; blocks: any[]};
export type FriendsSession = {feed: SocialFeed; images: SignedImages; people: People | null; photos: Record<string, string>; photosAt: number; unread: any[]};
const sessions = new Map<string, FriendsSession>();
const KEY = 'mfd-friends-people:';
const PHOTO_FRESH = 12 * 60000;   // signed photo links last 15 minutes (lib/socialData)

function readPeople(uid: string): People | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + uid) || 'null');
    return v && Array.isArray(v.profiles) && Array.isArray(v.links) && Array.isArray(v.blocks) ? v : null;
  } catch { return null; }
}

/** This account's Friends data for the session (made on first use). */
export function friendsSession(uid: string): FriendsSession {
  let s = sessions.get(uid);
  if (!s) { s = {feed: new SocialFeed(uid), images: new SignedImages(), people: readPeople(uid), photos: {}, photosAt: 0, unread: []}; sessions.set(uid, s); }
  return s;
}

/** Photo links still valid enough to show at once (else none: they are signed again). */
export function freshPhotos(s: FriendsSession, now = Date.now()) { return now - s.photosAt < PHOTO_FRESH ? s.photos : {}; }
export function rememberPhotos(s: FriendsSession, photos: Record<string, string>, now = Date.now()) { if (now - s.photosAt >= PHOTO_FRESH) s.photosAt = now; s.photos = photos; }

/** The latest people list, kept for the session and saved on this device (small: at most 200 profiles). */
export function rememberPeople(uid: string, people: People) {
  friendsSession(uid).people = people;
  try { localStorage.setItem(KEY + uid, JSON.stringify(people)); } catch { /* a per-device convenience */ }
}

/** Same data, so React can skip re-rendering and re-checking the feed. */
export const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
