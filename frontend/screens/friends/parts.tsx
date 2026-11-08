// Friends building blocks (Lovable design): feed card, workout page, hours chart, comparison, activity.
// Data comes in as props from FriendsScreen; numbers come from domain/socialStats.
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, CopyPlus, Heart, LockKeyhole, Medal, MessageCircle, Share2 } from 'lucide-react';
import type { Exercise, Workout } from '../../domain/types';
import { setLabels, trackingFields, workingVolume } from '../../domain/training';
import { MUSCLE_GROUPS, minutesOf, pctChange, recordCount, workSets, type ExerciseMetric } from '../../domain/socialStats';
import { ExerciseThumb } from '../training/ExercisePicker';
import { fmtNum, fmtVolume, kgTo, mss } from '../../lib/format';
import { InfoButton } from '../../components/ui';

export type Person = { user_id: string; username: string; display_name: string; avatar_path?: string | null };
export type Avatar = (p: Person, size?: 'xs' | 'sm' | 'md' | 'lg') => ReactNode;
type Unit = 'kg' | 'lb';

export const agoText = (t: number, now = Date.now()) => {
  const h = (now - t) / 3_600_000, d = new Date(t), today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const yesterday = new Date(now); yesterday.setDate(today.getDate() - 1);
  if (h < 1 / 60) return 'Just now';
  if (h < 1) return `${Math.floor(h * 60)} min ago`;
  if (sameDay) return `${Math.floor(h)} hour${Math.floor(h) === 1 ? '' : 's'} ago`;
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
};
const durationText = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}min` : `${min} min`);

/** "Time · Volume · (Sets) · Records" */
export function StatRow({ w, unit, records, withSets }: { w: Workout; unit: Unit; records: number | null; withSets?: boolean }) {
  const items: [string, ReactNode][] = [['Time', durationText(minutesOf(w))], ['Volume', fmtVolume(workingVolume(w.exercises), unit)]];
  if (withSets) items.push(['Sets', String(workSets(w))]);
  if (records) items.push(['Records', <span key="r" className="fr-records"><Medal aria-hidden="true" />{records}</span>]);
  return <div className="fr-stats tnum">{items.map(([k, v]) => <div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>;
}

/** Stacked avatars + "Liked by Riya and 2 others" (tap → who liked). */
export function LikedBy({ likers, uid, avatar, onOpen }: { likers: Person[]; uid: string; avatar: Avatar; onOpen: () => void }) {
  if (!likers.length) return null;
  const first = likers[0]!, others = likers.length - 1;
  return <button type="button" className="fr-liked" onClick={onOpen}>
    <span className="fr-stack">{likers.slice(0, 3).map((p) => <span key={p.user_id}>{avatar(p, 'xs')}</span>)}</span>
    <span>Liked by <b>{first.user_id === uid ? 'you' : first.display_name}</b>{others > 0 && ` and ${others} other${others === 1 ? '' : 's'}`}</span>
  </button>;
}

export type CardActions = { liked: boolean; likes: number; comments: number; onLike: () => void; onComments: () => void; onCopy: () => void; onShare: () => void };
export function ActionRow({ a, extra }: { a: CardActions; extra?: ReactNode }) {
  return <div className="fr-actions">
    <button type="button" className={'fr-action' + (a.liked ? ' liked' : '')} aria-pressed={a.liked} aria-label={`${a.liked ? 'Remove like' : 'Like'} · ${a.likes}`} onClick={a.onLike}><Heart aria-hidden="true" fill={a.liked ? 'currentColor' : 'none'} /><span className="tnum">{a.likes}</span></button>
    <button type="button" className="fr-action" aria-label={`Comments · ${a.comments}`} onClick={a.onComments}><MessageCircle aria-hidden="true" /><span className="tnum">{a.comments}</span></button>
    <button type="button" className="fr-action" aria-label="Copy workout" onClick={a.onCopy}><CopyPlus aria-hidden="true" /></button>
    <button type="button" className="fr-action" aria-label="Share workout" onClick={a.onShare}><Share2 aria-hidden="true" /></button>
    {extra && <span className="fr-actions-end">{extra}</span>}
  </div>;
}

/** One workout in the feed (and on profiles). */
export function FeedCard({ owner, w, when, unit, records, photo, exerciseOf, nameOf, avatar, uid, likers, actions, ownExtra, onOpen, onProfile, onLikes }: {
  owner: Person; w: Workout; when: number; unit: Unit; records: number | null; photo?: string; exerciseOf: (id: string) => Exercise | undefined; nameOf: (id: string) => string;
  avatar: Avatar; uid: string; likers: Person[]; actions: CardActions; ownExtra?: ReactNode; onOpen: () => void; onProfile: () => void; onLikes: () => void;
}) {
  const shown = w.exercises.filter((b) => b.sets.some((s) => s.done && s.type !== 'warmup'));
  const more = shown.length - 3;
  return <article className="card fr-card" aria-label={`${owner.display_name}: ${w.title}`}>
    <button type="button" className="fr-head" onClick={onProfile} aria-label={`Open ${owner.display_name}'s profile`}>
      {avatar(owner)}<span className="grow"><span className="name ellipsis">{owner.display_name}</span><span className="sub">{agoText(when)}</span></span>
    </button>
    <button type="button" className="fr-body" onClick={onOpen} aria-label={`Open ${w.title}`}>
      <span className="fr-title">{w.title}</span>
      <StatRow w={w} unit={unit} records={records} />
      <span className="fr-ex-list">{shown.slice(0, 3).map((b) => <span key={b.id} className="fr-ex"><ExerciseThumb exercise={exerciseOf(b.exerciseId)} /><span className="ellipsis"><b className="tnum">{b.sets.filter((s) => s.done && s.type !== 'warmup').length} sets</b> {nameOf(b.exerciseId)}</span></span>)}</span>
      {more > 0 && <span className="fr-more">See {more} more exercise{more === 1 ? '' : 's'}</span>}
    </button>
    {photo && <img className="social-photo" src={photo} alt={`${owner.display_name}'s workout photo`} loading="lazy" decoding="async" />}
    <div className="fr-foot"><ActionRow a={actions} extra={ownExtra} /><LikedBy likers={likers} uid={uid} avatar={avatar} onOpen={onLikes} /></div>
  </article>;
}

