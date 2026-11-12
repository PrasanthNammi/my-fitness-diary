package site.mfd.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** After an update Android closes the app; a notification ("Updated to 1.3") opens it again in one tap. */
class UpdatedReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) Notify.updated(ctx, BuildConfig.VERSION_NAME)
    }
}
