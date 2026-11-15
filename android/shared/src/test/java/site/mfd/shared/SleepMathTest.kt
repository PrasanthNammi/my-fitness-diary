package site.mfd.shared

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Cases from real Samsung Health records (Health Connect, November 2026). */
class SleepMathTest {
    private val m = 60_000L
    /** Minutes from 13 Nov 00:00 local (UTC here). */
    private fun t(day: Int, h: Int, min: Int) = ((day - 13) * 24 * 60 + h * 60 + min) * m
    private fun day(ms: Long) = "2026-11-%02d".format(13 + Math.floorDiv(ms, 86_400_000L))
    private val sh = "com.sec.android.app.shealth"

    @Test fun aNightCountsWholeOnTheDayYouWakeUp() {
        // 12 Nov 22:31 → 13 Nov 05:20 = 6h49, Samsung Health's number (awake moments included).
        val d = SleepMath.byDay(listOf(SleepMath.Session(sh, t(12, 22, 31), t(13, 5, 20))), ::day)
        assertEquals(setOf("2026-11-13"), d.keys)
        assertEquals(409L, d["2026-11-13"]!!.asleepMs / m)
        assertEquals(6.82, SleepMath.hours(d["2026-11-13"]!!.asleepMs)!!, 0.0) // shows as 6h49
    }

    @Test fun aNightInPiecesIsOneNight() {
        // 15 Nov: 00:27 → 03:41 and 03:58 → 08:43 (17 min awake between) = 3h14 + 4h45 = 7h59.
        val d = SleepMath.byDay(listOf(SleepMath.Session(sh, t(15, 0, 27), t(15, 3, 41)), SleepMath.Session(sh, t(15, 3, 58), t(15, 8, 43))), ::day)
        assertEquals(479L, d["2026-11-15"]!!.asleepMs / m)
        assertEquals(2, d["2026-11-15"]!!.main.sessions.size)
    }

    @Test fun aNapCountsInTheDayButIsNotTheMainNight() {
        // 8 Nov: night 02:28 → 09:33 (7h05) and a nap 15:17 → 16:43 (1h26): the day's sleep is 8h31, as Samsung Health.
        val d = SleepMath.byDay(listOf(SleepMath.Session(sh, t(8, 2, 28), t(8, 9, 33)), SleepMath.Session(sh, t(8, 15, 17), t(8, 16, 43))), ::day)
        assertEquals(511L, d["2026-11-08"]!!.asleepMs / m)
        assertEquals(425L, d["2026-11-08"]!!.main.asleepMs / m)
    }

    @Test fun anEveningStartAndALateMorningPiece() {
        // 9 → 10 Nov: 21:56 → 23:35, 23:57 → 04:57 (one night, 6h39), then 06:57 → 08:51 after 2 h awake: 8h33 that day.
        val d = SleepMath.byDay(listOf(SleepMath.Session(sh, t(9, 21, 56), t(9, 23, 35)), SleepMath.Session(sh, t(9, 23, 57), t(10, 4, 57)),
            SleepMath.Session(sh, t(10, 6, 57), t(10, 8, 51))), ::day)
        assertEquals(513L, d["2026-11-10"]!!.asleepMs / m)
        assertEquals(399L, d["2026-11-10"]!!.main.asleepMs / m)
    }

    @Test fun twoAppsRecordingTheSameNightAreNotAdded() {
        val d = SleepMath.byDay(listOf(SleepMath.Session(sh, t(12, 23, 0), t(13, 6, 49)), SleepMath.Session("other", t(12, 23, 30), t(13, 6, 0))), ::day)
        assertEquals(469L, d["2026-11-13"]!!.asleepMs / m)
    }

    @Test fun strayRecordsAreIgnored() {
        assertNull(SleepMath.hours(20 * m)); assertNull(SleepMath.hours(19 * 3_600_000L)); assertNull(SleepMath.hours(null))
    }
}
