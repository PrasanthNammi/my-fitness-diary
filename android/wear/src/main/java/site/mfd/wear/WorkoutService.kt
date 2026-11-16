package site.mfd.wear

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.PowerManager
import android.os.SystemClock
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.snapshotFlow
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import site.mfd.shared.Sync

/**
 * The workout session on the watch, running while a workout is in progress (started and stopped by WatchActivity):
 * - Health Services exercise: heart rate from the watch's sensor, recorded for the workout;
 * - an ongoing activity, so raising the wrist shows MFD instead of the watch face;
 * - the rest timer's buzz, also with the screen off (a short wake lock covers each rest);
 * - the live heart rate to the phone's workout screen.
 * Without heart-rate permission it still runs, without heart rate.
 */
class WorkoutService : LifecycleService() {
    companion object {
        /** Latest heart rate (0 = none yet). */
        val bpm = mutableIntStateOf(0)
        @Volatile var running = false
            private set
        /** (epoch ms, bpm) for the current workout. */
        private val samples = mutableListOf<Pair<Long, Int>>()
        private var workoutId: String? = null
        private const val CHANNEL = "workout"

        fun start(ctx: Context, id: String) {
            if (running && workoutId == id) return
            synchronized(samples) { if (workoutId != id) samples.clear() }
            workoutId = id
            ctx.startForegroundService(Intent(ctx, WorkoutService::class.java))
        }
        fun stop(ctx: Context) { ctx.stopService(Intent(ctx, WorkoutService::class.java)) }

        /** Average and maximum since `startMs`. */
        fun summary(startMs: Long): Pair<Long?, Long?> = synchronized(samples) {
            val x = samples.filter { it.first >= startMs }.map { it.second }
            if (x.isEmpty()) null to null else Math.round(x.average()) to x.max().toLong()
        }

        /** The workout's heart rate as 15-second averages (frontend/domain/heartRate.ts), or null without readings. */
        fun series(startMs: Long, endMs: Long, interval: Int = 15): JSONObject? = synchronized(samples) {
            val x = samples.filter { it.first in startMs..endMs }
            if (x.isEmpty()) return null
            val n = ((endMs - startMs) / 1000 / interval + 1).toInt().coerceIn(1, 2000)
            val buckets = x.groupBy { ((it.first - startMs) / 1000 / interval).toInt().coerceAtMost(n - 1) }
            JSONObject().put("interval", interval).put("bpm", JSONArray((0 until n).map { i -> buckets[i]?.let { l -> Math.round(l.map { it.second }.average()).toInt() } ?: 0 }))
        }
    }

    private var wake: PowerManager.WakeLock? = null
    private val boot = Instant.ofEpochMilli(System.currentTimeMillis() - SystemClock.elapsedRealtime())

    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val points = update.latestMetrics.getData(DataType.HEART_RATE_BPM)
            for (p in points) {
                val v = p.value.toInt()
                if (v !in 30..250) continue
                synchronized(samples) { samples += p.getTimeInstant(boot).toEpochMilli() to v; if (samples.size > 40_000) samples.removeAt(0) }
                bpm.intValue = v
            }
            if (bpm.intValue > 0) sendLive(bpm.intValue)
        }
        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onRegistered() {}
        override fun onRegistrationFailed(throwable: Throwable) {}
        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
    }

    private var lastLive = 0L
    private var phone: Pair<String, Long>? = null // node id, when it was looked up

    /** The live reading to the phone, at most every 5 s (shown on its workout screen; best effort). */
    private fun sendLive(v: Int) {
        val now = SystemClock.elapsedRealtime()
        if (now - lastLive < 5_000) return
        lastLive = now
        lifecycleScope.launch { sendToPhone(Sync.HEART, v.toString().toByteArray()) }
    }

    /** A message to the phone (best effort; the phone's node is looked up at most once a minute). */
    private suspend fun sendToPhone(path: String, data: ByteArray) {
        val now = SystemClock.elapsedRealtime()
        try {
            val node = phone?.takeIf { now - it.second < 60_000 }?.first
                ?: Wearable.getCapabilityClient(this).getCapability(Sync.PHONE, CapabilityClient.FILTER_REACHABLE).await().nodes.firstOrNull()?.id?.also { phone = it to now }
                ?: return
            Wearable.getMessageClient(this).sendMessage(node, path, data).await()
        } catch (e: Exception) { phone = null }
    }

    override fun onCreate() {
        super.onCreate()
        running = true
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Workout", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, WatchActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("Workout in progress").setContentText("MFD")
            .setOngoing(true).setCategory(NotificationCompat.CATEGORY_WORKOUT).setContentIntent(open).setSilent(true)
        OngoingActivity.Builder(this, 1, builder).setTouchIntent(open).setStatus(Status.Builder().addTemplate("Workout in progress").build()).build().apply(this)
        try {
            ServiceCompat.startForeground(this, 1, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
        } catch (e: Exception) { running = false; stopSelf(); return } // no health permission at all
        lifecycleScope.launch { startHeartRate() }
        lifecycleScope.launch { while (true) { sendToPhone(Sync.HERE, ByteArray(0)); delay(8_000) } }
        lifecycleScope.launch { buzzAtRestEnd() }
    }

    private suspend fun startHeartRate() {
        try {
            val client = HealthServices.getClient(this).exerciseClient
            client.setUpdateCallback(callback)
            val config = ExerciseConfig.builder(ExerciseType.WEIGHTLIFTING).setDataTypes(setOf(DataType.HEART_RATE_BPM))
                .setIsAutoPauseAndResumeEnabled(false).setIsGpsEnabled(false).build()
            client.startExerciseAsync(config).await()
        } catch (e: Exception) { /* no permission, or another app's exercise is running: no heart rate */ }
    }

    /** The next rest end on the watch's view of the workout; a buzz when it comes, screen on or off. */
    private suspend fun buzzAtRestEnd() {
        snapshotFlow { Optimistic.view(WatchStore.snapshot.value, WatchStore.outbox.toList()).workout?.timers?.values?.mapNotNull { it.endsAt }?.filter { it > System.currentTimeMillis() }?.minOrNull() }
            .collectLatest { end ->
                if (end == null) return@collectLatest
                val wait = end - System.currentTimeMillis()
                val lock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mfd:rest").apply { acquire(wait + 10_000) }
                wake = lock
                try { delay(wait); buzz(this) } finally { if (lock.isHeld) lock.release() }
            }
    }

    override fun onDestroy() {
        running = false
        bpm.intValue = 0
        wake?.let { if (it.isHeld) it.release() }
        try { HealthServices.getClient(this).exerciseClient.endExerciseAsync() } catch (e: Exception) {}
        super.onDestroy()
    }
}
