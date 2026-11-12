package site.mfd.wear

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

/** Mirrors tests/watch-commands.cjs for the commands the watch applies itself. */
class EngineTest {
    private fun v(w: Double?, r: Int?) = Values(w, r, null, null)
    private val now = 1_000_000L
    private fun workout() = Workout("w1", "Push", 0, "r1", listOf(
        Block("b1", "bench", "Bench", "weight_reps", 90, null, 2.5, listOf(
            SetRow("s1", "warmup", false, false, Values.EMPTY, v(40.0, 10), null),
            SetRow("s2", "normal", false, false, Values.EMPTY, v(80.0, 8), null),
            SetRow("s3", "normal", false, false, Values.EMPTY, Values.EMPTY, v(77.5, 7)))),
        Block("b2", "plank", "Plank", "time", 0, null, 1.0, listOf(SetRow("p1", "normal", false, false, Values.EMPTY, Values(null, null, 60, null), null))),
    ), emptyMap())
    private fun c(type: String, vararg kv: Pair<String, Any>) = JSONObject().put("v", 1).put("id", "c$type").put("type", type).put("workoutId", "w1").put("at", now).also { o -> kv.forEach { o.put(it.first, it.second) } }

    @Test fun logUsesTypedThenTargetThenPreviousAndStartsRest() {
        var w = Engine.apply(workout(), c("logSet", "block" to "b1", "set" to "s2", "values" to JSONObject().put("weightKg", 82.5)))
        assertEquals(v(82.5, 8), w.blocks[0].sets[1].v); assertEquals(true, w.blocks[0].sets[1].done)
        assertEquals(now + 90_000, w.timers["b1"]!!.endsAt)
        w = Engine.apply(w, c("logSet", "block" to "b1", "set" to "s3"))
        assertEquals(v(77.5, 7), w.blocks[0].sets[2].v)
        w = Engine.apply(w, c("logSet", "block" to "b2", "set" to "p1"))
        assertEquals(60, w.blocks[1].sets[0].v.timeSec); assertNull(w.timers["b2"])
    }

    @Test fun nothingToLogOrAlreadyLoggedChangesNothing() {
        val empty = workout().let { it.copy(blocks = listOf(it.blocks[0].copy(sets = listOf(SetRow("x", "normal", false, false, Values.EMPTY, Values.EMPTY, null))))) }
        assertSame(empty, Engine.apply(empty, c("logSet", "block" to "b1", "set" to "x")))
        val w = Engine.apply(workout(), c("logSet", "block" to "b1", "set" to "s1"))
        assertSame(w, Engine.apply(w, c("logSet", "block" to "b1", "set" to "s1")))
    }

    @Test fun editTypesSetsAndRest() {
        var w = Engine.apply(workout(), c("logSet", "block" to "b1", "set" to "s2"))
        w = Engine.apply(w, c("updateSet", "block" to "b1", "set" to "s2", "values" to JSONObject().put("reps", 7)))
        assertEquals(v(80.0, 7), w.blocks[0].sets[1].v)
        w = Engine.apply(w, c("setType", "block" to "b1", "set" to "s3", "setType" to "failure")); assertEquals("failure", w.blocks[0].sets[2].type)
        assertSame(w, Engine.apply(w, c("setType", "block" to "b1", "set" to "s3", "setType" to "mega")))
        w = Engine.apply(w, c("addSet", "block" to "b1", "newSet" to "s4")); assertEquals(v(77.5, 7), w.blocks[0].sets[3].t)
        w = Engine.apply(w, c("removeSet", "block" to "b1", "set" to "s4")); assertEquals(3, w.blocks[0].sets.size)
        w = Engine.apply(w, c("restAdjust", "block" to "b1", "sec" to 15)); assertEquals(now + 105_000, w.timers["b1"]!!.endsAt)
        w = Engine.apply(w, c("restSkip", "block" to "b1")); assertNull(w.timers["b1"]!!.endsAt)
        w = Engine.apply(w, c("unlogSet", "block" to "b1", "set" to "s2")); assertEquals(false, w.blocks[0].sets[1].done)
    }

    @Test fun exercisesAndSupersets() {
        var w = Engine.apply(workout(), c("addExercise", "exercise" to "curl", "name" to "Curl", "tracking" to "weight_reps", "newBlock" to "nb1",
            "newSets" to org.json.JSONArray(listOf("ns1", "ns2")), "sets" to 2, "restSec" to 120))
        assertEquals(listOf("b1", "b2", "nb1"), w.blocks.map { it.id }); assertEquals(listOf("ns1", "ns2"), w.blocks[2].sets.map { it.id }); assertEquals(120, w.blocks[2].restSec)
        w = Engine.apply(w, c("addExercise", "exercise" to "curl", "name" to "Curl", "tracking" to "weight_reps", "newBlock" to "nb2", "supersetWith" to "b1", "sets" to 1))
        assertEquals("nb2", w.blocks[1].id); assertEquals(w.blocks[0].supersetId, w.blocks[1].supersetId)
        w = Engine.apply(w, c("unsuperset", "block" to "nb2")); assertNull(w.blocks[0].supersetId)
        w = Engine.apply(w, c("moveExercise", "block" to "b1", "dir" to 1)); assertEquals("b1", w.blocks[1].id)
        assertSame(w, Engine.apply(w, c("moveExercise", "block" to w.blocks[0].id, "dir" to -1)))
        w = Engine.apply(w, c("superset", "block" to "b1")); assertEquals(w.blocks[1].supersetId, w.blocks[2].supersetId)
        w = Engine.apply(w, c("removeExercise", "block" to "b1")); assertEquals(false, w.blocks.any { it.id == "b1" }); assertNull(w.timers["b1"])
        assertNull(w.blocks.first { it.id == "b2" }.supersetId)
    }

    @Test fun foreignOrMissingChangesNothing() {
        val w = workout()
        assertSame(w, Engine.apply(w, c("logSet", "block" to "b1", "set" to "s1").put("workoutId", "other")))
        assertSame(w, Engine.apply(w, c("logSet", "block" to "nope", "set" to "s1")))
        assertSame(w, Engine.apply(w, c("explode", "block" to "b1")))
    }
}
