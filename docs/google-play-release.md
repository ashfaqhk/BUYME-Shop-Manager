# BUYME Google Play release

The Android application ID is `app.buyme.shopmanager`. This release candidate is version **1.3**, version code **4**, targeting Android 16 / API 36.

## Current status

- The app bundle can be built with Android SDK 36, build-tools 35.0.0, Gradle 8.14 and JDK 17 or newer.
- The current bundle is **unsigned**. It is not upload-ready. It needs the owner's persistent Android upload key.
- Never put a keystore, its passwords, Google account passwords or service-account credentials in source code or chat. Use the workspace's secure credential setup.
- This Android package opens the published BUYME website in a browser tab. It is not a standalone native copy. Web updates must be published separately. Google Play acceptance is not guaranteed; review its functionality and web-content policies before submission.
- The current production website was verified as https://buyme-shop-manager.replit.app. Do not substitute a development URL.

## Before submitting

1. Connect the owner's Google Play account, and determine whether BUYME is a new listing or an existing app.
2. For an existing listing, confirm its application ID, existing upload certificate and latest version code before changing anything.
3. Configure release signing securely and build a signed bundle. Preserve the upload key for future releases.
4. Publish and verify the updated website used by this Android launcher.
5. Complete the store listing, support contact, screenshots, public privacy policy, Data safety, content rating, app-access review instructions and any required testing.
6. Upload to an appropriate testing track first, verify on actual Android devices, and submit the production release through Play Console.

The store's current target-level requirement is documented at https://support.google.com/googleplay/android-developer/answer/11926878.
