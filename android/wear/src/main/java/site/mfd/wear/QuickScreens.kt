package site.mfd.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
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
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.ProgressIndicatorDefaults
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import kotlin.math.roundToInt

private fun mealNow(): String { val h = java.time.LocalTime.now().hour
    return when { h < 11 -> "breakfast"; h < 15 -> "lunch"; h < 18 -> "snacks"; else -> "dinner" } }
private val MEAL_LABEL = linkedMapOf("breakfast" to "Breakfast", "lunch" to "Lunch", "dinner" to "Dinner", "snacks" to "Snacks")

/** Weigh-in: the last weight to start from, the bezel moves it by 0.1. */
@Composable
fun WeighScreen(t: Today, units: Units, onSave: (Double) -> Unit) {
    var shown by remember { mutableDoubleStateOf(((units.toShown(t.lastWeightKg ?: 75.0)) * 10).roundToInt() / 10.0) }
    Box(Modifier.fillMaxSize().bezel { dir -> shown = maxOf(20.0, ((shown + dir * 0.1) * 10).roundToInt() / 10.0) }, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(bottom = 30.dp)) {
            Text("Weigh-in", color = C.muted, fontWeight = FontWeight.Bold)
            Text("%.1f".format(shown), fontSize = 46.sp, fontWeight = FontWeight.ExtraBold)
            Text(units.unit, color = C.muted)
            t.lastWeightKg?.let { last -> val diff = shown - units.toShown(last)
                Text((if (diff >= 0) "+" else "") + "%.1f".format(diff) + " since last", color = if (diff <= 0) C.success else C.accent2, fontSize = 12.sp) }
            Text("Turn the bezel", color = C.muted, fontSize = 11.sp)
        }
        EdgeAction("Save", Modifier.align(Alignment.BottomCenter)) { onSave(units.toKg(shown)) }
    }
}

/** Water: today against the goal; +250 ml, +500 ml, Undo. */
@Composable
fun WaterScreen(t: Today, onAdd: (Int) -> Unit) {
    var last by remember { mutableIntStateOf(0) }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(progress = { (t.waterMl.toFloat() / maxOf(1, t.waterGoalMl)).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxSize().padding(4.dp), strokeWidth = 8.dp,
            colors = ProgressIndicatorDefaults.colors(indicatorColor = C.water, trackColor = C.surface))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Water", color = C.muted, fontWeight = FontWeight.Bold)
            Text("%.2f".format(t.waterMl / 1000.0).trimEnd('0').trimEnd('.') + " / " + "%.1f".format(t.waterGoalMl / 1000.0) + " L", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            Button(onClick = { onAdd(250); last = 250 }, modifier = Modifier.padding(top = 6.dp).height(44.dp).width(130.dp),
                colors = ButtonDefaults.buttonColors(containerColor = C.water, contentColor = Color.White), label = { Text("+250 ml", fontWeight = FontWeight.ExtraBold) })
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                Button(onClick = { onAdd(500); last = 500 }, modifier = Modifier.height(36.dp), colors = ButtonDefaults.filledTonalButtonColors(containerColor = C.surface2), label = { Text("+500") })
                Button(onClick = { if (last > 0) { onAdd(-last); last = 0 } }, enabled = last > 0, modifier = Modifier.height(36.dp), colors = ButtonDefaults.filledTonalButtonColors(containerColor = C.surface2), label = { Text("Undo") })
            }
        }
    }
}

/** Food: something eaten before (recent or favourite), no typing. */
@Composable
fun FoodScreen(t: Today, foods: List<WatchFood>, onPick: (WatchFood) -> Unit) {
    val list = rememberScalingLazyListState()
    ScreenScaffold(scrollState = list) { padding -> ScalingLazyColumn(state = list, contentPadding = padding) {
        item { ListHeader { Text("Log food") } }
        item { Text(kcalLine(t), color = C.muted, fontSize = 12.sp, textAlign = TextAlign.Center) }
        if (foods.isEmpty()) item { Text("Foods you log on your phone appear here", color = C.muted, textAlign = TextAlign.Center) }
        for (f in foods) item { Row(f.name, "${num(f.amount)} ${unitText(f.unit, f.amount)} · ${(f.kcalPerUnit * f.amount).roundToInt()} kcal") { onPick(f) } }
    } }
}
fun unitText(u: String, amount: Double) = when (u) { "serving" -> if (amount == 1.0) "serving" else "servings"; else -> u }
fun kcalLine(t: Today) = t.kcalTarget?.let { "${it - t.kcalEaten} kcal left · ${t.protein} g protein" } ?: "${t.kcalEaten} kcal today"

