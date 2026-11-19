package site.mfd.wear

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.IconButton
import androidx.wear.compose.material3.IconButtonDefaults
import androidx.wear.compose.material3.ProgressIndicatorDefaults
import androidx.wear.compose.material3.Text
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.roundToInt

/** Set types: label, letter and colour (as on the phone). */
data class Kind(val label: String, val letter: String?, val color: Color)
val KINDS = linkedMapOf(
    "normal" to Kind("Working", null, C.text), "warmup" to Kind("Warm-up", "W", C.warmup),
    "failure" to Kind("Failure", "F", C.failure), "drop" to Kind("Drop", "D", C.drop),
)

/** Weights in the person's unit (kg or lb); values are stored in kg. */
class Units(val lb: Boolean) {
    fun toShown(kg: Double) = if (lb) kg * 2.20462 else kg
    fun toKg(x: Double) = if (lb) x / 2.20462 else x
    fun step(kgStep: Double) = if (lb) (if (kgStep >= 2.5) 5.0 else 2.5) else kgStep
    val unit get() = if (lb) "lb" else "kg"
}

/** A number as logged, up to two decimals (12.5, 12.25, 80), without trailing zeros. */
fun num(x: Double): String = if (abs(x - x.roundToInt()) < 0.001) x.roundToInt().toString() else "%.2f".format(x).trimEnd('0').trimEnd('.', ',')
fun mmss(sec: Int) = "%d:%02d".format(sec / 60, sec % 60)

/** How a field's value reads, and how far one bezel click moves it. */
fun fieldText(f: String, x: Double?, u: Units): String = when {
    x == null -> "—"
    f == "weightKg" -> num((u.toShown(x) * 100).roundToInt() / 100.0)
    f == "timeSec" -> mmss(x.toInt())
    f == "distanceKm" -> num(x)
    else -> x.roundToInt().toString()
}
fun fieldUnit(f: String, u: Units) = when (f) { "weightKg" -> u.unit; "reps" -> "reps"; "timeSec" -> "time"; "distanceKm" -> "km"; else -> "" }
fun setText(tracking: String, v: Values, u: Units) = Engine.fields(tracking).joinToString(" × ") { f -> fieldText(f, Engine.get(v, f), u) + if (f == "weightKg") " ${u.unit}" else "" }

fun buzz(ctx: Context) {
    val v = if (Build.VERSION.SDK_INT >= 31) (ctx.getSystemService(VibratorManager::class.java)).defaultVibrator else @Suppress("DEPRECATION") ctx.getSystemService(Vibrator::class.java)
    v?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 260, 140, 260, 140, 400), -1))
}

/** Bezel turns (and the crown on other watches): one call per click, +1 clockwise. */
@Composable
fun Modifier.bezel(onTurn: (Int) -> Unit): Modifier {
    val focus = remember { FocusRequester() }
    var acc by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) { focus.requestFocus() }
    return this.onRotaryScrollEvent { e -> acc += e.verticalScrollPixels; if (abs(acc) >= 24f) { onTurn(if (acc > 0) 1 else -1); acc = 0f }; true }
        .focusRequester(focus).focusable()
}

/**
 * The logging screen: one set at a time. Tap weight or reps, turn the bezel to change it, Log set. ‹ › move between
 * sets (earlier sets can be corrected: Update). With no value selected the bezel moves between exercises.
 */
