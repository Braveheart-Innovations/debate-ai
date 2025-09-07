# Firebase Setup Guide
## Symposium AI - Authentication & Backend Configuration

*Last Updated: January 2025*  
*Version: 1.0*

---

## Executive Summary

This document provides comprehensive setup instructions for Firebase services in Symposium AI, with special focus on the anonymous authentication system that enables Demo Mode access. The app uses Firebase for authentication, user data storage, subscription tracking, and receipt validation.

**Key Firebase Services:**
- Firebase Authentication (Anonymous, Email, Social)
- Cloud Firestore (User data and subscriptions)
- Cloud Functions (Receipt validation, webhooks)
- Analytics (User behavior tracking)
- Crashlytics (Error monitoring)

---

## 1. Firebase Project Setup

### 1.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create Project"
3. Project name: `symposium-ai-prod`
4. Enable Google Analytics
5. Select or create Analytics account
6. Create project

### 1.2 Add Apps to Project

#### iOS App
1. Click iOS icon to add iOS app
2. Bundle ID: `com.braveheartinnovations.symposium`
3. App nickname: `Symposium AI iOS`
4. Download `GoogleService-Info.plist`
5. Place in `ios/SymposiumAI/` directory

#### Android App
1. Click Android icon to add Android app
2. Package name: `com.braveheartinnovations.symposium`
3. App nickname: `Symposium AI Android`
4. Download `google-services.json`
5. Place in `android/app/` directory

---

## 2. Authentication Configuration

### 2.1 Enable Authentication Methods

Navigate to Authentication → Sign-in method and enable:

#### Anonymous Authentication (REQUIRED for Demo Mode)
1. Click "Anonymous"
2. Toggle "Enable"
3. Save

**Important:** Anonymous auth is critical for Demo Mode functionality

#### Email/Password
1. Click "Email/Password"
2. Toggle "Enable"
3. Keep "Email link" disabled
4. Save

#### Apple Sign In (iOS)
1. Click "Apple"
2. Toggle "Enable"
3. No additional configuration needed in Firebase
4. Requires Apple Developer account setup

#### Google Sign In
1. Click "Google"
2. Toggle "Enable"
3. Configure support email
4. Add SHA-1 fingerprint for Android
5. Save

### 2.2 Anonymous Authentication Implementation

```typescript
// src/services/firebase/auth.ts
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export class AuthService {
  /**
   * Sign in anonymously for Demo Mode access
   * Creates minimal user document with demo permissions
   */
  static async signInAnonymously() {
    try {
      const userCredential = await auth().signInAnonymously();
      const user = userCredential.user;
      
      // Create or update anonymous user document
      await firestore().collection('users').doc(user.uid).set({
        uid: user.uid,
        authProvider: 'anonymous',
        isAnonymous: true,
        membershipStatus: 'demo',
        hasUsedTrial: false,
        createdAt: firestore.FieldValue.serverTimestamp(),
        lastActive: firestore.FieldValue.serverTimestamp(),
        preferences: {
          theme: 'auto',
          notifications: false,
        },
      }, { merge: true });
      
      console.log('Anonymous sign-in successful:', user.uid);
      return { success: true, user };
    } catch (error: any) {
      console.error('Anonymous sign-in failed:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Convert anonymous account to permanent account
   * Preserves user data and history
   */
  static async linkAnonymousAccount(email: string, password: string) {
    try {
      const user = auth().currentUser;
      
      if (!user?.isAnonymous) {
        throw new Error('Current user is not anonymous');
      }
      
      // Create email/password credential
      const credential = auth.EmailAuthProvider.credential(email, password);
      
      // Link anonymous account with email/password
      await user.linkWithCredential(credential);
      
      // Update user document
      await firestore().collection('users').doc(user.uid).update({
        email,
        authProvider: 'email',
        isAnonymous: false,
        convertedAt: firestore.FieldValue.serverTimestamp(),
      });
      
      console.log('Anonymous account linked successfully');
      return { success: true, user };
    } catch (error: any) {
      console.error('Account linking failed:', error);
      
      // Handle specific error cases
      if (error.code === 'auth/email-already-in-use') {
        return { 
          success: false, 
          error: 'This email is already associated with another account',
          code: 'EMAIL_IN_USE'
        };
      }
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Check if current user is anonymous
   */
  static isAnonymousUser(): boolean {
    const user = auth().currentUser;
    return user?.isAnonymous || false;
  }
}
```

