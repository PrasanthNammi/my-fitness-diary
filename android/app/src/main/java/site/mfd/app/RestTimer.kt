package site.mfd.app

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * The rest timer, run by the app itself so it never depends on the page being awake or on a push arriving:
 * - an exact alarm ends the rest on the second (also locked, in Doze) and posts "Rest over";
 * - a short foreground service redraws the notification every second while the rest runs (the wavy bar of
 *   time left), holding a partial wake lock until it ends;
 * - the end vibrates directly, like an alarm (also in silent mode), when MFD's "Vibrate" setting is on.
 */
object RestTimer {
    const val NOTIFICATION_ID = 4201
    private const val ACCENT = 0xFFFF5A1F.toInt()

    // ── The wavy bar ─────────────────────────────────────────────────────────────────────────────
    /** Time left as a wave (it moves along each second), the time gone as a flat track, and a dot where they meet. */
    fun bar(left: Float, phase: Float): Bitmap {
        val w = 720; val h = 48; val mid = h / 2f; val r = 9f
        val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        val x = r + (w - 2 * r) * left.coerceIn(0f, 1f)
        val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 7f; strokeCap = Paint.Cap.ROUND; color = Color.argb(90, 150, 150, 150) }
        if (x < w - r) c.drawLine(x, mid, w - r, mid, track)
        if (x > r) {
            val wave = Path().apply {
                moveTo(r, mid)
                var px = r
                while (px <= x) { lineTo(px, mid + 6f * sin((px / 46f) * 2 * PI.toFloat() - phase)); px += 2f }
            }
            c.drawPath(wave, Paint(track).apply { color = ACCENT; strokeWidth = 8f })
        }
        c.drawCircle(x, mid, r + 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ACCENT })
        c.drawCircle(x, mid, r - 3, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE })
        return b
    }

    // ── The exercise's picture (from MFD's own site only) ───────────────────────────────────────
    private fun imageFile(ctx: Context, url: String) =
        File(ctx.cacheDir, "rest-" + MessageDigest.getInstance("SHA-256").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }.take(24) + ".png")

    /** The round picture if already downloaded; otherwise starts the download (the next redraw shows it). */
    fun image(ctx: Context, url: String?): Bitmap? {
        if (url == null || !url.startsWith(MainActivity.SITE_ORIGIN + "/catalogue/")) return null
        val f = imageFile(ctx, url)
        if (f.exists()) return BitmapFactory.decodeFile(f.path)
        thread {
            try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 8000; conn.readTimeout = 8000
                val bytes = conn.inputStream.use { input ->
                    val out = java.io.ByteArrayOutputStream(); val buf = ByteArray(16_384)
                    while (true) { val n = input.read(buf); if (n < 0) break; out.write(buf, 0, n); if (out.size() > 600_000) return@thread }
                    out.toByteArray()
                }
                conn.disconnect()
                val src = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return@thread
                val size = 144; val side = min(src.width, src.height)
                val square = Bitmap.createScaledBitmap(Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side), size, size, true)
                val round = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
                Canvas(round).apply {
                    drawCircle(size / 2f, size / 2f, size / 2f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE })
                    drawCircle(size / 2f, size / 2f, size / 2f, Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) })
                }
                f.outputStream().use { round.compress(Bitmap.CompressFormat.PNG, 100, it) }
            } catch (e: Exception) { /* no picture */ }
        }
        return null
    }

    // ── The notification ─────────────────────────────────────────────────────────────────────────
    fun build(ctx: Context, rest: Notify.Rest, now: Long = System.currentTimeMillis()): Notification {
        val left = max(0L, rest.ends - now)
        val total = max(1L, rest.ends - rest.start)
        val bar = bar(left.toFloat() / total, (now / 1000 % 60) * 1.3f)
        val img = image(ctx, rest.image)
        fun views(layout: Int) = RemoteViews(ctx.packageName, layout).apply {
            setChronometer(R.id.rest_time, SystemClock.elapsedRealtime() + left, "Rest %s", true)
            setChronometerCountDown(R.id.rest_time, true)
            setImageViewBitmap(R.id.rest_bar, bar)
            if (img != null) setImageViewBitmap(R.id.rest_img, img) else setViewVisibility(R.id.rest_img, android.view.View.GONE)
        }
        val big = views(R.layout.notif_rest_big).apply {
            setTextViewText(R.id.rest_title, rest.label)
            if (rest.next.isNullOrEmpty()) setViewVisibility(R.id.rest_next, android.view.View.GONE) else setTextViewText(R.id.rest_next, rest.next)
        }
        return NotificationCompat.Builder(ctx, Notify.CH_RESTING)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Rest · ${rest.label}")
            .setContentText(rest.next ?: "Rest timer")
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(views(R.layout.notif_rest))
            .setCustomBigContentView(big)
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(Notify.open(ctx, null))
            .addAction(Notify.button(ctx, rest.id, 0)).addAction(Notify.button(ctx, rest.id, -15)).addAction(Notify.button(ctx, rest.id, 15))
            .build()
    }

    // ── Starting, ending, stopping ───────────────────────────────────────────────────────────────
    private fun alarm(ctx: Context) = PendingIntent.getBroadcast(ctx, 4202, Intent(ctx, RestAlarmReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** Runs `rest`: the alarm at its end, the redrawing service (or one static post if Android won't start it now). */
    fun run(ctx: Context, rest: Notify.Rest) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, rest.ends, alarm(ctx))
        else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, rest.ends, alarm(ctx))
        try { ctx.startForegroundService(Intent(ctx, RestService::class.java)) }
        catch (e: Exception) { Notify.postRest(ctx, build(ctx, rest)) } // started from the background: still shown, the alarm still ends it
    }

    fun stop(ctx: Context) {
        ctx.getSystemService(AlarmManager::class.java).cancel(alarm(ctx))
        ctx.stopService(Intent(ctx, RestService::class.java))
    }

    /** The rest's end: "Rest over" (once; it vibrates). */
    fun finish(ctx: Context) {
        val rest = Notify.current(ctx) ?: return
        if (rest.over) return
        stop(ctx)
        Notify.restOver(ctx, rest.id, rest.label)
    }

    fun vibrate(ctx: Context) {
        val v: Vibrator = if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(VibratorManager::class.java).defaultVibrator
            else @Suppress("DEPRECATION") ctx.getSystemService(Vibrator::class.java)
        val effect = VibrationEffect.createWaveform(longArrayOf(0, 260, 140, 260, 140, 420), -1)
        // Alarm vibrations also come in silent and vibrate-off modes, like a gym timer should.
        if (Build.VERSION.SDK_INT >= 33) v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
        else @Suppress("DEPRECATION") v.vibrate(effect, android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_ALARM).build())
    }
}

