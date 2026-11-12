# My Fitness Diary for Android

A native Android app (`site.mfd.app`) around the live web app. Screens, data, the offline cache and sign-in all come
from the website in a full-screen WebView, so every web release reaches the app at once. The app adds what a browser
tab can't: camera permission for barcodes, outside links (ChatGPT, Claude) opening in their own apps, Google sign-in
(through a Chrome tab), native notifications with a lock-screen rest countdown, saving exports, updating itself, and
sleep and steps from Health Connect.

The page talks to the app through a `MFDNative` message channel that only the MFD site's own origin gets
(`MainActivity.onPageMessage`, `frontend/lib/native.ts`).

Shared as an APK with friends; built to the Play Store's standards (fixed app ID, one signing key, current target
SDK) so it can be published there later.

## Build

Needs JDK 21 (or 17+) and the Android SDK (`ANDROID_HOME`, or `sdk.dir` in `local.properties`).

```sh
cd android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk (debug key)
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk (release key)
```

## Signing key

Release builds are signed with the key in `~/.mfd-android/` (`mfd-release.jks` and `keystore.properties`), or the
properties file named by `MFD_KEYSTORE_PROPERTIES`. Neither is in Git.

**Back up both files somewhere safe (for example a password manager).** Android only installs an update over the
app when it is signed with the same key: without it, everyone would have to uninstall and reinstall.

Certificate SHA-256: `EF:6D:E0:21:CC:76:4F:58:8C:AF:1C:86:ED:05:C5:DF:5E:28:35:BE:03:35:C2:6C:B3:86:F9:5A:D1:A6:C1:13`

## Versions

Raise `versionCode` (and `versionName`) in `app/build.gradle.kts` for every APK you share; Android refuses an update
with the same or a lower `versionCode`.

## Notifications (Firebase)

The WebView has no Web Push, so the app uses Firebase Cloud Messaging:

- `app/google-services.json` (Firebase console → project `my-fitness-dairy` → Android app `site.mfd.app`) is kept out
  of Git. Without it the app still builds (CI does), and notifications show as unavailable in Settings.
- Turning notifications on in Settings registers the app's FCM token with the push service (the `mfd-connect`
  Worker), which sends to it beside browsers. The Worker needs the secret `MFD_FCM_SA`: a Firebase service-account
  key (Project settings → Service accounts → Generate new private key), set with
  `npx wrangler secret put MFD_FCM_SA --config <wrangler.json>` (paste the whole JSON).
- Messages are data-only; the app builds every notification (`Notify.kt`). The rest countdown is the app's own
  (Android keeps it ticking on the lock screen); the server sends "Rest over" while MFD is in the background.

## Health Connect (from 1.4)

Recovery check-ins (Progress → Recovery) can fill themselves from Android Health Connect, where Samsung Health and
other apps share data. "Get sleep & steps from Samsung Health" on the Recovery card opens Health Connect's own
permission screen (read sleep, steps, heart rate, resting heart rate, heart-rate variability, weight and body fat;
each can be allowed alone). Workout heart rate is read for a finished workout's time window (`Health.heart`, 5-second steps;
op `healthHeart`); resting heart rate, HRV, weight and body fat come with the daily read (shown from MFD 2.0). After that, each time MFD opens (at most every
10 minutes) the last 7 days are read (`Health.kt`) and merged (`mergeHealthDays`):

- steps follow Health Connect's daily total (or, when that is empty, the busiest single source, so a phone and a watch
  aren't added together);
- sleep counts on the day it ends, from every source together with awake time removed, and only fills a day without
  sleep: hours typed or adjusted by hand are never replaced. Under 30 minutes (naps) is left out.

Read-only, only while MFD is open, nothing else is read. Health Connect links to `PrivacyActivity` (text in
`strings.xml`) from its permission screens. Samsung Health must share to Health Connect (Samsung Health → Settings →
Health Connect). Debug builds add `HealthTestActivity` (`app/src/debug`) to write sample data for testing:
`adb shell am start -n site.mfd.app/.HealthTestActivity`.

## Galaxy Watch app (`wear/`, MFD 2.0)

A Wear OS app (Compose for Wear OS) with the same application ID and signing key as the phone app; Android only lets
apps with the same package and key talk over the Wearable Data Layer. The protocol lives in `shared/` (`Sync.kt`,
with unit tests):

- phone → watch: one data item at `/mfd/state` holding a snapshot the page publishes on every diary change
  (`frontend/lib/watch.ts`: routines with folders and set counts, the running workout, units; under 80 KB);
- watch → phone: messages at `/mfd/command`, one JSON command each with an id. `WatchListener` queues them
  (`WatchLink`), the page takes them with `watchDrain` and applies each id once, so nothing is lost while MFD is
  closed or reloading.

Build: `./gradlew :wear:assembleRelease` (`wear/build/outputs/apk/release/wear-release.apk`). It installs on the
watch over Wi-Fi debugging (`adb pair`, `adb connect`, `adb install`), not from the Play Store. Wear Compose stays on
1.6.x until the project moves to Android Gradle plugin 9.1 (1.7 needs it).

## New versions (the app updates itself)

From 1.3 the app updates itself from MFD's download site, `https://mfd-downloads.shanustylish777.workers.dev` (a
static-files Worker). A banner ("New version of the MFD app · Update") appears when
`/android/latest.json` there names a newer version; Update downloads it in the app, which installs it only if:

- it came from that fixed HTTPS address (no redirects; the file path must be `/android/<name>.apk`);
- its size and SHA-256 match `latest.json`;
- it is `site.mfd.app` with exactly the announced, higher `versionCode`;
- it is signed with the app's own key (and Android itself refuses any other key).

Android then asks "Update this app?" (and the first time, to allow installs from MFD). The banner waits until no
workout is running and nothing is half-edited, as the web update does. After the update, a notification opens the
new version. Tested against tampered downloads, another key, a wrong version, other hosts and downgrades.

To publish a version:

```sh
cd android && ./gradlew assembleRelease            # versionCode raised first
cd .. && node scripts-publish-android.cjs android/app/build/outputs/apk/release/app-release.apk
cd hosting && npx wrangler deploy --config ../.sites-runtime/downloads/wrangler.json
```

The script refuses an APK that isn't MFD, isn't signed with the release key, or isn't newer than the published one.
Add `--staging` (and build with `-PmfdDownloads=https://mfd-downloads-staging.shanustylish777.workers.dev
-PmfdWebDebug=true`) to try it first.

Apps before 1.3 can't update themselves: the website's `public/android/latest.json` names the newest APK, and their
banner opens it in a browser tab to download and install once.
