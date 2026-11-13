package site.mfd.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.webkit.CookieManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Skip / −15s / +15s on the rest notification. The app moves its own rest at once. With MFD on screen the page is
 * told and moves its timer the same way (its next update matches). Otherwise the push service holds the rest (the
 * page handed it over when MFD went to the background), so the change goes there, with the signed-in session's
 * cookie. A skip reaches the page whenever it is running.
 */
class RestActionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra(EXTRA_ID) ?: return
        val sec = intent.getIntExtra(EXTRA_SEC, 0)
        android.util.Log.i("MFDRest", "notification button: ${if (sec == 0) "skip" else "%+d".format(sec)}")
        // The app always changes its own rest at once (the notification never waits for the page), then the page
        // follows: on screen it is told now; in the background the server holds the rest and is told instead.
        if (sec == 0) {
            Notify.skip(ctx, id)
            MainActivity.sendToOpenPage(JSONObject().put("event", "restSkip").put("id", id))
            return
        }
        if (sec != 15 && sec != -15) return
        val rest = Notify.current(ctx)?.takeIf { it.id == id }
        if (rest != null) {
            val now = System.currentTimeMillis()
            val ends = if (rest.over) now + sec * 1000L else maxOf(now, rest.ends + sec * 1000L)
            if (ends > now + 1000) Notify.resting(ctx, id, rest.label, ends, rest.next, rest.image, 0, rest.vibrate) else Notify.cancel(ctx)
        }
        if (MainActivity.sendToPage(JSONObject().put("event", "restAdjust").put("id", id).put("sec", sec))) return
        val done = goAsync()
        thread {
            try { tellServer(id, sec) } catch (e: Exception) { /* offline: the page takes the rest back on return */ } finally { done.finish() }
        }
    }

    private fun tellServer(id: String, sec: Int) {
        val cookie = CookieManager.getInstance().getCookie(MainActivity.SITE) ?: return
        val c = URL(MainActivity.SITE + "api/push/rests/adjust").openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 8000; c.readTimeout = 8000
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.setRequestProperty("Origin", MainActivity.SITE_ORIGIN)
            c.setRequestProperty("Cookie", cookie)
            c.outputStream.use { it.write(JSONObject().put("id", id).put("sec", sec).toString().toByteArray()) }
            c.responseCode
        } finally { c.disconnect() }
    }

    companion object {
        const val ACTION = "site.mfd.app.REST_ADJUST"
        const val EXTRA_ID = "id"
        const val EXTRA_SEC = "sec"
    }
}
