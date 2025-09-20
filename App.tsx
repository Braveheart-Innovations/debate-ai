// Test comment for CI pipeline verification
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider, useDispatch } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { store } from './src/store';
import { updateApiKeys, restoreVerificationData } from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import { AIServiceProvider } from './src/providers/AIServiceProvider';
import { ThemeProvider } from './src/theme';
import secureStorage from './src/services/secureStorage';
import VerificationPersistenceService from './src/services/VerificationPersistenceService';
import { initializeFirebase } from './src/services/firebase/config';
import { getFirestore, doc, getDoc, setDoc } from '@react-native-firebase/firestore';
import { onAuthStateChanged, toAuthUser } from './src/services/firebase/auth';
import { reload } from '@react-native-firebase/auth';
import { setAuthUser, setUserProfile } from './src/store';
import PurchaseService from './src/services/iap/PurchaseService';

function AppContent() {
  const dispatch = useDispatch();

  useEffect(() => {
    let authUnsubscribe: (() => void) | undefined;
    
    // Initialize app on startup
    const initializeApp = async () => {
      try {
        // Initialize Firebase first
        await initializeFirebase();
        console.log('Firebase initialized');
        
        // Initialize IAP connection
        try {
          await PurchaseService.initialize();
          console.log('IAP initialized');
        } catch (e) {
          console.warn('IAP init failed, continuing without IAP:', e);
        }

        // Set up auth state listener
        authUnsubscribe = onAuthStateChanged(async (user) => {
          if (user) {
            try {
              await reload(user);
            } catch (e) {
              console.warn('Auth user reload failed, continuing:', e);
            }
            dispatch(setAuthUser(toAuthUser(user)));
            
            // Fetch user profile from Firestore
            try {
              const db = getFirestore();
              const userDocRef = doc(db, 'users', user.uid);
              // Try once, and if unavailable, retry once after small delay
              let profileDoc = await getDoc(userDocRef);
              if (!profileDoc.exists()) {
                // No profile yet; allow UI to use fallback below
              }
              
              // If Firestore transient error occurred previously in sign-in flow, this may still fail
              
              if (profileDoc.exists()) {
                const profileData = profileDoc.data();
                // If the existing document has no displayName or a placeholder, patch it with a better fallback
                try {
                  const fallbackName = user.displayName || undefined;
                  const currentName = (profileData && (profileData as any).displayName) as
                    | string
                    | undefined;
                  if (fallbackName && (!currentName || currentName === 'User')) {
                    await setDoc(userDocRef, { displayName: fallbackName }, { merge: true });
                    (profileData as any).displayName = fallbackName;
                  }
                } catch (e) {
                  console.warn('Profile patch skipped:', e);
                }
                dispatch(setUserProfile({
                  email: user.email,
                  displayName: profileData?.displayName || user.displayName,
                  photoURL: user.photoURL,
                  createdAt: profileData?.createdAt?.toDate
                    ? profileData.createdAt.toDate().getTime()
                    : typeof profileData?.createdAt === 'number'
                    ? profileData.createdAt
                    : Date.now(),
                  membershipStatus: profileData?.membershipStatus || 'free',
                  preferences: profileData?.preferences || {},
                }));
              } else {
                // Create a minimal profile document so future loads have a stable source of truth
                const fallbackName = user.displayName || undefined;
                try {
                  await setDoc(
                    userDocRef,
                    {
                      email: user.email,
                      ...(fallbackName ? { displayName: fallbackName } : {}),
                      createdAt: new Date(),
                      membershipStatus: 'free',
                      preferences: {},
                    },
                    { merge: true }
                  );
                } catch (e) {
                  console.warn('Initial profile create skipped:', e);
                }
                dispatch(
                  setUserProfile({
                    email: user.email,
                    displayName: fallbackName || 'User',
                    photoURL: user.photoURL,
                    createdAt: Date.now(),
                    membershipStatus: 'free',
                    preferences: {},
                  })
                );
              }
            } catch (error) {
              console.error('Error fetching user profile:', error);
              // Fallback profile so UI has data even if Firestore is unavailable
              dispatch(setUserProfile({
                email: user.email,
                displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
                photoURL: user.photoURL,
                createdAt: Date.now(),
                membershipStatus: 'free',
                preferences: {},
              }));
            }
            
            console.log('User authenticated with Firebase:', user.uid);
          } else {
            // No user signed in, optionally sign in anonymously
            dispatch(setAuthUser(null));
            dispatch(setUserProfile(null));
          }
        });
        
        // Load stored API keys (BYOK - users' own keys stay on device)
        const storedKeys = await secureStorage.getApiKeys();
        if (storedKeys) {
          dispatch(updateApiKeys(storedKeys));
          console.log('Loaded API keys from secure storage:', Object.keys(storedKeys));
        } else {
          console.log('No stored API keys found');
        }

        // Load verification data
        const verificationData = await VerificationPersistenceService.loadVerificationData();
        if (verificationData) {
          // Update Redux store with persisted verification data
          dispatch(restoreVerificationData(verificationData));
          console.log('Loaded verification data:', verificationData.verifiedProviders);
        } else {
          console.log('No verification data found');
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      }
    };

    initializeApp();
    
    // Cleanup function
    return () => {
      if (authUnsubscribe) {
        authUnsubscribe();
      }
      try {
        PurchaseService.cleanup();
      } catch {}
    };
  }, [dispatch]);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AIServiceProvider>
          <AppNavigator />
          <StatusBar style="auto" />
        </AIServiceProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <AppContent />
      </Provider>
    </GestureHandlerRootView>
  );
}
