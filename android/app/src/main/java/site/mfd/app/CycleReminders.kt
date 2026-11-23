package site.mfd.app

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.edit
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

/**
 * Cycle & Health reminders (medicines, the daily log, "period may start soon"), scheduled on the phone with local
 * alarms: the website sends the plan (CycleReminders in frontend/domain/cycleReminders.ts) and nothing goes through
 * a server. The wording is already in the person's chosen style; the lock screen always shows only "MFD · Reminder".
 * Alarms are set again after a restart, an app update, and every time one fires (daily reminders: the next day).
 */
object CycleReminders {
    private const val CH = "cycle_reminders"
    private const val ACTION = "site.mfd.app.CYCLE_REMINDER"
    private const val EXTRA = "id"
    private const val MAX = 40
    private val TIME = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")
    private val DATE = Regex("^\\d{4}-\\d{2}-\\d{2}$")

    data class Item(val id: String, val title: String, val text: String, val open: String, val time: String,
                    val date: String?, val start: String?, val end: String?)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("cycle_reminders", Context.MODE_PRIVATE)

    /** The plan from the website (replaces the previous one). */
    fun save(ctx: Context, plan: String) {
        if (plan.length > 50_000) return
        prefs(ctx).edit { putString("plan", plan) }
        schedule(ctx)
    }

    fun items(ctx: Context): List<Item> {
        val o = try { JSONObject(prefs(ctx).getString("plan", null) ?: return emptyList()) } catch (e: Exception) { return emptyList() }
        fun list(key: String, once: Boolean) = o.optJSONArray(key)?.let { a -> (0 until a.length()).mapNotNull { i ->
            val x = a.optJSONObject(i) ?: return@mapNotNull null
            val id = x.optString("id").take(200); val time = x.optString("time")
            if (id.isEmpty() || !TIME.matches(time)) return@mapNotNull null
            val date = x.optString("date").takeIf { once && DATE.matches(it) }
            if (once && date == null) return@mapNotNull null
            Item(id, x.optString("title").take(60).ifEmpty { "MFD" }, x.optString("text").take(200).ifEmpty { "Reminder" },
                x.optString("open").takeIf { MainActivity.isAppPath(it) } ?: "/", time, date,
                x.optString("start").takeIf { DATE.matches(it) }, x.optString("end").takeIf { DATE.matches(it) })
        } } ?: emptyList()
        return (list("daily", false) + list("once", true)).take(MAX)
    }

    /** When `item` should next appear, or null (ended, or a one-off already shown). */
    fun next(item: Item, now: LocalDateTime, shown: Set<String>): LocalDateTime? = site.mfd.shared.ReminderTime.next(
        LocalTime.parse(item.time), item.date?.let(LocalDate::parse), item.start?.let(LocalDate::parse), item.end?.let(LocalDate::parse), item.id in shown, now)

    private fun intent(ctx: Context, id: String) = PendingIntent.getBroadcast(ctx, id.hashCode(),
        Intent(ctx, CycleReminderReceiver::class.java).setAction(ACTION).putExtra(EXTRA, id),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** Cancels the old alarms and sets one for each reminder's next time. */
    fun schedule(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val p = prefs(ctx)
        for (old in (p.getString("set", "") ?: "").split('\n').filter { it.isNotEmpty() }) am.cancel(intent(ctx, old))
        val zone = ZoneId.systemDefault(); val now = LocalDateTime.now(zone)
        val shown = (p.getString("shown", "") ?: "").split('\n').filter { it.isNotEmpty() }.toSet()
        val set = mutableListOf<String>()
        for (item in items(ctx)) {
            val at = next(item, now, shown) ?: continue
            val ms = at.atZone(zone).toInstant().toEpochMilli()
            try { am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, intent(ctx, item.id)) }
            catch (e: SecurityException) { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, intent(ctx, item.id)) }
            set += item.id
        }
        p.edit { putString("set", set.joinToString("\n")) }
    }

    /** An alarm went off: show that reminder, then set the next alarms. */
    fun fire(ctx: Context, id: String) {
        val item = items(ctx).firstOrNull { it.id == id }
        if (item != null) {
            if (item.date != null) prefs(ctx).edit { putString("shown", ((prefs(ctx).getString("shown", "") ?: "").split('\n').filter { it.isNotEmpty() } + id).takeLast(50).joinToString("\n")) }
            show(ctx, item)
        }
        schedule(ctx)
    }

    private fun show(ctx: Context, item: Item) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH, "Reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Medicine, cycle and daily-log reminders you switched on in Cycle & Health"
            lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
        })
        // What the lock screen shows: never the medicine or anything about the cycle.
        val public = NotificationCompat.Builder(ctx, CH).setSmallIcon(R.drawable.ic_notification).setContentTitle("MFD").setContentText("Reminder").build()
        val n = NotificationCompat.Builder(ctx, CH)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(item.title)
            .setContentText(item.text)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(public)
            .setAutoCancel(true)
            .setContentIntent(Notify.open(ctx, item.open))
            .build()
        try { NotificationManagerCompat.from(ctx).notify("cycle:" + item.id, 1, n) } catch (e: SecurityException) {}
    }
}

/** Alarms from CycleReminders, and the phone restarting or MFD being updated (alarms are set again). */
class CycleReminderReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            "site.mfd.app.CYCLE_REMINDER" -> CycleReminders.fire(ctx, intent.getStringExtra("id") ?: return)
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> CycleReminders.schedule(ctx)
        }
    }
}
