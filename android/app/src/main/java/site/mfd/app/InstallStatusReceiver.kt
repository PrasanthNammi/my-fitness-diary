package site.mfd.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import androidx.core.content.IntentCompat
import org.json.JSONObject

/**
 * Android's answers about the update session. Not exported: only Android (through the session's PendingIntent)
 * can send here, and only messages about the session this app started are acted on.
 */
class InstallStatusReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != ACTION || intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -2) != Updater.sessionId) return
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // Android's own "Update this app?" screen.
                val confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java) ?: return
                try { ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e: Exception) { failed("Couldn’t open the installer. Try again.") }
            }
            PackageInstaller.STATUS_SUCCESS -> {} // Android restarts the app as the new version
            PackageInstaller.STATUS_FAILURE_ABORTED -> failed("Update cancelled.")
            PackageInstaller.STATUS_FAILURE_STORAGE -> failed("Not enough space on the phone for the update.")
            else -> failed("Couldn’t install the update.")
        }
    }

    private fun failed(message: String) {
        MainActivity.sendToPage(JSONObject().put("event", "appUpdate").put("state", "failed").put("message", message))
    }

    companion object {
        const val ACTION = "site.mfd.app.INSTALL_STATUS"
    }
}
