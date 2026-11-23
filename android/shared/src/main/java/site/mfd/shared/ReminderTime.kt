package site.mfd.shared

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/** When a Cycle & Health reminder should next appear (the phone app's CycleReminders). */
object ReminderTime {
    /**
     * A daily reminder (no `date`): the next `time` after `now`, not before `start`, not after `end`.
     * A one-off (`date`): that date and time; if it is today and the time has passed (the phone was off), in a few
     * seconds; null once shown or when the day has passed.
     */
    fun next(time: LocalTime, date: LocalDate?, start: LocalDate?, end: LocalDate?, shown: Boolean, now: LocalDateTime): LocalDateTime? {
        if (date != null) {
            if (shown) return null
            val at = date.atTime(time)
            return if (at.isAfter(now)) at else if (date == now.toLocalDate()) now.plusSeconds(5) else null
        }
        var day = now.toLocalDate().let { if (start != null && start.isAfter(it)) start else it }
        if (!day.atTime(time).isAfter(now)) day = day.plusDays(1)
        if (end != null && day.isAfter(end)) return null
        return day.atTime(time)
    }
}
