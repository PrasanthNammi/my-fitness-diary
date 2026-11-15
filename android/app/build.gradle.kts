import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Firebase (notifications): app/google-services.json comes from the Firebase console and is kept out of git.
// Without it (CI) the app still builds; notifications then report themselves as unavailable.
if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")

// Release signing key: kept outside the repository (default ~/.mfd-android/keystore.properties, or the file named
// by MFD_KEYSTORE_PROPERTIES). Every update must be signed with the same key, or it won't install over the app.
val keystoreFile = file(System.getenv("MFD_KEYSTORE_PROPERTIES") ?: "${System.getProperty("user.home")}/.mfd-android/keystore.properties")
val keystore = Properties().apply { if (keystoreFile.exists()) keystoreFile.inputStream().use { load(it) } }

android {
    namespace = "site.mfd.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "site.mfd.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 8
        versionName = "2.0.1"
        // MFD's download site: where the app finds and downloads its own updates. Test builds can point
        // elsewhere with -PmfdDownloads=https://...
        val downloads = (project.findProperty("mfdDownloads") as String?) ?: "https://mfd-downloads.shanustylish777.workers.dev"
        require(Regex("^https://[a-z0-9.-]+$").matches(downloads)) { "mfdDownloads must be an https origin" }
        buildConfigField("String", "DOWNLOADS", "\"$downloads\"")
        // Test builds only (-PmfdWebDebug=true): lets a computer inspect the WebView.
        buildConfigField("boolean", "WEB_DEBUG", ((project.findProperty("mfdWebDebug") as String?) == "true").toString())
    }

    signingConfigs {
        if (keystore.isNotEmpty()) create("release") {
            storeFile = file(keystore.getProperty("storeFile"))
            storePassword = keystore.getProperty("storePassword")
            keyAlias = keystore.getProperty("keyAlias")
            keyPassword = keystore.getProperty("keyPassword")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":shared"))
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-ktx:1.12.2")
    implementation("androidx.webkit:webkit:1.15.0")
    implementation("androidx.browser:browser:1.9.0")
    implementation(platform("com.google.firebase:firebase-bom:35.1.0"))
    implementation("com.google.firebase:firebase-messaging")
    // Firebase pulls in an old Fragment library; the permission prompts need 1.3+.
    implementation("androidx.fragment:fragment-ktx:1.9.0")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
}
