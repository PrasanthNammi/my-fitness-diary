package site.mfd.wear

import org.json.JSONArray
import org.json.JSONObject

/** The phone's snapshot (frontend/lib/watch.ts `snapshot`), parsed. Missing or odd fields fall back to safe defaults. */
data class Snapshot(
    val applied: Set<String>,
    val weightUnit: String,
    val defaultRestSec: Int,
    val routines: List<Routine>,
    val workout: Workout?,
    val recent: List<LibExercise>,
    val muscles: Map<String, List<LibExercise>>,
    val today: Today = Today(),
    val foods: List<WatchFood> = emptyList(),
)

data class Today(
    val date: String = "", val kcalTarget: Int? = null, val kcalEaten: Int = 0, val protein: Int = 0, val proteinTarget: Int? = null,
    val waterMl: Int = 0, val waterGoalMl: Int = 2500, val lastWeightKg: Double? = null, val lastWeightDate: String? = null,
    val energy: Int? = null, val soreness: Int? = null, val sleep: Double? = null, val steps: Int? = null, val workoutsThisWeek: Int = 0,
)
data class WatchFood(val ref: String, val from: String, val name: String, val amount: Double, val unit: String, val kcalPerUnit: Double, val proteinPerUnit: Double, val units: List<String>)

data class Routine(val id: String, val name: String, val folder: String?, val exercises: List<Pair<String, Int>>)
data class LibExercise(val id: String, val name: String, val muscle: String, val tracking: String, val last: Values? = null)
data class Values(val weightKg: Double?, val reps: Int?, val timeSec: Int?, val distanceKm: Double?) {
    companion object { val EMPTY = Values(null, null, null, null) }
}
data class SetRow(val id: String, val type: String, val done: Boolean, val ai: Boolean, val v: Values, val t: Values, val p: Values?)
data class Block(
    val id: String, val exerciseId: String, val name: String, val tracking: String, val restSec: Int,
    val supersetId: String?, val step: Double, val sets: List<SetRow>,
)
data class Timer(val endsAt: Long?, val durationSec: Int)
data class Workout(val id: String, val title: String, val startedAt: Long, val routineId: String?, val blocks: List<Block>, val timers: Map<String, Timer>)

object Parse {
    private fun JSONObject.str(k: String) = if (isNull(k)) null else optString(k).takeIf { it.isNotEmpty() }
    private fun JSONObject.dbl(k: String) = if (isNull(k) || !has(k)) null else optDouble(k).takeIf { !it.isNaN() }
    private fun JSONObject.int(k: String) = if (isNull(k) || !has(k)) null else optInt(k)
    private inline fun <T> JSONArray?.items(f: (JSONObject) -> T?): List<T> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { i -> optJSONObject(i)?.let(f) }

    private fun values(o: JSONObject?) = if (o == null) Values.EMPTY else Values(o.dbl("weightKg"), o.int("reps"), o.int("timeSec"), o.dbl("distanceKm"))
    private fun lib(o: JSONObject) = LibExercise(o.optString("id"), o.optString("name"), o.optString("muscle"), o.optString("tracking"), o.optJSONObject("last")?.let { values(it) })

    fun snapshot(o: JSONObject): Snapshot {
        val units = o.optJSONObject("units")
        val w = o.optJSONObject("workout")
        val library = o.optJSONObject("library")
        val muscles = library?.optJSONObject("muscles")
        return Snapshot(
            applied = o.optJSONArray("applied")?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet(),
            weightUnit = units?.optString("weight")?.takeIf { it == "lb" } ?: "kg",
            defaultRestSec = units?.optInt("defaultRestSec", 90) ?: 90,
            routines = o.optJSONArray("routines").items { r ->
                Routine(r.optString("id"), r.optString("name"), r.str("folder"), r.optJSONArray("exercises").items { e -> e.optString("name") to e.optInt("sets") })
            },
            workout = w?.let { x ->
                Workout(
                    id = x.optString("id"), title = x.optString("title"), startedAt = x.optLong("startedAt"), routineId = x.str("routineId"),
                    blocks = x.optJSONArray("blocks").items { b ->
                        Block(b.optString("id"), b.optString("exerciseId"), b.optString("name"), b.optString("tracking"), b.optInt("restSec"),
                            b.str("supersetId"), b.optDouble("step", 1.0),
                            b.optJSONArray("sets").items { s ->
                                SetRow(s.optString("id"), s.optString("type", "normal"), s.optBoolean("done"), s.optBoolean("ai"),
                                    values(s.optJSONObject("v")), values(s.optJSONObject("t")), s.optJSONObject("p")?.let { values(it) })
                            })
                    },
                    timers = x.optJSONObject("timers")?.let { t -> t.keys().asSequence().associateWith { k ->
                        val v = t.getJSONObject(k); Timer(if (v.isNull("endsAt")) null else v.optLong("endsAt"), v.optInt("durationSec"))
                    } } ?: emptyMap(),
                )
            },
            recent = library?.optJSONArray("recent").items(::lib),
            muscles = muscles?.keys()?.asSequence()?.associateWith { k -> muscles.optJSONArray(k).items(::lib) } ?: emptyMap(),
            today = o.optJSONObject("today")?.let { t ->
                val lw = t.optJSONObject("lastWeight"); val c = t.optJSONObject("checkin")
                Today(t.optString("date"), t.int("kcalTarget"), t.optInt("kcalEaten"), t.optInt("protein"), t.int("proteinTarget"), t.optInt("waterMl"), t.optInt("waterGoalMl", 2500),
                    lw?.dbl("kg"), lw?.str("date"), c?.int("energy"), c?.int("soreness"), c?.dbl("sleep"), c?.int("steps"), t.optInt("workoutsThisWeek"))
            } ?: Today(),
            foods = o.optJSONArray("foods").items { f ->
                WatchFood(f.optString("ref"), f.optString("from"), f.optString("name"), f.optDouble("amount", 1.0), f.optString("unit"), f.optDouble("kcalPerUnit"), f.optDouble("proteinPerUnit"),
                    f.optJSONArray("units")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: listOf(f.optString("unit")))
            },
        )
    }
}