---

## 3. Firestore Database Setup

### 3.1 Database Structure

```typescript
// Firestore Collections Structure
interface FirestoreSchema {
  users: {
    [userId: string]: UserDocument;
  };
  subscriptions: {
    [subscriptionId: string]: SubscriptionDocument;
  };
  receipts: {
    [receiptId: string]: ReceiptDocument;
  };
}

interface UserDocument {
  // Basic Info
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  
  // Authentication
  authProvider: 'anonymous' | 'email' | 'apple' | 'google';
  isAnonymous: boolean;
  createdAt: Timestamp;
  lastActive: Timestamp;
  convertedAt?: Timestamp; // When anonymous converted to full
  
  // Subscription
  membershipStatus: 'demo' | 'trial' | 'premium';
  subscriptionId?: string;
  productId?: 'monthly' | 'annual';
  
  // Trial Tracking
  trialStartDate?: Timestamp;
  trialEndDate?: Timestamp;
  hasUsedTrial: boolean;
  
  // Payment
  paymentPlatform?: 'ios' | 'android';
  subscriptionExpiryDate?: Timestamp;
  autoRenewing: boolean;
  
  // Preferences
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    notifications: boolean;
  };
  
  // API Keys (encrypted)
  apiKeys?: {
    [provider: string]: string; // Encrypted
  };
}
```

### 3.2 Security Rules

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isNotAnonymous() {
      return request.auth != null && !request.auth.token.firebase.sign_in_provider == 'anonymous';
    }
    
    // Users collection
    match /users/{userId} {
      // Anyone authenticated (including anonymous) can read their own document
      allow read: if isOwner(userId);
      
      // Users can update their own document with restrictions
      allow write: if isOwner(userId) && 
        // Prevent direct modification of subscription fields
        !request.resource.data.diff(resource.data).affectedKeys()
          .hasAny(['membershipStatus', 'subscriptionId', 'trialEndDate', 
                   'subscriptionExpiryDate', 'hasUsedTrial']);
      
      // Allow creation for new users (including anonymous)
      allow create: if isOwner(userId);
    }
    
    // Subscriptions collection (read-only for users)
    match /subscriptions/{subscriptionId} {
      allow read: if isAuthenticated() && 
        resource.data.userId == request.auth.uid;
      allow write: if false; // Only Cloud Functions can write
    }
    
    // Receipts collection (read-only for users)
    match /receipts/{receiptId} {
      allow read: if isAuthenticated() && 
        resource.data.userId == request.auth.uid;
      allow write: if false; // Only Cloud Functions can write
    }
  }
}
```

### 3.3 Indexes

Create these composite indexes in Firestore:

1. **Users by membership status and trial end date**
   - Collection: `users`
   - Fields: `membershipStatus` (Ascending), `trialEndDate` (Ascending)
   - Query scope: Collection

2. **Subscriptions by user and status**
   - Collection: `subscriptions`
   - Fields: `userId` (Ascending), `status` (Ascending)
   - Query scope: Collection

---

## 4. Cloud Functions Setup

### 4.1 Initialize Functions

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Functions
firebase init functions

# Select:
# - Language: TypeScript
# - ESLint: Yes
# - Install dependencies: Yes
```

### 4.2 Anonymous User Cleanup Function

