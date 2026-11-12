package site.mfd.app

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.pm.PackageInfoCompat
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Updates of the app itself (it isn't on the Play Store). The newest version is described in
 * `<DOWNLOADS>/android/latest.json` on MFD's download site. An update is only installed when, in order:
 *  - it comes from that one fixed HTTPS address (no redirects, size limits on everything read);
 *  - its size and SHA-256 match latest.json;
 *  - it is this app (same package name), with exactly the announced, higher version code;
 *  - it is signed with this app's own signing key;
 * and then Android installs it through PackageInstaller, which asks the person to confirm and itself refuses any
 * update not signed with the installed app's key.
 */
object Updater {
    data class Info(val version: String, val versionCode: Long, val size: Long, val sha256: String, val apk: String)

    class UpdateError(message: String) : Exception(message)

    private const val MAX_MANIFEST = 16 * 1024
    private const val MAX_APK = 100L * 1024 * 1024
    private val VERSION = Regex("^\\d{1,4}(\\.\\d{1,4}){0,3}$")
    private val HASH = Regex("^[0-9a-f]{64}$")
    private val APK_PATH = Regex("^/android/[A-Za-z0-9._-]{1,80}\\.apk$")

    private val busy = AtomicBoolean(false)
    /** The update found by the last check: the page can only ask to install this one, never name a file. */
    @Volatile var latest: Info? = null
        private set
    /** The install session this app started; status messages for any other session are ignored. */
    @Volatile var sessionId = -1
        private set

    /** latest.json → an update newer than `current`, or null (nothing newer, or anything malformed). */
    fun parse(json: String, current: Long): Info? {
        val o = try { JSONObject(json) } catch (e: Exception) { return null }
        val version = o.optString("version")
        val code = o.optLong("versionCode", -1)
        val size = o.optLong("size", -1)
        val sha = o.optString("sha256")
        val apk = o.optString("apk")
        if (!VERSION.matches(version) || code <= current || size !in 1..MAX_APK || !HASH.matches(sha) || !APK_PATH.matches(apk)) return null
        return Info(version, code, size, sha, apk)
    }

    private fun connect(path: String): HttpURLConnection {
        val url = URL(BuildConfig.DOWNLOADS + path)
        if (url.protocol != "https") throw UpdateError("Updates are only downloaded over HTTPS.")
        return (url.openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            connectTimeout = 15_000
            readTimeout = 30_000
            useCaches = false
            setRequestProperty("Cache-Control", "no-cache")
        }
    }

    /** Network: call off the main thread. */
    fun check(): Info? {
        val c = connect("/android/latest.json")
        try {
            if (c.responseCode != 200) return null
            val bytes = c.inputStream.use { input ->
                val buffer = ByteArray(MAX_MANIFEST + 1)
                var n = 0
                while (n < buffer.size) { val r = input.read(buffer, n, buffer.size - n); if (r < 0) break; n += r }
                if (n > MAX_MANIFEST) return null
                buffer.copyOf(n)
            }
            return parse(String(bytes, Charsets.UTF_8), BuildConfig.VERSION_CODE.toLong()).also { latest = it }
        } finally { c.disconnect() }
    }

    /** Downloads, checks and hands the update to Android. `event` gets progress and errors (any thread). */
    fun install(ctx: Context, info: Info, event: (JSONObject) -> Unit) {
        if (!busy.compareAndSet(false, true)) return
        Thread {
            val file = File(ctx.cacheDir, "update.apk")
            try {
                if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
                    event(JSONObject().put("state", "needsPermission")); return@Thread
                }
                download(info, file) { percent -> event(JSONObject().put("state", "downloading").put("percent", percent)) }
                event(JSONObject().put("state", "verifying"))
                verify(ctx, file, info)
                event(JSONObject().put("state", "installing"))
                commit(ctx, file)
            } catch (e: UpdateError) {
                event(JSONObject().put("state", "failed").put("message", e.message))
            } catch (e: Exception) {
                event(JSONObject().put("state", "failed").put("message", "Couldn’t download the update. Check your connection and try again."))
            } finally {
                file.delete()
                busy.set(false)
            }
        }.start()
    }

    private fun download(info: Info, file: File, progress: (Int) -> Unit) {
        val c = connect(info.apk)
        try {
            if (c.responseCode != 200) throw UpdateError("The update isn’t available right now. Try again later.")
            val digest = MessageDigest.getInstance("SHA-256")
            var total = 0L
            var shown = -1
            c.inputStream.use { input ->
                file.outputStream().use { out ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        total += n
                        if (total > info.size) throw UpdateError("The download was damaged. Try again.")
                        digest.update(buffer, 0, n)
                        out.write(buffer, 0, n)
                        val percent = (total * 100 / info.size).toInt()
                        if (percent != shown) { shown = percent; progress(percent) }
                    }
                }
            }
            val hash = digest.digest().joinToString("") { "%02x".format(it) }
            if (total != info.size || hash != info.sha256) throw UpdateError("The download was damaged. Try again.")
        } finally { c.disconnect() }
    }

    @Suppress("DEPRECATION")
    private fun certificates(info: PackageInfo?): Set<String>? {
        val signatures = when {
            info == null -> null
            Build.VERSION.SDK_INT >= 28 -> info.signingInfo?.let { if (it.hasMultipleSigners()) it.apkContentsSigners else it.signingCertificateHistory }
            else -> info.signatures
        } ?: return null
        val sha = MessageDigest.getInstance("SHA-256")
        return signatures.map { s -> sha.digest(s.toByteArray()).joinToString("") { "%02x".format(it) } }.toSet()
    }

    @Suppress("DEPRECATION")
    private fun verify(ctx: Context, file: File, info: Info) {
        val pm = ctx.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val archive = pm.getPackageArchiveInfo(file.path, flags) ?: throw UpdateError("The download isn’t a valid app.")
        if (archive.packageName != ctx.packageName) throw UpdateError("The download isn’t My Fitness Diary.")
        val code = PackageInfoCompat.getLongVersionCode(archive)
        if (code != info.versionCode || code <= BuildConfig.VERSION_CODE) throw UpdateError("The download isn’t the expected version.")
        val ours = certificates(pm.getPackageInfo(ctx.packageName, flags))
        val theirs = certificates(archive)
        // Android refuses an update signed with another key anyway; checking here first gives a clear message.
        if (ours != null && theirs != null && ours.intersect(theirs).isEmpty()) throw UpdateError("The update isn’t signed by MFD. It was not installed.")
    }

    private fun commit(ctx: Context, file: File) {
        val installer = ctx.packageManager.packageInstaller
        for (old in installer.mySessions) try { installer.abandonSession(old.sessionId) } catch (e: Exception) {}
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(ctx.packageName) // Android rejects the session if the APK is any other app
            setSize(file.length())
            setInstallReason(PackageManager.INSTALL_REASON_USER)
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED)
        }
        val id = installer.createSession(params)
        sessionId = id
        installer.openSession(id).use { session ->
            session.openWrite("base.apk", 0, file.length()).use { out ->
                file.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val status = Intent(ctx, InstallStatusReceiver::class.java).setAction(InstallStatusReceiver.ACTION)
            val mutable = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0 // Android adds the status
            session.commit(PendingIntent.getBroadcast(ctx, id, status, PendingIntent.FLAG_UPDATE_CURRENT or mutable).intentSender)
        }
    }
}
