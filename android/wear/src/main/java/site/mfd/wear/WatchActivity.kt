package site.mfd.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.TimeText
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import site.mfd.shared.Sync

/** MFD on the Galaxy Watch. Screens follow the Lovable /watch design; data comes from the phone (WatchStore). */
class WatchActivity : ComponentActivity() {
    private val listener = DataClient.OnDataChangedListener { events ->
        for (e in events) if (e.type == DataEvent.TYPE_CHANGED && e.dataItem.uri.path == Sync.STATE)
            DataMapItem.fromDataItem(e.dataItem).dataMap.getString(Sync.KEY_JSON)?.let { WatchStore.receive(this, it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WatchStore.load(this)
        setContent { App() }
    }

    override fun onResume() {
        super.onResume()
        Wearable.getDataClient(this).addListener(listener)
        lifecycleScope.launch {
            WatchStore.refresh(this@WatchActivity)
            // Keep trying to deliver queued actions while the app is open (the phone may come back in range).
            while (true) { delay(15_000); WatchStore.flush(this@WatchActivity) }
        }
    }

    override fun onPause() {
        Wearable.getDataClient(this).removeListener(listener)
        super.onPause()
    }

    @androidx.compose.runtime.Composable
    private fun App() {
        val nav = rememberSwipeDismissableNavController()
        val scope = rememberCoroutineScope()
        val snapshot by WatchStore.snapshot
        val nearby by WatchStore.phoneNearby
        val view = remember(snapshot, WatchStore.outbox.toList()) { Optimistic.view(snapshot, WatchStore.outbox) }
        fun send(type: String, fields: Map<String, Any?> = emptyMap()) = scope.launch { WatchStore.send(this@WatchActivity, type, fields) }

        // A workout appearing (started here or on the phone) opens it; one ending goes back home.
        val workoutId = view.workout?.id
        LaunchedEffect(workoutId) {
            val route = nav.currentDestination?.route
            if (workoutId != null && route != "overview" && route?.startsWith("exercise") != true) nav.navigate("overview") { popUpTo("home") }
            if (workoutId == null && (route == "overview" || route?.startsWith("exercise") == true)) nav.popBackStack("home", false)
        }

        MaterialTheme {
            AppScaffold(timeText = { TimeText() }) {
                SwipeDismissableNavHost(navController = nav, startDestination = "home") {
                    composable("home") {
                        HomeScreen(snapshot, view, nearby, onWorkout = { nav.navigate("overview") }, onStartEmpty = { send("startEmpty") }, onRoutines = { nav.navigate("routines") })
                    }
                    composable("routines") { snapshot?.let { s -> RoutinesScreen(s, onRoutine = { nav.navigate("routine/${it.id}") }, onStartEmpty = { send("startEmpty") }) } }
                    composable("routine/{id}") { entry ->
                        val r = snapshot?.routines?.firstOrNull { it.id == entry.arguments?.getString("id") }
                        if (r != null) RoutineScreen(r, startDisabled = view.workout != null || view.starting != null) { send("startRoutine", mapOf("routine" to r.id)) }
                    }
                    composable("overview") { view.workout?.let { w -> OverviewScreen(w) { b -> nav.navigate("exercise/${b.id}") } } }
                    composable("exercise/{id}") { entry ->
                        val b = view.workout?.blocks?.firstOrNull { it.id == entry.arguments?.getString("id") }
                        ComingNext(b?.name ?: "Exercise")
                    }
                }
            }
        }
    }
}
