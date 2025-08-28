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
import { getFirestore, doc, getDoc } from '@react-native-firebase/firestore';
import { onAuthStateChanged } from './src/services/firebase/auth';
import { setAuthUser, setUserProfile } from './src/store';

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
        
        // Set up auth state listener
        authUnsubscribe = onAuthStateChanged(async (user) => {
          if (user) {
            dispatch(setAuthUser(user));
            
            // Fetch user profile from Firestore
            try {
              const db = getFirestore();
              const userDocRef = doc(db, 'users', user.uid);
              const profileDoc = await getDoc(userDocRef);
              
              if (profileDoc.exists()) {
                const profileData = profileDoc.data();
                dispatch(setUserProfile({
                  email: user.email,
                  displayName: profileData?.displayName || user.displayName,
                  photoURL: user.photoURL,
                  createdAt: profileData?.createdAt?.toDate() || new Date(),
                  membershipStatus: profileData?.membershipStatus || 'free',
                  preferences: profileData?.preferences || {},
                }));
              }
            } catch (error) {
              console.error('Error fetching user profile:', error);
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
