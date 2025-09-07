# Firebase Development Build Instructions

## Overview

React Native Firebase requires native code and cannot run in Expo Go. You need to create a development build to use Firebase features.

## Prerequisites

- Xcode (for iOS) - version 14.0 or later
- Android Studio (for Android) - if building for Android
- CocoaPods installed (`sudo gem install cocoapods`)
- Firebase configuration files already in place:
  - ✅ `GoogleService-Info.plist` (iOS)
  - ✅ `google-services.json` (Android)

## Step 1: Clean Previous Builds

```bash
# Clean any existing native directories
rm -rf ios android

# Clear all caches
npx expo prebuild --clean
```

## Step 2: Generate Native Projects

```bash
# This creates the ios/ and android/ directories with Firebase configured
npx expo prebuild

# Or if you want to specify platforms:
npx expo prebuild --platform ios
npx expo prebuild --platform android
```

## Step 3: Install iOS Dependencies (iOS only)

```bash
cd ios
pod install
cd ..
```

If you encounter pod install issues:

```bash
cd ios
pod deintegrate
pod install --repo-update
cd ..
```

## Step 4: Build and Run

### For iOS Development Build:

```bash
# Method 1: Using Expo CLI (Recommended)
npx expo run:ios

# Method 2: Using Xcode
# Open ios/DebateAI.xcworkspace in Xcode
# Select your device/simulator
# Press Cmd+R to build and run
```

### For Android Development Build:

```bash
# Method 1: Using Expo CLI (Recommended)
npx expo run:android

# Method 2: Using Android Studio
# Open android/ folder in Android Studio
# Wait for Gradle sync
# Run the app (Shift+F10)
```

## Step 5: Development Workflow

Once the development build is installed on your device/simulator:

1. **Start the Metro bundler:**

   ```bash
   npx expo start --dev-client
   ```

2. **The app will now load with Firebase support**
   - You'll see the Expo development menu
   - Firebase Auth will work
   - All React Native Firebase features are available

## Troubleshooting

### iOS Build Fails

```bash
# Clean everything
cd ios
rm -rf Pods Podfile.lock
pod cache clean --all
pod install
cd ..
npx expo run:ios --clear
```

### Android Build Fails

```bash
# Clean Gradle cache
cd android
./gradlew clean
cd ..
npx expo run:android --clear
```

### Firebase Configuration Not Found

- Ensure `GoogleService-Info.plist` is in the project root
- Ensure `google-services.json` is in the project root
- Run `npx expo prebuild --clear` to regenerate with config files

### Module Resolution Errors

```bash
# Clear all caches
rm -rf node_modules
npm install
npx expo start -c
```

### Can't Find Development Build

If the app shows "Development build not found":

1. Make sure you've run `npx expo run:ios` or `npx expo run:android`
2. The development build must be installed on your device/simulator
3. Start with `npx expo start --dev-client` not just `npx expo start`

## Using EAS Build (Alternative - Cloud Build)

If you prefer not to build locally, you can use EAS Build:

1. **Install EAS CLI:**

   ```bash
   npm install -g eas-cli
   ```

2. **Configure EAS:**

   ```bash
   eas build:configure
   ```

3. **Create development build:**

   ```bash
   # iOS
   eas build --platform ios --profile development

   # Android
   eas build --platform android --profile development
   ```

4. **Install on device:**
   - iOS: Download and install the .ipa file
   - Android: Download and install the .apk file

## Important Notes

1. **You cannot use Expo Go anymore** - Firebase requires native code
2. **Development builds are required** for Firebase to work
3. **The app identifier** is `com.braveheartinnovations.debateai`
4. **Rebuilding is required** when:
   - Adding new native dependencies
   - Changing app.json native configuration
   - Updating Firebase configuration files

## Quick Commands Reference

```bash
# First time setup
npx expo prebuild --clear
cd ios && pod install && cd ..
npx expo run:ios

# Daily development
npx expo start --dev-client

# Clean rebuild
rm -rf ios android node_modules
npm install
npx expo prebuild --clear
cd ios && pod install && cd ..
npx expo run:ios
```

## Firebase Emulator (optional)

The app can connect to the local Firebase Emulators during development. This is now opt-in to avoid iOS HTTP/ATS pitfalls.

- To enable emulators, set in your env file:

  ```
  EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true
  ```

- Start emulators locally:

  ```bash
  firebase emulators:start
  ```

Notes:

- On iOS Simulator, the app connects to `127.0.0.1` ports (Auth: 9099, Firestore: 8080). The iOS project includes ATS exceptions for `localhost` and `127.0.0.1`.
- If the emulators are not running, the app will fall back to production Firebase.

## Next Steps

After the development build is working:

1. Test Firebase Authentication
2. Verify Firestore connection
3. Test premium feature gates
4. Ensure API keys (BYOK) still work correctly

## Support

If you encounter issues:

1. Check React Native Firebase docs: https://rnfirebase.io
2. Check Expo docs: https://docs.expo.dev/develop/development-builds/introduction/
3. Ensure all prerequisites are installed correctly
4. Try a clean rebuild before debugging further
