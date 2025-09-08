import { 
  getAuth,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  FirebaseAuthTypes,
  signInWithCredential,
  GoogleAuthProvider,
  linkWithCredential,
  AppleAuthProvider,
  updateProfile as fbUpdateProfile,
  getIdToken as firebaseGetIdToken
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

// Minimal serializable user shape for Redux
export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  emailVerified: boolean;
  providerId?: string | null;
};

export const toAuthUser = (user: FirebaseAuthTypes.User): AuthUser => ({
  uid: user.uid,
  email: user.email ?? null,
  displayName: user.displayName ?? null,
  photoURL: user.photoURL ?? null,
  isAnonymous: !!user.isAnonymous,
  emailVerified: !!user.emailVerified,
  providerId: user.providerId ?? null,
});

/**
 * Sign in anonymously for users without accounts
 */
export const signInAnonymously = async (): Promise<FirebaseAuthTypes.User> => {
  try {
    const auth = getAuth();
    const credential = await firebaseSignInAnonymously(auth);
    console.warn('User signed in anonymously:', credential.user.uid);
    return credential.user;
  } catch (error) {
    console.error('Anonymous sign in error:', error);
    throw error;
  }
};

/**
 * Sign in with email and password
 */
export const signInWithEmail = async (
  email: string,
  password: string
): Promise<FirebaseAuthTypes.User> => {
  try {
    const auth = getAuth();
    console.warn('Attempting email sign in for:', email);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    console.warn('User signed in successfully:', credential.user.uid);
    return credential.user;
  } catch (error) {
    const authError = error as { code?: string; message?: string };
    console.error('Email sign in error:', {
      code: authError?.code,
      message: authError?.message,
      email,
      fullError: error
    });
    
    // Provide more specific error messages
    if (authError?.code === 'auth/user-not-found') {
      throw new Error('No account found with this email address');
    } else if (authError?.code === 'auth/wrong-password') {
      throw new Error('Incorrect password');
    } else if (authError?.code === 'auth/invalid-email') {
      throw new Error('Invalid email address');
    } else if (authError?.code === 'auth/network-request-failed') {
      throw new Error('Network error. Please check your connection');
    }
    throw error;
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
    console.warn('Attempting to create account for:', email);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const user = credential.user;
    
    console.warn('Auth user created, creating Firestore document...');
    // Create user document in Firestore
    const db = getFirestore();
    const usersCollection = collection(db, 'users');
    const userDoc = doc(usersCollection, user.uid);
    
    await setDoc(userDoc, {
      email: user.email,
      createdAt: serverTimestamp(),
      isPremium: false,
    });
    
    console.warn('User created successfully:', user.uid);
    return user;
  } catch (error) {
    const authError = error as { code?: string; message?: string };
    console.error('Sign up error:', {
      code: authError?.code,
      message: authError?.message,
      email,
      fullError: error
    });
    
    // Provide more specific error messages
    if (authError?.code === 'auth/email-already-in-use') {
      throw new Error('An account already exists with this email address');
    } else if (authError?.code === 'auth/weak-password') {
      throw new Error('Password should be at least 6 characters');
    } else if (authError?.code === 'auth/invalid-email') {
      throw new Error('Invalid email address');
    } else if (authError?.code === 'auth/network-request-failed') {
      throw new Error('Network error. Please check your connection');
    }
    throw error;
  }
};

/**
 * Sign out the current user
 */
export const signOut = async (): Promise<void> => {
  try {
    const auth = getAuth();
    await firebaseSignOut(auth);
    console.warn('User signed out');
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
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
    console.error('Error getting ID token:', error);
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
    console.error('Error checking premium access:', error);
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
 * Sign in with Apple
 */
interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: number | null;
  membershipStatus: 'free' | 'premium';
  isPremium: boolean;
  authProvider: string;
  preferences: Record<string, unknown>;
}

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
    if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') {
      throw new Error('User cancelled');
    }
    // Improve messaging on simulator/unknown
    if (Platform.OS === 'ios' && !Device.isDevice) {
      throw new Error('Apple Sign-In is not supported in the iOS Simulator. Please test on a real device.');
    }
    console.error('Apple Sign In error:', error);
    throw new Error(err?.message || 'Apple Sign-In failed. Please try again or use another method.');
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
        membershipStatus: 'free',
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
    console.error('Google Sign In error:', {
      code: authError?.code,
      message: authError?.message,
      statusCode: authError?.statusCode,
      fullError: error
    });
    
    if (authError?.code === 'SIGN_IN_CANCELLED' || authError?.code === '12501') {
      throw new Error('User cancelled');
    } else if (authError?.code === 'DEVELOPER_ERROR' || authError?.code === '10') {
      console.error('Google Sign In Developer Error - Check configuration:');
      console.error('1. Ensure SHA-1 fingerprint is added to Firebase Console');
      console.error('2. Download and update google-services.json/GoogleService-Info.plist');
      console.error('3. Verify bundle ID matches Firebase configuration');
      throw new Error('Google Sign In configuration error. Please contact support.');
    } else if (authError?.code === 'NETWORK_ERROR' || authError?.code === '7') {
      throw new Error('Network error. Please check your connection.');
    }
    throw new Error(authError?.message || 'Google Sign-In failed. Please try again.');
  }
};

