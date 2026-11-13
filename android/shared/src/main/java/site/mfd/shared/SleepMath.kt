package site.mfd.shared

/**
 * A night's sleep from Health Connect, counted the way Samsung Health shows it: each session counts whole on the
 * day it ends, asleep = the session's non-awake stages (or the whole session when it has no stages); when two apps
 * recorded the same night, the app with the most sleep that day is used (their stages are never mixed). Times are
 * added in milliseconds and rounded once.
 */
object SleepMath {
    const val AWAKE = 1; const val SLEEPING = 2; const val OUT_OF_BED = 3; const val LIGHT = 4; const val DEEP = 5; const val REM = 6; const val AWAKE_IN_BED = 7
    private val awake = setOf(AWAKE, OUT_OF_BED, AWAKE_IN_BED)

    data class Stage(val type: Int, val start: Long, val end: Long)
    /** `day`: the local date the session ends on (yyyy-mm-dd); `source`: the app that wrote it. */
    data class Session(val day: String, val source: String, val start: Long, val end: Long, val stages: List<Stage>)

    fun asleepMs(s: Session): Long =
        if (s.stages.isEmpty()) maxOf(0, s.end - s.start)
        else s.stages.filter { it.type !in awake }.sumOf { maxOf(0, minOf(it.end, s.end) - maxOf(it.start, s.start)) }

    /** Asleep milliseconds per day. */
    fun byDay(sessions: List<Session>): Map<String, Long> =
        sessions.groupBy { it.day }.mapValues { (_, l) -> l.groupBy { it.source }.values.maxOf { list -> list.sumOf(::asleepMs) } }

    /** Hours with one decimal (as MFD stores them), or null for under 30 minutes (a stray record) or over 18 h. */
    fun hours(ms: Long?): Double? = ms?.takeIf { it in 30 * 60_000L..18 * 3_600_000L }?.let { Math.round(it / 360_000.0) / 10.0 }
}