/** The exact alarm at the rest's end. */
class RestAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) { RestTimer.finish(ctx) }
}

/** Redraws the rest notification every second while a rest runs, then stops. */
class RestService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var wake: PowerManager.WakeLock? = null

    private val tick = object : Runnable {
        override fun run() {
            val rest = Notify.current(this@RestService)
            if (rest == null || rest.over) { stopSelf(); return }
            val now = System.currentTimeMillis()
            if (now >= rest.ends) { RestTimer.finish(this@RestService); return } // the alarm's backup
            getSystemService(NotificationManager::class.java).notify(RestTimer.NOTIFICATION_ID, RestTimer.build(this@RestService, rest, now))
            handler.postDelayed(this, 1000 - now % 1000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val rest = Notify.current(this)
        if (rest == null || rest.over) { stopSelf(); return START_NOT_STICKY }
        ServiceCompat.startForeground(this, RestTimer.NOTIFICATION_ID, RestTimer.build(this, rest),
            if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0)
        wake?.let { if (it.isHeld) it.release() }
        wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mfd:rest").apply {
            acquire(max(1000L, rest.ends - System.currentTimeMillis()) + 10_000)
        }
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        wake?.let { if (it.isHeld) it.release() }
        // Keep what is shown ("Rest over" replaces it); a cleared rest removes it itself.
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
        super.onDestroy()
    }
}
