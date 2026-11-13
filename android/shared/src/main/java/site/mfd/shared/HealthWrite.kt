package site.mfd.shared

import org.json.JSONArray
import org.json.JSONObject

/**
 * What the MFD page asks the phone app to save to Health Connect (`healthWrite`), checked before anything is written:
 * finished workouts (with the MFD watch's heart rate) and food diary entries, plus MFD ids deleted since. Every
 * record carries its MFD id as the client record id, so saving it again updates it and deleting it in MFD removes it.
 * Anything malformed or out of range is dropped.
 */
object HealthWrite {
    const val MAX_WORKOUTS = 50
    const val MAX_MEALS = 200
    const val MAX_REMOVE = 200
    private const val DAY = 86_400_000L
    private val ID = Regex("^[A-Za-z0-9:_.-]{1,80}$")
    val MEALS = setOf("breakfast", "lunch", "dinner", "snacks")

    data class Workout(val id: String, val version: Long, val title: String, val start: Long, val end: Long, val notes: String, val interval: Int, val bpm: List<Int>)
    data class Meal(val id: String, val version: Long, val start: Long, val meal: String, val name: String, val kcal: Double, val protein: Double, val carbs: Double, val fat: Double,
                    val sugars: Double?, val saturates: Double?, val fibre: Double?, val salt: Double?)
    data class Request(val workouts: List<Workout>, val meals: List<Meal>, val removeWorkouts: List<String>, val removeMeals: List<String>)

    private fun text(o: JSONObject, k: String, max: Int) = o.optString(k, "").trim().take(max)
    private fun num(o: JSONObject, k: String, lo: Double, hi: Double): Double? =
        (o.opt(k) as? Number)?.toDouble()?.takeIf { it.isFinite() && it in lo..hi }
    private fun ids(a: JSONArray?) = (0 until minOf(a?.length() ?: 0, MAX_REMOVE)).mapNotNull { a!!.optString(it).takeIf { s -> ID.matches(s) } }

    /** The checked request, given the phone's time now (epoch ms). */
    fun parse(o: JSONObject, now: Long): Request {
        val workouts = mutableListOf<Workout>()
        val wa = o.optJSONArray("workouts") ?: JSONArray()
        for (i in 0 until minOf(wa.length(), MAX_WORKOUTS)) {
            val w = wa.optJSONObject(i) ?: continue
            val id = w.optString("id"); val start = w.optLong("start"); val end = w.optLong("end"); val version = w.optLong("version")
            if (!ID.matches(id) || version <= 0 || start <= 0 || end <= start || end - start > DAY || end > now + 60_000) continue
            val hr = w.optJSONObject("heart")
            val interval = hr?.optInt("interval") ?: 0
            val raw = hr?.optJSONArray("bpm")
            val bpm = if (interval in 1..60 && raw != null && raw.length() <= 2000) (0 until raw.length()).map { raw.optInt(it).takeIf { b -> b in 30..250 } ?: 0 } else emptyList()
            workouts += Workout(id, version, text(w, "title", 100).ifEmpty { "Workout" }, start, end, text(w, "notes", 500), if (bpm.any { it > 0 }) interval else 0, if (bpm.any { it > 0 }) bpm else emptyList())
        }
        val meals = mutableListOf<Meal>()
        val ma = o.optJSONArray("meals") ?: JSONArray()
        for (i in 0 until minOf(ma.length(), MAX_MEALS)) {
            val m = ma.optJSONObject(i) ?: continue
            val id = m.optString("id"); val start = m.optLong("start"); val version = m.optLong("version"); val meal = m.optString("meal")
            val kcal = num(m, "kcal", 0.0, 20_000.0); val protein = num(m, "protein", 0.0, 2_000.0); val carbs = num(m, "carbs", 0.0, 5_000.0); val fat = num(m, "fat", 0.0, 2_000.0)
            if (!ID.matches(id) || version <= 0 || start <= 0 || start > now + DAY || meal !in MEALS || kcal == null || protein == null || carbs == null || fat == null) continue
            meals += Meal(id, version, start, meal, text(m, "name", 100).ifEmpty { "Food" }, kcal, protein, carbs, fat,
                num(m, "sugars", 0.0, 5_000.0), num(m, "saturates", 0.0, 2_000.0), num(m, "fibre", 0.0, 2_000.0), num(m, "salt", 0.0, 500.0))
        }
        val remove = o.optJSONObject("remove") ?: JSONObject()
        return Request(workouts, meals, ids(remove.optJSONArray("workouts")), ids(remove.optJSONArray("meals")))
    }
}
