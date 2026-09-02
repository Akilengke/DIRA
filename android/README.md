# DIRA (Donkey Incident Reporting APP) - Android Studio Project Guide

This directory contains the ready-to-open **Android Studio** project wrapper for **DIRA - Kaa Rada! (Caritas Kitui)**.

## How to open and build in Android Studio:

1. Launch **Android Studio**.
2. Click **Open** (or `File > Open...`).
3. Select the `android/` directory inside this repository.
4. Android Studio will automatically sync Gradle dependencies (`AGP 8.2.2`, `minSdk 23`, `targetSdk 34`).
5. Connect an Android device or start an Android Emulator.
6. Click **Run > Run 'app'** (or press Shift + F10) to compile the APK and launch on device.

## Key Features Configured in Native Android App:
- **Toll-free Hotline integration**: Native handling of `tel:0800000890` dialing.
- **Hardware GPS Geolocation**: Precision GPS coordinate access with runtime permission handling.
- **Camera & Image Upload**: In-app photo taking and evidence attachment for cases.
- **Offline PWA support & DOM Caching**: Seamless responsiveness even in low-connectivity rural zones.
- **Custom App Theming**: Status bar and navigation bar branded in Caritas Kitui Red (`#991B1B`).
