package site.mfd.wear

import org.json.JSONObject

/** What the screens show: the phone's snapshot plus watch actions the phone hasn't applied yet. */
data class View(val workout: Workout?, val starting: String?)

object Optimistic {
    fun view(s: Snapshot?, outbox: List<JSONObject>): View {
        // The phone's workout with the watch's not-yet-applied actions on top, in order.
        val workout = s?.workout?.let { w -> outbox.filter { it.optString("id") !in s.applied }.fold(w) { acc, c -> Engine.apply(acc, c) } }
        // A start sent from the watch, not applied yet: show "Starting…" instead of the start buttons.
        val start = outbox.lastOrNull { it.optString("type").startsWith("start") }
        val starting = if (workout == null && start != null)
            s?.routines?.firstOrNull { it.id == start.optString("routine") }?.name ?: "workout" else null
        return View(workout, starting)
    }
}