@Composable
fun ExerciseScreen(
    w: Workout, b: Block, units: Units,
    onSend: (String, Map<String, Any?>) -> Unit, onOtherExercise: (Int) -> Unit, onSetType: (SetRow) -> Unit, onActions: () -> Unit, onOverview: () -> Unit, onLogged: (Block) -> Unit,
) {
    val pending = b.sets.indexOfFirst { !it.done }.let { if (it < 0) b.sets.lastIndex else it }
    var view by remember(b.id) { mutableStateOf<Int?>(null) }
    val si = (view ?: pending).coerceIn(0, maxOf(0, b.sets.lastIndex))
    val s = b.sets.getOrNull(si) ?: return
    val fields = Engine.fields(b.tracking)
    var selected by remember(b.id, si) { mutableStateOf<String?>(null) }
    // Values typed on the watch for this set, before logging (in kg / reps / seconds / km).
    val draft = remember(b.id, s.id) { mutableStateMapOf<String, Double>() }
    val showAi = s.ai && !s.done && draft.isEmpty()
    fun shownValue(f: String) = draft[f] ?: (if (s.done) Engine.get(s.v, f) else Engine.shown(s, f))

    val logLabel = if (s.done) "Update" else "Log set"
    val onLog = {
        val values = draft.toMap()
        if (s.done) { if (values.isNotEmpty()) onSend("updateSet", mapOf("block" to b.id, "set" to s.id, "values" to org.json.JSONObject(values as Map<*, *>))); view = null }
        else { onSend("logSet", mapOf("block" to b.id, "set" to s.id, "values" to org.json.JSONObject(values as Map<*, *>))); view = null; selected = null; onLogged(b) }
    }
    Box(Modifier.fillMaxSize().bezel { dir ->
        val f = selected
        if (f == null) { onOtherExercise(dir); return@bezel }
        val cur = shownValue(f) ?: 0.0
        draft[f] = when (f) {
            "weightKg" -> maxOf(0.0, units.toKg(((units.toShown(cur) + dir * units.step(b.step)) * 100).roundToInt() / 100.0))
            "reps" -> maxOf(0.0, cur + dir)
            "timeSec" -> maxOf(0.0, cur + dir * 5)
            else -> maxOf(0.0, ((cur + dir * 0.1) * 10).roundToInt() / 10.0)
        }
    }, contentAlignment = Alignment.TopCenter) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = 26.dp, start = 24.dp, end = 24.dp)) {
            // The name opens the exercise's actions (add or remove sets, move, superset…).
            Text(b.name + "  ⋯", fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable { onActions() }.padding(horizontal = 6.dp, vertical = 2.dp))
            val k = KINDS[s.type] ?: KINDS.getValue("normal")
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { view = si - 1 }, enabled = si > 0, modifier = Modifier.size(30.dp)) { Icon(Icons.Filled.KeyboardArrowLeft, "Previous set") }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { onSetType(s) }.padding(horizontal = 2.dp)) {
                    k.letter?.let { Box(Modifier.size(18.dp).background(k.color, CircleShape), contentAlignment = Alignment.Center) { Text(it, color = Color.Black, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold) } }
                    if (s.done) Icon(Icons.Filled.Check, "Logged", tint = C.success, modifier = Modifier.size(14.dp))
                    Text(" Set ${si + 1}/${b.sets.size} · ${k.label}", color = k.color, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }
                IconButton(onClick = { view = si + 1 }, enabled = si < b.sets.lastIndex, modifier = Modifier.size(30.dp)) { Icon(Icons.Filled.KeyboardArrowRight, "Next set") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (f in fields) {
                    val on = selected == f
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                        modifier = Modifier.width(if (fields.size == 1) 100.dp else 74.dp).height(54.dp)
                            .background(if (on) C.accentSoft else C.surface, RoundedCornerShape(18.dp))
                            .then(if (on) Modifier.border(2.dp, C.accent, RoundedCornerShape(18.dp)) else Modifier)
                            .clickable { selected = if (on) null else f }) {
                        Text((if (showAi) "✦" else "") + fieldText(f, shownValue(f), units), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold,
                            color = if (showAi) C.ai else C.text, maxLines = 1)
                        Text(fieldUnit(f, units), fontSize = 10.sp, color = C.muted)
                    }
                }
            }
            Text(if (selected != null) "Turn the bezel to change" else (if (showAi) "✦ AI · " else "") + "Last: " + (s.p?.let { setText(b.tracking, it, units) } ?: "—"),
                fontSize = 11.sp, color = if (selected != null) C.accent2 else if (showAi) C.ai else C.muted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
        }
        EdgeAction(logLabel, Modifier.align(Alignment.BottomCenter), onLog)
    }
}

