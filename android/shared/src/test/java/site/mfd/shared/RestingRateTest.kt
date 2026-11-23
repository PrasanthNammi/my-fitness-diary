package site.mfd.shared

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RestingRateTest {
    private val min = 60_000L
    private fun night(vararg bpm: Long, every: Long = 5) = bpm.mapIndexed { i, b -> i * every * min to b }

    @Test fun lowestThirtyMinutes() = assertEquals(53L, RestingRate.lowest30(night(70, 66, 60, 54, 52, 51, 53, 52, 58, 64, 70, 72)))
    // One odd low reading among 60s (every 5 min) only pulls its 30-minute window a little: (5 x 60 + 40) / 6.
    @Test fun oneLowReadingOnlyPullsALittle() = assertEquals(57L, RestingRate.lowest30(night(60, 60, 60, 60, 60, 60, 40, 60, 60, 60, 60, 60, 60)))
    @Test fun tooFewReadings() = assertNull(RestingRate.lowest30(night(55, 54)))
    @Test fun readingsTooCloseTogether() = assertNull(RestingRate.lowest30(night(55, 54, 53, every = 1)))
    @Test fun impossibleValuesIgnored() = assertEquals(58L, RestingRate.lowest30(night(0, 58, 58, 58, 58, 58, 300)))
    @Test fun empty() = assertNull(RestingRate.lowest30(emptyList()))
}
