package site.mfd.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.time.LocalDate
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject

/**
 * My Fitness Diary for Android: the live web app in a full-screen WebView. The app itself (screens, data, offline
 * cache, sign-in) comes from the website, so every web release reaches this app at once; this shell adds what a
 * browser tab can't: camera permission, outside links in their own apps, Google sign-in, and native notifications
 * (the page talks to the app through the `MFDNative` channel, on the MFD site only; see frontend/lib/native.ts).
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var pendingCamera: PermissionRequest? = null
    private var pendingFiles: ValueCallback<Array<Uri>>? = null

    private val cameraPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val request = pendingCamera ?: return@registerForActivityResult
        pendingCamera = null
        if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else request.deny()
    }

    // Health Connect: Android's own permission screen for sleep and steps.
    private var pendingHealth: Triple<Int, JavaScriptReplyProxy, Set<String>>? = null
    private val healthPermission = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        val (id, reply, wanted) = pendingHealth ?: return@registerForActivityResult
        pendingHealth = null
        // Asked to save too: granted only when every one asked for was allowed.
        val ok = if (wanted.isEmpty()) granted.intersect(Health.PERMISSIONS).isNotEmpty() else granted.containsAll(wanted)
        val writable = Health.WRITE.filterValues { granted.contains(it.first()) }.keys
        reply.postMessage(JSONObject().put("id", id).put("granted", ok).put("writable", org.json.JSONArray(writable.toList())).toString())
    }

    private var pendingEnable: Pair<Int, JavaScriptReplyProxy>? = null
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        val (id, reply) = pendingEnable ?: return@registerForActivityResult
        pendingEnable = null
        finishEnable(id, reply)
    }

    // Export & import → Download: the page's file, saved where the user picks (Downloads, Drive…).
    private var pendingSave: Triple<String, Int, JavaScriptReplyProxy>? = null
    private val saveFile = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val (text, id, reply) = pendingSave ?: return@registerForActivityResult
        pendingSave = null
        val saved = uri != null && try {
            contentResolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray()) } != null
        } catch (e: Exception) { false }
        reply.postMessage(JSONObject().put("id", id).put("saved", saved).toString())
    }

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        pendingFiles?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        pendingFiles = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        web = WebView(this)
        web.setBackgroundColor(ContextCompat.getColor(this, R.color.mfd_bg))
        // The WebView ignores its own padding, so it sits in a container that is padded instead.
        val root = FrameLayout(this).apply { setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.mfd_bg)); addView(web) }
        setContentView(root)

        // Android 15+ draws behind the system bars: keep the page clear of them and of the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        WindowInsetsControllerCompat(window, web).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG || BuildConfig.WEB_DEBUG)
        java.io.File(cacheDir, "update.apk").delete() // left by an update that was interrupted
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false // the rest-timer chime
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false) // target=_blank comes back through shouldOverrideUrlLoading
            userAgentString = "$userAgentString MFDAndroid/${BuildConfig.VERSION_NAME}"
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !isOwnSite(request.url) && openOutside(request.url)
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                // Only the camera, and only for MFD itself (barcode scanning).
                if (!isOwnSite(request.origin) || !request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    request.deny(); return
                }
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                } else {
                    pendingCamera?.deny()
                    pendingCamera = request
                    cameraPermission.launch(Manifest.permission.CAMERA)
                }
            }

            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                pendingFiles?.onReceiveValue(null)
                pendingFiles = callback
                return try { filePicker.launch(params.createIntent()); true } catch (e: ActivityNotFoundException) { pendingFiles = null; false }
            }
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "MFDNative", setOf(SITE_ORIGIN)) { _, message, origin, isMainFrame, reply ->
                if (isMainFrame && origin.toString().trimEnd('/') == SITE_ORIGIN) message.data?.let { onPageMessage(it, reply) }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })

        val start = signInUrl(intent) ?: openUrl(intent)
        when {
            start != null -> web.loadUrl(start)
            savedInstanceState == null || web.restoreState(savedInstanceState) == null -> web.loadUrl(SITE)
        }
    }

    // The app is already open (singleTask): a sign-in hand-off from Chrome, or a tapped notification, arrives here.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        (signInUrl(intent) ?: openUrl(intent))?.let { web.loadUrl(it) }
    }

    /** A tapped notification: the MFD screen it is about ("/" just brings MFD to the front). */
    private fun openUrl(intent: Intent?): String? {
        val path = intent?.getStringExtra(EXTRA_OPEN)?.takeIf { isAppPath(it) && it != "/" } ?: return null
        intent.removeExtra(EXTRA_OPEN)
        return SITE + path.removePrefix("/")
    }

    // ── Messages from the page (frontend/lib/native.ts) ──────────────────────────────
    private fun onPageMessage(raw: String, reply: JavaScriptReplyProxy) {
        val m = try { JSONObject(raw) } catch (e: Exception) { return }
        val id = m.optInt("id", 0)
        fun answer(o: JSONObject) { if (id != 0) reply.postMessage(o.put("id", id).toString()) }
        when (m.optString("op")) {
            "hello" -> { page = reply; alive = this }
            "notifications" -> answer(JSONObject().put("granted", notificationsOn()).put("blocked", notificationsBlocked()).put("push", pushAvailable()))
            "enable" -> enable(id, reply)
            "token" -> token { answer(JSONObject().put("token", it ?: JSONObject.NULL)) }
            "rest" -> {
                val restId = m.optString("id").takeIf { REST_ID.matches(it) } ?: return
                Notify.resting(this, restId, m.optString("label").take(80), m.optLong("ends"),
                    m.optString("next").take(120).ifEmpty { null }, m.optString("image").take(400).ifEmpty { null },
                    m.optLong("duration").coerceIn(0, 3600), if (m.has("vibrate")) m.optBoolean("vibrate") else null)
            }
            "restOver" -> Notify.restOver(this, m.optString("id").takeIf { REST_ID.matches(it) } ?: return, m.optString("label").take(80))
            "restClear" -> Notify.clearRest(this, m.optBoolean("all"))
            "vibrate" -> if (m.optString("kind") == "record") RestTimer.celebrate(this)
            "appUpdateCheck" -> Thread {
                val info = try { Updater.check() } catch (e: Exception) { null }
                runOnUiThread { answer(JSONObject().put("available", info != null).put("version", info?.version ?: JSONObject.NULL)) }
            }.start()
            "appUpdateInstall" -> {
                val info = Updater.latest ?: return answer(JSONObject().put("started", false))
                answer(JSONObject().put("started", true))
                Updater.install(applicationContext, info) { e ->
                    runOnUiThread {
                        if (e.optString("state") == "needsPermission") {
                            // Android's "Allow from this source" switch for MFD; then the person taps Update again.
                            try { startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) } catch (x: ActivityNotFoundException) {}
                        }
                        try { reply.postMessage(e.put("event", "appUpdate").toString()) } catch (x: Exception) {}
                    }
                }
            }
            "healthStatus" -> lifecycleScope.launch {
                val availability = Health.availability(this@MainActivity)
                val granted = try { Health.granted(this@MainActivity) } catch (e: Exception) { false }
                val reads = try { Health.readable(this@MainActivity) } catch (e: Exception) { emptyList() }
                val writable = try { Health.writable(this@MainActivity) } catch (e: Exception) { emptySet() }
                answer(JSONObject().put("availability", availability).put("granted", granted).put("reads", org.json.JSONArray(reads)).put("writable", org.json.JSONArray(writable.toList())))
            }
            "healthConnect" -> {
                // Optionally also asks to save "workouts" and/or "food" to Health Connect.
                val write = m.optJSONArray("write")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it in Health.WRITE }.toSet() } ?: emptySet()
                lifecycleScope.launch { connectHealth(id, reply, write) }
            }
            "healthWrite" -> {
                val request = site.mfd.shared.HealthWrite.parse(m, System.currentTimeMillis())
                lifecycleScope.launch {
                    val result = try {
                        val w = Health.write(this@MainActivity, request)
                        JSONObject().put("workouts", w.workouts).put("meals", w.meals).put("removed", w.removed)
                    } catch (e: SecurityException) { JSONObject().put("error", "permission") } catch (e: Exception) { JSONObject().put("error", "write") }
                    answer(result)
                }
            }
            "healthManage" -> {
                // Health Connect's page for MFD's permissions (Android 14+), else Health Connect's settings.
                val intents = listOfNotNull(
                    if (Build.VERSION.SDK_INT >= 34) Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS").putExtra(Intent.EXTRA_PACKAGE_NAME, packageName) else null,
                    Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"),
                )
                answer(JSONObject().put("opened", intents.any { i -> try { startActivity(i); true } catch (e: Exception) { false } }))
            }
            "healthDisconnect" -> lifecycleScope.launch {
                answer(JSONObject().put("ok", try { Health.disconnect(this@MainActivity); true } catch (e: Exception) { false }))
            }
            "healthRead" -> {
                val from = parseDay(m.optString("from")); val to = parseDay(m.optString("to"))
                if (from == null || to == null) return answer(JSONObject().put("error", "invalid"))
                lifecycleScope.launch {
                    val result = try {
                        val days = org.json.JSONArray()
                        for (d in Health.read(this@MainActivity, from, to)) days.put(JSONObject().put("date", d.date.toString())
                            .put("sleep", d.sleepHours ?: JSONObject.NULL).put("steps", d.steps ?: JSONObject.NULL)
                            .put("restingHr", d.restingHr ?: JSONObject.NULL).put("hrv", d.hrvMs ?: JSONObject.NULL)
                            .put("weightKg", d.weightKg ?: JSONObject.NULL).put("bodyFat", d.bodyFatPct ?: JSONObject.NULL)
                            .put("sleepStages", d.stages?.let { JSONObject().put("deep", it.deep).put("light", it.light).put("rem", it.rem).put("awake", it.awake)
                                .put("start", it.start.toEpochMilli()).put("end", it.end.toEpochMilli()) } ?: JSONObject.NULL))
                        JSONObject().put("days", days)
                    } catch (e: SecurityException) { JSONObject().put("error", "permission") } catch (e: Exception) { JSONObject().put("error", "read") }
                    answer(result)
                }
            }
            "healthHeart" -> {
                // A finished workout's start and end (epoch ms), within the last 30 days.
                val start = m.optLong("from", 0); val end = m.optLong("to", 0); val now = System.currentTimeMillis()
                if (start <= now - 30L * 86_400_000 || end <= start || end > now + 60_000) return answer(JSONObject().put("error", "invalid"))
                lifecycleScope.launch {
                    val result = try {
                        val h = Health.heart(this@MainActivity, java.time.Instant.ofEpochMilli(start), java.time.Instant.ofEpochMilli(end))
                        JSONObject().put("samples", org.json.JSONArray(h.samples.map { org.json.JSONArray(listOf(it.first, it.second)) }))
                            .put("avg", h.avg ?: JSONObject.NULL).put("max", h.max ?: JSONObject.NULL)
                    } catch (e: SecurityException) { JSONObject().put("error", "permission") } catch (e: Exception) { JSONObject().put("error", "read") }
                    answer(result)
                }
            }
            "watchState" -> answer(JSONObject().put("ok", WatchLink.publish(applicationContext, m.optString("json"))))
            "watchStatus" -> lifecycleScope.launch {
                val watches = try { WatchLink.watches(this@MainActivity) } catch (e: Exception) { emptyList() }
                answer(JSONObject().put("watches", org.json.JSONArray(watches.map { JSONObject().put("name", it.first).put("nearby", it.second) })))
            }
            "watchDrain" -> answer(JSONObject().put("commands", WatchLink.drain(applicationContext)))
            "save" -> {
                val name = m.optString("name").takeIf { SAVE_NAME.matches(it) } ?: return
                pendingSave = Triple(m.optString("text"), id, reply)
                try { saveFile.launch(name) } catch (e: ActivityNotFoundException) { pendingSave = null; answer(JSONObject().put("saved", false)) }
            }
        }
    }

    private fun parseDay(s: String): LocalDate? = try {
        LocalDate.parse(s).takeIf { !it.isAfter(LocalDate.now().plusDays(1)) && it.isAfter(LocalDate.now().minusYears(1)) }
    } catch (e: Exception) { null }

    private suspend fun connectHealth(id: Int, reply: JavaScriptReplyProxy, write: Set<String> = emptySet()) {
        fun answer(o: JSONObject) = reply.postMessage(o.put("id", id).toString())
        when (Health.availability(this)) {
            "unsupported" -> answer(JSONObject().put("granted", false).put("state", "unsupported"))
            "install" -> {
                // Android 13 and earlier: Health Connect is an app from the Play Store.
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${Health.PROVIDER}&url=healthconnect://onboarding")).setPackage("com.android.vending")) } catch (e: ActivityNotFoundException) {}
                answer(JSONObject().put("granted", false).put("state", "install"))
            }
            else -> {
                val wanted = write.flatMap { Health.WRITE[it].orEmpty() }.toSet()
                val have = try { HealthConnectClient.getOrCreate(this).permissionController.getGrantedPermissions() } catch (e: Exception) { emptySet() }
                val readOk = have.intersect(Health.PERMISSIONS).isNotEmpty()
                if (readOk && have.containsAll(wanted)) answer(JSONObject().put("granted", true).put("writable", org.json.JSONArray(Health.writable(this).toList())))
                else {
                    pendingHealth = Triple(id, reply, wanted)
                    try { healthPermission.launch(Health.PERMISSIONS + wanted) } catch (e: Exception) { pendingHealth = null; answer(JSONObject().put("granted", false)) }
                }
            }
        }
    }

    private fun notificationsOn() = NotificationManagerCompat.from(this).areNotificationsEnabled()
    private val asked get() = getSharedPreferences("app", MODE_PRIVATE).getBoolean("askedNotifications", false)
    /** Off, and Android won't ask again (denied twice, or switched off in settings). */
    private fun notificationsBlocked(): Boolean = !notificationsOn() && (Build.VERSION.SDK_INT < 33 ||
        (asked && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)))
    private fun pushAvailable() = FirebaseApp.getApps(this).isNotEmpty()

    private fun enable(id: Int, reply: JavaScriptReplyProxy) {
        when {
            notificationsOn() -> finishEnable(id, reply)
            notificationsBlocked() -> {
                // Only the phone's settings can turn them back on.
                try { startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)) } catch (e: ActivityNotFoundException) {}
                reply.postMessage(JSONObject().put("id", id).put("granted", false).toString())
            }
            else -> {
                getSharedPreferences("app", MODE_PRIVATE).edit { putBoolean("askedNotifications", true) }
                pendingEnable = id to reply
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun finishEnable(id: Int, reply: JavaScriptReplyProxy) {
        val granted = notificationsOn()
        if (!granted) { reply.postMessage(JSONObject().put("id", id).put("granted", false).toString()); return }
        token { reply.postMessage(JSONObject().put("id", id).put("granted", true).put("token", it ?: JSONObject.NULL).toString()) }
    }

    /** This install's Firebase token, or null when Firebase isn't set up or can't be reached. */
    private fun token(done: (String?) -> Unit) {
        if (!pushAvailable()) { done(null); return }
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task -> done(if (task.isSuccessful) task.result else null) }
        } catch (e: Exception) { done(null) }
    }

    /** site.mfd.app://auth?code=... → the site's own sign-in callback, finished in this WebView (it holds the
     *  PKCE verifier cookie; the code alone is useless). Anything else is ignored. */
    private fun signInUrl(intent: Intent?): String? {
        val data = intent?.data ?: return null
        if (intent.action != Intent.ACTION_VIEW || data.scheme != "site.mfd.app" || data.host != "auth") return null
        val code = data.getQueryParameter("code") ?: return null
        if (!Regex("^[A-Za-z0-9._~-]{1,512}$").matches(code)) return null
        return SITE + "?code=" + code
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() { super.onResume(); web.onResume(); onScreen = this }
    override fun onPause() {
        onScreen = null
        web.onPause()
        CookieManager.getInstance().flush() // the rest buttons use the session cookie even if MFD is closed
        super.onPause()
    }
    override fun onDestroy() { if (onScreen === this) onScreen = null; if (alive === this) alive = null; page = null; super.onDestroy() }
    private var page: JavaScriptReplyProxy? = null

    private fun isOwnSite(uri: Uri?): Boolean = uri?.scheme == "https" && uri.host == SITE_HOST

    /** Links that leave MFD: Android app links (intent://, e.g. ChatGPT/Claude), mail/phone, or a browser tab. */
    private fun openOutside(uri: Uri): Boolean {
        try {
            when (uri.scheme) {
                "intent" -> {
                    val intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                        addCategory(Intent.CATEGORY_BROWSABLE); component = null; selector = null
                    }
                    try { startActivity(intent) } catch (e: ActivityNotFoundException) {
                        intent.getStringExtra("browser_fallback_url")?.let { openOutside(Uri.parse(it)) }
                    }
                }
                "http", "https" -> CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, uri)
                "mailto", "tel" -> startActivity(Intent(Intent.ACTION_VIEW, uri))
                else -> {} // anything else is ignored
            }
        } catch (e: Exception) {
            // A link that can't be opened must never crash the app.
        }
        return true
    }

    companion object {
        const val SITE = "https://prasanth-nammi-portfolio.shanustylish777.chatgpt.site/"
        val SITE_HOST: String = Uri.parse(SITE).host!!
        val SITE_ORIGIN: String = SITE.trimEnd('/')
        const val EXTRA_OPEN = "open"
        private val REST_ID = Regex("^[\\w:.-]{1,100}$")
        private val SAVE_NAME = Regex("^[\\w.-]{1,80}\\.json$")
        private val APP_PATH = Regex("^/(#/[\\w%./:-]{0,400})?$")

        /** "/", or "/#/<route>": the only places a notification may open. */
        fun isAppPath(path: String) = APP_PATH.matches(path)

        private var onScreen: MainActivity? = null
        /** The open MFD window, on screen or in the background (its page still runs). */
        private var alive: MainActivity? = null

        /** To the page while MFD is open at all (also in the background); false when it isn't running. */
        fun sendToOpenPage(event: JSONObject): Boolean {
            val page = alive?.page ?: return false
            return try { page.postMessage(event.toString()); true } catch (e: Exception) { false }
        }

        /** To the page, only while MFD is on screen; false otherwise (the caller then acts without it). */
        /** MFD is on screen now (the page chimes and vibrates itself then). */
        fun onScreenNow() = onScreen != null

        fun sendToPage(event: JSONObject): Boolean {
            val page = onScreen?.page ?: return false
            return try { page.postMessage(event.toString()); true } catch (e: Exception) { false }
        }
    }
}
