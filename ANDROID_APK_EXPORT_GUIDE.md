# DIRA Mobile App - Android APK Export & Installation Guide

This project is fully configured as a Progressive Web App (PWA) and Trusted Web Activity (TWA) ready for Android APK generation and Google Play distribution.

---

## Method 1: Instant Online APK Generation via PWABuilder (Recommended - No Coding)

Microsoft PWABuilder (powered by Google Bubblewrap) generates an installable Android `.apk` and signed `.aab` (Android App Bundle) directly from your live app URL in 60 seconds:

1. Visit **[PWABuilder](https://www.pwabuilder.com)**.
2. Enter your live deployment URL:
   `https://ais-pre-lcxmwdpyoc256lycqd3ogb-642916903521.europe-west1.run.app`
3. Click **Start**.
4. When the manifest analysis displays 100% PWA compliance, click **Package for Android**.
5. PWABuilder will automatically compile and download:
   - `app-release-unsigned.apk` (or signed testing APK)
   - Android Studio project source code
   - Ready-to-publish Google Play `.aab` package.

---

## Method 2: Direct 1-Tap WebAPK Installation on Android Phones

Android Chrome and Samsung Internet natively convert compliant PWAs into installed **WebAPKs**:

1. Open `https://ais-pre-lcxmwdpyoc256lycqd3ogb-642916903521.europe-west1.run.app` in Chrome on your Android phone.
2. Tap the **"Install App"** banner or tap the Chrome 3-dot menu and select **"Install app" / "Add to Home screen"**.
3. Android OS automatically generates a native WebAPK file in the background and places the **DIRA** icon into your Android app drawer.
4. It launches in full-screen standalone mode without any browser address bar and retains offline capabilities.

---

## Method 3: Command-Line APK Build with Google Bubblewrap CLI

If you have Node.js and the Android SDK or JDK on your local computer:

```bash
# 1. Install Google's Bubblewrap CLI
npm install -g @bubblewrap/cli

# 2. Initialize from your live URL or local manifest
bubblewrap init --manifest=https://ais-pre-lcxmwdpyoc256lycqd3ogb-642916903521.europe-west1.run.app/manifest.json

# 3. Build the Android APK
bubblewrap build
```

This compiles `app-release-signed.apk` directly into your current directory.

---

## Method 4: Capacitor / Android Studio Project

1. Run:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap add android
   npx cap sync
   npx cap open android
   ```
2. In Android Studio, select **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
