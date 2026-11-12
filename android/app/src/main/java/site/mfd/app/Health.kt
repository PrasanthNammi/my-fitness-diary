package site.mfd.app

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Sleep and steps from Android Health Connect (where Samsung Health, Fitbit, Google Fit… share them), read only
 * while MFD is open, only with the person's permission, and only these two kinds of data. They fill the recovery
 * check-ins in the diary (frontend/lib/health.ts). Nothing is written to Health Connect.
 */
object Health {
    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
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

    /** Which of sleep and steps the person allowed (they can allow one and not the other). */
    suspend fun allowed(ctx: Context): Set<String> =
        if (availability(ctx) != "ready") emptySet()
        else HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions().intersect(PERMISSIONS)

    /** At least one of the two is allowed. */
    suspend fun granted(ctx: Context): Boolean = allowed(ctx).isNotEmpty()

    data class Day(val date: LocalDate, val sleepHours: Double?, val steps: Long?)
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
            days += Day(d, hours, steps?.takeIf { it in 1..200_000 })
            d = d.plusDays(1)
        }
        return days
    }
}
