package site.mfd.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * My Fitness Diary for Android: the live web app in a full-screen WebView. The app itself (screens, data, offline
 * cache, sign-in) comes from the website, so every web release reaches this app at once; this shell adds what a
 * browser tab can't (camera permission, outside links in their own apps, and later native notifications).
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
        setContentView(web)

        // Android 15+ draws behind the system bars: keep the page clear of them and of the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(web) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        WindowInsetsControllerCompat(window, web).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
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

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(SITE)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() { super.onResume(); web.onResume() }
    override fun onPause() { web.onPause(); super.onPause() }

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
    }
}
