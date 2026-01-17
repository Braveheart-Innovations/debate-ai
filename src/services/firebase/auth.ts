import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  FirebaseAuthTypes,
  signInWithCredential,
  GoogleAuthProvider,
  AppleAuthProvider,
  updateProfile as fbUpdateProfile,
  getIdToken as firebaseGetIdToken,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail
} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from '@react-native-firebase/firestore';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { ErrorService } from '@/services/errors/ErrorService';
import { AuthError } from '@/errors/types/AuthError';

// Minimal serializable user shape for Redux
export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerId?: string | null;
};

export const toAuthUser = (user: FirebaseAuthTypes.User): AuthUser => ({
  uid: user.uid,
  email: user.email ?? null,
  displayName: user.displayName ?? null,
  photoURL: user.photoURL ?? null,
  emailVerified: !!user.emailVerified,
  providerId: user.providerId ?? null,
});

/**
 * Unified User Document Schema
 * Used across web and mobile platforms for consistency
 *
 * Membership Lifecycles:
 * - Mobile: demo → trial → premium (canceled reverts to demo)
 * - Web: free → trial → premium (canceled reverts to free with remaining limits)
 */
export interface UserDocument {
  // === Identity ===
  email: string | null;
  emailVerified: boolean;

  // === Profile ===
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;

  // === Authentication ===
  authProvider: 'google' | 'apple' | 'email';
  authProviderUid: string | null;
  createdOnPlatform: 'web' | 'ios' | 'android';

  // === Subscription/Membership ===
  // demo = mobile only (pre-recorded content)
  // free = web only (limited usage: 5 debates/compares/chats)
  membershipStatus: 'demo' | 'free' | 'trial' | 'premium' | 'canceled' | 'past_due';
  isPremium: boolean;
  hasUsedTrial: boolean;
  trialStartedAt: ReturnType<typeof serverTimestamp> | null;
  trialEndsAt: ReturnType<typeof serverTimestamp> | null;
  subscriptionStartedAt: ReturnType<typeof serverTimestamp> | null;
  subscriptionEndsAt: ReturnType<typeof serverTimestamp> | null;
  subscriptionPlan: 'monthly' | 'annual' | null;
  subscriptionSource: 'stripe' | 'apple_iap' | 'google_play' | null;

  // === Free Tier Limits (web only, null for mobile) ===
  freeDebatesRemaining: number | null;
  freeComparesRemaining: number | null;
  freeChatsRemaining: number | null;

  // === User Preferences ===
  preferences: Record<string, unknown>;

  // === Timestamps ===
  createdAt: ReturnType<typeof serverTimestamp>;
  lastSignInAt: ReturnType<typeof serverTimestamp>;
  updatedAt: ReturnType<typeof serverTimestamp>;
}

/**
 * Build a new user document with all required fields
 * Mobile users start in 'demo' status with pre-recorded content access
 */
