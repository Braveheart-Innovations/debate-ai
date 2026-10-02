import { useEffect } from 'react';
import { LogBox, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';

// Suppress Reanimated v4 dev-mode worklet warnings
LogBox.ignoreLogs(['[Worklets] Tried to synchronously call a non-worklet function']);
import { Provider, useDispatch, useSelector } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { store, RootState } from './src/store';
import { updateApiKeys, restoreVerificationData, restoreStats, restoreOnboarding, setPrices, hydrateAISelection, hydrateCreateSelection } from './src/store';
import AISelectionPersistenceService from './src/services/home/AISelectionPersistenceService';
import CreateSelectionPersistenceService from './src/services/create/CreateSelectionPersistenceService';
import { loadPersistedPrices, fetchAndPersistPrices, FALLBACK_PRICES } from './src/services/prices/PricesPersistenceService';
import { settingsService } from './src/services/settings/SettingsService';
import AppNavigator from './src/navigation/AppNavigator';
import { AIServiceProvider } from './src/providers/AIServiceProvider';
import { CitationPreviewProvider } from './src/providers/CitationPreviewProvider';
import { ThemeProvider, useTheme } from './src/theme';
import secureStorage from './src/services/secureStorage';
import VerificationPersistenceService from './src/services/VerificationPersistenceService';
import { StatsPersistenceService } from './src/services/stats';
import { initializeFirebase } from './src/services/firebase/config';
import { getFirestore, doc, getDoc, onSnapshot, collection } from '@react-native-firebase/firestore';
import { onAuthStateChanged, toAuthUser } from './src/services/firebase/auth';
import { reload } from '@react-native-firebase/auth';
import { setAuthLoading, setAuthUser, setUserProfile } from './src/store';
import PurchaseService from './src/services/iap/PurchaseService';
import { CrashlyticsService } from './src/services/crashlytics';
import { ErrorBoundary } from './src/components/organisms/common/ErrorBoundary';
import { ToastContainer } from './src/components/organisms/common/ToastContainer';
import { AppPortalProvider } from './src/components/organisms/common/AppPortal';
import { PersonalityProvider } from './src/contexts/PersonalityContext';
import { logger } from './src/services/logging';

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
        logger.debug('Firebase initialized');

        // Initialize Crashlytics
        await CrashlyticsService.initialize();

        // Initialize IAP connection and load prices ONCE
        try {
          const isAndroidEmulator = Platform.OS === 'android' && !Device.isDevice;
          const iapResult = isAndroidEmulator
            ? { success: false as const, skipped: true }
            : await PurchaseService.initialize();

          if (iapResult.success) {
            logger.debug('IAP initialized');
          } else if (iapResult.skipped) {
            logger.debug('IAP skipped on Android emulator');
          } else {
            console.warn('IAP init failed, continuing without IAP:', iapResult.error);
          }

          // Load cached prices or fetch fresh if stale/missing
          const cachedPrices = await loadPersistedPrices();
          if (cachedPrices) {
            dispatch(setPrices({
              monthly: cachedPrices.monthly,
              annual: cachedPrices.annual,
              lifetime: cachedPrices.lifetime,
            }));
            logger.debug('Loaded cached prices');
          } else if (!iapResult.success) {
            dispatch(setPrices(FALLBACK_PRICES));
            logger.debug('Using fallback store prices');
          } else {
            const freshPrices = await fetchAndPersistPrices();
            dispatch(setPrices(freshPrices));
            logger.debug('Fetched fresh prices');
          }
        } catch (e) {
          console.warn('IAP init failed, continuing without IAP:', e);
        }

        // Load persisted onboarding state (survives app updates)
        try {
          const hasOnboarded = await settingsService.loadOnboardingState();
          if (hasOnboarded) {
            dispatch(restoreOnboarding(true));
            logger.debug('Restored onboarding state: completed');
          }
        } catch (e) {
          console.warn('Failed to load onboarding state:', e);
        }

        // Set up auth state listener
        authUnsubscribe = onAuthStateChanged(async (user) => {
          dispatch(setAuthLoading(true));

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
                  const authProvider =
                    profileData?.authProvider === 'email' ||
                    profileData?.authProvider === 'apple' ||
                    profileData?.authProvider === 'google'
                      ? profileData.authProvider
                      : undefined;

                  // Extract trialEndDate as milliseconds
                  let trialEndDate: number | null = null;
                  if (profileData?.trialEndDate) {
                    if (typeof profileData.trialEndDate.toMillis === 'function') {
                      trialEndDate = profileData.trialEndDate.toMillis();
                    } else if (typeof profileData.trialEndDate === 'number') {
                      trialEndDate = profileData.trialEndDate;
                    }
                  }

                  let hasUsedTrial = profileData?.hasUsedTrial === true;
                  if (!hasUsedTrial) {
                    try {
                      const trialHistoryDoc = await getDoc(doc(collection(db, 'trialHistory'), user.uid));
                      hasUsedTrial = trialHistoryDoc.exists();
                    } catch (e) {
                      console.warn('Failed to read trial history fallback:', e);
                    }
                  }

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
                    authProvider,
                    emailVerified: user.emailVerified || profileData?.emailVerified === true,
                    hasUsedTrial,
                    trialEndDate,
                  }));
                  dispatch(setAuthLoading(false));

                  CrashlyticsService.setAttributes({ membershipStatus });
                } else {
                  // Document doesn't exist - user was likely deleted
                  // Do NOT auto-create documents here; user creation happens in auth flows
                  logger.debug('User document does not exist - likely deleted, clearing auth state');
                  dispatch(setAuthUser(null));
                  dispatch(setUserProfile(null));
                  dispatch(setAuthLoading(false));
                  CrashlyticsService.setUserId(null);
                }
              },
              (error) => {
                const errorCode = (error as { code?: string })?.code;
                // Permission denied usually means the user was deleted - clear auth state
                if (errorCode === 'firestore/permission-denied') {
                  logger.debug('Firestore permission denied - user likely deleted, clearing auth');
                  dispatch(setAuthUser(null));
                  dispatch(setUserProfile(null));
                  dispatch(setAuthLoading(false));
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
                  emailVerified: user.emailVerified,
                }));
                dispatch(setAuthLoading(false));
                CrashlyticsService.setAttributes({ membershipStatus: 'demo' });
              }
            );

            console.warn('User authenticated with Firebase');

            // NOTE: Auto-restore removed - it was assigning purchases from OTHER Google accounts
            // to the currently logged-in Firebase user. This caused:
            // 1. New users inheriting subscriptions from previous device users
            // 2. Google Play review failures due to inconsistent behavior
            // Users can manually tap "Restore Purchases" on the paywall if needed.
          } else {
            // User signed out - clear all auth state
            dispatch(setAuthUser(null));
            dispatch(setUserProfile(null));
            dispatch(setAuthLoading(false));
            CrashlyticsService.setUserId(null);
          }
        });
        
        // Load stored API keys (BYOK - users' own keys stay on device)
        const storedKeys = await secureStorage.getApiKeys();
        if (storedKeys) {
          dispatch(updateApiKeys(storedKeys));
          logger.debug('Loaded API keys from secure storage', { providers: Object.keys(storedKeys) });
        } else {
          logger.debug('No stored API keys found');
        }

        // Load verification data
        const verificationData = await VerificationPersistenceService.loadVerificationData();
        if (verificationData) {
          // Update Redux store with persisted verification data
          dispatch(restoreVerificationData(verificationData));
          logger.debug('Loaded verification data', { verifiedProviders: verificationData.verifiedProviders });
        } else {
          logger.debug('No verification data found');
        }

        // Load persisted composer AI selection (chat/compare pills).
        // Always dispatch so `hydrated` flips even on first run.
        const persistedSelection = await AISelectionPersistenceService.load();
        dispatch(hydrateAISelection(persistedSelection ?? { chat: [], compare: [] }));

        // Load persisted Studio composer selection (Create pills + options).
        const persistedCreateSelection = await CreateSelectionPersistenceService.load();
        dispatch(hydrateCreateSelection(persistedCreateSelection));

        // Load debate stats from storage
        const statsData = await StatsPersistenceService.loadStats();
        if (statsData) {
          dispatch(restoreStats({ stats: statsData.stats, history: statsData.history }));
          logger.debug('Loaded debate stats', { aisTracked: Object.keys(statsData.stats).length });
        } else {
          logger.debug('No debate stats found');
        }
      } catch (error) {
        console.error('Error initializing app:', error);
        dispatch(setAuthLoading(false));
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
      } catch (error) {
        logger.warn('IAP cleanup failed on unmount', { error: String(error) });
      }
    };
  }, [dispatch]);

  // Persist debate stats to AsyncStorage whenever they change
  // This effect is in App.tsx so it's ALWAYS mounted (unlike useDebateVoting which unmounts)
  useEffect(() => {
    // Only save if there's actual data to persist
    if (Object.keys(debateStats.stats).length > 0 || debateStats.history.length > 0) {
      StatsPersistenceService.saveStats(debateStats.stats, debateStats.history);
      logger.debug('Saved debate stats', { ais: Object.keys(debateStats.stats).length });
    }
  }, [debateStats.stats, debateStats.history]);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedAppSurface />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedAppSurface() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <AppPortalProvider>
        <PersonalityProvider>
          <CitationPreviewProvider>
            <AIServiceProvider>
              <AppNavigator />
              <ToastContainer />
              <StatusBar style="light" />
            </AIServiceProvider>
          </CitationPreviewProvider>
        </PersonalityProvider>
      </AppPortalProvider>
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary level="fatal" showReportButton={true}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <Provider store={store}>
            <AppContent />
          </Provider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
