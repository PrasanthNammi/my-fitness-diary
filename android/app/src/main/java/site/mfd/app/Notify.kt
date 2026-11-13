package site.mfd.app

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.edit
import kotlin.math.max

/**
 * MFD's notifications, built by the app: the rest timer (RestTimer: the exercise, what comes next, a live countdown
 * with a wavy bar, Skip / −15s / +15s), "Rest over", and messages from the push service (friends, AI assistants).
 */
object Notify {
    private const val REST_TAG = "rest" // before 2.0 (tagged); cleared with the current one
    const val CH_RESTING = "rest_timer"
    private const val CH_REST_OVER = "rest_done" // 2.0: sound only; the app vibrates itself (RestTimer)
    private const val CH_FRIENDS = "friends"
    private const val CH_AI = "ai"
    private const val CH_APP = "app"

    /** The rest on the notification, so its buttons work even when MFD isn't running. `start` fixes the bar's full
     *  length (it grows with +15s); `next` is what comes after it; `image` the exercise's picture. */
    data class Rest(val id: String, val label: String, val ends: Long, val over: Boolean, val start: Long = ends,
                    val next: String? = null, val image: String? = null, val vibrate: Boolean = true)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("rest", Context.MODE_PRIVATE)

    fun current(ctx: Context): Rest? {
        val p = prefs(ctx)
        val id = p.getString("id", null) ?: return null
        val ends = p.getLong("ends", 0)
        return Rest(id, p.getString("label", "") ?: "", ends, p.getBoolean("over", false), p.getLong("start", ends),
            p.getString("next", null), p.getString("image", null), p.getBoolean("vibrate", true))
    }

    private fun remember(ctx: Context, rest: Rest?) = prefs(ctx).edit {
        val skipped = prefs(ctx).getString("skipped", "") ?: ""
        clear()
        putString("skipped", skipped)
        if (rest != null) putString("id", rest.id).putString("label", rest.label).putLong("ends", rest.ends).putBoolean("over", rest.over)
            .putLong("start", rest.start).putString("next", rest.next).putString("image", rest.image).putBoolean("vibrate", rest.vibrate)
    }

    /** Rests skipped on the notification (the last few): a late "Rest over" from the server for them is ignored. */
    private fun skipped(ctx: Context) = (prefs(ctx).getString("skipped", "") ?: "").split('\n').filter { it.isNotEmpty() }
    private fun markSkipped(ctx: Context, id: String) = prefs(ctx).edit { putString("skipped", (skipped(ctx) + id).takeLast(20).joinToString("\n")) }