function buildNewUserDocument(
  user: FirebaseAuthTypes.User,
  authProvider: 'google' | 'apple' | 'email',
  additionalData?: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  }
): Record<string, unknown> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  return {
    // Identity
    email: additionalData?.email || user.email || null,
    emailVerified: user.emailVerified || false,

    // Profile
    displayName: additionalData?.displayName || user.displayName || null,
    photoURL: additionalData?.photoURL || user.photoURL || null,
    phoneNumber: user.phoneNumber || null,

    // Authentication
    authProvider,
    authProviderUid: user.providerData?.[0]?.uid || null,
    createdOnPlatform: platform,

    // Subscription - mobile users start in 'demo' status
    membershipStatus: 'demo',
    isPremium: false,
    hasUsedTrial: false,
    trialStartedAt: null,
    trialEndsAt: null,
    subscriptionStartedAt: null,
    subscriptionEndsAt: null,
    subscriptionPlan: null,
    subscriptionSource: null,

    // Free tier limits - null for mobile (not applicable)
    freeDebatesRemaining: null,
    freeComparesRemaining: null,
    freeChatsRemaining: null,

    // Preferences
    preferences: {},

    // Timestamps
    createdAt: serverTimestamp(),
    lastSignInAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/**
 * Sign in with email and password
 */
export const signInWithEmail = async (
  email: string,
  password: string
): Promise<FirebaseAuthTypes.User> => {
  try {
    const auth = getAuth();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  } catch (error) {
    const authError = error as { code?: string; message?: string };
    // Use AuthError.fromFirebaseCode for consistent error handling
    const appError = AuthError.fromFirebaseCode(
      authError?.code || 'unknown',
      authError?.message || 'Sign in failed'
    );
    ErrorService.handleError(appError, {
      feature: 'auth',
      showToast: false, // Let the UI handle displaying errors
      context: { action: 'signInWithEmail', email },
    });
    throw appError;
  }
};

/**
 * Sign up with email and password
 */
export const signUpWithEmail = async (
  email: string,
  password: string
): Promise<FirebaseAuthTypes.User> => {
  try {
    const auth = getAuth();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const user = credential.user;

    // Create user document in Firestore with unified schema
    const db = getFirestore();
    const usersCollection = collection(db, 'users');
    const userDocRef = doc(usersCollection, user.uid);

    const newUserData = buildNewUserDocument(user, 'email');
    await setDoc(userDocRef, newUserData);

    return user;
  } catch (error) {
    const authError = error as { code?: string; message?: string };
    // Use AuthError.fromFirebaseCode for consistent error handling
    const appError = AuthError.fromFirebaseCode(
      authError?.code || 'unknown',
      authError?.message || 'Sign up failed'
    );
    ErrorService.handleError(appError, {
      feature: 'auth',
      showToast: false,
      context: { action: 'signUpWithEmail', email },
    });
    throw appError;
  }
};

/**
 * Sign out the current user
 */
export const signOut = async (): Promise<void> => {
  try {
    const auth = getAuth();
    await firebaseSignOut(auth);
  } catch (error) {
    const authError = error as { code?: string; message?: string };
    const appError = AuthError.fromFirebaseCode(
      authError?.code || 'unknown',
      authError?.message || 'Sign out failed'
    );
    ErrorService.handleError(appError, {
      feature: 'auth',
      showToast: true,
      context: { action: 'signOut' },
    });
    throw appError;
  }
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (email: string): Promise<void> => {
  try {
    const auth = getAuth();
    await firebaseSendPasswordResetEmail(auth, email);
  } catch (error) {
    const authError = error as { code?: string; message?: string };
    const appError = AuthError.fromFirebaseCode(
      authError?.code || 'unknown',
      authError?.message || 'Password reset failed'
    );
    ErrorService.handleError(appError, {
      feature: 'auth',
      showToast: false,
      context: { action: 'sendPasswordResetEmail', email },
    });
    throw appError;
  }
};

/**
 * Get the current authenticated user
 */
export const getCurrentUser = (): FirebaseAuthTypes.User | null => {
  const auth = getAuth();
  return auth.currentUser;
};

/**
 * Get the current user's ID token for API calls
 */
export const getIdToken = async (): Promise<string | null> => {
  const user = getCurrentUser();
  if (!user) return null;

  try {
    return await firebaseGetIdToken(user);
  } catch (error) {
    // Silent error - don't show toast, just log
    ErrorService.handleSilent(error, { action: 'getIdToken' });
    return null;
  }
};

/**
 * Listen to authentication state changes
 */
export const onAuthStateChanged = (
  callback: (user: FirebaseAuthTypes.User | null) => void
): (() => void) => {
  const auth = getAuth();
  return firebaseOnAuthStateChanged(auth, callback);
};

/**
 * Check if user has premium access
 */
export const checkPremiumAccess = async (): Promise<boolean> => {
  const user = getCurrentUser();
  if (!user) return false;

  try {
    const db = getFirestore();
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) return false;

    const userData = userDoc.data();
    return userData?.isPremium === true;
  } catch (error) {
    // Silent error - don't block app functionality
    ErrorService.handleSilent(error, { action: 'checkPremiumAccess' });
    return false;
  }
};

// Re-export User type for convenience
export type User = FirebaseAuthTypes.User;

/**
 * Configure Google Sign In
 * Must be called before using Google Sign In
 */
export const configureGoogleSignIn = () => {
  const config: {
    webClientId: string;
    offlineAccess: boolean;
    iosClientId?: string;
  } = {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '', // Required for Firebase
    offlineAccess: true,
  };
  
  // iOS requires the iOS client ID
  if (Platform.OS === 'ios' && process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) {
    config.iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  }
  
  GoogleSignin.configure(config);
};

/**
 * User profile returned from auth functions
 * Subset of UserDocument for immediate use after auth
 */
interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: number | null;
  membershipStatus: 'demo' | 'free' | 'trial' | 'premium' | 'canceled' | 'past_due';
  isPremium: boolean;
  authProvider: string;
  preferences: Record<string, unknown>;
}

