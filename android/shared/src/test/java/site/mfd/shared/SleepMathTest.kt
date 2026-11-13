package site.mfd.shared

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SleepMathTest {
    private val m = 60_000L
    private fun t(h: Int, min: Int, day: Int = 13) = ((day - 13) * 24 * 60 + h * 60 + min) * m // minutes from 13 Nov 00:00

    @Test fun aNightCrossingMidnightCountsWholeOnTheDayItEnds() {
        // 22:55 → 06:40 with awake moments at 23:50 and 03:10: 7h45 in bed minus 26 min awake = 7h19.
        val start = t(22, 55, 12); val end = t(6, 40)
        val stages = listOf(
            SleepMath.Stage(SleepMath.LIGHT, start, t(23, 50, 12)), SleepMath.Stage(SleepMath.AWAKE, t(23, 50, 12), t(0, 4)),
            SleepMath.Stage(SleepMath.DEEP, t(0, 4), t(3, 10)), SleepMath.Stage(SleepMath.AWAKE, t(3, 10), t(3, 22)),
            SleepMath.Stage(SleepMath.REM, t(3, 22), end))
        val days = SleepMath.byDay(listOf(SleepMath.Session("2026-11-13", "com.sec.android.app.shealth", start, end, stages)))
        assertEquals(setOf("2026-11-13"), days.keys) // none of it on the 12th
        assertEquals(7 * 60 + 19L, days["2026-11-13"]!! / m)
        assertEquals(7.3, SleepMath.hours(days["2026-11-13"])!!, 0.0)
    }

    @Test fun shortStagesAreNotRoundedDownOneByOne() {
        // 120 stages of 3 min 30 s each = 7 h exactly (minute rounding per stage would lose an hour).
        val stages = (0 until 120).map { SleepMath.Stage(SleepMath.LIGHT, it * 210_000L, (it + 1) * 210_000L) }
        assertEquals(7 * 3_600_000L, SleepMath.asleepMs(SleepMath.Session("d", "s", 0, 120 * 210_000L, stages)))
    }

    @Test fun twoAppsRecordingTheSameNightAreNotAdded() {
        val watch = SleepMath.Session("2026-11-13", "shealth", t(23, 0, 12), t(6, 49), emptyList())
        val phone = SleepMath.Session("2026-11-13", "other", t(23, 30, 12), t(6, 0), emptyList())
        assertEquals(7 * 60 + 49L, SleepMath.byDay(listOf(watch, phone))["2026-11-13"]!! / m)
    }

    @Test fun napsFromTheSameAppAreAdded() {
        val night = SleepMath.Session("2026-11-13", "shealth", t(0, 0), t(6, 0), emptyList())
        val nap = SleepMath.Session("2026-11-13", "shealth", t(14, 0), t(14, 40), emptyList())
        assertEquals(6 * 60 + 40L, SleepMath.byDay(listOf(night, nap))["2026-11-13"]!! / m)
    }

    @Test fun strayRecordsAreIgnored() {
        assertNull(SleepMath.hours(20 * m)); assertNull(SleepMath.hours(19 * 3_600_000L)); assertNull(SleepMath.hours(null))
    }
}
