# Profile Authentication Enhancement - Complete Implementation Guide

## Overview
This guide provides detailed steps to enhance the Profile authentication system with social login capabilities (Apple Sign In and Google Sign In), improve UI consistency with gradient headers, and fix header icon positioning issues.

## Table of Contents
1. [Header Icon Positioning Fix](#1-header-icon-positioning-fix)
2. [Dependencies Installation](#2-dependencies-installation)
3. [Platform Configuration](#3-platform-configuration)
4. [Component Architecture](#4-component-architecture)
5. [Implementation Steps](#5-implementation-steps)
6. [Testing Checklist](#6-testing-checklist)
7. [Migration Strategy](#7-migration-strategy)

---

## 1. Header Icon Positioning Fix

### Issue
The HeaderActions icons are currently positioned in the lower right of the gradient header, interfering with text rendering.

### Solution
Move the icons to the upper right corner by modifying the `headerTopRightContainer` styles.

### File: `src/components/organisms/Header.tsx`

#### Current Issue (Lines 719-732):
```typescript
{/* Top right container for ProfileIcon and HeaderActions */}
<Box style={[styles.headerTopRightContainer, { 
  top: insets.top + theme.spacing.sm,
  right: theme.spacing.lg 
}]}>
```

#### Fix Implementation:
```typescript
// Update the headerTopRightContainer positioning (line 873-878)
headerTopRightContainer: {
  position: 'absolute',
  flexDirection: 'row',
  alignItems: 'center',
  zIndex: 15,
  // Move to upper right - adjust top position
  top: 0,  // Will be overridden with insets.top in JSX
}

// In the JSX (lines 719-732), adjust the top positioning:
<Box style={[styles.headerTopRightContainer, { 
  top: insets.top + 8,  // Reduced from theme.spacing.sm for upper positioning
  right: theme.spacing.lg 
}]}>
```

This positions the icons in the upper right corner, preventing interference with the title and subtitle text.

---

## 2. Dependencies Installation

### Required Packages

```bash
# Social Authentication
npm install @invertase/react-native-apple-authentication@^2.3.0
npm install @react-native-google-signin/google-signin@^10.1.0

# Secure Storage (for token management)
npm install react-native-keychain@^8.1.2

# Already installed (verify versions):
# - @react-native-firebase/auth@^23.1.1
# - expo-linear-gradient@^14.1.5
# - expo-blur@^14.1.5
```

### iOS Pod Installation
```bash
cd ios && pod install && cd ..
```

---

## 3. Platform Configuration

### iOS Configuration (Apple Sign In)

#### Step 1: Enable Sign In with Apple Capability
1. Open project in Xcode: `ios/SymposiumAI.xcworkspace`
2. Select your app target
3. Go to "Signing & Capabilities" tab
4. Click "+" and add "Sign In with Apple"

#### Step 2: Update Info.plist
```xml
<!-- ios/SymposiumAI/Info.plist -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>com.braveheartinnovations.debateai</string>
        </array>
    </dict>
</array>
```

### Android Configuration (Google Sign In)

#### Step 1: Configure Firebase Console
1. Go to Firebase Console → Project Settings
2. Add SHA-1 and SHA-256 fingerprints
3. Download updated `google-services.json`
4. Place in `android/app/google-services.json`

#### Step 2: Update Android Manifest
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
```

---

## 4. Component Architecture

### New File Structure
```
src/
├── components/
│   ├── molecules/
│   │   ├── auth/
│   │   │   ├── EmailAuthForm.tsx (existing)
│   │   │   ├── AppleSignInButton.tsx (new)
│   │   │   ├── GoogleSignInButton.tsx (new)
│   │   │   └── SocialAuthButton.tsx (new)
│   │   └── profile/
│   │       ├── MembershipCard.tsx (new)
│   │       └── FreeTierCTA.tsx (new)
│   └── organisms/
│       ├── auth/
│       │   ├── AuthModal.tsx (existing - to be deprecated)
│       │   └── SocialAuthProviders.tsx (new)
│       └── profile/
│           ├── ProfileSheet.tsx (enhance)
│           └── ProfileContent.tsx (refactor)
├── services/
│   └── firebase/
│       └── auth.ts (enhance with social auth)
└── store/
    └── authSlice.ts (enhance with social auth actions)
```

---

## 5. Implementation Steps

### Step 1: Create Apple Sign In Button Component

**File: `src/components/molecules/auth/AppleSignInButton.tsx`**
```typescript
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  AppleButton,
  appleAuth,
} from '@invertase/react-native-apple-authentication';
import { Button } from '../Button';
import { useTheme } from '../../../theme';

interface AppleSignInButtonProps {
  onPress: () => void;
  variant?: 'white' | 'black' | 'whiteOutline';
  fullWidth?: boolean;
  loading?: boolean;
}

export const AppleSignInButton: React.FC<AppleSignInButtonProps> = ({
  onPress,
  variant = 'black',
  fullWidth = true,
  loading = false,
}) => {
  const { theme } = useTheme();

  // Fallback for non-iOS platforms
  if (Platform.OS !== 'ios' || !appleAuth.isSupported) {
    return null;
  }

  const buttonStyle = {
    [AppleButton.Style.WHITE]: AppleButton.Style.WHITE,
    [AppleButton.Style.BLACK]: AppleButton.Style.BLACK,
    [AppleButton.Style.WHITE_OUTLINE]: AppleButton.Style.WHITE_OUTLINE,
  }[variant] || AppleButton.Style.BLACK;

  return (
    <AppleButton
      buttonStyle={buttonStyle}
      buttonType={AppleButton.Type.SIGN_IN}
      style={[
        styles.button,
        fullWidth && styles.fullWidth,
        { height: 48 }
      ]}
      onPress={onPress}
      cornerRadius={12}
    />
  );
};

const styles = StyleSheet.create({
  button: {
    marginVertical: 8,
  },
  fullWidth: {
    width: '100%',
  },
});
```

### Step 2: Create Google Sign In Button Component

**File: `src/components/molecules/auth/GoogleSignInButton.tsx`**
```typescript
import React from 'react';
import { TouchableOpacity, View, StyleSheet, ActivityIndicator } from 'react-native';
import { Typography } from '../Typography';
import { useTheme } from '../../../theme';

interface GoogleSignInButtonProps {
  onPress: () => void;
  fullWidth?: boolean;
  loading?: boolean;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onPress,
  fullWidth = true,
  loading = false,
}) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      style={[
        styles.button,
        fullWidth && styles.fullWidth,
        { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        }
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.primary[500]} />
      ) : (
        <>
          {/* Google Logo SVG or Image */}
          <View style={styles.logoContainer}>
            {/* Add Google logo here */}
          </View>
          <Typography variant="body" weight="medium" color="primary">
            Sign in with Google
          </Typography>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 8,
    height: 48,
  },
  fullWidth: {
    width: '100%',
  },
  logoContainer: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
});
```

### Step 3: Create Social Auth Providers Container

**File: `src/components/organisms/auth/SocialAuthProviders.tsx`**
```typescript
import React, { useState } from 'react';
import { View, StyleSheet, Platform, Alert } from 'react-native';
import { AppleSignInButton } from '../../molecules/auth/AppleSignInButton';
import { GoogleSignInButton } from '../../molecules/auth/GoogleSignInButton';
import { Typography } from '../../molecules/Typography';
import { useTheme } from '../../../theme';
import { useDispatch } from 'react-redux';
import { 
  signInWithApple, 
  signInWithGoogle 
} from '../../../services/firebase/auth';
import { setAuthUser, setUserProfile } from '../../../store/authSlice';

interface SocialAuthProvidersProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export const SocialAuthProviders: React.FC<SocialAuthProvidersProps> = ({
  onSuccess,
  onError,
}) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const [loadingProvider, setLoadingProvider] = useState<'apple' | 'google' | null>(null);

  const handleAppleSignIn = async () => {
    if (Platform.OS !== 'ios') return;
    
    setLoadingProvider('apple');
    try {
      const { user, profile } = await signInWithApple();
      dispatch(setAuthUser(user));
      dispatch(setUserProfile(profile));
      onSuccess?.();
    } catch (error) {
      console.error('Apple Sign In error:', error);
      onError?.(error as Error);
      Alert.alert('Sign In Failed', 'Unable to sign in with Apple. Please try again.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoadingProvider('google');
    try {
      const { user, profile } = await signInWithGoogle();
      dispatch(setAuthUser(user));
      dispatch(setUserProfile(profile));
      onSuccess?.();
    } catch (error) {
      console.error('Google Sign In error:', error);
      onError?.(error as Error);
      Alert.alert('Sign In Failed', 'Unable to sign in with Google. Please try again.');
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Platform-specific ordering */}
      {Platform.OS === 'ios' ? (
        <>
          <AppleSignInButton
            onPress={handleAppleSignIn}
            loading={loadingProvider === 'apple'}
            fullWidth
          />
          <GoogleSignInButton
            onPress={handleGoogleSignIn}
            loading={loadingProvider === 'google'}
            fullWidth
          />
        </>
      ) : (
        <GoogleSignInButton
          onPress={handleGoogleSignIn}
          loading={loadingProvider === 'google'}
          fullWidth
        />
      )}
      
      {/* Divider */}
      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
        <Typography variant="caption" color="secondary" style={styles.dividerText}>
          OR
        </Typography>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
  },
});
```

### Step 4: Create Premium CTA Component

**File: `src/components/molecules/profile/FreeTierCTA.tsx`**
```typescript
import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../Typography';
import { useTheme } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';

interface FreeTierCTAProps {
  onPress: () => void;
  variant?: 'compact' | 'full';
}

export const FreeTierCTA: React.FC<FreeTierCTAProps> = ({
  onPress,
  variant = 'full',
}) => {
  const { theme, isDark } = useTheme();

  const gradientColors: readonly [string, string, ...string[]] = isDark
    ? [theme.colors.gradients.premium[0], theme.colors.gradients.premium[1], '#1a1a2e']
    : [theme.colors.gradients.premium[0], theme.colors.gradients.premium[1], theme.colors.gradients.sunrise[0]];

  if (variant === 'compact') {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.compactContainer}
        >
          <Ionicons name="star" size={16} color="#fff" />
          <Typography variant="caption" weight="semibold" color="inverse">
            Upgrade to Premium
          </Typography>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.fullContainer}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientContainer}
      >
        <View style={styles.header}>
          <Ionicons name="star" size={24} color="#FFD700" />
          <Typography variant="title" weight="bold" color="inverse" style={styles.title}>
            Unlock Premium Features
          </Typography>
        </View>
        
        <View style={styles.features}>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Typography variant="caption" color="inverse" style={styles.featureText}>
              Unlimited AI Debates
            </Typography>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Typography variant="caption" color="inverse" style={styles.featureText}>
              Custom Debate Topics
            </Typography>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Typography variant="caption" color="inverse" style={styles.featureText}>
              Expert AI Models
            </Typography>
          </View>
        </View>
        
        <View style={styles.ctaContainer}>
          <Typography variant="body" weight="bold" color="inverse">
            Upgrade Now - Save 50%
          </Typography>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fullContainer: {
    width: '100%',
    marginVertical: 16,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  gradientContainer: {
    padding: 20,
    borderRadius: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    marginLeft: 12,
  },
  features: {
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureText: {
    marginLeft: 8,
  },
  ctaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    borderRadius: 12,
  },
});
```

### Step 5: Update Firebase Auth Service

**File: `src/services/firebase/auth.ts`**
```typescript
import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import firestore from '@react-native-firebase/firestore';

// Configure Google Sign In
GoogleSignin.configure({
  webClientId: process.env.GOOGLE_WEB_CLIENT_ID, // From Firebase Console
});

// Apple Sign In
export const signInWithApple = async () => {
  try {
    // Start Apple authentication
    const appleAuthRequestResponse = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    });

    // Ensure we have a valid response
    if (!appleAuthRequestResponse.identityToken) {
      throw new Error('Apple Sign In failed - no identify token returned');
    }

    // Create Firebase credential
    const credential = auth.AppleAuthProvider.credential(
      appleAuthRequestResponse.identityToken,
      appleAuthRequestResponse.nonce,
    );

    // Sign in with Firebase
    const userCredential = await auth().signInWithCredential(credential);
    
    // Get or create user profile
    const userProfile = await getOrCreateUserProfile(userCredential.user);
    
    return {
      user: userCredential.user,
      profile: userProfile,
    };
  } catch (error) {
    console.error('Apple Sign In error:', error);
    throw error;
  }
};

