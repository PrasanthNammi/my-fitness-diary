package site.mfd.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.wear.remote.interactions.RemoteActivityHelper
import kotlinx.coroutines.guava.await
import androidx.core.content.edit
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject
import site.mfd.shared.Sync

/**
 * The phone side of the MFD watch app (protocol in site.mfd.shared.Sync). The page publishes a snapshot (routines,
 * the running workout, settings) that the watch shows; watch commands are queued here and the page takes them
 * (`watchDrain`), so nothing is lost when MFD is closed or the page is reloading.
 */
object WatchLink {
    private const val PREFS = "watch"
    private const val QUEUE = "queue"
    private const val MAX_QUEUE = 500

    fun publish(ctx: Context, json: String): Boolean {
        if (Sync.state(json) == null) return false
        val request = PutDataMapRequest.create(Sync.STATE).apply {
            dataMap.putString(Sync.KEY_JSON, json)
            dataMap.putLong(Sync.KEY_AT, System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(ctx).putDataItem(request)
        return true
    }

    /**
     * Opens MFD's running workout on every nearby watch with the MFD app (a workout just started on the phone).
     * Returns how many watches were asked; the watch then says it is there with Sync.HERE.
     */
    suspend fun open(ctx: Context): Int {
        val nodes = Wearable.getCapabilityClient(ctx).getCapability(Sync.WATCH, CapabilityClient.FILTER_REACHABLE).await().nodes
        val helper = RemoteActivityHelper(ctx)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(Sync.OPEN_URI)).addCategory(Intent.CATEGORY_BROWSABLE)
        var asked = 0
        for (n in nodes) try { helper.startRemoteActivity(intent, n.id).await(); asked++ } catch (e: Exception) {}
        return asked
    }

    /** Watches with the MFD app installed: name and whether it is connected now. */
    suspend fun watches(ctx: Context): List<Pair<String, Boolean>> =
        Wearable.getCapabilityClient(ctx).getCapability(Sync.WATCH, CapabilityClient.FILTER_ALL).await().nodes.map { it.displayName to it.isNearby }

    @Synchronized fun enqueue(ctx: Context, command: JSONObject) {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val list = try { JSONArray(prefs.getString(QUEUE, "[]")) } catch (e: Exception) { JSONArray() }
        val id = command.getString("id")
        for (i in 0 until list.length()) if (list.optJSONObject(i)?.optString("id") == id) return // already queued
        list.put(command)
        val kept = JSONArray()
        for (i in maxOf(0, list.length() - MAX_QUEUE) until list.length()) kept.put(list.get(i))
        prefs.edit { putString(QUEUE, kept.toString()) }
    }

    /** Hands every queued command to the page, oldest first, and empties the queue. */
    @Synchronized fun drain(ctx: Context): JSONArray {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val list = try { JSONArray(prefs.getString(QUEUE, "[]")) } catch (e: Exception) { JSONArray() }
        prefs.edit { remove(QUEUE) }
        return list
    }
}

/** Commands from the watch: checked, queued, and the page (if open) is told to take them. */
class WatchListener : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        // Live heart rate: only to an open MFD page (shown next to the workout timer), never stored or queued.
        if (event.path == Sync.HEART) {
            Sync.heart(event.data)?.let { MainActivity.sendToOpenPage(JSONObject().put("event", "watchHeart").put("bpm", it)) }
            return
        }
        // The watch's workout session is running: only to an open MFD page ("Watch connected").
        if (event.path == Sync.HERE) { MainActivity.sendToOpenPage(JSONObject().put("event", "watchHere")); return }
        if (event.path != Sync.COMMAND) return
        val command = Sync.command(event.data) ?: return
        WatchLink.enqueue(this, command)
        // MFD open (even in the background): its page takes the command now. Not running: it waits in the queue;
        // a workout started on the watch also gets a notification that opens MFD.
        if (!MainActivity.sendToOpenPage(JSONObject().put("event", "watchPending")) && command.optString("type").startsWith("start"))
            Notify.watchWorkout(this)
    }
}
