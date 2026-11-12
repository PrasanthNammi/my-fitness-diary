package site.mfd.wear

import org.json.JSONObject

/**
 * The watch's own copy of the workout rules (frontend/domain/watchCommands.ts), so a tap shows at once even when the
 * phone is out of reach or locked. The phone applies the same command for real; its next snapshot replaces this view.
 * Keep the two in step: tests in EngineTest mirror tests/watch-commands.cjs.
 */
object Engine {
    /** The values an exercise type records (domain/training.ts trackingFields). Floors and steps stay on the phone. */
    fun fields(tracking: String): List<String> = when (tracking) {
        "weight_reps", "weighted_bodyweight", "assisted_bodyweight" -> listOf("weightKg", "reps")
        "reps" -> listOf("reps")
        "time" -> listOf("timeSec")
        "weight_time" -> listOf("weightKg", "timeSec")
        "distance_time" -> listOf("distanceKm", "timeSec")
        "weight_distance" -> listOf("weightKg", "distanceKm")
        else -> emptyList()
    }

    fun get(v: Values, f: String): Double? = when (f) {
        "weightKg" -> v.weightKg; "reps" -> v.reps?.toDouble(); "timeSec" -> v.timeSec?.toDouble(); "distanceKm" -> v.distanceKm; else -> null
    }
    fun with(v: Values, f: String, x: Double?): Values = when (f) {
        "weightKg" -> v.copy(weightKg = x); "reps" -> v.copy(reps = x?.toInt()); "timeSec" -> v.copy(timeSec = x?.toInt()); "distanceKm" -> v.copy(distanceKm = x); else -> v
    }
    /** What a set shows before logging: typed, else faded target, else last session. */
    fun shown(s: SetRow, f: String): Double? = get(s.v, f) ?: get(s.t, f) ?: s.p?.let { get(it, f) }

    private fun valid(f: String, x: Double?): Boolean =
        x != null && x.isFinite() && x >= 0 && (f == "weightKg" || x > 0) && (f !in setOf("reps") || x == Math.floor(x))

    private fun values(o: JSONObject?): Values {
        if (o == null) return Values.EMPTY
        fun d(k: String) = if (o.has(k) && !o.isNull(k)) o.optDouble(k).takeIf { it.isFinite() } else null
        return Values(d("weightKg"), d("reps")?.toInt(), d("timeSec")?.toInt(), d("distanceKm"))
    }
    private fun merge(base: Values, typed: Values) = Values(typed.weightKg ?: base.weightKg, typed.reps ?: base.reps, typed.timeSec ?: base.timeSec, typed.distanceKm ?: base.distanceKm)

    /** Superset helpers (frontend/domain/supersets.ts). */
    private fun join(list: List<Block>, aId: String, bId: String, newId: String): List<Block> {
        val a = list.first { it.id == aId }; val b = list.first { it.id == bId }
        val sid = a.supersetId ?: b.supersetId ?: newId
        val moved = list.map { if (it.id == aId || it.id == bId) it.copy(supersetId = sid) else it }
        val bBlock = moved.first { it.id == bId }
        val without = moved.filter { it.id != bId }.toMutableList()
        without.add(without.indexOfFirst { it.id == aId } + 1, bBlock)
        return without
    }
    private fun leave(list: List<Block>, id: String): List<Block> {
        val sid = list.firstOrNull { it.id == id }?.supersetId
        var next = list.map { if (it.id == id) it.copy(supersetId = null) else it }
        if (sid != null && next.count { it.supersetId == sid } < 2) next = next.map { if (it.supersetId == sid) it.copy(supersetId = null) else it }
        return next
    }

