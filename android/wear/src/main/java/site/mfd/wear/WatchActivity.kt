package site.mfd.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
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

/** The exercise to log next after `b`: itself while it has sets left, else the next one with sets left. */
fun nextPending(w: Workout, b: Block): Block? =
    if (b.sets.any { !it.done }) b else w.blocks.drop(w.blocks.indexOf(b) + 1).firstOrNull { x -> x.sets.any { !it.done } } ?: w.blocks.firstOrNull { x -> x.sets.any { !it.done } }

/**
 * After a set is logged: in a superset, straight on to the next partner that still has sets (rest comes after the
 * round); otherwise the rest timer if the exercise has one; otherwise stay for the next set.
 */
fun afterLog(nav: androidx.navigation.NavHostController, w: Workout, b: Block) {
    val ss = b.supersetId
    if (ss != null) {
        val members = w.blocks.filter { it.supersetId == ss }
        val after = members.drop(members.indexOf(b) + 1).firstOrNull { m -> m.sets.count { !it.done } >= (if (m.id == b.id) 2 else 1) }
        if (after != null) { nav.navigate("exercise/${after.id}") { popUpTo("overview") }; return }
    }
    if (b.restSec > 0) nav.navigate("rest/${b.id}")
}

/** Adds a picked exercise (3 sets; into a superset when chosen from one) and opens it. */
fun addExercise(nav: androidx.navigation.NavHostController, e: LibExercise, into: String?, send: (String, Map<String, Any?>) -> Unit) {
    val w = Optimistic.view(WatchStore.snapshot.value, WatchStore.outbox).workout ?: return
    val id = newId()
    send("addExercise", mapOf("workoutId" to w.id, "exercise" to e.id, "name" to e.name, "tracking" to e.tracking, "newBlock" to id,
        "newSets" to org.json.JSONArray(List(3) { newId() }), "sets" to 3, "restSec" to (WatchStore.snapshot.value?.defaultRestSec ?: 90),
        "step" to if (Regex("barbell|smith|machine|cable|ez", RegexOption.IGNORE_CASE).containsMatchIn(e.name)) 2.5 else 1.0, "supersetWith" to into,
        "last" to e.last?.let { v -> org.json.JSONObject().put("weightKg", v.weightKg).put("reps", v.reps).put("timeSec", v.timeSec).put("distanceKm", v.distanceKm) }))
    nav.navigate("exercise/$id") { popUpTo("overview") }
}

