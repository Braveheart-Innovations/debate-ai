import { getApp } from '@react-native-firebase/app';
import { 
  getAuth, 
  connectAuthEmulator 
} from '@react-native-firebase/auth';
import { 
  getFirestore, 
  connectFirestoreEmulator,
  terminate,
  clearIndexedDbPersistence
} from '@react-native-firebase/firestore';
import firestore from '@react-native-firebase/firestore';

// Declare global type for emulator flag
declare global {
  var __FIREBASE_EMULATORS_CONNECTED__: boolean | undefined;
}

/**
 * Initialize Firebase services for authentication and user data only
 * API keys remain on device (BYOK model)
 */
export const initializeFirebase = async () => {
  // Firebase is automatically initialized from GoogleService-Info.plist and google-services.json
  // The app is already available via getApp()
  
  const db = getFirestore();
  
  // Configure Firestore settings for offline persistence and unlimited cache
  // NOTE: This uses the deprecated namespace API because React Native Firebase v23
  // doesn't have a modular replacement yet. This will trigger a warning but works correctly.
  // We NEED this for offline support and performance.
  await firestore().settings({
    persistence: true,
    cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
  });
  
  // Use emulators in development
  if (__DEV__) {
    // Only connect to emulators if not already connected
    if (!global.__FIREBASE_EMULATORS_CONNECTED__) {
      console.warn('Connecting to Firebase emulators...');
      // Auth emulator
      const auth = getAuth();
      connectAuthEmulator(auth, 'http://localhost:9099');
      
      // Firestore emulator
      await terminate(db);
      await clearIndexedDbPersistence(db);
      connectFirestoreEmulator(db, 'localhost', 8080);
      
      global.__FIREBASE_EMULATORS_CONNECTED__ = true;
    }
  }
  console.warn('Firebase initialized successfully (Auth & Firestore only)');
};

/**
 * Export commonly used Firebase instances
 */
export { getAuth, getFirestore, getApp };