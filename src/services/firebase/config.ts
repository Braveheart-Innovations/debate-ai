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
  
  // Use emulators in development (opt-in via env var)
  const wantEmulators =
    __DEV__ &&
    (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1' ||
      process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true');
  if (wantEmulators) {
    // Only connect to emulators if not already connected
    if (!global.__FIREBASE_EMULATORS_CONNECTED__) {
      try {
        console.warn('Checking Firebase emulator availability...');
        
        // Prefer 127.0.0.1 which works reliably in iOS Simulator
        const emulatorHost = '127.0.0.1';
        
        // Test if emulators are running by attempting a fetch
        const emulatorAvailable = await Promise.race([
          fetch(`http://${emulatorHost}:9099`).then(() => true).catch(() => false),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
        ]);
        
        if (emulatorAvailable) {
          console.warn('Firebase emulators detected, connecting...');
          
          // Auth emulator
          const auth = getAuth();
          connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
          
          // Firestore emulator
          await terminate(db);
          await clearIndexedDbPersistence(db);
          connectFirestoreEmulator(db, emulatorHost, 8080);
          
          global.__FIREBASE_EMULATORS_CONNECTED__ = true;
          console.warn('Successfully connected to Firebase emulators');
        } else {
          console.warn('Firebase emulators not available, using production Firebase');
          console.warn('To use emulators, run: firebase emulators:start');
        }
      } catch (error) {
        console.error('Error connecting to Firebase emulators:', error);
        console.warn('Falling back to production Firebase');
      }
    }
  }
  console.warn('Firebase initialized successfully (Auth & Firestore only)');
};

/**
 * Export commonly used Firebase instances
 */
export { getAuth, getFirestore, getApp };
