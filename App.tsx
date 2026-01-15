import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { store, RootState } from './src/store';
import { updateApiKeys, restoreVerificationData, restoreStats, restoreOnboarding } from './src/store';
import { settingsService } from './src/services/settings/SettingsService';
import AppNavigator from './src/navigation/AppNavigator';
import { AIServiceProvider } from './src/providers/AIServiceProvider';
import { CitationPreviewProvider } from './src/providers/CitationPreviewProvider';
import { ThemeProvider } from './src/theme';
import secureStorage from './src/services/secureStorage';
import VerificationPersistenceService from './src/services/VerificationPersistenceService';
import { StatsPersistenceService } from './src/services/stats';
import { initializeFirebase } from './src/services/firebase/config';
import { getFirestore, doc, onSnapshot, collection } from '@react-native-firebase/firestore';
import { onAuthStateChanged, toAuthUser } from './src/services/firebase/auth';
import { reload } from '@react-native-firebase/auth';
import { setAuthUser, setUserProfile } from './src/store';
import PurchaseService from './src/services/iap/PurchaseService';
import { CrashlyticsService } from './src/services/crashlytics';
import { ErrorBoundary } from './src/components/organisms/common/ErrorBoundary';
import { ToastContainer } from './src/components/organisms/common/ToastContainer';

function AppContent() {
  const dispatch = useDispatch();
  const debateStats = useSelector((state: RootState) => state.debateStats);

  useEffect(() => {
    let authUnsubscribe: (() => void) | undefined;
    let firestoreUnsubscribe: (() => void) | undefined;
    
    // Initialize app on startup
    const initializeApp = async () => {
      try {
        // Initialize Firebase first
        await initializeFirebase();
        console.log('Firebase initialized');

        // Initialize Crashlytics
        await CrashlyticsService.initialize();

        // Initialize IAP connection
        try {
          await PurchaseService.initialize();
          console.log('IAP initialized');
        } catch (e) {
          console.warn('IAP init failed, continuing without IAP:', e);
        }

        // Load persisted onboarding state (survives app updates)
        try {
          const hasOnboarded = await settingsService.loadOnboardingState();
          if (hasOnboarded) {
            dispatch(restoreOnboarding(true));
            console.log('Restored onboarding state: completed');
          }
        } catch (e) {
          console.warn('Failed to load onboarding state:', e);
        }

        // Set up auth state listener
        authUnsubscribe = onAuthStateChanged(async (user) => {
          // Clean up previous Firestore listener when auth changes
          if (firestoreUnsubscribe) {
            firestoreUnsubscribe();
            firestoreUnsubscribe = undefined;
          }

          if (user) {
            try {
              await reload(user);
            } catch (e) {
              console.warn('Auth user reload failed, continuing:', e);
            }
            dispatch(setAuthUser(toAuthUser(user)));

            // Set Crashlytics user ID for error tracking
            CrashlyticsService.setUserId(user.uid);

            const db = getFirestore();
            const userDocRef = doc(collection(db, 'users'), user.uid);

            // Set up REAL-TIME listener for user profile changes (including subscription status)
            firestoreUnsubscribe = onSnapshot(
              userDocRef,
              async (snapshot) => {
                if (snapshot.exists()) {
                  const profileData = snapshot.data();
                  // Normalize membershipStatus: convert legacy 'free' to 'demo'
                  let membershipStatus = profileData?.membershipStatus || 'demo';
                  if (membershipStatus === 'free') membershipStatus = 'demo';

                  dispatch(setUserProfile({
                    email: user.email,
                    displayName: profileData?.displayName || user.displayName || 'User',
                    photoURL: user.photoURL,
                    createdAt: profileData?.createdAt?.toDate
                      ? profileData.createdAt.toDate().getTime()
                      : typeof profileData?.createdAt === 'number'
                      ? profileData.createdAt
                      : Date.now(),
                    membershipStatus,
                    preferences: profileData?.preferences || {},
                  }));

                  CrashlyticsService.setAttributes({ membershipStatus });
                } else {
                  // Document doesn't exist - user was likely deleted
                  // Do NOT auto-create documents here; user creation happens in auth flows
                  console.log('User document does not exist - likely deleted, clearing auth state');
                  dispatch(setAuthUser(null));
                  dispatch(setUserProfile(null));
                  CrashlyticsService.setUserId(null);
                }
              },
              (error) => {
                const errorCode = (error as { code?: string })?.code;
                // Permission denied usually means the user was deleted - clear auth state
                if (errorCode === 'firestore/permission-denied') {
                  console.log('Firestore permission denied - user likely deleted, clearing auth');
                  dispatch(setAuthUser(null));
                  dispatch(setUserProfile(null));
                  CrashlyticsService.setUserId(null);
                  return;
                }
                console.error('Firestore profile listener error:', error);
                // Fallback profile so UI has data even if Firestore is unavailable
                dispatch(setUserProfile({
                  email: user.email,
                  displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
                  photoURL: user.photoURL,
                  createdAt: Date.now(),
                  membershipStatus: 'demo',
                  preferences: {},
                }));
                CrashlyticsService.setAttributes({ membershipStatus: 'demo' });
              }
            );

            console.log('User authenticated with Firebase:', user.uid);

            // Auto-restore subscriptions on app startup to sync with App Store/Play Store
            // This fixes users who updated the app but didn't have their subscription status synced
            try {
              const restoreResult = await PurchaseService.restorePurchases();
              if (restoreResult.restored) {
                console.log('Subscriptions restored on startup:', restoreResult.isLifetime ? 'lifetime' : 'subscription');
              } else if (restoreResult.success) {
                console.log('No active subscriptions to restore');
              }
            } catch (e) {
              console.warn('Subscription restore failed on startup:', e);
            }
          } else {
            // User signed out - clear all auth state
            dispatch(setAuthUser(null));
            dispatch(setUserProfile(null));
            CrashlyticsService.setUserId(null);
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

        // Load debate stats from storage
        const statsData = await StatsPersistenceService.loadStats();
        if (statsData) {
          dispatch(restoreStats({ stats: statsData.stats, history: statsData.history }));
          console.log('Loaded debate stats:', Object.keys(statsData.stats).length, 'AIs tracked');
        } else {
          console.log('No debate stats found');
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      }
    };

    initializeApp();
    
    // Cleanup function
    return () => {
      if (firestoreUnsubscribe) {
        firestoreUnsubscribe();
      }
      if (authUnsubscribe) {
        authUnsubscribe();
      }
      try {
        PurchaseService.cleanup();
      } catch {}
    };
  }, [dispatch]);

  // Persist debate stats to AsyncStorage whenever they change
  // This effect is in App.tsx so it's ALWAYS mounted (unlike useDebateVoting which unmounts)
  useEffect(() => {
    // Only save if there's actual data to persist
    if (Object.keys(debateStats.stats).length > 0 || debateStats.history.length > 0) {
      StatsPersistenceService.saveStats(debateStats.stats, debateStats.history);
      console.log('Saved debate stats:', Object.keys(debateStats.stats).length, 'AIs');
    }
  }, [debateStats.stats, debateStats.history]);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <CitationPreviewProvider>
          <AIServiceProvider>
            <AppNavigator />
            <ToastContainer />
            <StatusBar style="auto" />
          </AIServiceProvider>
        </CitationPreviewProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary level="fatal" showReportButton={true}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Provider store={store}>
          <AppContent />
        </Provider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
