package site.mfd.shared

/**
 * A night's sleep from Health Connect, counted the way Samsung Health shows it (checked against its records):
 * - Samsung's sleep time is each sleep session from falling asleep to waking, short awake moments included;
 * - a night it splits into pieces (awake for a while in between) is one night: sessions of the same app less
 *   than [GAP] apart are joined, and their lengths added (the time between them is not sleep);
 * - the night belongs to the day you wake up; the longest night that day counts (an afternoon nap doesn't);
 * - when two apps recorded the same night, the app with the longest night that day is used (never mixed).
 * Times are added in milliseconds and rounded once.
 */
object SleepMath {
    const val GAP = 90 * 60_000L

    /** `source`: the app that wrote it; times in epoch ms; `day(end)` gives the local date of a time. */
    data class Session(val source: String, val start: Long, val end: Long)
    data class Night(val source: String, val start: Long, val end: Long, val asleepMs: Long, val sessions: List<Session>)

    /** The nights in `sessions`, each the joined pieces of one app's sleep. */
    fun nights(sessions: List<Session>): List<Night> = sessions.filter { it.end > it.start }.groupBy { it.source }.flatMap { (source, list) ->
        val out = mutableListOf<MutableList<Session>>()
        for (s in list.sortedBy { it.start }) {
            val last = out.lastOrNull()
            if (last != null && s.start - last.maxOf { it.end } < GAP) last += s else out += mutableListOf(s)
        }
        out.map { l ->
            // Overlapping pieces (rare) count once.
            var asleep = 0L; var reach = Long.MIN_VALUE
            for (s in l.sortedBy { it.start }) { val from = maxOf(s.start, reach); if (s.end > from) asleep += s.end - from; reach = maxOf(reach, s.end) }
            Night(source, l.minOf { it.start }, l.maxOf { it.end }, asleep, l)
        }
    }

    /** The night that counts for each day (by the day it ends): the longest of any app. */
    fun byDay(sessions: List<Session>, day: (Long) -> String): Map<String, Night> =
        nights(sessions).groupBy { day(it.end) }.mapValues { (_, l) -> l.maxBy { it.asleepMs } }

    /** Hours with two decimals (36 s: the minutes Samsung Health shows survive), or null for under 30 minutes (a stray
     *  record) or over 18 h. */
    fun hours(ms: Long?): Double? = ms?.takeIf { it in 30 * 60_000L..18 * 3_600_000L }?.let { Math.round(it / 36_000.0) / 100.0 }
}
