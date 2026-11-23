# Cycle & Health: data protection impact assessment (draft)

GDPR Art. 35 assessment for MFD's Cycle & Health section (health data, Art. 9). Draft written with the implementation
(MFD 3.1); to be reviewed by the owner before release and whenever the feature changes. Not legal advice.

## 1. Description

| | |
|---|---|
| Purpose | Let a woman record her cycle, symptoms, medicines, lab results and conditions privately; show her patterns, an estimate of the next period, reminders, a report for her doctor, and an export. |
| People | MFD users whose profile sex is female and who switch the section on (a small group of friends: mostly Germany, some India, one US). |
| Data | Daily logs (bleeding, flow, pain, symptoms, mood/energy/stress/focus, sleep notes, free-text notes, fertility observations recorded only), medicines and doses, lab results with lab ranges, conditions (diagnosed/suspected), settings. Special category data (health; sex life is not collected). |
| Sources | The person, and optionally period days from Android Health Connect on her phone. |
| Recipients | Only the person. Optional: AI assistants she connects (double opt-in, see 4). Processors: Supabase (database, EU Frankfurt), Google Drive (encrypted backups), Cloudflare (AI connector and app downloads; cycle data passes through the connector only when AI access is on). The website host serves the app's files only and stores no diary data. |
| Retention | Until she deletes it (single entries or everything) or her account; encrypted backups 30 days. |
| Legal basis | Explicit consent, Art. 9(2)(a) (switching on, with a consent sheet and privacy note); DPDP Act (India) consent; US: FTC Health Breach Notification Rule applies to the app. |

## 2. Necessity and proportionality

- Off by default; offered only to women; one clear question at sign-up, and a consent sheet when switched on later.
- Only fields the person fills are stored; empty values are not saved; a day without a log stays unknown.
- No profiling beyond her own estimate, computed on her phone; no ads, no sale, no sharing with friends or the feed.
- Not a medical device (EU MDR 2017/745): no fertile window, ovulation, contraception or diagnosis; labs shown with the
  lab's own range and never interpreted (docs/cycle/EVIDENCE.md).
- Data rights built in: export (CSV), report (PDF), edit, delete everything, withdraw consent.

## 3. Risks and measures

| Risk | Likelihood / severity (before) | Measures | Residual |
|---|---|---|---|
| Another user reads her data | Low / high | Separate tables with row-level security (own rows only; no anonymous access), tested (tests/diary-cycle.cjs); never in the Friends feed (feed built from training tables only). | Low |
| Exposure through AI assistants | Medium / high | Not in the connector's diary view at all; get_cycle needs its own tick on that connection (never in "Select all") AND her switch in MFD; switching off stops every assistant at once; tested. Provider terms explained in the privacy note. | Low |
| Lock-screen or notification disclosure (e.g. to a partner or family) | Medium / medium | Reminders off unless switched on; "Discreet" style by default ("MFD / Reminder"); lock screen always only "MFD · Reminder"; scheduled on the phone, nothing via a server or push provider. | Low |
| Misleading health information (e.g. relying on the estimate) | Medium / medium | Ranges only, after 3 cycles; ⓘ with method, tested population, limits (PCOS/thyroid not studied) and her own track record; "not for preventing or planning pregnancy"; clinician review planned before any personal alerts. | Low–medium (until clinician review) |
| Breach at a processor | Low / high | EU region; encrypted backups; least-privilege keys; breach plan: notify authority within 72 h and affected people without undue delay (GDPR 33–34; FTC HBNR; DPDP). | Low |
| Data kept longer than wanted | Low / medium | Delete everything in one tap; soft-deleted rows cleared like other rows; backups expire after 30 days. | Low |
| Legal demands for reproductive health data (US) | Low / high | Minimal collection; she can export and delete at any time; no fertility predictions stored; data held in the EU. | Low–medium |
| Health Connect import adds wrong data | Low / low | Only period days on dates without her own log; marked "from Health Connect"; editing makes it hers; never writes there. | Low |

## 4. AI assistants (double opt-in)

1. When connecting ChatGPT or Claude, "Cycle & Health" is a separate tick under "Health data" (unticked, no Select all).
2. In MFD, "Let AI assistants read this" (off by default).
Only both together let the tool answer; it returns her records with instructions not to infer fertile days,
diagnoses or lab interpretations. The AI provider is then a separate controller for what it receives.

## 5. Outcome

With the measures above the residual risk is low. Open before wider use: clinician review (CLINICIAN-REVIEW.md);
owner review of this draft and the privacy note; record of processing entry for Cycle & Health.