// Google Sign In
export const signInWithGoogle = async () => {
  try {
    // Get the users ID token
    const { idToken } = await GoogleSignin.signIn();

    // Create a Google credential with the token
    const googleCredential = auth.GoogleAuthProvider.credential(idToken);

    // Sign-in the user with the credential
    const userCredential = await auth().signInWithCredential(googleCredential);
    
    // Get or create user profile
    const userProfile = await getOrCreateUserProfile(userCredential.user);
    
    return {
      user: userCredential.user,
      profile: userProfile,
    };
  } catch (error) {
    console.error('Google Sign In error:', error);
    throw error;
  }
};

// Helper to get or create user profile in Firestore
const getOrCreateUserProfile = async (user: any) => {
  const userDocRef = firestore().collection('users').doc(user.uid);
  const userDoc = await userDocRef.get();
  
  if (userDoc.exists) {
    return userDoc.data();
  }
  
  // Create new user profile
  const newProfile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email?.split('@')[0] || 'User',
    photoURL: user.photoURL,
    createdAt: firestore.FieldValue.serverTimestamp(),
    membershipStatus: 'free',
    lastSignInMethod: user.providerData[0]?.providerId || 'unknown',
    preferences: {},
  };
  
  await userDocRef.set(newProfile);
  return newProfile;
};

