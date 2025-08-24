import { 
  getAuth,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  FirebaseAuthTypes
} from '@react-native-firebase/auth';
import { 
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from '@react-native-firebase/firestore';

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