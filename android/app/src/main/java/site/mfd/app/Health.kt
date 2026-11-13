package site.mfd.app

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import kotlin.reflect.KClass
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Health data from Android Health Connect (where Samsung Health, Fitbit, Google Fit… share it), read only while MFD
 * is open and only with the person's permission (each kind can be allowed alone): sleep, steps, heart rate during
 * workouts, resting heart rate, heart-rate variability, weight and body fat. They fill the recovery check-ins,
 * weigh-ins and workout heart rate in the diary (frontend/lib/health.ts). Nothing is written to Health Connect.
 */
object Health {
    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
    )
    const val PROVIDER = "com.google.android.apps.healthdata"
    /** At most this many days per read. */
    const val MAX_DAYS = 31L

    /** "ready", "install" (Health Connect needs installing or updating) or "unsupported". */
    fun availability(ctx: Context): String = when (HealthConnectClient.getSdkStatus(ctx, PROVIDER)) {
        HealthConnectClient.SDK_AVAILABLE -> "ready"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "install"
        else -> "unsupported"
    }

    private val SLEEP = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private val STEPS = HealthPermission.getReadPermission(StepsRecord::class)
    private val HEART = HealthPermission.getReadPermission(HeartRateRecord::class)
    private val RESTING = HealthPermission.getReadPermission(RestingHeartRateRecord::class)
    private val HRV = HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class)
    private val WEIGHT = HealthPermission.getReadPermission(WeightRecord::class)
    private val BODY_FAT = HealthPermission.getReadPermission(BodyFatRecord::class)

    /** Every record of a kind in the range, page by page (at most `limit`). */
    private suspend fun <T : Record> readAll(client: HealthConnectClient, type: KClass<T>, range: TimeRangeFilter, limit: Int): List<T> {
        val out = mutableListOf<T>()
        var page: String? = null
        do {
            val response = client.readRecords(ReadRecordsRequest(type, range, pageToken = page))
            out += response.records
            page = response.pageToken
        } while (page != null && out.size < limit)
        return out
    }

    /** Names of the kinds MFD may read, for Settings → Health & devices. */
    suspend fun readable(ctx: Context): List<String> {
        val a = allowed(ctx)
        return listOf("sleep" to SLEEP, "steps" to STEPS, "heart" to HEART, "restingHr" to RESTING, "hrv" to HRV, "weight" to WEIGHT, "bodyFat" to BODY_FAT)
            .filter { it.second in a }.map { it.first }
    }

    /** Takes back every Health Connect permission MFD has (Settings → Health & devices → Disconnect). */
    suspend fun disconnect(ctx: Context) {
        if (availability(ctx) == "ready") HealthConnectClient.getOrCreate(ctx).permissionController.revokeAllPermissions()
    }

    /** Which of sleep and steps the person allowed (they can allow one and not the other). */
    suspend fun allowed(ctx: Context): Set<String> =
        if (availability(ctx) != "ready") emptySet()
        else HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions().intersect(PERMISSIONS)

    /** At least one of the two is allowed. */
    suspend fun granted(ctx: Context): Boolean = allowed(ctx).isNotEmpty()

    data class Day(
        val date: LocalDate, val sleepHours: Double?, val steps: Long?,
        val restingHr: Long? = null, val hrvMs: Double? = null, val weightKg: Double? = null, val bodyFatPct: Double? = null,
        val stages: Stages? = null,
    )
    /** The night's main sleep session by stage (minutes), with when it started and ended. */
    data class Stages(val deep: Long, val light: Long, val rem: Long, val awake: Long, val start: Instant, val end: Instant)
    data class Span(val start: Instant, val end: Instant)

    /** Overlapping or touching spans joined. */
    fun union(spans: List<Span>): List<Span> = spans.filter { it.end.isAfter(it.start) }.sortedBy { it.start }
        .fold(mutableListOf()) { acc, s ->
            val last = acc.lastOrNull()
            if (last != null && !s.start.isAfter(last.end)) acc[acc.size - 1] = Span(last.start, maxOf(last.end, s.end)) else acc += s
            acc
        }

    /** `spans` with every part covered by `cut` removed (both already joined). */
    fun subtract(spans: List<Span>, cut: List<Span>): List<Span> = spans.flatMap { s ->
        var pieces = listOf(s)
        for (c in cut) pieces = pieces.flatMap { p ->
            if (!c.end.isAfter(p.start) || !c.start.isBefore(p.end)) listOf(p)
            else listOfNotNull(Span(p.start, c.start).takeIf { c.start.isAfter(p.start) }, Span(c.end, p.end).takeIf { p.end.isAfter(c.end) })
        }
        pieces
    }

    /** Sleep counts on the day it ends (last night's sleep belongs to this morning); awake time is left out. */
    suspend fun read(ctx: Context, from: LocalDate, to: LocalDate): List<Day> {
        require(!to.isBefore(from) && Duration.between(from.atStartOfDay(), to.atStartOfDay()).toDays() < MAX_DAYS)
        val client = HealthConnectClient.getOrCreate(ctx)
        val zone = ZoneId.systemDefault()
        val allowed = allowed(ctx)
        if (allowed.isEmpty()) throw SecurityException("Health Connect access not allowed")
        // Sessions ending on these days can start the evening before.
        val sessions = mutableListOf<SleepSessionRecord>()
        var page: String? = null
        if (SLEEP in allowed) do {
            val response = client.readRecords(ReadRecordsRequest(
                SleepSessionRecord::class,
                TimeRangeFilter.between(from.minusDays(1).atStartOfDay(zone).toInstant(), to.plusDays(1).atStartOfDay(zone).toInstant()),
                pageToken = page,
            ))
            sessions += response.records
            page = response.pageToken
        } while (SLEEP in allowed && page != null && sessions.size < 1000)

        // Asleep time from every source together, minus time any source recorded as awake: the same night can
        // arrive from two apps (a watch and a phone), so overlapping time is counted once.
        val awakeStages = setOf(SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED, SleepSessionRecord.STAGE_TYPE_OUT_OF_BED)
        val asleep = mutableListOf<Span>()
        val awake = mutableListOf<Span>()
        for (s in sessions) {
            if (s.stages.isEmpty()) asleep += Span(s.startTime, s.endTime)
            else for (stage in s.stages) (if (stage.stage in awakeStages) awake else asleep) += Span(stage.startTime, stage.endTime)
        }
        val sleepByDay = mutableMapOf<LocalDate, Long>() // minutes
        for (span in subtract(union(asleep), union(awake))) {
            val day = span.end.atZone(zone).toLocalDate()
            if (day.isBefore(from) || day.isAfter(to)) continue
            sleepByDay[day] = (sleepByDay[day] ?: 0) + Duration.between(span.start, span.end).toMinutes()
        }

        // Stages: the longest session ending that day that has them (a second app's copy of the same night is not
        // added). "Sleeping" without a stage counts as light sleep.
        val stagesByDay = sessions.filter { it.stages.isNotEmpty() }.groupBy { it.endTime.atZone(zone).toLocalDate() }
            .mapValues { (_, l) ->
                val s = l.maxBy { Duration.between(it.startTime, it.endTime) }
                fun mins(vararg types: Int) = s.stages.filter { it.stage in types }.sumOf { Duration.between(it.startTime, it.endTime).toMinutes() }
                Stages(mins(SleepSessionRecord.STAGE_TYPE_DEEP), mins(SleepSessionRecord.STAGE_TYPE_LIGHT, SleepSessionRecord.STAGE_TYPE_SLEEPING, SleepSessionRecord.STAGE_TYPE_UNKNOWN),
                    mins(SleepSessionRecord.STAGE_TYPE_REM), mins(*awakeStages.toIntArray()), s.startTime, s.endTime)
            }.filterValues { it.deep + it.light + it.rem >= 30 }

        // Steps: Health Connect's own daily total (it combines sources by the person's priority list). When that
        // is empty (a source not on the list), the busiest single source, so a phone and a watch counting the same
        // walk are not added together.
        val stepRecords = mutableListOf<StepsRecord>()
        page = null
        if (STEPS in allowed) do {
            val response = client.readRecords(ReadRecordsRequest(
                StepsRecord::class,
                TimeRangeFilter.between(from.atStartOfDay(zone).toInstant(), to.plusDays(1).atStartOfDay(zone).toInstant()),
                pageToken = page,
            ))
            stepRecords += response.records
            page = response.pageToken
        } while (page != null && stepRecords.size < 20_000)
        val bySource = stepRecords.groupBy { it.startTime.atZone(zone).toLocalDate() }
            .mapValues { (_, list) -> list.groupBy { it.metadata.dataOrigin.packageName }.values.maxOfOrNull { r -> r.sumOf { it.count } } }

        // One value per day for the rest: the day's latest resting heart rate, weight and body fat, and the average
        // HRV (watches measure it several times a night). Values outside human ranges are ignored.
        val dayRange = TimeRangeFilter.between(from.atStartOfDay(zone).toInstant(), to.plusDays(1).atStartOfDay(zone).toInstant())
        fun day(t: Instant) = t.atZone(zone).toLocalDate()
        val resting = if (RESTING !in allowed) emptyMap() else readAll(client, RestingHeartRateRecord::class, dayRange, 2000)
            .filter { it.beatsPerMinute in 25..150 }.groupBy { day(it.time) }.mapValues { (_, l) -> l.maxBy { it.time }.beatsPerMinute }
        val hrv = if (HRV !in allowed) emptyMap() else readAll(client, HeartRateVariabilityRmssdRecord::class, dayRange, 5000)
            .filter { it.heartRateVariabilityMillis in 1.0..300.0 }.groupBy { day(it.time) }
            .mapValues { (_, l) -> Math.round(l.map { it.heartRateVariabilityMillis }.average() * 10) / 10.0 }
        val weight = if (WEIGHT !in allowed) emptyMap() else readAll(client, WeightRecord::class, dayRange, 2000)
            .filter { it.weight.inKilograms in 20.0..400.0 }.groupBy { day(it.time) }
            .mapValues { (_, l) -> Math.round(l.maxBy { it.time }.weight.inKilograms * 100) / 100.0 }
        val fat = if (BODY_FAT !in allowed) emptyMap() else readAll(client, BodyFatRecord::class, dayRange, 2000)
            .filter { it.percentage.value in 2.0..70.0 }.groupBy { day(it.time) }
            .mapValues { (_, l) -> Math.round(l.maxBy { it.time }.percentage.value * 10) / 10.0 }

        val days = mutableListOf<Day>()
        var d = from
        while (!d.isAfter(to)) {
            val steps = if (STEPS !in allowed) null else client.aggregate(AggregateRequest(
                setOf(StepsRecord.COUNT_TOTAL),
                TimeRangeFilter.between(d.atStartOfDay(zone).toInstant(), d.plusDays(1).atStartOfDay(zone).toInstant()),
            ))[StepsRecord.COUNT_TOTAL]?.takeIf { it > 0 } ?: bySource[d]
            val minutes = sleepByDay[d]
            // Under 30 minutes is a nap or a stray record, not a night's sleep; over 18 hours is an error.
            val hours = minutes?.takeIf { it in 30..18 * 60 }?.let { Math.round(it / 6.0) / 10.0 }
            days += Day(d, hours, steps?.takeIf { it in 1..200_000 }, resting[d], hrv[d], weight[d], fat[d], stagesByDay[d])
            d = d.plusDays(1)
        }
        return days
    }

    data class HeartSeries(val samples: List<Pair<Long, Long>>, val avg: Long?, val max: Long?)
    /** Workouts are at most this long for a heart-rate read. */
    val MAX_WINDOW: Duration = Duration.ofHours(8)

    /**
     * Heart rate during a workout: every sample between `start` and `end`, averaged into 5-second steps (seconds from
     * the start, bpm), with the average and maximum. Watches on their own measure only now and then; during a workout
     * they record every second or so.
     */
    suspend fun heart(ctx: Context, start: Instant, end: Instant): HeartSeries {
        require(end.isAfter(start) && Duration.between(start, end) <= MAX_WINDOW)
        if (HEART !in allowed(ctx)) throw SecurityException("Heart rate not allowed")
        val records = readAll(HealthConnectClient.getOrCreate(ctx), HeartRateRecord::class, TimeRangeFilter.between(start, end), 2000)
        val points = records.flatMap { it.samples }.filter { !it.time.isBefore(start) && !it.time.isAfter(end) && it.beatsPerMinute in 30..250 }
        if (points.isEmpty()) return HeartSeries(emptyList(), null, null)
        val buckets = points.groupBy { Duration.between(start, it.time).seconds / 5 * 5 }.toSortedMap()
            .map { (t, l) -> t to Math.round(l.map { it.beatsPerMinute }.average()) }
        return HeartSeries(buckets, Math.round(points.map { it.beatsPerMinute }.average()), points.maxOf { it.beatsPerMinute })
    }
}
