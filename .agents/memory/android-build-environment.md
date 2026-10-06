---
name: Android builds on Replit
description: A small Android SDK setup when preparing an APK in this workspace
---

The package-management installer may not recognize the `androidsdk` package even though Nixpkgs has it. The default Nixpkgs Android SDK includes emulators, system images, NDKs, and many platform versions. A minimal `androidenv.composeAndroidPackages` derivation with only the required platform and build-tools avoids downloading those extras.

**Why:** The default SDK build expanded into emulator and system-image dependencies; a minimal composition built successfully. Android Gradle builds only needed one platform and matching build-tools.

**How to apply:** Try the managed package installer first. If the SDK is unavailable there, compose the specific Android platform and build-tools through Nix with emulator, system images, and NDK disabled, following the Android SDK license requirements. Keep signing credentials outside the repository, and do not rely on Nix store paths staying stable between environments.

## Updated APK requests

When the user asks for an updated APK, rebuild it rather than reattaching an older existing binary.

**Why:** The user repeated the updated-APK request after receiving the existing download.

**How to apply:** Build from the current Android project, verify the version and signing compatibility, and provide the newly built file.