/**
 * Helper to get or create user profile in Firestore
 */
const getOrCreateUserProfile = async (
  user: User,
  additionalData?: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
    authProvider?: string;
  }
): Promise<UserProfile> => {
  const db = getFirestore();
  const userDocRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userDocRef);
  
  if (userDoc.exists()) {
    const data = userDoc.data();
    // Optionally merge in improved displayName/email on first successful sign-in
    if (additionalData) {
      const updates: Record<string, unknown> = {};
      if (additionalData.displayName && (!data?.displayName || data.displayName === 'User')) {
        updates.displayName = additionalData.displayName;
      }
      if (additionalData.email && !data?.email) {
        updates.email = additionalData.email;
      }
      if (additionalData.authProvider && !data?.authProvider) {
        updates.authProvider = additionalData.authProvider;
      }
      if (data?.isPremium === undefined) {
        updates.isPremium = false;
      }
      if (!data?.membershipStatus) {
        updates.membershipStatus = 'free';
      }
      if (!data?.preferences) {
        updates.preferences = {};
      }
      if (!data?.uid) {
        updates.uid = user.uid;
      }
      if (Object.keys(updates).length > 0) {
        await setDoc(userDocRef, updates, { merge: true });
      }
    }
    const createdAtMs = data?.createdAt?.toDate
      ? data.createdAt.toDate().getTime()
      : typeof data?.createdAt === 'number'
      ? data.createdAt
      : Date.now();
    return {
      ...data,
      ...(additionalData?.displayName ? { displayName: additionalData.displayName } : {}),
      ...(additionalData?.email ? { email: additionalData.email } : {}),
      createdAt: createdAtMs,
    } as UserProfile;
  }
  
  // Create new user profile; avoid writing literal 'User' as displayName
  const computedDisplayName =
    additionalData?.displayName ||
    user.displayName ||
    (additionalData?.email ? additionalData.email.split('@')[0] : undefined);

  const newProfile: {
    uid: string;
    email: string | null | undefined;
    photoURL: string | null | undefined;
    createdAt: unknown;
    membershipStatus: 'free';
    isPremium: boolean;
    authProvider: string;
    preferences: Record<string, unknown>;
    displayName?: string;
  } = {
    uid: user.uid,
    email: additionalData?.email || user.email,
    photoURL: additionalData?.photoURL || user.photoURL,
    createdAt: serverTimestamp(),
    membershipStatus: 'free' as const,
    isPremium: false,
    authProvider: additionalData?.authProvider || 'unknown',
    preferences: {},
  };
  if (computedDisplayName) {
    newProfile.displayName = computedDisplayName;
  }
  
  await setDoc(userDocRef, newProfile);
  return {
    ...(newProfile as unknown as Omit<UserProfile, 'createdAt'>),
    displayName: (computedDisplayName as string) || 'User',
    createdAt: Date.now(),
  } as unknown as UserProfile;
};

/**
 * Link anonymous account to social account
 */
export const linkAnonymousAccount = async (
  method: 'apple' | 'google'
): Promise<{ user: User; profile: UserProfile }> => {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  if (!currentUser || !currentUser.isAnonymous) {
    throw new Error('No anonymous user to link');
  }
  
  try {
    let credential;
    
    if (method === 'apple' && Platform.OS === 'ios') {
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });
      
      credential = AppleAuthProvider.credential(
        appleCredential.identityToken as string,
        undefined as unknown as string
      );
    } else if (method === 'google') {
      configureGoogleSignIn();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      credential = GoogleAuthProvider.credential(tokens.idToken);
    } else {
      throw new Error('Invalid authentication method');
    }
    
    // Link the anonymous account with the social credential
    const linkedUser = await linkWithCredential(currentUser, credential);
    
    // Update user profile
    const profile = await getOrCreateUserProfile(linkedUser.user, {
      authProvider: method,
    });
    
    return {
      user: linkedUser.user,
      profile,
    };
  } catch (error) {
    console.error('Account linking error:', error);
    throw error;
  }
};
