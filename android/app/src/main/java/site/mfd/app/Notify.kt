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

/**
 * MFD's notifications, built by the app: the rest timer (a live countdown that keeps ticking on the lock screen,
 * with −15s / +15s), "Rest over", and messages from the push service (friends, AI assistants).
 */
object Notify {
    private const val REST_TAG = "rest"
    private const val CH_RESTING = "rest_timer"
    private const val CH_REST_OVER = "rest_over"
    private const val CH_FRIENDS = "friends"
    private const val CH_AI = "ai"

    /** The rest on the notification, so its buttons work even when MFD isn't running. */
    data class Rest(val id: String, val label: String, val ends: Long, val over: Boolean)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("rest", Context.MODE_PRIVATE)

    fun current(ctx: Context): Rest? {
        val p = prefs(ctx)
        val id = p.getString("id", null) ?: return null
        return Rest(id, p.getString("label", "") ?: "", p.getLong("ends", 0), p.getBoolean("over", false))
    }

    private fun remember(ctx: Context, rest: Rest?) = prefs(ctx).edit {
        if (rest == null) clear() else putString("id", rest.id).putString("label", rest.label).putLong("ends", rest.ends).putBoolean("over", rest.over)
    }

    private fun channels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannels(listOf(
            // Default importance (not low) so it shows on the lock screen; it never makes a sound.
            NotificationChannel(CH_RESTING, "Rest timer", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "The running rest countdown"; setShowBadge(false); setSound(null, null); enableVibration(false)
            },
            NotificationChannel(CH_REST_OVER, "Rest over", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "When a rest ends"; enableVibration(true); vibrationPattern = longArrayOf(0, 120, 60, 120)
            },
            NotificationChannel(CH_FRIENDS, "Friends", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Likes, comments and messages from friends"
            },
            NotificationChannel(CH_AI, "AI assistants", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "When ChatGPT or Claude adds something to your diary"
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

    /** Opens MFD, at `path` (e.g. "/#/friends/chat/riya") when given. */
    private fun open(ctx: Context, path: String?): PendingIntent {
        val intent = Intent(ctx, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            if (path != null) putExtra(MainActivity.EXTRA_OPEN, path)
        }
        return PendingIntent.getActivity(ctx, (path ?: "").hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun button(ctx: Context, id: String, sec: Int): NotificationCompat.Action {
        val intent = Intent(ctx, RestActionReceiver::class.java).setAction(RestActionReceiver.ACTION)
            .putExtra(RestActionReceiver.EXTRA_ID, id).putExtra(RestActionReceiver.EXTRA_SEC, sec)
        val pending = PendingIntent.getBroadcast(ctx, sec + 100, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Action(0, if (sec > 0) "+15s" else "−15s", pending)
    }

    /** "Resting · Bench Press" with a countdown to `ends` that Android keeps ticking, even locked. */
    fun resting(ctx: Context, id: String, label: String, ends: Long) {
        remember(ctx, Rest(id, label, ends, false))
        val left = ends - System.currentTimeMillis()
        if (left <= 0) { cancel(ctx); return }
        post(ctx, REST_TAG, NotificationCompat.Builder(ctx, CH_RESTING)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Resting · $label")
            .setContentText("Rest timer")
            .setWhen(ends).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // Never left counting below zero if "Rest over" doesn't arrive.
            .setTimeoutAfter(left + 3000)
            .setContentIntent(open(ctx, null))
            .addAction(button(ctx, id, -15)).addAction(button(ctx, id, 15)))
    }

    fun restOver(ctx: Context, id: String, label: String) {
        remember(ctx, Rest(id, label, System.currentTimeMillis(), true))
        post(ctx, REST_TAG, NotificationCompat.Builder(ctx, CH_REST_OVER)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Rest over")
            .setContentText(label)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(open(ctx, null))
            .addAction(button(ctx, id, 15)))
    }

    /** `all = false` leaves a "Rest over" in place (rest skipped or paused, but the last one already ended). */
    fun clearRest(ctx: Context, all: Boolean) {
        val rest = current(ctx)
        if (all || rest == null || !rest.over) cancel(ctx)
    }

    fun cancel(ctx: Context) {
        remember(ctx, null)
        NotificationManagerCompat.from(ctx).cancel(REST_TAG, 1)
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
