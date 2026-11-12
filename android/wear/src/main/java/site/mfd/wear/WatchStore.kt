package site.mfd.wear

import android.content.Context
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.core.content.edit
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject
import site.mfd.shared.Sync
import java.util.UUID

/**
 * Everything the watch app knows: the phone's latest snapshot and the outbox of actions taken on the watch.
 * Each action goes into the outbox first (kept across restarts), is sent to the phone, and is re-sent until a
 * snapshot lists it as applied; the phone applies each id once, so re-sending is safe. Until then the screens show
 * it optimistically (Optimistic.kt), so the watch never waits for the phone.
 */
object WatchStore {
    val snapshot = mutableStateOf<Snapshot?>(null)
    val phoneNearby = mutableStateOf<Boolean?>(null)
    val outbox = mutableStateListOf<JSONObject>()
    private const val PREFS = "watch"
    private var loaded = false

    fun load(ctx: Context) {
        if (loaded) return
        loaded = true
        // The last snapshot, so tiles, complications and a cold start show data before the phone answers.
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("snapshot", null)?.let { json ->
            Sync.state(json)?.let { snapshot.value = Parse.snapshot(it) }
        }
        val saved = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("outbox", "[]")
        try { val a = JSONArray(saved); for (i in 0 until a.length()) a.optJSONObject(i)?.let(outbox::add) } catch (e: Exception) {}
    }

    private fun save(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putString("outbox", JSONArray(outbox.toList()).toString()) }

    /** A new snapshot from the phone: actions it has applied leave the outbox. */
    fun receive(ctx: Context, json: String) {
        val o = Sync.state(json) ?: return
        val s = Parse.snapshot(o)
        snapshot.value = s
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putString("snapshot", json) }
        if (outbox.removeAll { it.optString("id") in s.applied }) save(ctx)
        Glance.refresh(ctx)
    }

    suspend fun refresh(ctx: Context) {
        try {
            Wearable.getDataClient(ctx).dataItems.await().use { items ->
                items.filter { it.uri.path == Sync.STATE }.maxByOrNull { DataMapItem.fromDataItem(it).dataMap.getLong(Sync.KEY_AT) }
                    ?.let { DataMapItem.fromDataItem(it).dataMap.getString(Sync.KEY_JSON) }?.let { receive(ctx, it) }
            }
        } catch (e: Exception) {}
        flush(ctx)
    }

    /** Queues an action (the workout id is added for workout actions) and tries to send it. */
    suspend fun send(ctx: Context, type: String, fields: Map<String, Any?> = emptyMap()) {
        val c = JSONObject().put("v", Sync.VERSION).put("id", UUID.randomUUID().toString().replace("-", "")).put("type", type).put("at", System.currentTimeMillis())
        for ((k, v) in fields) c.put(k, v ?: JSONObject.NULL)
        outbox.add(c); save(ctx)
        flush(ctx)
    }

    /** Sends everything in the outbox (oldest first) if the phone is reachable. */
    suspend fun flush(ctx: Context) {
        val node = try {
            Wearable.getCapabilityClient(ctx).getCapability(Sync.PHONE, CapabilityClient.FILTER_REACHABLE).await().nodes.firstOrNull()
        } catch (e: Exception) { null }
        phoneNearby.value = node != null
        if (node == null) return
        val client = Wearable.getMessageClient(ctx)
        for (c in outbox.toList()) try { client.sendMessage(node.id, Sync.COMMAND, c.toString().toByteArray()).await() } catch (e: Exception) { return }
    }
}