/** Horizontal bars, top 3 then "Show N more". */
export function MuscleSplitBars({ split }: { split: Record<string, number> }) {
  const [all, setAll] = useState(false);
  const rows = MUSCLE_GROUPS.filter((g) => split[g]! > 0).sort((a, b) => split[b]! - split[a]!);
  if (!rows.length) return null;
  return <section className="card fr-section">
    <div className="eyebrow">Muscle split</div>
    <div className="fr-bars">{(all ? rows : rows.slice(0, 3)).map((g) => <div key={g} className="fr-bar-row"><span className="fr-bar-label">{g}</span><span className="fr-bar"><span style={{ width: `${split[g]! * 100}%` }} /></span><span className="tnum fr-bar-value">{Math.round(split[g]! * 100)}%</span></div>)}</div>
    {rows.length > 3 && <button type="button" className="fr-link" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show ${rows.length - 3} more`}</button>}
  </section>;
}

/** Every exercise with its sets; record sets get small medal chips. */
export function SetTable({ w, unit, records, exerciseOf, nameOf, onExercise }: { w: Workout; unit: Unit; records: Map<string, string[]> | null; exerciseOf: (id: string) => Exercise | undefined; nameOf: (id: string) => string; onExercise: (id: string) => void }) {
  return <section className="card fr-section">
    <div className="eyebrow">Workout</div>
    {w.exercises.map((b) => {
      const labels = setLabels(b.sets), fields = trackingFields(b.tracking);
      const head = fields.includes('weightKg') && fields.includes('reps') ? 'Weight & reps' : fields.map((f) => ({ weightKg: 'Weight', reps: 'Reps', timeSec: 'Time', distanceKm: 'Distance', floors: 'Floors', steps: 'Steps' })[f]).join(' & ');
      return <div key={b.id} className="fr-ex-block">
        <button type="button" className="fr-ex-name" onClick={() => onExercise(b.exerciseId)}><ExerciseThumb exercise={exerciseOf(b.exerciseId)} /><span>{nameOf(b.exerciseId)}</span></button>
        <div className="fr-sets" role="table" aria-label={nameOf(b.exerciseId)}>
          <div className="fr-set head" role="row"><span role="columnheader">Set</span><span role="columnheader">{head}</span></div>
          {b.sets.map((s, i) => {
            const v = fields.map((f) => { const x = s[f]; if (x == null) return null; return f === 'weightKg' ? `${fmtNum(kgTo(x, unit), 2)} ${unit}` : f === 'reps' ? (fields.includes('weightKg') ? String(x) : `${x} reps`) : f === 'timeSec' ? mss(x) : f === 'distanceKm' ? `${fmtNum(x, 2)} km` : String(x); }).filter(Boolean).join(fields.includes('weightKg') && fields.includes('reps') ? ' × ' : ' · ');
            const pr = records?.get(s.id);
            return <div key={s.id} className="fr-set" role="row"><span role="cell" className={`set-label ${s.type}`}>{labels[i]}</span><span role="cell"><span className="tnum">{v || '—'}</span>{pr && <span className="fr-pr-chips">{pr.map((k) => <span key={k} className="fr-pr"><Medal aria-hidden="true" />{k}</span>)}</span>}</span></div>;
          })}
        </div>
      </div>;
    })}
  </section>;
}

/** Hours per week, last 12 weeks; tap a bar to see its value. */
export function HoursChart({ weeks }: { weeks: { start: number; minutes: number }[] }) {
  const [sel, setSel] = useState(weeks.length - 1);
  const max = Math.max(60, ...weeks.map((w) => w.minutes)), cur = weeks[sel]!;
  const label = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return <section className="card fr-section">
    <div className="fr-chart-head"><span className="eyebrow">Hours per week</span><span className="tnum"><b>{(cur.minutes / 60).toFixed(1)} h</b> <span className="muted">· {sel === weeks.length - 1 ? 'This week' : label(cur.start)}</span></span></div>
    <div className="fr-hours">{weeks.map((w, i) => <button key={w.start} type="button" aria-label={`Week of ${label(w.start)}: ${(w.minutes / 60).toFixed(1)} hours`} aria-pressed={i === sel} onClick={() => setSel(i)}><span className={i === sel ? 'on' : i === weeks.length - 1 ? 'now' : ''} style={{ height: `${Math.max(3, (w.minutes / max) * 100)}%` }} /></button>)}</div>
    <div className="fr-hours-axis">{weeks.map((w, i) => <span key={w.start} className={i === weeks.length - 1 ? 'now' : ''}>{i % 3 === 2 || i === weeks.length - 1 ? new Date(w.start).getDate() + ' ' + new Date(w.start).toLocaleDateString(undefined, { month: 'short' }) : ''}</span>)}</div>
  </section>;
}

export function CompareRow({ me, friend, avatar, label, onClick }: { me: Person; friend: Person; avatar: Avatar; label: string; onClick: () => void }) {
  return <button type="button" className="card fr-compare-row" onClick={onClick}><span className="fr-stack big">{avatar(me, 'sm')}{avatar(friend, 'sm')}</span><span className="grow strong">{label}</span><ChevronRight aria-hidden="true" /></button>;
}

export function ChangeBadge({ pct }: { pct: number }) {
  if (pct === 0) return <span className="fr-change">=</span>;
  return <span className={'fr-change ' + (pct > 0 ? 'up' : 'down')}>{pct > 0 ? '↑' : '↓'} {Math.abs(pct)}%</span>;
}
/** You vs friend: two bars, the larger value fills the row. */
export function PairBars({ me, friend, avatar, mine, theirs, fmt }: { me: Person; friend: Person; avatar: Avatar; mine: number; theirs: number; fmt: (v: number) => string }) {
  const max = Math.max(mine, theirs, 1e-9);
  return <div className="fr-pair">{([[me, mine, true], [friend, theirs, false]] as const).map(([p, v, isMe]) => <div key={String(isMe)} className="fr-pair-row">{avatar(p, 'xs')}<span className={'fr-bar' + (isMe ? '' : ' them')}><span style={{ width: `${(v / max) * 100}%` }} /></span><span className="tnum fr-pair-value">{fmt(v)}</span></div>)}</div>;
}
export function Metric({ label, mine, theirs, me, friend, avatar, fmt }: { label: string; mine: number; theirs: number; me: Person; friend: Person; avatar: Avatar; fmt: (v: number) => string }) {
  return <div className="fr-metric"><div className="fr-metric-head"><span className="strong">{label}</span><ChangeBadge pct={pctChange(mine, theirs)} /></div><PairBars me={me} friend={friend} avatar={avatar} mine={mine} theirs={theirs} fmt={fmt} /></div>;
}
export const metricFormat = (m: ExerciseMetric, unit: Unit) => (v: number) => (m.kind === 'kg' ? `${fmtNum(kgTo(v, unit), 1)} ${unit}` : m.kind === 'sec' ? mss(v) : m.kind === 'km' ? `${fmtNum(v, 2)} km` : `${Math.round(v)} reps`);

/** Me vs friend hero; "Stronger" under whoever leads (exercise view). */
export function Hero({ me, friend, avatar, leader }: { me: Person; friend: Person; avatar: Avatar; leader?: 'me' | 'friend' | null }) {
  const side = (p: Person, isMe: boolean) => <div className="fr-hero-side">{avatar(p, 'lg')}<span className="strong ellipsis">{isMe ? 'You' : p.display_name}</span>{leader === (isMe ? 'me' : 'friend') ? <span className="fr-stronger">Stronger</span> : <span className="fr-stronger-gap" />}</div>;
  return <section className="card fr-hero">{side(me, true)}<span className="fr-vs" aria-hidden="true">VS</span>{side(friend, false)}</section>;
}

/** Six-axis radar: you filled in the accent colour, the friend dashed grey. */
export function Radar({ mine, theirs, friendName }: { mine: Record<string, number>; theirs: Record<string, number>; friendName: string }) {
  const c = 130, r = 84, max = Math.max(0.01, ...Object.values(mine), ...Object.values(theirs));
  const pt = (i: number, v: number) => { const a = (Math.PI * 2 * i) / 6 - Math.PI / 2; return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const; };
  const poly = (d: Record<string, number>) => MUSCLE_GROUPS.map((g, i) => pt(i, (d[g] ?? 0) / max).join(',')).join(' ');
  return <section className="card fr-section">
    <div className="fr-chart-head"><span className="eyebrow">Muscle split</span><InfoButton title="Muscle split" lines={['Share of working sets per muscle group in this period.', `Filled: you. Dashed: ${friendName}.`]} /></div>
    <svg viewBox="0 0 260 260" className="fr-radar" role="img" aria-label={`Muscle split. You: ${MUSCLE_GROUPS.map((g) => `${g} ${Math.round((mine[g] ?? 0) * 100)}%`).join(', ')}. ${friendName}: ${MUSCLE_GROUPS.map((g) => `${g} ${Math.round((theirs[g] ?? 0) * 100)}%`).join(', ')}.`}>
      {[1 / 3, 2 / 3, 1].map((k) => <polygon key={k} points={MUSCLE_GROUPS.map((_, i) => pt(i, k).join(',')).join(' ')} className="grid" />)}
      {MUSCLE_GROUPS.map((g, i) => { const [x, y] = pt(i, 1), [lx, ly] = pt(i, 1.24); return <g key={g}><line x1={c} y1={c} x2={x} y2={y} className="grid" /><text x={lx} y={ly + 4} textAnchor="middle">{g}</text></g>; })}
      <polygon points={poly(theirs)} className="them" />
      <polygon points={poly(mine)} className="me" />
    </svg>
    <div className="fr-legend"><span><i className="me" />You</span><span><i className="them" />{friendName}</span></div>
  </section>;
}

export const Private = () => <p className="fr-private"><LockKeyhole aria-hidden="true" />Only you can see this comparison</p>;

/** Records per workout from a person's history (memoised by the history array). */
export function useRecordCounts(history: Workout[] | null, records: Map<string, string[]> | null) {
  return useMemo(() => (history && records ? new Map(history.map((w) => [w.id, recordCount(w, records)])) : null), [history, records]);
}
