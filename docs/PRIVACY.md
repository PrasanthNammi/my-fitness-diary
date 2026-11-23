# My Fitness Diary: privacy note

How My Fitness Diary (MFD) handles your data. The same text is in the app (Settings → Privacy). MFD is a small app run
by one person for friends; it has no ads and sells nothing. Cycle & Health has its own, stricter note
(docs/cycle/PRIVACY.md). Draft; not legal advice.

## Who is responsible

The MFD owner (the person who invited you). Contact them in the app or the way you usually do.

## What MFD stores

- **Account:** your email address and sign-in details (passwords are handled by the sign-in service, never visible).
- **Profile:** name, date of birth, sex, height, weight, goals and targets, units and app settings.
- **Your diary:** workouts, routines and folders, food entries and saved foods, water, weigh-ins and body measurements,
  recovery check-ins (sleep, steps, heart rate, energy, soreness, notes), and photos you add.
- **Friends:** your friends list, your username and picture, likes, comments and messages.
- **AI assistants:** which assistants you connected, what you allowed them, and what they added (marked in your diary).
- **Phone app:** a notification token so MFD can send notifications; data from Health Connect only for the kinds you
  allow (see the app's Health Connect privacy screen).

## Why

To keep your diary in sync across your devices and show it back to you; to calculate your targets, progress and
statistics; for the friends features you use; to send the notifications you switched on; and to keep MFD working and
safe (backups, error and load monitoring). The legal basis is the agreement to provide the app to you (GDPR
Art. 6(1)(b)) and, for optional features (Health Connect, AI assistants, notifications, Cycle & Health), your consent
when you switch them on (Art. 6(1)(a), and Art. 9(2)(a) for health data).

## Who can see it

- **You.** Your diary is readable only by your account (enforced by the database).
- **Your friends** see what the Friends features show: your name, username and picture, the workouts in your Friends
  feed, and your likes, comments and messages to them. Never your food, body, recovery or Cycle & Health.
- **AI assistants** (ChatGPT by OpenAI, Claude by Anthropic) only if you connect them, and only the kinds of data you
  tick; their providers then handle it under their own terms. You can disconnect them any time.
- **Services that run MFD** (processors), each only for its job:
  - Supabase: database, sign-in and photo storage, in the EU (Frankfurt).
  - OpenAI (ChatGPT Sites): hosts the website's files; your diary is not stored there.
  - Cloudflare: the AI connector and app downloads.
  - Google: Firebase Cloud Messaging delivers notifications; Google Drive keeps MFD's nightly backups, encrypted
    before upload.
  - Grafana Cloud: service-health numbers (counts and timings), no diary content.
  - Open Food Facts: when you scan or search a food, the barcode or search words are sent to look it up.

Nothing is sold, used for ads, or shared for anyone else's purposes.

## How long

As long as you have an account. Deleted entries are removed from the database; backups are kept 30 days. When your
account is deleted, everything in it is deleted, and it leaves the backups within 30 days.

## Your rights

You can see and correct everything in the app; export it (Settings → Data → Export, or a full backup); delete entries;
withdraw consent for optional features by switching them off; object to or restrict processing; and complain to a data
protection authority (in Germany, your state's authority). To delete your account, ask the MFD owner; it is done
within 30 days.

## Security and breaches

Encrypted connections, per-person access rules in the database, encrypted backups, and no secrets in the app. If
personal data were ever exposed, the authority would be told within 72 hours where required, and you without undue
delay (GDPR Art. 33–34; India DPDP Act; US FTC Health Breach Notification Rule).

## Changes

Important changes are announced in the app before they apply.
