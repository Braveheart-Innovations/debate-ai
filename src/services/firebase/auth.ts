import { 
  getAuth,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  FirebaseAuthTypes,
  signInWithCredential,
  OAuthProvider,
  GoogleAuthProvider,
  linkWithCredential
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
    const credential = await signInWithEmailAndPassword(auth, email, password);
    console.warn('User signed in:', credential.user.uid);
    return credential.user;
  } catch (error) {
    console.error('Email sign in error:', error);
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
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const user = credential.user;
    
    // Create user document in Firestore
    const db = getFirestore();
    const usersCollection = collection(db, 'users');
    const userDoc = doc(usersCollection, user.uid);
    
    await setDoc(userDoc, {
      email: user.email,
      createdAt: serverTimestamp(),
      isPremium: false,
    });
    
    console.warn('User created:', user.uid);
    return user;
  } catch (error) {
    console.error('Sign up error:', error);
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
    return await user.getIdToken();
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
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '', // From Firebase Console
    offlineAccess: true,
    hostedDomain: '',
    forceCodeForRefreshToken: true,
    accountName: '',
  });
};

/**
 * Sign in with Apple
 */
interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: unknown;
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
    // Start Apple authentication
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
    });

    // Create an OAuth provider credential
    const auth = getAuth();
    const provider = new OAuthProvider('apple.com');
    const oAuthCredential = provider.credential({
      idToken: credential.identityToken!,
      rawNonce: credential.authorizationCode,
    });

    // Sign in with Firebase
    const userCredential = await signInWithCredential(auth, oAuthCredential);
    
    // Get or create user profile
    const profile = await getOrCreateUserProfile(userCredential.user, {
      displayName: credential.fullName 
        ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
        : null,
      email: credential.email,
      authProvider: 'apple',
    });
    
    return {
      user: userCredential.user,
      profile,
    };
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      throw new Error('User cancelled');
    }
    console.error('Apple Sign In error:', error);
    throw error;
  }
};

/**
 * Sign in with Google
 */
export const signInWithGoogle = async (): Promise<{ user: User; profile: UserProfile }> => {
  try {
    // Configure Google Sign In if not already done
    configureGoogleSignIn();
    
    // Check if Google Play Services are available (Android)
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    
    // Sign in with Google
    await GoogleSignin.signIn();
    const tokens = await GoogleSignin.getTokens();
    
    // Create a Google credential with the token
    const googleCredential = GoogleAuthProvider.credential(tokens.idToken);
    
    // Sign in with Firebase
    const auth = getAuth();
    const userCredential = await signInWithCredential(auth, googleCredential);
    
    // Get current Google user info
    const currentUser = await GoogleSignin.getCurrentUser();
    
    // Get or create user profile
    const profile = await getOrCreateUserProfile(userCredential.user, {
      displayName: currentUser?.user.name || userCredential.user.displayName,
      email: currentUser?.user.email || userCredential.user.email,
      photoURL: currentUser?.user.photo || userCredential.user.photoURL,
      authProvider: 'google',
    });
    
    return {
      user: userCredential.user,
      profile,
    };
  } catch (error) {
    if ((error as { code?: string }).code === 'SIGN_IN_CANCELLED') {
      throw new Error('User cancelled');
    }
    console.error('Google Sign In error:', error);
    throw error;
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
    return userDoc.data() as UserProfile;
  }
  
  // Create new user profile
  const newProfile = {
    uid: user.uid,
    email: additionalData?.email || user.email,
    displayName: additionalData?.displayName || user.displayName || 'User',
    photoURL: additionalData?.photoURL || user.photoURL,
    createdAt: serverTimestamp(),
    membershipStatus: 'free',
    isPremium: false,
    authProvider: additionalData?.authProvider || 'unknown',
    preferences: {},
  };
  
  await setDoc(userDocRef, newProfile);
  return newProfile;
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
      
      const provider = new OAuthProvider('apple.com');
      credential = provider.credential({
        idToken: appleCredential.identityToken!,
        rawNonce: appleCredential.authorizationCode,
      });
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