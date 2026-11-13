package site.mfd.shared

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HealthWriteTest {
    private val now = 1_763_000_000_000L
    private fun parse(s: String) = HealthWrite.parse(JSONObject(s), now)

    @Test fun keepsValidWorkoutsWithHeartRate() {
        val r = parse("""{"workouts":[{"id":"w1","version":5,"title":"Push","start":${now - 3_600_000},"end":${now - 60_000},"notes":"4 exercises","heart":{"interval":15,"bpm":[100,0,999,140]}}]}""")
        assertEquals(1, r.workouts.size)
        val w = r.workouts[0]
        assertEquals("Push", w.title); assertEquals(15, w.interval); assertEquals(listOf(100, 0, 0, 140), w.bpm)
    }

    @Test fun dropsBadWorkouts() {
        for (bad in listOf(
            """{"id":"bad id!","version":1,"start":1,"end":2}""",
            """{"id":"w","version":0,"start":${now - 10},"end":${now}}""",
            """{"id":"w","version":1,"start":${now},"end":${now - 10}}""",
            """{"id":"w","version":1,"start":${now - 2 * 86_400_000L},"end":${now}}""",
            """{"id":"w","version":1,"start":${now + 3_600_000},"end":${now + 7_200_000}}""",
        )) assertTrue(bad, parse("""{"workouts":[$bad]}""").workouts.isEmpty())
        val noHeart = parse("""{"workouts":[{"id":"w","version":1,"start":${now - 10_000},"end":$now,"heart":{"interval":0,"bpm":[120]}}]}""").workouts[0]
        assertEquals(0, noHeart.interval); assertTrue(noHeart.bpm.isEmpty())
    }

    @Test fun keepsValidMealsOnly() {
        val r = parse("""{"meals":[
            {"id":"e1","version":3,"start":${now - 1000},"meal":"lunch","name":"Oats","kcal":400,"protein":20,"carbs":60,"fat":10,"sugars":null,"salt":0.4},
            {"id":"e2","version":3,"start":${now - 1000},"meal":"brunch","name":"x","kcal":1,"protein":1,"carbs":1,"fat":1},
            {"id":"e3","version":3,"start":${now - 1000},"meal":"lunch","name":"x","kcal":-5,"protein":1,"carbs":1,"fat":1},
            {"id":"e4","version":3,"start":${now - 1000},"meal":"lunch","name":"x","kcal":"400","protein":1,"carbs":1,"fat":1}]}""")
        assertEquals(listOf("e1"), r.meals.map { it.id })
        assertEquals(null, r.meals[0].sugars); assertEquals(0.4, r.meals[0].salt!!, 0.0)
    }

    @Test fun removesOnlyWellFormedIds() {
        val r = parse("""{"remove":{"workouts":["w1","bad id!"],"meals":["e1"]}}""")
        assertEquals(listOf("w1"), r.removeWorkouts); assertEquals(listOf("e1"), r.removeMeals)
    }
}
