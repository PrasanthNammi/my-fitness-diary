package site.mfd.wear

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.degrees
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import site.mfd.shared.Sync

/** Tiles and complications: the latest data, refreshed whenever the phone sends a snapshot (also with MFD closed). */
object Glance {
    fun refresh(ctx: Context) {
        try {
            TileService.getUpdater(ctx).requestUpdate(TodayTile::class.java)
            TileService.getUpdater(ctx).requestUpdate(QuickStartTile::class.java)
            for (c in listOf(KcalComplication::class.java, WorkoutsComplication::class.java))
                ComplicationDataSourceUpdateRequester.create(ctx, ComponentName(ctx, c)).requestUpdateAll()
        } catch (e: Exception) {}
    }
    fun today(ctx: Context): Pair<Today?, Boolean> {
        WatchStore.load(ctx)
        val s = WatchStore.snapshot.value ?: return null to false
        val v = Optimistic.view(s, WatchStore.outbox)
        return v.today to (v.workout != null)
    }
    /** Opens MFD (at a routine when given). */
    fun open(ctx: Context, routine: String? = null): PendingIntent = PendingIntent.getActivity(ctx, routine?.hashCode() ?: 0,
        Intent(ctx, WatchActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).apply { routine?.let { putExtra(WatchActivity.EXTRA_ROUTINE, it) } }, PendingIntent.FLAG_IMMUTABLE)
}

/** Phone snapshots while MFD isn't open: saved for tiles, complications and the next start. */
class SnapshotListener : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        for (e in events) if (e.type == DataEvent.TYPE_CHANGED && e.dataItem.uri.path == Sync.STATE)
            DataMapItem.fromDataItem(e.dataItem).dataMap.getString(Sync.KEY_JSON)?.let { WatchStore.load(this); WatchStore.receive(this, it) }
    }
}

private const val RES = "1"
private fun text(t: String, size: Float, color: Int, bold: Boolean = false) = LayoutElementBuilders.Text.Builder().setText(t)
    .setFontStyle(LayoutElementBuilders.FontStyle.Builder().setSize(sp(size)).setColor(argb(color))
        .setWeight(if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL).build()).build()
private fun launch(ctx: Context, routine: String? = null) = ModifiersBuilders.Clickable.Builder().setId("open" + (routine ?: ""))
    .setOnClick(ActionBuilders.LaunchAction.Builder().setAndroidActivity(ActionBuilders.AndroidActivity.Builder()
        .setPackageName(ctx.packageName).setClassName(WatchActivity::class.java.name)
        .apply { routine?.let { addKeyToExtraMapping(WatchActivity.EXTRA_ROUTINE, ActionBuilders.AndroidStringExtra.Builder().setValue(it).build()) } }.build()).build()).build()
private fun tile(root: LayoutElementBuilders.LayoutElement): ListenableFuture<TileBuilders.Tile> = Futures.immediateFuture(
    TileBuilders.Tile.Builder().setResourcesVersion(RES).setFreshnessIntervalMillis(30 * 60_000L)
        .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(root)).build())
private const val TEXT = 0xFFF4F2EE.toInt(); private const val MUTED = 0xFFA19D95.toInt(); private const val ACCENT = 0xFFFF5A1F.toInt(); private const val TRACK = 0xFF2A2A2E.toInt()

