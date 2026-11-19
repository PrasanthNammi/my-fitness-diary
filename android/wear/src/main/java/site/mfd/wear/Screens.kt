package site.mfd.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/** "12:34" or "1:02:03". */
fun clock(sec: Long): String { val s = maxOf(0, sec); val h = s / 3600; val m = s % 3600 / 60; val x = s % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, x) else "%d:%02d".format(m, x) }

/** Seconds since `start` (ms), ticking every second. */
@Composable
fun elapsed(start: Long): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(start) { while (true) { now = System.currentTimeMillis(); delay(1000) } }
    return (now - start) / 1000
}

@Composable
private fun ListScreen(edge: (@Composable BoxScope.() -> Unit)? = null, content: ScalingLazyListScope.() -> Unit) {
    val list = rememberScalingLazyListState()
    // A few dp inside the round edge, so rows are never cut off.
    val inset = Modifier.padding(horizontal = 6.dp)
    if (edge != null) ScreenScaffold(scrollState = list, edgeButton = edge) { padding -> ScalingLazyColumn(state = list, modifier = inset, contentPadding = padding, content = content) }
    else ScreenScaffold(scrollState = list) { padding -> ScalingLazyColumn(state = list, modifier = inset, contentPadding = padding, content = content) }
}

@Composable
fun Row(title: String, sub: String? = null, accent: Boolean = false, icon: (@Composable BoxScope.() -> Unit)? = null, onClick: () -> Unit) =
    Button(
        onClick = onClick, modifier = Modifier.fillMaxWidth(),
        colors = if (accent) ButtonDefaults.buttonColors(containerColor = C.accent, contentColor = Color.White, iconColor = Color.White, secondaryContentColor = Color.White) else ButtonDefaults.filledTonalButtonColors(containerColor = C.surface, contentColor = C.text, iconColor = C.accent2),
        icon = icon,
        label = { Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold) },
        secondaryLabel = sub?.let { { Text(it, color = if (accent) Color.White else C.muted, maxLines = 1) } },
    )

@Composable
private fun PhoneLine(nearby: Boolean?) = Text(
    when (nearby) { true -> "Phone linked"; false -> "Phone not nearby · still works"; null -> "Looking for your phone…" },
    color = if (nearby == true) C.success else C.muted, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
)

