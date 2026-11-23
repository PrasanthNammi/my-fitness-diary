package site.mfd.shared

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

class ReminderTimeTest {
    private val now = LocalDateTime.of(2026, 11, 23, 8, 0)
    private val seven = LocalTime.of(7, 0)
    private val nine = LocalTime.of(9, 0)

    @Test fun dailyTimePassedGoesToTomorrow() = assertEquals(LocalDateTime.of(2026, 11, 24, 7, 0), ReminderTime.next(seven, null, null, null, false, now))
    @Test fun dailyLaterToday() = assertEquals(LocalDateTime.of(2026, 11, 23, 9, 0), ReminderTime.next(nine, null, null, null, false, now))
    @Test fun dailyWaitsForStart() = assertEquals(LocalDateTime.of(2026, 12, 1, 7, 0), ReminderTime.next(seven, null, LocalDate.of(2026, 12, 1), null, false, now))
    @Test fun dailyStopsAfterEnd() = assertNull(ReminderTime.next(seven, null, null, LocalDate.of(2026, 11, 23), false, now))
    @Test fun dailyLastDay() = assertEquals(LocalDateTime.of(2026, 11, 23, 9, 0), ReminderTime.next(nine, null, null, LocalDate.of(2026, 11, 23), false, now))
    @Test fun onceInFuture() = assertEquals(LocalDateTime.of(2026, 11, 29, 9, 0), ReminderTime.next(nine, LocalDate.of(2026, 11, 29), null, null, false, now))
    @Test fun onceTodayMissedShowsSoon() = assertEquals(now.plusSeconds(5), ReminderTime.next(seven, LocalDate.of(2026, 11, 23), null, null, false, now))
    @Test fun onceShownNeverAgain() = assertNull(ReminderTime.next(nine, LocalDate.of(2026, 11, 29), null, null, true, now))
    @Test fun oncePastDayDropped() = assertNull(ReminderTime.next(nine, LocalDate.of(2026, 11, 20), null, null, false, now))
}
