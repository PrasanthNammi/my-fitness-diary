package site.mfd.app

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import site.mfd.shared.HealthWrite
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import kotlin.reflect.KClass
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import site.mfd.shared.SleepMath
import java.time.ZoneId

/**
 * Health data from Android Health Connect (where Samsung Health, Fitbit, Google Fit… share it), read only while MFD
 * is open and only with the person's permission (each kind can be allowed alone): sleep, steps, heart rate during
 * workouts, resting heart rate, heart-rate variability, weight and body fat. They fill the recovery check-ins,
 * weigh-ins and workout heart rate in the diary (frontend/lib/health.ts).
 *
 * From 2.0, when the person turns it on (separately for workouts and food), MFD also saves its finished workouts
 * (with the MFD watch's heart rate) and food diary to Health Connect, so Samsung Health shows them ([write]).
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
    /** Saving to Health Connect, by what the person turned on. */
    val WRITE = mapOf(
        "workouts" to setOf(HealthPermission.getWritePermission(ExerciseSessionRecord::class), HealthPermission.getWritePermission(HeartRateRecord::class)),
        "food" to setOf(HealthPermission.getWritePermission(NutritionRecord::class)),
    )
    private val WRITE_EXERCISE = HealthPermission.getWritePermission(ExerciseSessionRecord::class)
    private val WRITE_HEART = HealthPermission.getWritePermission(HeartRateRecord::class)
    private val WRITE_FOOD = HealthPermission.getWritePermission(NutritionRecord::class)
    const val PROVIDER = "com.google.android.apps.healthdata"
    /** At most this many days per read. */
    const val MAX_DAYS = 31L

    /** "ready", "install" (Health Connect needs installing or updating) or "unsupported". */
    /** Cycle & Health: period days (asked for separately, only when the person switches it on there). */
    val CYCLE = setOf(HealthPermission.getReadPermission(MenstruationPeriodRecord::class), HealthPermission.getReadPermission(MenstruationFlowRecord::class))

    /** Period days between `from` and `to` (inclusive): days inside a period record or with a flow entry, with the
     *  flow when one was recorded ("light" / "medium" / "heavy"). Spotting-only entries are not periods. */
    suspend fun periods(ctx: Context, from: LocalDate, to: LocalDate): Map<LocalDate, String?> {
        val client = HealthConnectClient.getOrCreate(ctx)
        val zone = ZoneId.systemDefault()
        val range = TimeRangeFilter.between(from.atStartOfDay(zone).toInstant(), to.plusDays(1).atStartOfDay(zone).toInstant())
        val granted = client.permissionController.getGrantedPermissions()
        val out = sortedMapOf<LocalDate, String?>()
        if (HealthPermission.getReadPermission(MenstruationPeriodRecord::class) in granted)
            for (p in readAll(client, MenstruationPeriodRecord::class, range, 2000)) {
                var d = p.startTime.atZone(zone).toLocalDate()
                val last = p.endTime.minusMillis(1).atZone(zone).toLocalDate()
                var n = 0
                while (!d.isAfter(last) && n++ < 20) { if (!d.isBefore(from) && !d.isAfter(to)) out.putIfAbsent(d, null); d = d.plusDays(1) }
            }
        if (HealthPermission.getReadPermission(MenstruationFlowRecord::class) in granted)
            for (f in readAll(client, MenstruationFlowRecord::class, range, 5000)) {
                val flow = when (f.flow) { MenstruationFlowRecord.FLOW_LIGHT -> "light"; MenstruationFlowRecord.FLOW_MEDIUM -> "medium"; MenstruationFlowRecord.FLOW_HEAVY -> "heavy"; else -> null } ?: continue
                out[f.time.atZone(zone).toLocalDate()] = flow
            }
        return out
    }

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

    /** Which kinds MFD may save ("workouts", "food"). */
    suspend fun writable(ctx: Context): Set<String> {
        if (availability(ctx) != "ready") return emptySet()
        val granted = HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions()
        return WRITE.filterValues { granted.contains(it.first()) }.keys
    }

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

        // Sleep as Samsung Health counts it (site.mfd.shared.SleepMath): falling asleep to waking, a night's pieces
        // joined, on the day you wake up; the day's total (a second sleep or a nap too); one app, never mixed.
        val awakeStages = setOf(SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED, SleepSessionRecord.STAGE_TYPE_OUT_OF_BED)
        val nights = SleepMath.byDay(sessions.map { SleepMath.Session(it.metadata.dataOrigin.packageName, it.startTime.toEpochMilli(), it.endTime.toEpochMilli()) }) {
            Instant.ofEpochMilli(it).atZone(zone).toLocalDate().toString()
        }

        // Stages of the day's main night (all its pieces); "Sleeping" without a stage counts as light sleep.
        val stagesByDay = nights.mapValues { (_, sleep) -> sleep.main }.mapValues { (_, night) ->
            val stages = sessions.filter { it.metadata.dataOrigin.packageName == night.source && it.startTime.toEpochMilli() >= night.start && it.endTime.toEpochMilli() <= night.end }
                .flatMap { it.stages }
            fun mins(vararg types: Int) = stages.filter { it.stage in types }.sumOf { Duration.between(it.startTime, it.endTime).toMillis() } / 60_000
            Stages(mins(SleepSessionRecord.STAGE_TYPE_DEEP), mins(SleepSessionRecord.STAGE_TYPE_LIGHT, SleepSessionRecord.STAGE_TYPE_SLEEPING, SleepSessionRecord.STAGE_TYPE_UNKNOWN),
                mins(SleepSessionRecord.STAGE_TYPE_REM), mins(*awakeStages.toIntArray()), Instant.ofEpochMilli(night.start), Instant.ofEpochMilli(night.end))
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
        // Samsung Health doesn't write resting heart rate to Health Connect: for nights without one, the lowest
        // 30-minute average of the heart rate during that night's main sleep (site.mfd.shared.RestingRate).
        val sleepResting: Map<LocalDate, Long> = if (HEART !in allowed) emptyMap() else stagesByDay
            .filterKeys { LocalDate.parse(it) !in resting.keys }
            .mapNotNull { (d, night) ->
                val heart = try { readAll(client, HeartRateRecord::class, TimeRangeFilter.between(night.start, night.end), 200) } catch (e: Exception) { emptyList() }
                site.mfd.shared.RestingRate.lowest30(heart.flatMap { r -> r.samples.map { it.time.toEpochMilli() to it.beatsPerMinute } })?.let { LocalDate.parse(d) to it }
            }.toMap()
        val hrv = if (HRV !in allowed) emptyMap() else readAll(client, HeartRateVariabilityRmssdRecord::class, dayRange, 5000)
            .filter { it.heartRateVariabilityMillis in 1.0..300.0 }.groupBy { day(it.time) }
            .mapValues { (_, l) -> Math.round(l.map { it.heartRateVariabilityMillis }.average() * 10) / 10.0 }
        val weight = if (WEIGHT !in allowed) emptyMap() else readAll(client, WeightRecord::class, dayRange, 2000)
            .filter { it.weight.inKilograms in 20.0..400.0 }.groupBy { day(it.time) }
            .mapValues { (_, l) -> Math.round(l.maxBy { it.time }.weight.inKilograms * 100) / 100.0 }
        val fat = if (BODY_FAT !in allowed) emptyMap() else readAll(client, BodyFatRecord::class, dayRange, 2000)
            .filter { it.percentage.value in 2.0..70.0 }.groupBy { day(it.time) }
            .mapValues { (_, l) -> Math.round(l.maxBy { it.time }.percentage.value * 10) / 10.0 }

        // Steps per local calendar day, as Samsung Health counts them: Health Connect's own daily totals by local
        // date (a record crossing midnight is split the same way), with sources combined by the person's priority list.
        val stepsByDay: Map<LocalDate, Long> = if (STEPS !in allowed) emptyMap() else client.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(
            metrics = setOf(StepsRecord.COUNT_TOTAL),
            timeRangeFilter = TimeRangeFilter.between(from.atStartOfDay(), to.plusDays(1).atStartOfDay()),
            timeRangeSlicer = Period.ofDays(1),
        )).associate { it.startTime.toLocalDate() to (it.result[StepsRecord.COUNT_TOTAL] ?: 0L) }

        val days = mutableListOf<Day>()
        var d = from
        while (!d.isAfter(to)) {
            // Steps: the busiest single app's records (by start), which is exactly Samsung Health's own total; Health
            // Connect's merged total can be a step short where two apps overlap. Merged total when no records.
            val steps = if (STEPS !in allowed) null else bySource[d]?.takeIf { it > 0 } ?: stepsByDay[d]?.takeIf { it > 0 }
            // Under 30 minutes is a stray record, not a night's sleep; over 18 hours is an error.
            val hours = SleepMath.hours(nights[d.toString()]?.asleepMs)
            days += Day(d, hours, steps?.takeIf { it in 1..200_000 }, resting[d] ?: sleepResting[d], hrv[d], weight[d], fat[d], stagesByDay[d.toString()])
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

    data class Written(val workouts: Int, val meals: Int, val removed: Int)

    private val MEAL_TYPES = mapOf("breakfast" to MealType.MEAL_TYPE_BREAKFAST, "lunch" to MealType.MEAL_TYPE_LUNCH, "dinner" to MealType.MEAL_TYPE_DINNER, "snacks" to MealType.MEAL_TYPE_SNACK)

    /**
     * Saves workouts and food to Health Connect and removes ones deleted in MFD. Each record's client id is its MFD id
     * ("mfd-w-…", "mfd-hr-…", "mfd-f-…") with a newer version each time, so saving again updates it in place. Kinds the
     * person didn't allow are skipped.
     */
    suspend fun write(ctx: Context, r: HealthWrite.Request): Written {
        val client = HealthConnectClient.getOrCreate(ctx)
        val granted = client.permissionController.getGrantedPermissions()
        if (WRITE_EXERCISE !in granted && WRITE_FOOD !in granted) throw SecurityException("Saving to Health Connect not allowed")
        val zone = ZoneId.systemDefault()
        fun offset(ms: Long) = zone.rules.getOffset(Instant.ofEpochMilli(ms))
        val records = mutableListOf<Record>()
        var workouts = 0; var meals = 0; var removed = 0
        if (WRITE_EXERCISE in granted) for (w in r.workouts) {
            records += ExerciseSessionRecord(
                startTime = Instant.ofEpochMilli(w.start), startZoneOffset = offset(w.start), endTime = Instant.ofEpochMilli(w.end), endZoneOffset = offset(w.end),
                metadata = Metadata.manualEntry("mfd-w-${w.id}", w.version), exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
                title = w.title, notes = w.notes.ifEmpty { null },
            )
            // The MFD watch's readings: one sample per step, in the middle of it, within the workout.
            val samples = w.bpm.mapIndexedNotNull { i, b ->
                val t = w.start + (i * w.interval + w.interval / 2) * 1000L
                if (b > 0 && t < w.end) HeartRateRecord.Sample(Instant.ofEpochMilli(t), b.toLong()) else null
            }
            if (WRITE_HEART in granted && samples.isNotEmpty()) records += HeartRateRecord(
                startTime = Instant.ofEpochMilli(w.start), startZoneOffset = offset(w.start), endTime = Instant.ofEpochMilli(w.end), endZoneOffset = offset(w.end),
                samples = samples, metadata = Metadata.activelyRecorded(Device(type = Device.TYPE_WATCH), "mfd-hr-${w.id}", w.version),
            )
            workouts++
        }
        if (WRITE_FOOD in granted) for (m in r.meals) {
            records += NutritionRecord(
                startTime = Instant.ofEpochMilli(m.start), startZoneOffset = offset(m.start), endTime = Instant.ofEpochMilli(m.start + 60_000), endZoneOffset = offset(m.start + 60_000),
                metadata = Metadata.manualEntry("mfd-f-${m.id}", m.version), name = m.name, mealType = MEAL_TYPES[m.meal] ?: MealType.MEAL_TYPE_UNKNOWN,
                energy = Energy.kilocalories(m.kcal), protein = Mass.grams(m.protein), totalCarbohydrate = Mass.grams(m.carbs), totalFat = Mass.grams(m.fat),
                sugar = m.sugars?.let { Mass.grams(it) }, saturatedFat = m.saturates?.let { Mass.grams(it) }, dietaryFiber = m.fibre?.let { Mass.grams(it) },
                sodium = m.salt?.let { Mass.grams(it / 2.5) }, // salt is 2.5 × sodium
            )
            meals++
        }
        for (part in records.chunked(100)) client.insertRecords(part)
        if (WRITE_EXERCISE in granted && r.removeWorkouts.isNotEmpty()) {
            client.deleteRecords(ExerciseSessionRecord::class, emptyList(), r.removeWorkouts.map { "mfd-w-$it" })
            if (WRITE_HEART in granted) client.deleteRecords(HeartRateRecord::class, emptyList(), r.removeWorkouts.map { "mfd-hr-$it" })
            removed += r.removeWorkouts.size
        }
        if (WRITE_FOOD in granted && r.removeMeals.isNotEmpty()) {
            client.deleteRecords(NutritionRecord::class, emptyList(), r.removeMeals.map { "mfd-f-$it" })
            removed += r.removeMeals.size
        }
        return Written(workouts, meals, removed)
    }

    /** Test builds only (WEB_DEBUG): the raw sleep sessions of the last days, to compare with Samsung Health. */
    suspend fun sleepDebug(ctx: Context, days: Long): org.json.JSONArray {
        val zone = ZoneId.systemDefault(); val now = Instant.now()
        val out = org.json.JSONArray()
        for (s in readAll(HealthConnectClient.getOrCreate(ctx), SleepSessionRecord::class, TimeRangeFilter.between(now.minus(Duration.ofDays(days)), now), 500))
            out.put(org.json.JSONObject().put("app", s.metadata.dataOrigin.packageName).put("start", s.startTime.atZone(zone).toString()).put("end", s.endTime.atZone(zone).toString())
                .put("min", Duration.between(s.startTime, s.endTime).toMinutes()).put("id", s.metadata.id.take(8))
                .put("stages", org.json.JSONArray(s.stages.groupBy { it.stage }.map { (k, l) -> "$k:${l.sumOf { Duration.between(it.startTime, it.endTime).toMinutes() }}" })))
        return out
    }

    /** Test builds only (WEB_DEBUG): steps per day counted several ways, to see which matches Samsung Health. */
    suspend fun stepsDebug(ctx: Context, from: LocalDate, to: LocalDate): org.json.JSONArray {
        val client = HealthConnectClient.getOrCreate(ctx); val zone = ZoneId.systemDefault()
        val grouped = client.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(from.atStartOfDay(), to.plusDays(1).atStartOfDay()), Period.ofDays(1)))
            .associate { it.startTime.toLocalDate() to it.result[StepsRecord.COUNT_TOTAL] }
        val records = readAll(client, StepsRecord::class, TimeRangeFilter.between(from.minusDays(1).atStartOfDay(zone).toInstant(), to.plusDays(2).atStartOfDay(zone).toInstant()), 50_000)
        val out = org.json.JSONArray(); var d = from
        while (!d.isAfter(to)) {
            val s = d.atStartOfDay(zone).toInstant(); val e = d.plusDays(1).atStartOfDay(zone).toInstant()
            val instant = client.aggregate(androidx.health.connect.client.request.AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(s, e)))[StepsRecord.COUNT_TOTAL]
            val byApp = records.filter { !it.startTime.isBefore(s) && it.startTime.isBefore(e) }.groupBy { it.metadata.dataOrigin.packageName.split('.').takeLast(2).joinToString(".") }
                .mapValues { (_, l) -> l.sumOf { it.count } }
            val crossing = records.filter { it.startTime.isBefore(e) && it.endTime.isAfter(e) }.map { "${it.metadata.dataOrigin.packageName.takeLast(10)} ${it.count} ${it.startTime.atZone(zone).toLocalTime()}-${it.endTime.atZone(zone).toLocalTime()}" }
            out.put(org.json.JSONObject().put("day", d.toString()).put("grouped", grouped[d]).put("instant", instant).put("byApp", org.json.JSONObject(byApp as Map<*, *>)).put("crossMidnight", org.json.JSONArray(crossing)))
            d = d.plusDays(1)
        }
        return out
    }
}