```typescript
// functions/src/cleanupAnonymousUsers.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Clean up old anonymous users to prevent database bloat
 * Runs daily and removes anonymous users older than 30 days
 */
export const cleanupAnonymousUsers = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const batch = admin.firestore().batch();
    let deletedCount = 0;
    
    try {
      // Find old anonymous users
      const oldAnonymousUsers = await admin.firestore()
        .collection('users')
        .where('isAnonymous', '==', true)
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
        .limit(500) // Process in batches
        .get();
      
      for (const doc of oldAnonymousUsers.docs) {
        const userData = doc.data();
        
        // Skip if user has been active recently
        const lastActive = userData.lastActive?.toDate();
        if (lastActive && lastActive > thirtyDaysAgo) {
          continue;
        }
        
        // Delete user document
        batch.delete(doc.ref);
        
        // Delete authentication account
        try {
          await admin.auth().deleteUser(userData.uid);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete auth account ${userData.uid}:`, error);
        }
      }
      
      await batch.commit();
      
      console.log(`Cleaned up ${deletedCount} anonymous users`);
      return null;
    } catch (error) {
      console.error('Anonymous user cleanup failed:', error);
      throw error;
    }
  });
```

### 4.3 User Lifecycle Functions

```typescript
// functions/src/userLifecycle.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Handle new user creation
 */
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  // Create initial user document
  const userDoc = {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    authProvider: user.providerData[0]?.providerId || 'anonymous',
    isAnonymous: user.customClaims?.anonymous || false,
    membershipStatus: 'demo',
    hasUsedTrial: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastActive: admin.firestore.FieldValue.serverTimestamp(),
    preferences: {
      theme: 'auto',
      notifications: false,
    },
  };
  
  await admin.firestore()
    .collection('users')
    .doc(user.uid)
    .set(userDoc, { merge: true });
  
  // Log analytics event
  await admin.analytics().logEvent('user_signup', {
    uid: user.uid,
    method: userDoc.authProvider,
    is_anonymous: userDoc.isAnonymous,
  });
  
  return null;
});

/**
 * Handle user deletion
 */
export const onUserDelete = functions.auth.user().onDelete(async (user) => {
  const batch = admin.firestore().batch();
  
  // Delete user document
  const userRef = admin.firestore().collection('users').doc(user.uid);
  batch.delete(userRef);
  
  // Delete user's subscriptions
  const subscriptions = await admin.firestore()
    .collection('subscriptions')
    .where('userId', '==', user.uid)
    .get();
  
  subscriptions.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  console.log(`Deleted data for user ${user.uid}`);
  return null;
});
```

---

## 5. React Native Integration

### 5.1 Installation

```bash
# Install Firebase packages
npm install @react-native-firebase/app
npm install @react-native-firebase/auth
npm install @react-native-firebase/firestore
npm install @react-native-firebase/functions
npm install @react-native-firebase/analytics
npm install @react-native-firebase/crashlytics

# iOS setup
cd ios && pod install
```

### 5.2 iOS Configuration

```objc
// ios/SymposiumAI/AppDelegate.mm
#import <Firebase.h>

- (BOOL)application:(UIApplication *)application 
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Initialize Firebase
  [FIRApp configure];
  
  // ... rest of app initialization
  return YES;
}
```

### 5.3 Android Configuration

```gradle
// android/build.gradle
buildscript {
  dependencies {
    classpath 'com.google.gms:google-services:4.4.0'
  }
}

// android/app/build.gradle
apply plugin: 'com.google.gms.google-services'

dependencies {
  implementation platform('com.google.firebase:firebase-bom:32.7.0')
}
```

---

## 6. App Initialization

### 6.1 Firebase Initialization

```typescript
// src/services/firebase/initialize.ts
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import analytics from '@react-native-firebase/analytics';
import crashlytics from '@react-native-firebase/crashlytics';