/**
 * Sign in with Apple
 */

export const signInWithApple = async (): Promise<{ user: User; profile: UserProfile }> => {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple Sign In is only available on iOS');
  }

  try {
    // Additional availability guard and simulator messaging
    try {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        const sim = !Device.isDevice;
        throw new Error(
          sim
            ? 'Apple Sign-In is not supported in the iOS Simulator. Please test on a real device.'
            : 'Apple Sign-In is unavailable on this device.'
        );
      }
    } catch {
      // If availability check itself fails, continue to attempt sign-in; will be caught below
    }

    // Start Apple authentication
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
    });

    // Build Apple credential (use AppleAuthProvider; provider.credential() is undefined)
    const auth = getAuth();
    const appleCredential = AppleAuthProvider.credential(
      credential.identityToken as string,
      undefined as unknown as string // nonce not used here
    );

    // Sign in with Firebase
    const userCredential = await signInWithCredential(auth, appleCredential);

    // Best-effort: set display name on Firebase user from Apple payload or email prefix
    // Prefer the full name Apple returns on first authorization; do not fallback to email here
    const appleFullName = credential.fullName
      ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
      : null;
    if (appleFullName) {
      try {
        if (userCredential.user.displayName !== appleFullName) {
          await fbUpdateProfile(userCredential.user, { displayName: appleFullName });
        }
      } catch (e) {
        console.warn('Apple Sign-In: failed to set displayName on Firebase user', e);
      }
    }
    
    // Get or create user profile
    const profile = await getOrCreateUserProfile(userCredential.user, {
      displayName: appleFullName || undefined,
      email: credential.email,
      authProvider: 'apple',
    });
    
    return {
      user: userCredential.user,
      profile,
    };
  } catch (error) {
    const err = error as { code?: string; message?: string };
    // Handle user cancellation separately (not an error)
    if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') {
      throw new Error('User cancelled');
    }
    // Use AuthError for consistent error handling
    const appError = AuthError.socialAuthFailed('apple', err?.message);
    // Add simulator context if applicable
    if (Platform.OS === 'ios' && !Device.isDevice) {
      appError.context.isSimulator = true;
    }
    ErrorService.handleError(appError, {
      feature: 'auth',
      showToast: false,
      context: { action: 'signInWithApple', isSimulator: !Device.isDevice },
    });
    throw appError;
  }
};

/**
 * Sign in with Google
 */