@Composable
fun FoodPickScreen(f: WatchFood, onAdd: (String, Double) -> Unit) {
    var meal by remember { mutableStateOf(mealNow()) }
    val step = if (f.unit == "serving") 0.5 else 10.0
    var amount by remember { mutableDoubleStateOf(f.amount) }
    Box(Modifier.fillMaxSize().bezel { dir -> amount = maxOf(step, ((amount + dir * step) * 10).roundToInt() / 10.0) }, contentAlignment = Alignment.TopCenter) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = 26.dp, start = 26.dp, end = 26.dp)) {
            Text(f.name, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 14.sp)
            Text("${num(amount)} ${unitText(f.unit, amount)}", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
            Text("${(f.kcalPerUnit * amount).roundToInt()} kcal · ${(f.proteinPerUnit * amount).roundToInt()} g protein", color = C.muted, fontSize = 12.sp)
            // One chip for the meal: each tap moves to the next one.
            val keys = MEAL_LABEL.keys.toList()
            Box(Modifier.padding(top = 8.dp).background(C.accentSoft, RoundedCornerShape(16.dp)).border(1.5.dp, C.accent, RoundedCornerShape(16.dp))
                .clickable { meal = keys[(keys.indexOf(meal) + 1) % keys.size] }.padding(horizontal = 16.dp, vertical = 7.dp)) {
                Text("${MEAL_LABEL[meal]}  ›", fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
        EdgeAction("Add", Modifier.align(Alignment.BottomCenter)) { onAdd(meal, amount) }
    }
}

/** Morning check-in: energy and soreness (tap one, turn the bezel); sleep and steps come from Samsung Health. */
@Composable
fun CheckinScreen(t: Today, onSave: (Int, Int) -> Unit) {
    var energy by remember { mutableIntStateOf(t.energy ?: 3) }
    var soreness by remember { mutableIntStateOf(t.soreness ?: 2) }
    var editing by remember { mutableStateOf("energy") }
    val energyLabel = listOf("Exhausted", "Tired", "OK", "Good", "Fresh"); val soreLabel = listOf("None", "Light", "Some", "Sore", "Very sore")
    Box(Modifier.fillMaxSize().bezel { dir -> if (editing == "energy") energy = (energy + dir).coerceIn(1, 5) else soreness = (soreness + dir).coerceIn(1, 5) }, contentAlignment = Alignment.TopCenter) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = 30.dp, start = 24.dp, end = 24.dp)) {
            Text("Check-in", color = C.muted, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                for ((key, value, labels) in listOf(Triple("energy", energy, energyLabel), Triple("soreness", soreness, soreLabel))) {
                    val on = editing == key
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(78.dp).background(if (on) C.accentSoft else C.surface, RoundedCornerShape(18.dp))
                        .then(if (on) Modifier.border(2.dp, C.accent, RoundedCornerShape(18.dp)) else Modifier).clickable { editing = key }.padding(vertical = 6.dp)) {
                        Text(if (key == "energy") "Energy" else "Soreness", fontSize = 10.sp, color = C.muted)
                        Text("$value/5", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                        Text(labels[value - 1], fontSize = 10.sp, color = C.muted, maxLines = 1)
                    }
                }
            }
            val sleep = t.sleep?.let { "Sleep ${num(it)} h" }; val steps = t.steps?.let { "%,d steps".format(it) }
            Text(listOfNotNull(sleep, steps).joinToString(" · ").ifEmpty { "Sleep and steps come from Samsung Health" }, color = C.muted, fontSize = 11.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
        }
        EdgeAction("Save", Modifier.align(Alignment.BottomCenter)) { onSave(energy, soreness) }
    }
}