/** MFD on the Galaxy Watch. Screens follow the Lovable /watch design; data comes from the phone (WatchStore). */
class WatchActivity : ComponentActivity() {
    // Heart-rate and notification permissions, asked when the first workout starts; the session starts either way.
    private var pendingWorkout: String? = null
    private val permissions = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()) {
        pendingWorkout?.let { WorkoutService.start(this, it) }; pendingWorkout = null
    }
    private fun session(id: String?) {
        if (id == null) { WorkoutService.stop(this); return }
        val wanted = buildList {
            add(if (android.os.Build.VERSION.SDK_INT >= 36) "android.permission.health.READ_HEART_RATE" else android.Manifest.permission.BODY_SENSORS)
            add(android.Manifest.permission.ACTIVITY_RECOGNITION)
            if (android.os.Build.VERSION.SDK_INT >= 33) add(android.Manifest.permission.POST_NOTIFICATIONS)
        }.filter { checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
        val prefs = getSharedPreferences("watch", MODE_PRIVATE)
        if (wanted.isNotEmpty() && !prefs.getBoolean("asked", false)) {
            prefs.edit().putBoolean("asked", true).apply()
            pendingWorkout = id; permissions.launch(wanted.toTypedArray())
        } else WorkoutService.start(this, id)
    }

    private val listener = DataClient.OnDataChangedListener { events ->
        for (e in events) if (e.type == DataEvent.TYPE_CHANGED && e.dataItem.uri.path == Sync.STATE)
            DataMapItem.fromDataItem(e.dataItem).dataMap.getString(Sync.KEY_JSON)?.let { WatchStore.receive(this, it) }
    }

    /** From the Quick start tile: the routine to open. */
    private val openRoutine = androidx.compose.runtime.mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WatchStore.load(this)
        wakeIfFromPhone(intent)
        openRoutine.value = intent?.getStringExtra(EXTRA_ROUTINE)
        setContent { App() }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_ROUTINE)?.let { openRoutine.value = it }
        wakeIfFromPhone(intent)
    }

    /** Opened by the phone for a workout it started: turn the screen on and show it (the snapshot follows). */
    private fun wakeIfFromPhone(intent: android.content.Intent?) {
        if (intent?.data?.toString() != Sync.OPEN_URI) return
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        lifecycleScope.launch { WatchStore.refresh(this@WatchActivity) }
    }

    companion object { const val EXTRA_ROUTINE = "routine" }

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
        // Read through State in every screen: navigation keeps each screen's content lambda, so plain values captured
        // here would go stale while the screen is open.
        val viewState = remember { androidx.compose.runtime.derivedStateOf { Optimistic.view(WatchStore.snapshot.value, WatchStore.outbox.toList()) } }
        val snapshot by WatchStore.snapshot
        val nearby by WatchStore.phoneNearby
        val view by viewState
        fun send(type: String, fields: Map<String, Any?> = emptyMap()) = scope.launch { WatchStore.send(this@WatchActivity, type, fields) }
        val units by remember { androidx.compose.runtime.derivedStateOf { Units(WatchStore.snapshot.value?.weightUnit == "lb") } }

        // A workout appearing (started here or on the phone) opens it; one ending goes back home.
        val workoutId = view.workout?.id
        LaunchedEffect(workoutId) {
            session(workoutId)
            val route = nav.currentDestination?.route
            if (workoutId != null && route != "overview" && route?.startsWith("exercise") != true) nav.navigate("overview") { popUpTo("home") }
            if (workoutId == null && (route == "overview" || route?.startsWith("exercise") == true)) nav.popBackStack("home", false)
        }

        val routineToOpen = openRoutine.value
        LaunchedEffect(routineToOpen) { if (routineToOpen != null && view.workout == null) { nav.navigate("routine/$routineToOpen"); openRoutine.value = null } }

        // A rest started on the phone (a set ticked there) opens the rest timer here too. Rests the watch started itself
        // are already open (or skipped for a superset); ones running when the app opens are only shown as the chip.
        val restSeen = remember { mutableSetOf<String>() }
        val restSeeded = remember { mutableStateOf(false) }
        val restKeys = view.workout?.let { w -> w.timers.mapNotNull { (id, t) -> t.endsAt?.let { "$id@$it" } } }.orEmpty()
        LaunchedEffect(restKeys) {
            val w = view.workout ?: return@LaunchedEffect
            val fresh = restKeys.filter { restSeen.add(it) }
            if (!restSeeded.value) { restSeeded.value = true; return@LaunchedEffect }
            val now = System.currentTimeMillis()
            val local = WatchStore.outbox.filter { it.optString("type") == "logSet" && now - it.optLong("at") < 15_000 }.map { it.optString("block") }.toSet()
            val open = fresh.map { it.substringBeforeLast('@') to it.substringAfterLast('@').toLong() }
                .filter { (id, ends) -> ends > now && id !in local && w.blocks.any { it.id == id } }.maxByOrNull { it.second } ?: return@LaunchedEffect
            if (nav.currentDestination?.route?.startsWith("rest/") != true) nav.navigate("rest/${open.first}")
        }

        MaterialTheme {
            AppScaffold(timeText = { TimeText() }) {
                SwipeDismissableNavHost(navController = nav, startDestination = "home") {
                    composable("home") {
                        HomeScreen(snapshot, view, nearby, units, onWorkout = { nav.navigate("overview") }, onStartEmpty = { send("startEmpty") }, onRoutines = { nav.navigate("routines") }, onQuick = { nav.navigate(it) })
                    }
                    composable("weigh") { WeighScreen(view.today, units) { kg -> send("weighIn", mapOf("kg" to Math.round(kg * 100) / 100.0)); nav.popBackStack() } }
                    composable("water") { WaterScreen(view.today) { ml -> send("water", mapOf("ml" to ml)) } }
                    composable("food") { FoodScreen(view.today, snapshot?.foods.orEmpty()) { f -> nav.navigate("foodpick/${f.ref}") } }
                    composable("foodpick/{ref}") { entry ->
                        snapshot?.foods?.firstOrNull { it.ref == entry.arguments?.getString("ref") }?.let { f ->
                            FoodPickScreen(f) { meal, amount -> send("foodRelog", mapOf("from" to f.from, "ref" to f.ref, "meal" to meal, "amount" to amount, "unit" to f.unit)); nav.popBackStack("home", false) }
                        }
                    }
                    composable("checkin") { CheckinScreen(view.today) { e, s -> send("checkin", mapOf("energy" to e, "soreness" to s)); nav.popBackStack() } }
                    composable("routines") { snapshot?.let { s -> RoutinesScreen(s, onRoutine = { nav.navigate("routine/${it.id}") }, onStartEmpty = { send("startEmpty") }) } }
                    composable("routine/{id}") { entry ->
                        val r = snapshot?.routines?.firstOrNull { it.id == entry.arguments?.getString("id") }
                        if (r != null) RoutineScreen(r, startDisabled = view.workout != null || view.starting != null) { send("startRoutine", mapOf("routine" to r.id)) }
                    }
                    composable("overview") { view.workout?.let { w -> OverviewScreen(w, onExercise = { b -> nav.navigate("exercise/${b.id}") }, onAdd = { nav.navigate("add/-") }, onFinish = { nav.navigate("finish") }, onRest = { nav.navigate("rest/$it") }) } }
                    composable("add/{into}") { entry ->
                        val into = entry.arguments?.getString("into")?.takeIf { it != "-" }
                        snapshot?.let { s -> AddExerciseScreen(s, onMuscle = { m -> nav.navigate("muscle/${into ?: "-"}/$m") }, onPick = { e -> addExercise(nav, e, into) { t, f -> send(t, f) } }) }
                    }
                    composable("muscle/{into}/{name}") { entry ->
                        val into = entry.arguments?.getString("into")?.takeIf { it != "-" }
                        val name = entry.arguments?.getString("name") ?: ""
                        MuscleScreen(name, snapshot?.muscles?.get(name).orEmpty()) { e -> addExercise(nav, e, into) { t, f -> send(t, f) } }
                    }
                    composable("finish") {
                        view.workout?.let { w -> FinishScreen(w, units, WorkoutService.summary(w.startedAt), onSave = {
                            val heart = WorkoutService.series(w.startedAt, System.currentTimeMillis())
                            send("finish", mapOf("workoutId" to w.id))
                            // After finish, so it attaches to the saved workout on the phone.
                            if (heart != null) send("heartRate", mapOf("workoutId" to w.id, "series" to heart))
                            nav.popBackStack("home", false)
                        }, onDiscard = { nav.navigate("discard") }) }
                    }
                    composable("discard") {
                        view.workout?.let { w -> ConfirmScreen("Discard workout?", "Nothing from it is saved.", "Discard", onYes = { send("discard", mapOf("workoutId" to w.id)); nav.popBackStack("home", false) }, onNo = { nav.popBackStack() }) }
                    }
                    composable("remove/{block}") { entry ->
                        val w = view.workout; val b = w?.blocks?.firstOrNull { it.id == entry.arguments?.getString("block") }
                        if (w != null && b != null) ConfirmScreen("Remove ${b.name}?", "Its logged sets are removed too.", "Remove",
                            onYes = { send("removeExercise", mapOf("workoutId" to w.id, "block" to b.id)); nav.popBackStack("overview", false) }, onNo = { nav.popBackStack() })
                    }
                    composable("exercise/{id}") { entry ->
                        val w = view.workout
                        val b = w?.blocks?.firstOrNull { it.id == entry.arguments?.getString("id") }
                        if (w != null && b != null) ExerciseScreen(
                            w, b, units,
                            onSend = { type, fields -> send(type, fields + ("workoutId" to w.id)) },
                            onOtherExercise = { dir -> w.blocks.getOrNull(w.blocks.indexOf(b) + dir)?.let { nav.navigate("exercise/${it.id}") { popUpTo("overview") } } },
                            onSetType = { set -> nav.navigate("settype/${b.id}/${set.id}") },
                            onActions = { nav.navigate("actions/${b.id}") },
                            onOverview = { nav.popBackStack("overview", false) },
                            onLogged = { logged -> afterLog(nav, w, logged) },
                            onRest = { nav.navigate("rest/$it") },
                        )
                    }
                    composable("actions/{block}") { entry ->
                        val w = view.workout; val b = w?.blocks?.firstOrNull { it.id == entry.arguments?.getString("block") }
                        if (w != null && b != null) ActionsScreen(w, b,
                            onCommand = { type, fields -> send(type, fields + ("workoutId" to w.id)); if (type == "moveExercise" || type.contains("superset")) nav.popBackStack("overview", false) },
                            onAddExercise = { nav.navigate("add/${if (b.supersetId != null) b.id else "-"}") },
                            onRemove = { nav.navigate("remove/${b.id}") })
                    }
                    composable("settype/{block}/{set}") { entry ->
                        val w = view.workout
                        val b = w?.blocks?.firstOrNull { it.id == entry.arguments?.getString("block") }
                        val set = b?.sets?.firstOrNull { it.id == entry.arguments?.getString("set") }
                        if (w != null && b != null && set != null) SetTypeScreen(set) { t ->
                            send("setType", mapOf("workoutId" to w.id, "block" to b.id, "set" to set.id, "setType" to t)); nav.popBackStack()
                        }
                    }
                    composable("rest/{block}") { entry ->
                        val w = view.workout
                        val b = w?.blocks?.firstOrNull { it.id == entry.arguments?.getString("block") }
                        if (w != null && b != null) {
                            val nextBlock = nextPending(w, b)
                            val nextSet = nextBlock?.sets?.firstOrNull { !it.done }
                            RestScreen(b, w.timers[b.id], units, nextSet?.let { setText(nextBlock.tracking, Values(Engine.shown(it, "weightKg"), Engine.shown(it, "reps")?.toInt(), Engine.shown(it, "timeSec")?.toInt(), Engine.shown(it, "distanceKm")), units) },
                                onSend = { type, fields -> send(type, fields + ("workoutId" to w.id)) },
                                onDone = { if (nextBlock != null) nav.navigate("exercise/${nextBlock.id}") { popUpTo("overview") } else nav.popBackStack("overview", false) })
                        }
                    }
                }
            }
        }
    }
}