    /** Applies one command to the workout; anything that doesn't fit leaves it unchanged. */
    fun apply(w: Workout, c: JSONObject): Workout {
        if (c.optString("workoutId") != w.id) return w
        if (c.optString("type") == "addExercise") {
            // The watch sends the name and tracking type with it, so the new exercise shows before the phone answers.
            val id = c.optString("newBlock"); val name = c.optString("name"); val tracking = c.optString("tracking")
            if (id.isEmpty() || name.isEmpty() || w.blocks.any { it.id == id } || w.blocks.size >= 40) return w
            val ids = c.optJSONArray("newSets")
            val count = c.optInt("sets", 3).coerceIn(1, 10)
            val block = Block(id, c.optString("exercise"), name, tracking, if (tracking == "distance_time") 0 else c.optInt("restSec", 90), null, c.optDouble("step", 1.0),
                (0 until count).map { i -> SetRow(ids?.optString(i)?.takeIf { it.isNotEmpty() } ?: "$id-$i", "normal", false, false, Values.EMPTY, Values.EMPTY, values(c.optJSONObject("last")).takeIf { it != Values.EMPTY }) })
            var blocks = w.blocks + block
            val into = c.optString("supersetWith")
            if (into.isNotEmpty() && blocks.any { it.id == into }) blocks = join(blocks, into, id, "ss-$id")
            return w.copy(blocks = blocks, timers = w.timers + (id to Timer(null, block.restSec)))
        }
        val bi = w.blocks.indexOfFirst { it.id == c.optString("block") }
        val b = w.blocks.getOrNull(bi) ?: return w
        val si = b.sets.indexOfFirst { it.id == c.optString("set") }
        val s = b.sets.getOrNull(si)
        val now = c.optLong("at", System.currentTimeMillis())
        fun withSets(sets: List<SetRow>, timers: Map<String, Timer> = w.timers) = w.copy(blocks = w.blocks.toMutableList().also { it[bi] = b.copy(sets = sets) }, timers = timers)
        fun replace(row: SetRow) = b.sets.toMutableList().also { it[si] = row }
        return when (c.optString("type")) {
            "logSet" -> {
                if (s == null || s.done) return w
                val draft = s.copy(v = merge(s.v, values(c.optJSONObject("values"))))
                var logged = draft.v
                for (f in fields(b.tracking)) { val x = shown(draft, f); if (!valid(f, x)) return w; logged = with(logged, f, x) }
                val timers = if (b.restSec > 0) w.timers + (b.id to Timer(now + b.restSec * 1000L, b.restSec)) else w.timers
                withSets(replace(draft.copy(v = logged, done = true)), timers)
            }
            "updateSet" -> { val v = values(c.optJSONObject("values")); if (s == null || v == Values.EMPTY) w else withSets(replace(s.copy(v = merge(s.v, v)))) }
            "unlogSet" -> if (s?.done != true) w else withSets(replace(s.copy(done = false)))
            "setType" -> { val t = c.optString("setType"); if (s == null || t !in listOf("warmup", "normal", "failure", "drop")) w else withSets(replace(s.copy(type = t))) }
            "addSet" -> {
                val last = b.sets.lastOrNull()
                val planned = if (last == null) Values.EMPTY else Values(shown(last, "weightKg"), shown(last, "reps")?.toInt(), shown(last, "timeSec")?.toInt(), shown(last, "distanceKm"))
                withSets(b.sets + SetRow(c.optString("newSet", "watch-" + c.optString("id")), "normal", false, false, Values.EMPTY, planned, null))
            }
            "removeSet" -> if (s == null || b.sets.size <= 1) w else withSets(b.sets.filterIndexed { i, _ -> i != si })
            "restAdjust" -> {
                val sec = c.optInt("sec"); val t = w.timers[b.id]
                if (t?.endsAt == null || (sec != 15 && sec != -15)) w
                else { val base = if (sec > 0) maxOf(t.endsAt, now) else t.endsAt; w.copy(timers = w.timers + (b.id to t.copy(endsAt = maxOf(now, base + sec * 1000L)))) }
            }
            "restSkip" -> { val t = w.timers[b.id]; if (t?.endsAt == null) w else w.copy(timers = w.timers + (b.id to t.copy(endsAt = null))) }
            "removeExercise" -> w.copy(blocks = leave(w.blocks, b.id).filter { it.id != b.id }, timers = w.timers - b.id)
            "moveExercise" -> {
                val j = bi + when (c.optInt("dir")) { 1 -> 1; -1 -> -1; else -> 0 }
                if (j == bi || j !in w.blocks.indices) w else w.copy(blocks = w.blocks.toMutableList().also { it[bi] = w.blocks[j]; it[j] = b })
            }
            "superset" -> {
                val next = w.blocks.getOrNull(bi + 1)
                if (next == null || (b.supersetId != null && b.supersetId == next.supersetId)) w else w.copy(blocks = join(w.blocks, b.id, next.id, "ss-${b.id}"))
            }
            "unsuperset" -> if (b.supersetId == null) w else w.copy(blocks = leave(w.blocks, b.id))
            else -> w
        }
    }
}