// Link anonymous account to social account
export const linkAnonymousAccount = async (method: 'apple' | 'google') => {
  const currentUser = auth().currentUser;
  
  if (!currentUser || !currentUser.isAnonymous) {
    throw new Error('No anonymous user to link');
  }
  
  try {
    let credential;
    
    if (method === 'apple') {
      const appleAuthRequestResponse = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });
      
      credential = auth.AppleAuthProvider.credential(
        appleAuthRequestResponse.identityToken!,
        appleAuthRequestResponse.nonce,
      );
    } else {
      const { idToken } = await GoogleSignin.signIn();
      credential = auth.GoogleAuthProvider.credential(idToken);
    }
    
    // Link the anonymous account with the social credential
    const linkedUser = await currentUser.linkWithCredential(credential);
    
    // Update user profile
    const userProfile = await getOrCreateUserProfile(linkedUser.user);
    
    return {
      user: linkedUser.user,
      profile: userProfile,
    };
  } catch (error) {
    console.error('Account linking error:', error);
    throw error;
  }
};
```

### Step 6: Update Auth Slice

**File: `src/store/authSlice.ts`**
```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  // Existing fields
  user: any | null;
  userProfile: any | null;
  isAuthenticated: boolean;
  isPremium: boolean;
  authLoading: boolean;
  authModalVisible: boolean;
  
  // New fields for social auth
  lastAuthMethod: 'email' | 'apple' | 'google' | 'anonymous' | null;
  socialAuthLoading: boolean;
  socialAuthError: string | null;
  isAnonymous: boolean;
  canLinkAccount: boolean;
}