    private fun channels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.deleteNotificationChannel("rest_over") // before 2.0: vibrated through the channel, which silent modes switch off
        nm.createNotificationChannels(listOf(
            // Default importance (not low) so it shows on the lock screen; it never makes a sound.
            NotificationChannel(CH_RESTING, "Rest timer", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "The running rest countdown"; setShowBadge(false); setSound(null, null); enableVibration(false)
            },
            NotificationChannel(CH_REST_OVER, "Rest over", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "When a rest ends (MFD vibrates itself, also in silent mode, when Vibrate is on in MFD)"; enableVibration(false)
            },
            NotificationChannel(CH_FRIENDS, "Friends", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Likes, comments and messages from friends"
            },
            NotificationChannel(CH_AI, "AI assistants", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "When ChatGPT or Claude adds something to your diary"
            },
            NotificationChannel(CH_APP, "App updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "When the app has been updated"
            },
        ))
    }

    @SuppressLint("MissingPermission") // checked: areNotificationsEnabled covers the Android 13+ permission
    private fun post(ctx: Context, tag: String, builder: NotificationCompat.Builder) {
        val nm = NotificationManagerCompat.from(ctx)
        if (!nm.areNotificationsEnabled()) return
        channels(ctx)
        try { nm.notify(tag, 1, builder.build()) } catch (e: SecurityException) { /* permission withdrawn meanwhile */ }
    }

    /** Shows a rest notification built by RestTimer (when its service can't run right now). */
    @SuppressLint("MissingPermission")
    fun postRest(ctx: Context, n: android.app.Notification) {
        val nm = NotificationManagerCompat.from(ctx)
        if (!nm.areNotificationsEnabled()) return
        channels(ctx)
        try { nm.notify(RestTimer.NOTIFICATION_ID, n) } catch (e: SecurityException) {}
    }

    /** Opens MFD, at `path` (e.g. "/#/friends/chat/riya") when given. */
    fun open(ctx: Context, path: String?): PendingIntent {
        val intent = Intent(ctx, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            if (path != null) putExtra(MainActivity.EXTRA_OPEN, path)
        }
        return PendingIntent.getActivity(ctx, (path ?: "").hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Skip (`sec` 0), −15s or +15s. */
    fun button(ctx: Context, id: String, sec: Int): NotificationCompat.Action {
        val intent = Intent(ctx, RestActionReceiver::class.java).setAction(RestActionReceiver.ACTION)
            .putExtra(RestActionReceiver.EXTRA_ID, id).putExtra(RestActionReceiver.EXTRA_SEC, sec)
        val pending = PendingIntent.getBroadcast(ctx, sec + 100, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Action(0, when { sec > 0 -> "+15s"; sec < 0 -> "−15s"; else -> "Skip" }, pending)
    }

    /**
     * Runs a rest until `ends`: the notification shows the exercise (`label`), what comes `next`, its picture and a
     * live countdown with the bar; it ends on the second by itself. `duration` (seconds) is the rest's full length;
     * the same rest moved by ±15 s keeps its start, so the bar grows or shrinks.
     */
    fun resting(ctx: Context, id: String, label: String, ends: Long, next: String? = null, image: String? = null, duration: Long = 0, vibrate: Boolean? = null) {
        val now = System.currentTimeMillis()
        if (ends - now <= 0) { cancel(ctx); return }
        val before = current(ctx)?.takeIf { it.id == id && !it.over }
        val start = before?.start?.takeIf { it < ends } ?: (ends - max(duration * 1000, ends - now))
        val rest = Rest(id, label, ends, false, start, next ?: before?.next, image ?: before?.image, vibrate ?: before?.vibrate ?: true)
        remember(ctx, rest)
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        channels(ctx)
        RestTimer.run(ctx, rest)
    }

    /** "Rest over", once per rest: the alarm, the page and the server may all say so; a skipped rest stays quiet. */
    fun restOver(ctx: Context, id: String, label: String) {
        val before = current(ctx)
        if ((before?.id == id && before.over) || id in skipped(ctx)) return
        val rest = (before?.takeIf { it.id == id } ?: Rest(id, label, System.currentTimeMillis(), false)).copy(over = true, ends = System.currentTimeMillis())
        remember(ctx, rest)
        RestTimer.stop(ctx)
        NotificationManagerCompat.from(ctx).cancel(REST_TAG, 1)
        val text = listOfNotNull(rest.label.ifEmpty { label }, rest.next).joinToString("\n")
        postRest(ctx, NotificationCompat.Builder(ctx, CH_REST_OVER)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Rest over")
            .setContentText(rest.next ?: rest.label.ifEmpty { label })
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setLargeIcon(RestTimer.image(ctx, rest.image))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(open(ctx, null))
            .addAction(button(ctx, id, 15))
            .build())
    }

    /** Skip on the notification: the rest ends now, quietly, and a late "Rest over" for it is ignored. */
    fun skip(ctx: Context, id: String) {
        markSkipped(ctx, id)
        if (current(ctx)?.id == id) cancel(ctx)
    }

    /** `all = false` leaves a "Rest over" in place (rest skipped or paused, but the last one already ended). */
    fun clearRest(ctx: Context, all: Boolean) {
        val rest = current(ctx)
        if (all || rest == null || !rest.over) cancel(ctx)
    }

    fun cancel(ctx: Context) {
        remember(ctx, null)
        RestTimer.stop(ctx)
        NotificationManagerCompat.from(ctx).cancel(REST_TAG, 1)
        NotificationManagerCompat.from(ctx).cancel(RestTimer.NOTIFICATION_ID)
    }

    /** A workout started on the watch while MFD wasn't running: one tap opens it on the phone too. */
    fun watchWorkout(ctx: Context) {
        post(ctx, "watch", NotificationCompat.Builder(ctx, CH_APP)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Workout started on your watch")
            .setContentText("Tap to open it in MFD")
            .setAutoCancel(true)
            .setContentIntent(open(ctx, "/#/workout")))
    }

    /** Android closes the app while updating it: one tap opens the new version. */
    fun updated(ctx: Context, version: String) {
        post(ctx, "updated", NotificationCompat.Builder(ctx, CH_APP)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("My Fitness Diary updated")
            .setContentText("Version $version is ready. Tap to open.")
            .setAutoCancel(true)
            .setTimeoutAfter(10 * 60_000L)
            .setContentIntent(open(ctx, null)))
    }

    /** A message from the push service (the same fields the website's service worker gets). */
    fun fromPush(ctx: Context, data: Map<String, String>) {
        val title = data["title"]?.take(120) ?: return
        val body = data["body"]?.take(300) ?: ""
        val tag = data["tag"]?.take(120) ?: "mfd"
        if (tag == REST_TAG) {
            // The server only sends "Rest over" to the app; the running countdown is the app's own.
            if (title == "Rest over") restOver(ctx, data["id"] ?: return, body)
            return
        }
        val path = data["url"]?.takeIf { MainActivity.isAppPath(it) }
        post(ctx, tag, NotificationCompat.Builder(ctx, if (tag == "ai") CH_AI else CH_FRIENDS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(open(ctx, path ?: "/")))
    }
}
