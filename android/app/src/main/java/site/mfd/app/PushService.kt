package site.mfd.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Messages from the MFD push service. They are data-only, so the app always builds the notification. */
class PushService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) = Notify.fromPush(this, message.data)

    // A new token is registered by the website the next time MFD opens (push.ts refreshAppPush).
    override fun onNewToken(token: String) {}
}