/** The main action along the round screen's bottom edge (like Wear OS's edge button). */
@Composable
fun EdgeAction(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) = Box(
    modifier.padding(bottom = 2.dp).width(128.dp).height(46.dp)
        .background(C.accent, RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp, bottomStart = 66.dp, bottomEnd = 66.dp))
        .clickable(onClick = onClick),
    contentAlignment = Alignment.Center,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 6.dp)) {
        Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(18.dp))
        Text(" $label", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
    }
}

@Composable
fun SetTypeScreen(s: SetRow, onPick: (String) -> Unit) = Column(Modifier.fillMaxSize().padding(horizontal = 30.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
    Text("Set type", fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(bottom = 6.dp))
    for ((key, k) in KINDS) Button(onClick = { onPick(key) }, modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp).height(38.dp),
        colors = ButtonDefaults.filledTonalButtonColors(containerColor = if (s.type == key) C.surface2 else C.surface, contentColor = k.color),
        label = { Text((k.letter?.let { "$it · " } ?: "") + k.label, fontWeight = FontWeight.Bold) })
}

/** Rest countdown with −15 s / Skip / +15 s; at zero it buzzes, says "Rest over" and goes on by itself after 2 s. */
@Composable
fun RestScreen(b: Block, timer: Timer?, units: Units, next: String?, onSend: (String, Map<String, Any?>) -> Unit, onDone: () -> Unit) {
    val ctx = LocalContext.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(250) } }
    val ends = timer?.endsAt
    val left = if (ends == null) 0 else maxOf(0, ((ends - now + 999) / 1000).toInt())
    val over = ends == null || left == 0
    // The workout session buzzes (also with the screen off); without it, buzz here.
    LaunchedEffect(over) { if (over) { if (ends != null && !WorkoutService.running) buzz(ctx); delay(2000); onDone() } }
    Box(Modifier.fillMaxSize().background(if (over) C.accentSoft else C.bg).clickable(enabled = over) { onDone() }, contentAlignment = Alignment.Center) {
        if (!over) CircularProgressIndicator(progress = { left / maxOf(1f, (timer?.durationSec ?: 1).toFloat()) }, modifier = Modifier.fillMaxSize().padding(4.dp), strokeWidth = 8.dp,
            colors = ProgressIndicatorDefaults.colors(indicatorColor = C.accent, trackColor = C.surface))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (over) "Rest over" else "Rest", color = if (over) C.text else C.muted, fontWeight = FontWeight.Bold, fontSize = if (over) 24.sp else 13.sp)
            if (!over) Text(mmss(left), fontSize = 44.sp, fontWeight = FontWeight.ExtraBold)
            next?.let { Text("Next: $it", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = C.muted) }
            HeartChip()
            if (!over) Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 6.dp, start = 14.dp, end = 14.dp)) {
                Button(onClick = { onSend("restAdjust", mapOf("block" to b.id, "sec" to -15)) }, modifier = Modifier.height(36.dp).width(52.dp), colors = ButtonDefaults.filledTonalButtonColors(containerColor = C.surface2), label = { Text("−15", fontWeight = FontWeight.Bold) })
                Button(onClick = { onSend("restSkip", mapOf("block" to b.id)); onDone() }, modifier = Modifier.height(36.dp), colors = ButtonDefaults.buttonColors(containerColor = C.accent, contentColor = Color.White), label = { Text("Skip") })
                Button(onClick = { onSend("restAdjust", mapOf("block" to b.id, "sec" to 15)) }, modifier = Modifier.height(36.dp).width(52.dp), colors = ButtonDefaults.filledTonalButtonColors(containerColor = C.surface2), label = { Text("+15", fontWeight = FontWeight.Bold) })
            } else Box(Modifier.padding(top = 10.dp).width(80.dp).height(4.dp).background(C.accent, RoundedCornerShape(2.dp)))
        }
    }
}