export const signInWithGoogle = async (): Promise<{ user: User; profile: UserProfile }> => {
  try {
    console.warn('Starting Google Sign In process...');
    
    // Configure Google Sign In if not already done
    configureGoogleSignIn();
    console.warn('Google Sign In configured');
    
    // Check if Google Play Services are available (Android)
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      console.warn('Google Play Services available');
    }
    
    // Sign out first to ensure account picker appears
    try {
      await GoogleSignin.signOut();
    } catch {
      // Ignore - user may not be signed in
    }

    // Sign in with Google
    console.warn('Presenting Google Sign In dialog...');
    await GoogleSignin.signIn();
    console.warn('Google Sign In successful, getting tokens...');
    const tokens = await GoogleSignin.getTokens();
    
    if (!tokens.idToken) {
      throw new Error('No ID token received from Google Sign In');
    }
    
    // Create a Google credential with the token
    const googleCredential = GoogleAuthProvider.credential(tokens.idToken);
    console.warn('Google credential created, signing in with Firebase...');
    
    // Sign in with Firebase
    const auth = getAuth();
    const userCredential = await signInWithCredential(auth, googleCredential);
    console.warn('Firebase sign in successful:', userCredential.user.uid);
    
    // Get current Google user info
    const currentUser = await GoogleSignin.getCurrentUser();
    
    // Try to get or create user profile; fall back gracefully if Firestore is unavailable
    let profile: UserProfile;
    try {
      profile = await getOrCreateUserProfile(userCredential.user, {
        displayName: currentUser?.user.name || userCredential.user.displayName,
        email: currentUser?.user.email || userCredential.user.email,
        photoURL: currentUser?.user.photo || userCredential.user.photoURL,
        authProvider: 'google',
      });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.warn('Firestore unavailable while building profile, using fallback:', err?.code || err);
      profile = {
        uid: userCredential.user.uid,
        email: currentUser?.user.email || userCredential.user.email,
        displayName: currentUser?.user.name || userCredential.user.displayName || 'User',
        photoURL: currentUser?.user.photo || userCredential.user.photoURL,
        createdAt: Date.now(),
        membershipStatus: 'demo',
        isPremium: false,
        authProvider: 'google',
        preferences: {},
      };
    }
    
    console.warn('User profile created/retrieved successfully');
    return {
      user: userCredential.user,
      profile,
    };
  } catch (error) {
    const authError = error as { code?: string; message?: string; statusCode?: number };
    // Handle user cancellation separately (not an error)
    if (authError?.code === 'SIGN_IN_CANCELLED' || authError?.code === '12501') {
      throw new Error('User cancelled');
    }
    // Use AuthError for consistent error handling
    const appError = AuthError.socialAuthFailed('google', authError?.message);
    // Add specific context for configuration errors
    if (authError?.code === 'DEVELOPER_ERROR' || authError?.code === '10') {
      appError.context.isDeveloperError = true;
    }
    ErrorService.handleError(appError, {
      feature: 'auth',
      showToast: false,
      context: {
        action: 'signInWithGoogle',
        errorCode: authError?.code,
        statusCode: authError?.statusCode,
      },
    });
    throw appError;
  }
};

/**
 * Helper to get or create user profile in Firestore
 * Uses unified schema for consistency across platforms
 */
const getOrCreateUserProfile = async (
  user: User,
  additionalData?: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
    authProvider?: 'google' | 'apple' | 'email';
  }
): Promise<UserProfile> => {
  const db = getFirestore();
  const userDocRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userDocRef);

  if (userDoc.exists()) {
    const data = userDoc.data();
    // Update profile fields that may have changed
    const updates: Record<string, unknown> = {
      lastSignInAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Update profile if we have better data
    if (additionalData?.displayName && (!data?.displayName || data.displayName === 'User')) {
      updates.displayName = additionalData.displayName;
    }
    if (additionalData?.photoURL && !data?.photoURL) {
      updates.photoURL = additionalData.photoURL;
    }
    if (user.emailVerified && !data?.emailVerified) {
      updates.emailVerified = true;
    }

    await setDoc(userDocRef, updates, { merge: true });

    const createdAtMs = data?.createdAt?.toDate
      ? data.createdAt.toDate().getTime()
      : typeof data?.createdAt === 'number'
        ? data.createdAt
        : Date.now();

    return {
      uid: user.uid,
      email: data?.email || additionalData?.email || user.email,
      displayName: updates.displayName as string || data?.displayName || 'User',
      photoURL: updates.photoURL as string || data?.photoURL || null,
      createdAt: createdAtMs,
      membershipStatus: data?.membershipStatus || 'free',
      isPremium: data?.isPremium || false,
      authProvider: data?.authProvider || additionalData?.authProvider || 'unknown',
      preferences: data?.preferences || {},
    };
  }

  // Create new user document with unified schema
  const authProvider = additionalData?.authProvider || 'email';
  const newUserData = buildNewUserDocument(user, authProvider, additionalData);
  await setDoc(userDocRef, newUserData);

  return {
    uid: user.uid,
    email: additionalData?.email || user.email || null,
    displayName: additionalData?.displayName || user.displayName || 'User',
    photoURL: additionalData?.photoURL || user.photoURL || null,
    createdAt: Date.now(),
    membershipStatus: 'free',
    isPremium: false,
    authProvider,
    preferences: {},
  };
};