export const initializeFirebase = async () => {
  try {
    // Enable Firestore offline persistence
    await firestore().settings({
      persistence: true,
      cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
    });
    
    // Enable Analytics in production
    if (!__DEV__) {
      await analytics().setAnalyticsCollectionEnabled(true);
      await crashlytics().setCrashlyticsCollectionEnabled(true);
    }
    
    // Set up auth state listener
    auth().onAuthStateChanged(async (user) => {
      if (user) {
        // User is signed in
        console.log('User signed in:', user.uid);
        
        // Update last active timestamp
        await firestore()
          .collection('users')
          .doc(user.uid)
          .update({
            lastActive: firestore.FieldValue.serverTimestamp(),
          })
          .catch(console.error);
        
        // Set user properties for analytics
        await analytics().setUserId(user.uid);
        await analytics().setUserProperty('auth_provider', 
          user.providerData[0]?.providerId || 'anonymous');
      } else {
        // User is signed out
        console.log('User signed out');
        await analytics().setUserId(null);
      }
    });
    
    console.log('Firebase initialized successfully');
    return { success: true };
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    return { success: false, error };
  }
};
```

### 6.2 App.tsx Integration

```typescript
// App.tsx
import React, { useEffect, useState } from 'react';
import { initializeFirebase } from './src/services/firebase/initialize';
import { AuthService } from './src/services/firebase/auth';
import { LoadingScreen } from './src/screens/LoadingScreen';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    initializeApp();
  }, []);
  
  const initializeApp = async () => {
    // Initialize Firebase
    await initializeFirebase();
    
    // Check if user exists, otherwise sign in anonymously
    const currentUser = auth().currentUser;
    if (!currentUser) {
      // Sign in anonymously for Demo Mode
      await AuthService.signInAnonymously();
    }
    
    setIsInitialized(true);
  };
  
  if (!isInitialized) {
    return <LoadingScreen />;
  }
  
  return <AppNavigator />;
}
```

---

## 7. Environment Configuration

### 7.1 Development vs Production

```typescript
// src/config/firebase.ts
const config = {
  development: {
    projectId: 'symposium-ai-dev',
    functionsRegion: 'us-central1',
    functionsEmulator: 'http://localhost:5001',
    firestoreEmulator: 'localhost:8080',
    authEmulator: 'http://localhost:9099',
  },
  production: {
    projectId: 'symposium-ai-prod',
    functionsRegion: 'us-central1',
    functionsEmulator: null,
    firestoreEmulator: null,
    authEmulator: null,
  },
};