const initialState: AuthState = {
  // Existing initial values
  user: null,
  userProfile: null,
  isAuthenticated: false,
  isPremium: false,
  authLoading: false,
  authModalVisible: false,
  
  // New initial values
  lastAuthMethod: null,
  socialAuthLoading: false,
  socialAuthError: null,
  isAnonymous: false,
  canLinkAccount: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Existing reducers...
    
    // New social auth reducers
    setSocialAuthLoading: (state, action: PayloadAction<boolean>) => {
      state.socialAuthLoading = action.payload;
    },
    
    setSocialAuthError: (state, action: PayloadAction<string | null>) => {
      state.socialAuthError = action.payload;
    },
    
    setLastAuthMethod: (state, action: PayloadAction<AuthState['lastAuthMethod']>) => {
      state.lastAuthMethod = action.payload;
    },
    
    setIsAnonymous: (state, action: PayloadAction<boolean>) => {
      state.isAnonymous = action.payload;
      state.canLinkAccount = action.payload;
    },
    
    socialAuthSuccess: (state, action: PayloadAction<{
      user: any;
      profile: any;
      method: 'apple' | 'google';
    }>) => {
      state.user = action.payload.user;
      state.userProfile = action.payload.profile;
      state.isAuthenticated = true;
      state.isPremium = action.payload.profile.membershipStatus === 'premium';
      state.lastAuthMethod = action.payload.method;
      state.socialAuthLoading = false;
      state.socialAuthError = null;
      state.isAnonymous = false;
      state.canLinkAccount = false;
    },
    
    socialAuthFailure: (state, action: PayloadAction<string>) => {
      state.socialAuthLoading = false;
      state.socialAuthError = action.payload;
    },
    
    resetSocialAuthState: (state) => {
      state.socialAuthLoading = false;
      state.socialAuthError = null;
    },
  },
});

