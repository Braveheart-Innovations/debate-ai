import React, { useState } from 'react';
import { View, StyleSheet, Platform, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { Typography } from '../../molecules/Typography';
import { useTheme } from '../../../theme';
import { useDispatch } from 'react-redux';
import { 
  signInWithApple, 
  signInWithGoogle, 
  toAuthUser
} from '../../../services/firebase/auth';
import { setAuthUser, setUserProfile } from '../../../store/authSlice';

interface SocialAuthProvidersProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export const SocialAuthProviders: React.FC<SocialAuthProvidersProps> = ({
  onSuccess,
  onError,
}) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const [loadingProvider, setLoadingProvider] = useState<'apple' | 'google' | null>(null);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  const [isSimulator, setIsSimulator] = useState(false);

  // Check if Apple Authentication is available and if we're in simulator
  React.useEffect(() => {
    if (Platform.OS === 'ios') {
      // Check if running in simulator - Apple Sign In doesn't work in simulator
      const checkSimulator = async () => {
        try {
          // In simulator, isAvailableAsync returns false
          const isAvailable = await AppleAuthentication.isAvailableAsync();
          setAppleAuthAvailable(isAvailable);
          
          // Additional check: if we're in dev mode and Apple Auth is not available,
          // we're likely in simulator
          if (__DEV__ && !isAvailable) {
            setIsSimulator(true);
            console.warn('Running in iOS Simulator - Apple Sign-In unavailable');
          }
        } catch (error) {
          console.error('Error checking Apple Authentication availability:', error);
          setAppleAuthAvailable(false);
        }
      };
      checkSimulator();
    }
  }, []);

  const handleAppleSignIn = async () => {
    if (Platform.OS !== 'ios' || !appleAuthAvailable) return;
    
    setLoadingProvider('apple');
    try {
      const { user, profile } = await signInWithApple();
      dispatch(setAuthUser(toAuthUser(user)));
      dispatch(setUserProfile({
        email: profile.email,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        createdAt: profile.createdAt || Date.now(),
        membershipStatus: profile.membershipStatus,
        preferences: profile.preferences,
        authProvider: 'apple'
      }));
      onSuccess?.();
    } catch (error) {
      console.error('Apple Sign In error:', error);
      if (error instanceof Error && error.message !== 'User cancelled') {
        onError?.(error);
        Alert.alert('Sign In Failed', 'Unable to sign in with Apple. Please try again.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoadingProvider('google');
    try {
      const { user, profile } = await signInWithGoogle();
      dispatch(setAuthUser(toAuthUser(user)));
      dispatch(setUserProfile({
        email: profile.email,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        createdAt: profile.createdAt || Date.now(),
        membershipStatus: profile.membershipStatus,
        preferences: profile.preferences,
        authProvider: 'google'
      }));
      onSuccess?.();
    } catch (error) {
      console.error('Google Sign In error:', error);
      if (error instanceof Error && !error.message.toLowerCase().includes('cancel')) {
        onError?.(error);
        Alert.alert('Sign In', error.message || 'Unable to sign in with Google.');
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Show simulator notice in development */}
      {__DEV__ && isSimulator && Platform.OS === 'ios' && (
        <View style={[styles.devNotice, { backgroundColor: theme.colors.warning + '20' }]}>
          <Typography variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            📱 iOS Simulator Detected: Apple Sign-In unavailable in simulator.{'\n'}
            Use email sign-in or test on a real device.
          </Typography>
        </View>
      )}
      
      {/* Platform-specific ordering - Apple first on iOS */}
      {Platform.OS === 'ios' && appleAuthAvailable && !isSimulator && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={styles.appleButton}
          onPress={handleAppleSignIn}
        />
      )}
      
      {/* Google Sign In Button - Available on all platforms */}
      <GoogleSigninButton
        size={GoogleSigninButton.Size.Wide}
        color={GoogleSigninButton.Color.Dark}
        onPress={handleGoogleSignIn}
        disabled={loadingProvider !== null}
        style={styles.googleButton}
      />
      
      {/* Divider */}
      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
        <Typography variant="caption" color="secondary" style={styles.dividerText}>
          OR
        </Typography>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 16,
  },
  appleButton: {
    width: '100%',
    height: 48,
    marginVertical: 8,
  },
  googleButton: {
    width: '100%',
    height: 48,
    marginVertical: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
  },
  devNotice: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
});
