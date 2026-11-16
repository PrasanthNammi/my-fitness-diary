package site.mfd.wear

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text

@Composable
private fun Scroll(content: ScalingLazyListScope.() -> Unit) {
    val list = rememberScalingLazyListState()
    ScreenScaffold(scrollState = list) { padding -> ScalingLazyColumn(state = list, contentPadding = padding, content = content) }
}

@Composable
private fun Danger(title: String, onClick: () -> Unit) = androidx.wear.compose.material3.Button(
    onClick = onClick, modifier = Modifier.fillMaxWidth(),
    colors = ButtonDefaults.filledTonalButtonColors(containerColor = C.failureSoft, contentColor = C.failure, iconColor = C.failure),
    icon = { Icon(Icons.Filled.Delete, null) }, label = { Text(title, fontWeight = FontWeight.Bold) })

/** What can be done to one exercise during a workout. */
@Composable
fun ActionsScreen(w: Workout, b: Block, onCommand: (String, Map<String, Any?>) -> Unit, onAddExercise: () -> Unit, onRemove: () -> Unit) = Scroll {
    val i = w.blocks.indexOf(b)
    val next = w.blocks.getOrNull(i + 1)
    item { ListHeader { Text(b.name, maxLines = 2, textAlign = TextAlign.Center) } }
    item { Row("Add set", icon = { Icon(Icons.Filled.Add, null) }) { onCommand("addSet", mapOf("block" to b.id, "newSet" to newId())) } }
    if (b.sets.size > 1) item { Row("Remove last set", icon = { Icon(Icons.Filled.Close, null) }) { onCommand("removeSet", mapOf("block" to b.id, "set" to b.sets.last().id)) } }
    if (i > 0) item { Row("Move up", icon = { Icon(Icons.Filled.KeyboardArrowUp, null) }) { onCommand("moveExercise", mapOf("block" to b.id, "dir" to -1)) } }
    if (next != null) item { Row("Move down", icon = { Icon(Icons.Filled.KeyboardArrowDown, null) }) { onCommand("moveExercise", mapOf("block" to b.id, "dir" to 1)) } }
    if (b.supersetId != null) item { Row("Remove from superset") { onCommand("unsuperset", mapOf("block" to b.id)) } }
    else if (next != null) item { Row("Superset with next", next.name) { onCommand("superset", mapOf("block" to b.id)) } }
    item { Row("Add exercise", if (b.supersetId != null) "Into this superset" else "At the end", icon = { Icon(Icons.Filled.Add, null) }, onClick = onAddExercise) }
    item { Danger("Remove exercise", onRemove) }
}

/** Add exercise: recently used first, then by muscle (the phone's library, no typing). */
@Composable
fun AddExerciseScreen(s: Snapshot, onMuscle: (String) -> Unit, onPick: (LibExercise) -> Unit) = Scroll {
    item { ListHeader { Text("Add exercise") } }
    if (s.recent.isNotEmpty()) {
        item { Text("Recent", color = C.muted, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
        for (e in s.recent.take(12)) item { Row(e.name, e.muscle) { onPick(e) } }
    }
    item { Text("By muscle", color = C.muted, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
    for (m in listOf("Chest", "Back", "Legs", "Shoulders", "Arms", "Core").filter { s.muscles[it]?.isNotEmpty() == true })
        item { Row(m, "${s.muscles[m]!!.size} exercises") { onMuscle(m) } }
    if (s.recent.isEmpty() && s.muscles.isEmpty()) item { Text("Open MFD on your phone to load your exercises", color = C.muted, textAlign = TextAlign.Center) }
}

@Composable
fun MuscleScreen(name: String, list: List<LibExercise>, onPick: (LibExercise) -> Unit) = Scroll {
    item { ListHeader { Text(name) } }
    for (e in list) item { Row(e.name) { onPick(e) } }
}

/** Finish: what was done, then Save or Discard. */
@Composable
fun FinishScreen(w: Workout, units: Units, heart: Pair<Long?, Long?>, onSave: () -> Unit, onDiscard: () -> Unit) = Scroll {
    val done = w.blocks.flatMap { b -> b.sets.filter { it.done }.map { b to it } }
    val volume = done.filter { it.second.type != "warmup" }.sumOf { (_, s) -> (s.v.weightKg ?: 0.0) * (s.v.reps ?: 0) }
    item { ListHeader { Text("Finish or discard") } }
    item { Text(clock((System.currentTimeMillis() - w.startedAt) / 1000), color = C.accent, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold) }
    item { Text("${done.size} sets · ${num((units.toShown(volume)).let { Math.round(it).toDouble() })} ${units.unit} volume", color = C.muted, textAlign = TextAlign.Center) }
    if (heart.first != null) item { Text("♥ avg ${heart.first} · max ${heart.second} bpm", color = C.failure, fontWeight = FontWeight.Bold) }
    if (done.isEmpty()) item { Text("Nothing logged yet", color = C.muted) }
    else item { Row("Save", accent = true, icon = { Icon(Icons.Filled.Check, null) }, onClick = onSave) }
    item { Danger("Discard", onDiscard) }
}

@Composable
fun ConfirmScreen(title: String, sub: String, yes: String, onYes: () -> Unit, onNo: () -> Unit) = Scroll {
    item { ListHeader { Text(title, textAlign = TextAlign.Center) } }
    item { Text(sub, color = C.muted, textAlign = TextAlign.Center) }
    item { Danger(yes, onYes) }
    item { Row("Cancel", onClick = onNo) }
}

/** Ids the watch gives to things it creates (the phone keeps them). */
fun newId() = "w" + java.util.UUID.randomUUID().toString().replace("-", "").take(20)