export const {
  // Existing exports...
  setSocialAuthLoading,
  setSocialAuthError,
  setLastAuthMethod,
  setIsAnonymous,
  socialAuthSuccess,
  socialAuthFailure,
  resetSocialAuthState,
} = authSlice.actions;

export default authSlice.reducer;
```

### Step 7: Enhanced ProfileSheet with Gradient Header

**File: `src/components/organisms/profile/ProfileSheet.tsx`**
```typescript
import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  PanResponder,
  TouchableWithoutFeedback,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SheetHandle } from '../../molecules/SheetHandle';
import { ProfileContent } from './ProfileContent';
import { Typography } from '../../molecules/Typography';
import { useTheme } from '../../../theme';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store';

interface ProfileSheetProps {
  visible: boolean;
  onClose: () => void;
  onSettingsPress?: () => void;
  onSubscriptionPress?: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85; // Increased for auth content
const SWIPE_THRESHOLD = 50;

export const ProfileSheet: React.FC<ProfileSheetProps> = ({
  visible,
  onClose,
  onSettingsPress,
  onSubscriptionPress,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const panY = useRef(0);

  // Get gradient colors
  const gradientColors: readonly [string, string, ...string[]] = isDark
    ? [theme.colors.gradients.primary[0], theme.colors.gradients.primary[1], theme.colors.primary[700] as string]
    : [theme.colors.gradients.primary[0], theme.colors.gradients.premium[1], theme.colors.gradients.sunrise[0] as string];

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        panY.current = (translateY as unknown as { _value: number })._value;
      },
      onPanResponderMove: (_, gestureState) => {
        const newY = panY.current + gestureState.dy;
        if (newY >= 0) {
          translateY.setValue(newY);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldClose = gestureState.dy > SWIPE_THRESHOLD || gestureState.vy > 0.5;
        
        if (shouldClose) {
          closeSheet();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  const openSheet = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  }, [translateY]);

  const closeSheet = () => {
    Animated.spring(translateY, {
      toValue: SHEET_HEIGHT,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start(() => {
      onClose();
    });
  };

  useEffect(() => {
    if (visible) {
      openSheet();
    } else {
      translateY.setValue(SHEET_HEIGHT);
    }
  }, [visible, translateY, openSheet]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={closeSheet}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={closeSheet}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: insets.bottom,
              height: SHEET_HEIGHT + insets.bottom,
              transform: [{ translateY }],
            }
          ]}
        >
          {/* Gradient Header */}
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.handleContainer} {...panResponder.panHandlers}>
              <SheetHandle />
            </View>
            
            <View style={styles.header}>
              <Typography variant="heading" weight="semibold" color="inverse">
                {isAuthenticated ? 'Profile' : 'Welcome'}
              </Typography>
              <TouchableOpacity
                onPress={closeSheet}
                style={styles.closeButton}
              >
                <Typography variant="heading" weight="medium" color="inverse">
                  ✕
                </Typography>
              </TouchableOpacity>
            </View>
          </LinearGradient>
          
          {/* Profile Content */}
          <ProfileContent
            onClose={closeSheet}
            onSettingsPress={onSettingsPress}
            onSubscriptionPress={onSubscriptionPress}
          />
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 16,
  },
  headerGradient: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 16,
  },
  handleContainer: {
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  closeButton: {
    padding: 8,
  },
});
```

### Step 8: Update ProfileContent with Social Auth

**File: `src/components/organisms/profile/ProfileContent.tsx`**
```typescript
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, logout, setAuthUser, setUserProfile } from '../../../store';
import { ProfileAvatar } from '../../molecules/ProfileAvatar';
import { Typography } from '../../molecules/Typography';
import { Button } from '../../molecules/Button';
import { SettingRow } from '../../molecules/SettingRow';
import { EmailAuthForm } from '../../molecules/auth/EmailAuthForm';
import { SocialAuthProviders } from '../auth/SocialAuthProviders';
import { FreeTierCTA } from '../../molecules/profile/FreeTierCTA';
import { useTheme } from '../../../theme';
import { 
  signOut, 
  signInWithEmail, 
  signUpWithEmail, 
  signInAnonymously,
  linkAnonymousAccount
} from '../../../services/firebase/auth';

