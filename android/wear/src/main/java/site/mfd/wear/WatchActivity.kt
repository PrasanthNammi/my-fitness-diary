package site.mfd.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import site.mfd.shared.Sync
import java.util.UUID

/**
 * MFD on the watch (groundwork): shows whether the phone is reachable and the routines the phone app shared, and
 * can send a test command. The full design (docs: Lovable /watch) is built on top of this link.
 */
class WatchActivity : ComponentActivity() {
    private val snapshot = mutableStateOf<JSONObject?>(null)
    private val phoneNearby = mutableStateOf<Boolean?>(null)
    private val sent = mutableStateOf<String?>(null)

    private val listener = DataClient.OnDataChangedListener { events ->
        for (e in events) if (e.type == DataEvent.TYPE_CHANGED && e.dataItem.uri.path == Sync.STATE) read(e.dataItem)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { WatchHome(snapshot.value, phoneNearby.value, sent.value, ::hello) }
    }

    override fun onResume() {
        super.onResume()
        Wearable.getDataClient(this).addListener(listener)
        lifecycleScope.launch {
            // The newest snapshot the phone left, even if it was sent while the watch was away.
            try { Wearable.getDataClient(this@WatchActivity).dataItems.await().use { items -> items.filter { it.uri.path == Sync.STATE }.forEach(::read) } } catch (e: Exception) {}
            phoneNearby.value = try { phone() != null } catch (e: Exception) { false }
        }
    }

    override fun onPause() {
        Wearable.getDataClient(this).removeListener(listener)
        super.onPause()
    }

    private fun read(item: DataItem) {
        val json = DataMapItem.fromDataItem(item).dataMap.getString(Sync.KEY_JSON) ?: return
        Sync.state(json)?.let { snapshot.value = it }
    }

    private suspend fun phone() = Wearable.getCapabilityClient(this).getCapability(Sync.PHONE, CapabilityClient.FILTER_REACHABLE).await().nodes.firstOrNull()

    private fun hello() {
        lifecycleScope.launch {
            sent.value = try {
                val node = phone() ?: throw IllegalStateException("no phone")
                val command = JSONObject().put("v", Sync.VERSION).put("id", UUID.randomUUID().toString().replace("-", "")).put("type", "hello").put("at", System.currentTimeMillis())
                Wearable.getMessageClient(this@WatchActivity).sendMessage(node.id, Sync.COMMAND, command.toString().toByteArray()).await()
                "Sent to your phone"
            } catch (e: Exception) { "Phone not nearby" }
        }
    }
}

private val Accent = Color(0xFFFF5A1F)

@Composable
private fun WatchHome(snapshot: JSONObject?, phoneNearby: Boolean?, sent: String?, onHello: () -> Unit) {
    MaterialTheme {
        AppScaffold {
            val list = rememberScalingLazyListState()
            ScreenScaffold(scrollState = list) {
                ScalingLazyColumn(state = list) {
                    item { ListHeader { Text("MFD") } }
                    item {
                        Text(
                            when (phoneNearby) { null -> "Looking for your phone…"; true -> "Phone connected"; false -> "Phone not nearby" },
                            textAlign = TextAlign.Center,
                        )
                    }
                    val routines = snapshot?.optJSONArray("routines")
                    if (snapshot == null) item { Text("Open MFD on your phone to finish setup", textAlign = TextAlign.Center) }
                    else {
                        snapshot.optJSONObject("workout")?.let { w -> item { Text("Workout in progress · ${w.optString("title")}", textAlign = TextAlign.Center) } }
                        item { Text("${routines?.length() ?: 0} routines", textAlign = TextAlign.Center) }
                        for (i in 0 until minOf(routines?.length() ?: 0, 30)) {
                            val r = routines!!.optJSONObject(i) ?: continue
                            item { Text(r.optString("name"), textAlign = TextAlign.Center) }
                        }
                    }
                    item { Button(onClick = onHello, colors = ButtonDefaults.buttonColors(containerColor = Accent)) { Text("Say hello") } }
                    sent?.let { item { Text(it, textAlign = TextAlign.Center) } }
                }
            }
        }
    }
}