/** Today: calories left with a ring, protein, water, workouts this week. */
class TodayTile : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val t = Glance.today(this).first
        val col = LayoutElementBuilders.Column.Builder().setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        if (t == null) col.addContent(text("MFD", 18f, ACCENT, true)).addContent(text("Open MFD on your phone", 13f, MUTED))
        else {
            col.addContent(text("Today", 13f, MUTED))
            col.addContent(text(t.kcalTarget?.let { "${it - t.kcalEaten}" } ?: "${t.kcalEaten}", 34f, TEXT, true))
            col.addContent(text(if (t.kcalTarget != null) "kcal left" else "kcal", 13f, MUTED))
            col.addContent(text("${t.protein}${t.proteinTarget?.let { " / $it" } ?: ""} g protein", 13f, TEXT))
            col.addContent(text("%.1f / %.1f L water".format(t.waterMl / 1000.0, t.waterGoalMl / 1000.0), 13f, TEXT))
            col.addContent(text("${t.workoutsThisWeek} workouts this week", 13f, MUTED))
        }
        val pct = if (t?.kcalTarget != null && t.kcalTarget > 0) (t.kcalEaten.toFloat() / t.kcalTarget).coerceIn(0f, 1f) else 0f
        val arc = LayoutElementBuilders.Arc.Builder().setAnchorAngle(degrees(0f)).setAnchorType(LayoutElementBuilders.ARC_ANCHOR_START)
            .addContent(LayoutElementBuilders.ArcLine.Builder().setLength(degrees(360f * pct)).setThickness(dp(6f)).setColor(argb(ACCENT)).build()).build()
        val track = LayoutElementBuilders.Arc.Builder().setAnchorAngle(degrees(0f)).setAnchorType(LayoutElementBuilders.ARC_ANCHOR_START)
            .addContent(LayoutElementBuilders.ArcLine.Builder().setLength(degrees(360f)).setThickness(dp(6f)).setColor(argb(TRACK)).build()).build()
        return tile(LayoutElementBuilders.Box.Builder().setWidth(expand()).setHeight(expand())
            .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(launch(this)).build())
            .addContent(track).addContent(arc).addContent(col.build()).build())
    }
    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion(RES).build())
}

/** Quick start: the next routine (opens it in MFD, where Start is one tap), or Continue workout while one runs. */
class QuickStartTile : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val (t, running) = Glance.today(this)
        val routine = t?.nextRoutineId
        val label = when { running -> "Continue workout"; routine != null -> "Start"; else -> "Open MFD" }
        val button = LayoutElementBuilders.Box.Builder().setWidth(dp(120f)).setHeight(dp(48f))
            .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(launch(this, if (running) null else routine))
                .setBackground(ModifiersBuilders.Background.Builder().setColor(argb(ACCENT)).setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(24f)).build()).build()).build())
            .addContent(text(label, 15f, 0xFFFFFFFF.toInt(), true)).build()
        val col = LayoutElementBuilders.Column.Builder().setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(text(if (running) "Workout in progress" else "Next workout", 13f, MUTED))
            .addContent(text(if (running) "" else t?.nextRoutineName ?: "Empty workout", 20f, TEXT, true))
            .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(10f)).build())
            .addContent(button)
        return tile(LayoutElementBuilders.Box.Builder().setWidth(expand()).setHeight(expand()).addContent(col.build()).build())
    }
    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion(RES).build())
}

/** Watch-face complication: calories left today (short text, or a ring with the value). */
class KcalComplication : SuspendingComplicationDataSourceService() {
    private fun data(type: ComplicationType, left: Int, target: Int?): ComplicationData? {
        val desc = PlainComplicationText.Builder("$left kcal left").build()
        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(PlainComplicationText.Builder("$left").build(), desc)
                .setTitle(PlainComplicationText.Builder("kcal").build()).setTapAction(Glance.open(this)).build()
            ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder((target ?: 0).minus(left).toFloat().coerceAtLeast(0f), 0f, (target ?: 1).toFloat().coerceAtLeast(1f), desc)
                .setText(PlainComplicationText.Builder("$left").build()).setTapAction(Glance.open(this)).build()
            else -> null
        }
    }
    override fun getPreviewData(type: ComplicationType) = data(type, 1000, 2600)
    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val t = Glance.today(this).first ?: return null
        return data(request.complicationType, t.kcalTarget?.let { it - t.kcalEaten } ?: t.kcalEaten, t.kcalTarget)
    }
}

/** Watch-face complication: workouts in the last 7 days. */
class WorkoutsComplication : SuspendingComplicationDataSourceService() {
    private fun data(type: ComplicationType, n: Int): ComplicationData? = if (type != ComplicationType.SHORT_TEXT) null else
        ShortTextComplicationData.Builder(PlainComplicationText.Builder("$n").build(), PlainComplicationText.Builder("$n workouts this week").build())
            .setTitle(PlainComplicationText.Builder("wk").build()).setTapAction(Glance.open(this)).build()
    override fun getPreviewData(type: ComplicationType) = data(type, 3)
    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? = Glance.today(this).first?.let { data(request.complicationType, it.workoutsThisWeek) }
}