export const firebaseConfig = __DEV__ ? config.development : config.production;
```

### 7.2 Emulator Setup (Development)

```json
// firebase.json
{
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "functions": {
      "port": 5001
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

```bash
# Start emulators for local development
firebase emulators:start

# Access Emulator UI at http://localhost:4000
```

---

## 8. Analytics Setup

### 8.1 Key Events to Track

```typescript
// src/services/analytics/events.ts
import analytics from '@react-native-firebase/analytics';

export const AnalyticsEvents = {
  // Authentication Events
  signUpStarted: (method: string) => 
    analytics().logEvent('sign_up_started', { method }),
  
  signUpCompleted: (method: string) => 
    analytics().logEvent('sign_up', { method }),
  
  loginCompleted: (method: string) => 
    analytics().logEvent('login', { method }),
  
  anonymousSessionStarted: () => 
    analytics().logEvent('anonymous_session_started'),
  
  anonymousConverted: (method: string) => 
    analytics().logEvent('anonymous_converted', { method }),
  
  // Subscription Events
  trialStarted: (planType: string) => 
    analytics().logEvent('trial_started', { plan_type: planType }),
  
  subscriptionPurchased: (planType: string, value: number) => 
    analytics().logEvent('purchase', { 
      currency: 'USD',
      value,
      items: [{ item_id: planType, item_name: `${planType}_subscription` }]
    }),
  
  // Demo Mode Events
  demoContentViewed: (contentType: string) => 
    analytics().logEvent('demo_content_viewed', { content_type: contentType }),
  
  upgradePromptShown: (trigger: string) => 
    analytics().logEvent('upgrade_prompt_shown', { trigger }),
};
```

### 8.2 User Properties

```typescript
// src/services/analytics/userProperties.ts
import analytics from '@react-native-firebase/analytics';

export const setUserProperties = async (user: UserDocument) => {
  await analytics().setUserProperty('membership_status', user.membershipStatus);
  await analytics().setUserProperty('auth_provider', user.authProvider);
  await analytics().setUserProperty('is_anonymous', user.isAnonymous.toString());
  await analytics().setUserProperty('has_used_trial', user.hasUsedTrial.toString());
  
  if (user.productId) {
    await analytics().setUserProperty('subscription_plan', user.productId);
  }
};
```

---

## 9. Testing

### 9.1 Test Scenarios

#### Anonymous Authentication Tests
- [ ] App launches and creates anonymous user
- [ ] Anonymous user can access Demo Mode
- [ ] Anonymous user data persists across app restarts
- [ ] Anonymous user can convert to full account
- [ ] Conversion preserves user data

#### User Flow Tests
- [ ] Email sign-up creates user document
- [ ] Social sign-in creates user document
- [ ] Sign-out clears user session
- [ ] Sign-in restores user data
- [ ] Multiple device sync works

#### Security Rules Tests
- [ ] Users can only read their own data
- [ ] Users cannot modify subscription fields
- [ ] Anonymous users have limited access
- [ ] Cloud Functions can modify all fields

### 9.2 Test Users

Create test users in Firebase Console:
1. `demo@test.com` - Demo user (no subscription)
2. `trial@test.com` - Trial user (7-day trial)
3. `premium@test.com` - Premium user (active subscription)

---

## 10. Monitoring & Debugging

### 10.1 Firebase Console Monitoring

**Key Metrics to Monitor:**
- Daily Active Users (DAU)
- Anonymous vs Authenticated ratio
- Conversion rate (Anonymous → Registered)
- Authentication errors
- Firestore usage and costs

### 10.2 Debug Logging

```typescript
// src/services/firebase/debug.ts
export const enableDebugLogging = () => {
  if (__DEV__) {
    // Enable Firebase debug logging
    firestore().setLogLevel('debug');
    
    // Log all auth state changes
    auth().onAuthStateChanged((user) => {
      console.log('[Auth State Changed]', {
        uid: user?.uid,
        isAnonymous: user?.isAnonymous,
        email: user?.email,
        providers: user?.providerData,
      });
    });
    
    // Log Firestore operations
    firestore().onSnapshotsInSync(() => {
      console.log('[Firestore] All snapshots in sync');
    });
  }
};
```

---

## 11. Production Checklist

### Pre-Launch
- [ ] Production Firebase project created
- [ ] Authentication methods configured
- [ ] Security rules deployed
- [ ] Cloud Functions deployed
- [ ] Analytics enabled
- [ ] Crashlytics enabled
- [ ] App Check configured (optional)

### Configuration
- [ ] Production config files in place
- [ ] Environment variables set
- [ ] API keys secured
- [ ] Bundle IDs match Firebase config

### Testing
- [ ] All auth methods tested
- [ ] Anonymous flow tested
- [ ] Conversion flow tested
- [ ] Security rules validated
- [ ] Functions tested

### Monitoring
- [ ] Alerts configured
- [ ] Usage budgets set
- [ ] Backup strategy in place
- [ ] Support contact ready

---

## 12. Troubleshooting

### Common Issues

**Issue**: Anonymous sign-in fails
```typescript
// Solution: Ensure Anonymous auth is enabled in Firebase Console
// Check: Authentication → Sign-in method → Anonymous
```

**Issue**: User document not created
```typescript
// Solution: Check Firestore rules allow creation
// Verify: Security rules permit write for authenticated users
```

**Issue**: Conversion fails with "email-already-in-use"
```typescript
// Solution: Handle account merging
// Implement: Custom merge logic or inform user
```

**Issue**: Functions not triggering
```typescript
// Solution: Check function deployment
// Verify: firebase deploy --only functions
```

---

## Conclusion

This Firebase setup provides a robust backend infrastructure for Symposium AI with special emphasis on anonymous authentication for Demo Mode. The configuration supports the complete user journey from anonymous browsing to premium subscription while maintaining security and data integrity.

Key features implemented:
- Anonymous authentication for friction-free Demo Mode
- Seamless conversion from anonymous to registered
- Comprehensive user data tracking
- Secure subscription management
- Automated cleanup and maintenance

---

*For Firebase support: team@braveheart-innovations.com*