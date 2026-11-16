package site.mfd.shared

import org.json.JSONObject

/**
 * The phone ↔ watch protocol (Wearable Data Layer). Android only connects apps with the same package name and
 * signing key, so both sides are MFD; messages are still size-limited and checked before use.
 *
 * - Phone → watch: one data item at [STATE] (key [KEY_JSON]) with the latest snapshot: routines, the running
 *   workout and settings. The watch always shows the newest one, even after being away from the phone.
 * - Watch → phone: messages at [COMMAND], one JSON command each (log a set, start a routine…), with an id so the
 *   phone applies each command once.
 * - Watch → phone during a workout: the live heart rate at [HEART] (the bpm as text, about every 5 s), only shown,
 *   never stored (the workout's full readings come with its heartRate command after it is saved).
 * - Watch → phone during a workout: [HERE] (empty) about every 8 s while MFD's workout session runs on the watch, so the
 *   phone's workout screen can say "Watch connected" (also without heart rate).
 * - Phone → watch: opening MFD's workout on the watch is a remote activity start of [OPEN_URI] (no message).
 */
object Sync {
    const val VERSION = 1
    const val STATE = "/mfd/state"
    const val COMMAND = "/mfd/command"
    const val HEART = "/mfd/heart"
    const val HERE = "/mfd/here"
    /** Opens the watch app on its running workout (WatchActivity's VIEW filter). */
    const val OPEN_URI = "mfd-watch://workout"
    const val KEY_JSON = "json"
    const val KEY_AT = "at"
    /** Capability names (res/values/wear.xml in each app). */
    const val PHONE = "mfd_phone"
    const val WATCH = "mfd_watch"
    /** Data items are limited to 100 KB; a snapshot stays well under. */
    const val MAX_STATE_BYTES = 80_000
    const val MAX_COMMAND_BYTES = 4_096
    private val ID = Regex("^[A-Za-z0-9_-]{8,64}$")
    private val TYPE = Regex("^[a-zA-Z]{2,32}$")

    /** A watch command if it is well-formed (version, id, type, size), else null. */
    fun command(bytes: ByteArray): JSONObject? {
        if (bytes.isEmpty() || bytes.size > MAX_COMMAND_BYTES) return null
        val o = try { JSONObject(String(bytes, Charsets.UTF_8)) } catch (e: Exception) { return null }
        return o.takeIf { it.optInt("v") == VERSION && ID.matches(it.optString("id")) && TYPE.matches(it.optString("type")) }
    }

    /** A live heart-rate reading (30–250 bpm), else null. */
    fun heart(bytes: ByteArray): Int? = if (bytes.size > 3) null else String(bytes, Charsets.US_ASCII).toIntOrNull()?.takeIf { it in 30..250 }

    /** A phone snapshot if it is well-formed and within the size limit, else null. */
    fun state(json: String): JSONObject? {
        if (json.toByteArray(Charsets.UTF_8).size > MAX_STATE_BYTES) return null
        val o = try { JSONObject(json) } catch (e: Exception) { return null }
        return o.takeIf { it.optInt("v") == VERSION && it.has("routines") }
    }
}
