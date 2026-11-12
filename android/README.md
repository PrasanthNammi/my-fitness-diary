# My Fitness Diary for Android

A native Android app (`site.mfd.app`) around the live web app. Screens, data, the offline cache and sign-in all come
from the website in a full-screen WebView, so every web release reaches the app at once. The app adds what a browser
tab can't: camera permission for barcodes, outside links (ChatGPT, Claude) opening in their own apps, Google sign-in
(through a Chrome tab), native notifications with a lock-screen rest countdown, and saving exports. Next: Health
Connect.

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

## New versions

`/android/latest.json` on the website (`public/android/latest.json`) names the newest APK:
`{"version": "1.3", "url": "https://…"}`. The app's user agent carries its version (`MFDAndroid/1.2`), and an older app
shows "Update the MFD app" at the top of Settings, plus a one-time message on opening.
