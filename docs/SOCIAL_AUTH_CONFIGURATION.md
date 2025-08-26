# Social Authentication Configuration Guide

## Overview
This guide covers all the configuration steps needed to enable Apple Sign-In and Google Sign-In in Symposium AI.

## 1. Firebase Console Configuration

### Enable Authentication Providers
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (Symposium AI)
3. Navigate to **Authentication** → **Sign-in method**
4. Enable the following providers:
   - **Email/Password** (already enabled)
   - **Anonymous** (for guest users)
   - **Apple**
   - **Google**

### Apple Sign-In Configuration in Firebase
1. Click on **Apple** provider
2. Enable it
3. You'll need to provide:
   - **Service ID** (we'll create this in Apple Developer)
   - **Apple Team ID** (from Apple Developer account)
   - **Key ID** and **Private Key** (we'll generate these)
4. Leave this tab open - we'll come back after Apple configuration

### Google Sign-In Configuration in Firebase
1. Click on **Google** provider
2. Enable it
3. Add your **Project support email**
4. Firebase automatically configures the Web Client ID
5. Click **Save**

### Get Configuration Values
1. Go to **Project Settings** (gear icon)
2. Under **Your apps**, find your iOS and Android apps
3. Download:
   - `GoogleService-Info.plist` (iOS)
   - `google-services.json` (Android)
4. Note your **Web Client ID** from the Google Sign-In settings

## 2. Apple Developer Configuration

### Prerequisites
- Active Apple Developer account ($99/year)
- Access to Certificates, Identifiers & Profiles

### Create App ID (if not already done)
1. Go to [Apple Developer](https://developer.apple.com)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Click **Identifiers** → **+**
4. Choose **App IDs** → **Continue**
5. Select **App** → **Continue**
6. Configure:
   - **Description**: Symposium AI
   - **Bundle ID**: com.braveheartinnovations.debateai
   - **Capabilities**: Check **Sign In with Apple**
7. Click **Continue** → **Register**

### Create Service ID (for Firebase)
1. In **Identifiers**, click **+**
2. Choose **Services IDs** → **Continue**
3. Configure:
   - **Description**: Symposium AI Sign In
   - **Identifier**: com.braveheartinnovations.debateai.signin
4. Click **Continue** → **Register**
5. Click on the created Service ID
6. Check **Sign In with Apple**
7. Click **Configure**:
   - **Primary App ID**: Select your app
   - **Domains and Subdomains**: Add your Firebase domain
     - Format: `your-project.firebaseapp.com`
   - **Return URLs**: Add Firebase callback URL
     - Format: `https://your-project.firebaseapp.com/__/auth/handler`
8. Click **Next** → **Done** → **Continue** → **Save**

### Create Sign In with Apple Key
1. In **Keys**, click **+**
2. Configure:
   - **Key Name**: Symposium AI Sign In Key
   - Check **Sign In with Apple**
3. Click **Configure**:
   - **Primary App ID**: Select your app
4. Click **Save** → **Continue** → **Register**
5. **Download the key file** (you can only download once!)
6. Note the **Key ID** shown on screen

### Get Your Team ID
1. Go to **Membership** in Apple Developer
2. Find your **Team ID** (10 characters)

### Add Apple Configuration to Firebase
1. Return to Firebase Console → Authentication → Apple
2. Fill in:
   - **Service ID**: com.braveheartinnovations.debateai.signin
   - **Apple Team ID**: Your 10-character team ID
   - **Key ID**: From the key you created
   - **Private Key**: Contents of the .p8 file you downloaded
3. Click **Save**

## 3. Google Sign-In Configuration

### For iOS

#### Configure iOS App in Google Cloud Console
1. The Web Client ID is already in Firebase (noted earlier)
2. Add it to your iOS configuration

#### Add URL Scheme to iOS
1. In `ios/SymposiumAI/Info.plist`, add:
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <!-- Reversed client ID from GoogleService-Info.plist -->
            <string>com.googleusercontent.apps.YOUR_CLIENT_ID</string>
        </array>
    </dict>
</array>
```

### For Android

#### Add SHA Certificates
1. **Get Debug SHA-1**:
```bash
cd android
./gradlew signingReport
```
Look for the SHA1 value under `Variant: debug`

2. **Get Release SHA-1** (if you have a release keystore):
```bash
keytool -list -v -keystore android/app/release.keystore -alias your-key-alias
```

3. **Add to Firebase**:
   - Go to Firebase Console → Project Settings
   - Under your Android app, click **Add fingerprint**
   - Add both debug and release SHA-1 fingerprints
   - Download updated `google-services.json`
   - Replace the file in `android/app/`

#### Configure OAuth 2.0 in Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Firebase project
3. Navigate to **APIs & Services** → **Credentials**
4. You should see OAuth 2.0 Client IDs created by Firebase
5. Click on the **Web client** (auto-created by Firebase)
6. Note the **Client ID** - this is your Web Client ID

## 4. Expo Configuration

### Update app.json
```json
{
  "expo": {
    "ios": {
      "googleServicesFile": "./GoogleService-Info.plist",
      "bundleIdentifier": "com.braveheartinnovations.debateai",
      "usesAppleSignIn": true
    },
    "android": {
      "googleServicesFile": "./google-services.json",
      "package": "com.braveheartinnovations.debateai"
    },
    "plugins": [
      "@react-native-google-signin/google-signin"
    ]
  }
}
```

### Environment Variables
Create `.env` file:
```bash
# Google Sign In - Web Client ID from Firebase/Google Cloud Console
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com

# Optional: iOS Client ID (if different from web)
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
```

## 5. Firestore Configuration

### Security Rules
Update `firestore.rules`:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read and write their own profile
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Premium status check
    match /subscriptions/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false; // Only backend can write subscriptions
    }
    
    // Anonymous users have limited access
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.token.firebase.sign_in_provider == 'anonymous';
      allow write: if false; // Anonymous users can't write profiles
    }
  }
}
```

### Deploy Rules
```bash
firebase deploy --only firestore:rules
```

### Indexes (if needed)
Create `firestore.indexes.json`:
```json
{
  "indexes": [
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdAt", "order": "DESCENDING" },
        { "fieldPath": "membershipStatus", "order": "ASCENDING" }
      ]
    }
  ]
}
```

Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```

## 6. Build and Test

### Development Build (EAS)
Since we're using native modules, you need a development build:

```bash
# Install EAS CLI if not already installed
npm install -g eas-cli

# Login to Expo account
eas login

# Configure EAS (first time only)
eas build:configure

# Create development build for iOS
eas build --profile development --platform ios

# Create development build for Android  
eas build --profile development --platform android
```

### Test Authentication Flow
1. Install development build on device/simulator
2. Test each authentication method:
   - Anonymous sign in
   - Email sign up/sign in
   - Apple Sign In (iOS only, needs real device)
   - Google Sign In
3. Verify Firestore user documents are created
4. Test upgrading anonymous account to full account

## 7. Troubleshooting

### Common Issues

#### Apple Sign-In Not Working
- Verify Service ID matches exactly in Firebase and Apple Developer
- Ensure private key is copied correctly (including headers)
- Check that Sign In with Apple capability is enabled in Xcode

#### Google Sign-In Not Working
- Verify SHA-1 fingerprints are added to Firebase
- Ensure Web Client ID is correct in environment variables
- Check that reversed client ID is in Info.plist (iOS)
- Verify google-services.json is in correct location

#### Anonymous Users Can't Upgrade
- Check Firestore rules allow account linking
- Verify linkWithCredential is implemented correctly
- Ensure user is actually anonymous before attempting link

#### Firestore Permission Denied
- Check security rules match user's auth state
- Verify user is authenticated before Firestore operations
- Check that document paths match security rules

## 8. Production Checklist

Before deploying to production:

- [ ] Add production SHA-1 to Firebase (Android)
- [ ] Update Firebase authorized domains for production URL
- [ ] Configure production Apple Service ID with production domain
- [ ] Update environment variables for production
- [ ] Test complete auth flow in production environment
- [ ] Monitor Firebase Authentication dashboard for errors
- [ ] Set up Firebase Authentication email templates (password reset, etc.)
- [ ] Configure rate limiting in Firebase (Security Rules)
- [ ] Enable App Check for additional security (optional)

## Important Notes

1. **Apple Sign-In** requires a real iOS device for testing (not simulator)
2. **Google Sign-In** works in simulator but needs proper configuration
3. **Anonymous accounts** are automatically deleted by Firebase after 30 days of inactivity
4. **SHA fingerprints** must be updated when changing signing certificates
5. **Web Client ID** is different from iOS/Android client IDs - use the Web one

## Support Resources

- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
- [Apple Sign-In Documentation](https://developer.apple.com/sign-in-with-apple/)
- [Google Sign-In for React Native](https://github.com/react-native-google-signin/google-signin)
- [Expo Authentication Guides](https://docs.expo.dev/guides/authentication/)