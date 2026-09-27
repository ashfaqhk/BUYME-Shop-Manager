# BUYME Android launcher

The downloadable `../downloads/BUYME-debug.apk` opens the published BUYME site in an Android browser tab with BUYME branding. This keeps the browser's camera picker, file uploads, PDF downloads, and website storage. It is **not a standalone native copy** of the web app; a network connection is needed to open the published site, and AI scanning always requires the network.

Build the debug APK with JDK 17 or newer, Android SDK platform 35, build-tools 35.0.0, and Gradle:

```sh
cd artifacts/buyme/android
ANDROID_HOME=/path/to/android-sdk gradle :app:assembleDebug
```

The result is `app/build/outputs/apk/debug/app-debug.apk`. Android may ask the user to allow installation from their browser or file manager. The debug signature is intended for direct testing only; a store release and reliable future APK upgrades require a private, persistent release-signing key. Never commit signing keys to the project.

This launcher uses the published URL set in `app/src/main/java/app/buyme/shopmanager/MainActivity.java`. Publish BUYME after web changes so the Android launcher displays the newest version.