// ───────── Home ─────────
@Composable
fun HomeScreen(s: Snapshot?, view: View, nearby: Boolean?, units: Units, onWorkout: () -> Unit, onStartEmpty: () -> Unit, onRoutines: () -> Unit, onQuick: (String) -> Unit) = ListScreen {
    item { PhoneLine(nearby) }
    item { Text("MFD", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, color = C.accent) }
    if (s == null) {
        item { Text("Open MFD on your phone to finish setup", textAlign = TextAlign.Center, color = C.muted) }
        return@ListScreen
    }
    val w = view.workout
    view.ended?.let { item { Text("✓ $it · syncing to your phone", color = C.success, fontSize = 12.sp, textAlign = TextAlign.Center) } }
    if (w != null) item { WorkoutCard(w, onWorkout) }
    else if (view.starting != null) item { Text("Starting ${view.starting}…", color = C.accent2, textAlign = TextAlign.Center) }
    else item { Row("Start empty workout", accent = true, icon = { Icon(Icons.Filled.PlayArrow, null) }, onClick = onStartEmpty) }
    item { Row("Routines", "${s.routines.size} routines", icon = { Icon(Icons.Filled.List, null) }, onClick = onRoutines) }
    val t = view.today
    item { Text("Quick log", color = C.muted, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
    item { Row("Weigh-in", t.lastWeightKg?.let { "Last ${num((units.toShown(it) * 10).roundToInt() / 10.0)} ${units.unit}" }) { onQuick("weigh") } }
    item { Row("Water", "%.1f / %.1f L".format(t.waterMl / 1000.0, t.waterGoalMl / 1000.0)) { onQuick("water") } }
    item { Row("Food", kcalLine(t)) { onQuick("food") } }
    item { Row("Check-in", "Energy & soreness") { onQuick("checkin") } }
}

@Composable
private fun WorkoutCard(w: Workout, onClick: () -> Unit) {
    val current = w.blocks.firstOrNull { b -> b.sets.any { !it.done } } ?: w.blocks.lastOrNull()
    Button(
        onClick = onClick, modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = C.accentSoft, contentColor = C.text),
        border = androidx.compose.foundation.BorderStroke(2.dp, C.accent),
        label = {
            Column {
                Text("● Workout in progress", color = C.accent2, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text(clock(elapsed(w.startedAt)), fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
                current?.let { Text(it.name, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold) }
            }
        },
    )
}

// ───────── Routines ─────────
@Composable
fun RoutinesScreen(s: Snapshot, onRoutine: (Routine) -> Unit, onStartEmpty: () -> Unit) = ListScreen {
    item { ListHeader { Text("Routines") } }
    if (s.routines.isEmpty()) {
        item { Text("No routines yet. Create one on your phone and it appears here.", textAlign = TextAlign.Center, color = C.muted) }
        item { Row("Empty workout", accent = true, icon = { Icon(Icons.Filled.PlayArrow, null) }, onClick = onStartEmpty) }
        return@ListScreen
    }
    // Folders in the phone's order, then routines without a folder.
    val groups = s.routines.groupBy { it.folder }
    for ((folder, list) in groups.entries.sortedBy { it.key == null }) {
        item { Text(folder ?: "No folder", color = C.muted, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
        for (r in list) item { Row(r.name, "${r.exercises.size} exercises", onClick = { onRoutine(r) }) }
    }
}

@Composable
fun RoutineScreen(r: Routine, startDisabled: Boolean, onStart: () -> Unit) = ListScreen(edge = {
    EdgeButton(onClick = onStart, enabled = !startDisabled, colors = ButtonDefaults.buttonColors(containerColor = C.accent, contentColor = Color.White, iconColor = Color.White)) {
        Icon(Icons.Filled.PlayArrow, null); Text("Start")
    }
}) {
    item { Text(r.name, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, textAlign = TextAlign.Center) }
    item { Text("${r.exercises.size} exercises · ${r.exercises.sumOf { it.second }} sets", color = C.muted, fontSize = 13.sp) }
    for ((name, sets) in r.exercises) item {
        Box(Modifier.fillMaxWidth().background(C.surface, RoundedCornerShape(26.dp)).padding(horizontal = 14.dp, vertical = 10.dp)) {
            androidx.compose.foundation.layout.Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${sets}×", color = C.accent, fontWeight = FontWeight.ExtraBold, modifier = Modifier.width(30.dp))
                Text(name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
    if (startDisabled) item { Text("A workout is already running", color = C.muted, fontSize = 12.sp, textAlign = TextAlign.Center) }
}

// ───────── Workout overview ─────────
@Composable
fun OverviewScreen(w: Workout, onExercise: (Block) -> Unit, onAdd: () -> Unit, onFinish: () -> Unit, onRest: (String) -> Unit = {}) = ListScreen {
    item { RestChip(w, onRest) }
    item { Text(clock(elapsed(w.startedAt)), color = C.accent, fontSize = 30.sp, fontWeight = FontWeight.ExtraBold) }
    item { Text(w.title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis) }
    item { HeartChip() }
    w.blocks.forEachIndexed { i, b ->
        val ssStart = b.supersetId != null && w.blocks.getOrNull(i - 1)?.supersetId != b.supersetId
        if (ssStart) item { Text("Superset", color = C.superset, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        item { ExerciseRow(b, inSuperset = b.supersetId != null) { onExercise(b) } }
    }
    if (w.blocks.isEmpty()) item { Text("No exercises yet", color = C.muted) }
    item { Row("Add exercise", icon = { Icon(Icons.Filled.Add, null) }, onClick = onAdd) }
    item { Row("Finish or discard", accent = true, icon = { Icon(Icons.Filled.Check, null) }, onClick = onFinish) }
}

@Composable
private fun ExerciseRow(b: Block, inSuperset: Boolean, onClick: () -> Unit) {
    val done = b.sets.count { it.done }; val total = b.sets.size
    val complete = total > 0 && done == total
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().then(if (inSuperset) Modifier.border(2.dp, C.superset, RoundedCornerShape(28.dp)) else Modifier),
        colors = ButtonDefaults.filledTonalButtonColors(containerColor = C.surface, contentColor = C.text),
        icon = {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(34.dp)) {
                CircularProgressIndicator(progress = { if (total == 0) 0f else done.toFloat() / total }, modifier = Modifier.size(34.dp), strokeWidth = 4.dp,
                    colors = androidx.wear.compose.material3.ProgressIndicatorDefaults.colors(indicatorColor = if (complete) C.success else C.accent, trackColor = C.surface2))
                if (complete) Icon(Icons.Filled.Check, null, tint = C.success, modifier = Modifier.size(16.dp))
                else Text("$done/$total", fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
            }
        },
        label = { Text(b.name, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold) },
    )
}

/** Live heart rate during a workout ("♥ 132"), hidden until the first reading. */
@Composable
fun HeartChip() {
    val v = WorkoutService.bpm.intValue
    if (v > 0) Text("♥ $v", color = C.failure, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
}

@Composable
fun ComingNext(title: String) = ListScreen {
    item { Text(title, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center) }
    item { Text("Coming in the next build.", color = C.muted, textAlign = TextAlign.Center) }
}