interface ProfileContentProps {
  onClose: () => void;
  onSettingsPress?: () => void;
  onSubscriptionPress?: () => void;
}

export const ProfileContent: React.FC<ProfileContentProps> = ({
  onClose,
  onSettingsPress,
  onSubscriptionPress,
}) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const { 
    userProfile, 
    isPremium, 
    isAuthenticated,
    isAnonymous 
  } = useSelector((state: RootState) => state.auth);
  
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (email: string, password: string) => {
    setLoading(true);
    try {
      let user;
      if (authMode === 'signup') {
        user = await signUpWithEmail(email, password);
      } else {
        user = await signInWithEmail(email, password);
      }
      
      // Update Redux state
      dispatch(setAuthUser(user));
      dispatch(setUserProfile(await getUserProfile(user.uid)));
      
      setShowEmailForm(false);
    } catch (error) {
      Alert.alert(
        'Authentication Error',
        error instanceof Error ? error.message : 'An error occurred'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    setLoading(true);
    try {
      const user = await signInAnonymously();
      dispatch(setAuthUser(user));
      dispatch(setUserProfile({
        email: null,
        displayName: 'Guest User',
        photoURL: null,
        createdAt: new Date(),
        membershipStatus: 'free',
        preferences: {},
      }));
      dispatch(setIsAnonymous(true));
    } catch {
      Alert.alert('Error', 'Failed to sign in as guest');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkAccount = async (method: 'apple' | 'google') => {
    try {
      const { user, profile } = await linkAnonymousAccount(method);
      dispatch(setAuthUser(user));
      dispatch(setUserProfile(profile));
      dispatch(setIsAnonymous(false));
      Alert.alert('Success', 'Your account has been upgraded!');
    } catch (error) {
      Alert.alert('Error', 'Failed to link account. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      dispatch(logout());
      onClose();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Unauthenticated view
  if (!isAuthenticated) {
    if (showEmailForm) {
      return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <View style={styles.authHeader}>
            <Button
              title="← Back"
              onPress={() => setShowEmailForm(false)}
              variant="ghost"
              size="small"
            />
            <Typography variant="title" weight="semibold" color="primary">
              {authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </Typography>
            <View style={{ width: 60 }} />
          </View>
          
          <ScrollView style={styles.authFormContainer}>
            <EmailAuthForm
              mode={authMode}
              onSubmit={handleEmailAuth}
              loading={loading}
            />
            <View style={styles.authModeToggle}>
              <Typography variant="body" color="secondary">
                {authMode === 'signin' ? "Don't have an account?" : "Already have an account?"}
              </Typography>
              <Button
                title={authMode === 'signin' ? 'Sign Up' : 'Sign In'}
                onPress={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                variant="ghost"
                size="small"
              />
            </View>
          </ScrollView>
        </View>
      );
    }
    
    return (
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.welcomeSection}>
          <ProfileAvatar size={80} />
          <Typography 
            variant="title" 
            weight="semibold" 
            color="primary"
            style={styles.welcomeTitle}
          >
            Welcome to Symposium AI
          </Typography>
          <Typography 
            variant="body" 
            color="secondary"
            style={styles.welcomeSubtitle}
          >
            Where Ideas Converge. Where Understanding Emerges.
          </Typography>
        </View>

        {/* Social Auth Providers */}
        <SocialAuthProviders onSuccess={onClose} />

        {/* Email Sign In */}
        <Button
          title="Sign in with Email"
          onPress={() => {
            setAuthMode('signin');
            setShowEmailForm(true);
          }}
          variant="secondary"
          fullWidth
          style={styles.emailButton}
        />

        {/* Guest Option */}
        <Button
          title="Continue as Guest"
          onPress={handleAnonymousSignIn}
          variant="ghost"
          fullWidth
          loading={loading}
        />
        
        <Typography 
          variant="caption" 
          color="secondary"
          style={styles.disclaimer}
        >
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Typography>
      </ScrollView>
    );
  }

  // Anonymous user view - show upgrade prompt
  if (isAnonymous) {
    return (
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileSection}>
          <ProfileAvatar
            displayName="Guest User"
            size={64}
          />
          <Typography 
            variant="title" 
            weight="semibold" 
            color="primary"
            style={styles.displayName}
          >
            Guest User
          </Typography>
          <Typography 
            variant="body" 
            color="secondary"
            style={styles.guestMessage}
          >
            Create an account to save your conversations and unlock all features
          </Typography>
        </View>

        {/* Upgrade options */}
        <View style={styles.upgradeSection}>
          <Typography variant="title" weight="semibold" color="primary">
            Upgrade Your Account
          </Typography>
          
          <SocialAuthProviders 
            onSuccess={() => {
              Alert.alert('Success', 'Your account has been upgraded!');
              onClose();
            }}
          />
        </View>

        {/* Settings */}
        <View style={[styles.settingsSection, { backgroundColor: theme.colors.surface }]}>
          <SettingRow
            title="Settings"
            subtitle="Manage app preferences"
            icon="settings-outline"
            onPress={onSettingsPress}
          />
        </View>
      </ScrollView>
    );
  }

  // Authenticated user view
  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileSection}>
        <ProfileAvatar
          displayName={userProfile?.displayName}
          email={userProfile?.email}
          photoURL={userProfile?.photoURL}
          isPremium={isPremium}
          size={64}
        />
        <Typography 
          variant="title" 
          weight="semibold" 
          color="primary"
          style={styles.displayName}
        >
          {userProfile?.displayName || 'User'}
        </Typography>
        <Typography 
          variant="body" 
          color="secondary"
          style={styles.email}
        >
          {userProfile?.email}
        </Typography>
        {isPremium && (
          <View style={[styles.premiumBadge, { backgroundColor: theme.colors.primary[100] }]}>
            <Typography 
              variant="caption" 
              weight="semibold" 
              color="brand"
            >
              Premium Member
            </Typography>
          </View>
        )}
      </View>

      {/* Premium CTA for free users */}
      {!isPremium && (
        <FreeTierCTA onPress={() => onSubscriptionPress?.()} />
      )}

      {/* Settings */}
      <View style={[styles.settingsSection, { backgroundColor: theme.colors.surface }]}>
        <SettingRow
          title="Account Settings"
          subtitle="Manage your account and preferences"
          icon="person-circle-outline"
          onPress={onSettingsPress}
        />
        
        {!isPremium && (
          <SettingRow
            title="Upgrade to Premium"
            subtitle="Unlock all features"
            icon="star"
            iconColor={theme.colors.primary[500]}
            onPress={onSubscriptionPress}
          />
        )}
        
        <SettingRow
          title="Help & Support"
          subtitle="Get help and contact support"
          icon="help-circle-outline"
          onPress={() => {
            // TODO: Navigate to help
            onClose();
          }}
        />
      </View>

      {/* Sign Out */}
      <View style={styles.actions}>
        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="secondary"
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  welcomeSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 24,
  },
  welcomeTitle: {
    marginTop: 16,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  displayName: {
    marginTop: 12,
    textAlign: 'center',
  },
  email: {
    marginTop: 4,
    textAlign: 'center',
  },
  guestMessage: {
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  premiumBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  upgradeSection: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  settingsSection: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emailButton: {
    marginBottom: 8,
  },
  disclaimer: {
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 40,
  },
  authHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  authFormContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  authModeToggle: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 10,
  },
});
```

---

## 6. Testing Checklist

### iOS Testing
- [ ] Apple Sign In button appears on iOS devices
- [ ] Apple Sign In flow completes successfully
- [ ] User profile is created in Firestore
- [ ] Anonymous to Apple account linking works
- [ ] Premium CTA displays for free users
- [ ] Gradient header displays correctly
- [ ] Header icons positioned in upper right

### Android Testing
- [ ] Google Sign In button appears prominently
- [ ] Google Sign In flow completes successfully
- [ ] User profile is created in Firestore
- [ ] Anonymous to Google account linking works
- [ ] Premium CTA displays for free users
- [ ] Gradient header displays correctly
- [ ] Header icons positioned in upper right

### Cross-Platform Testing
- [ ] Email authentication works on both platforms
- [ ] Anonymous sign in works on both platforms
- [ ] Sign out functionality works correctly
- [ ] Settings navigation works from Profile
- [ ] Premium subscription navigation works
- [ ] Profile sheet opens and closes smoothly
- [ ] Swipe to dismiss works correctly

### Edge Cases
- [ ] Network failure handling
- [ ] Authentication cancellation handling
- [ ] Duplicate account handling
- [ ] Token refresh handling
- [ ] Session timeout handling

---

## 7. Migration Strategy

### Phase 1: Infrastructure (Day 1)
1. Install dependencies
2. Configure iOS and Android platforms
3. Update Firebase configuration
4. Test basic Firebase connectivity

### Phase 2: Components (Day 2)
1. Create social auth button components
2. Create Premium CTA component
3. Update Header.tsx with icon positioning fix
4. Test component rendering

### Phase 3: Authentication (Day 3)
1. Implement social auth in Firebase service
2. Update auth slice with social auth actions
3. Test authentication flows
4. Implement account linking

### Phase 4: Profile Enhancement (Day 4)
1. Add gradient header to ProfileSheet
2. Integrate SocialAuthProviders
3. Update ProfileContent with new auth flow
4. Test complete user journey

### Phase 5: Polish & Testing (Day 5)
1. Fix any UI/UX issues
2. Complete platform-specific testing
3. Handle edge cases
4. Performance optimization

### Rollback Plan
If issues arise:
1. Keep AuthModal as fallback
2. Feature flag social auth
3. Gradual rollout to users
4. Monitor error rates

---

## Conclusion

This implementation guide provides a complete roadmap for enhancing the Profile authentication system with social login capabilities while maintaining the existing functionality and improving the UI consistency. The phased approach ensures minimal disruption while delivering a premium user experience.

Key improvements:
- Native social authentication (Apple & Google)
- Consistent gradient header design
- Fixed header icon positioning
- Premium upgrade CTAs
- Enhanced user journey

Follow the testing checklist thoroughly to ensure a smooth rollout across both iOS and Android platforms.