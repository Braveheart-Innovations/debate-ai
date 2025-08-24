import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, logout, setAuthUser, setUserProfile } from '../../../store';
import { ProfileAvatar } from '../../molecules/ProfileAvatar';
import { Typography } from '../../molecules/Typography';
import { Button } from '../../molecules/Button';
import { SettingRow } from '../../molecules/SettingRow';
import { EmailAuthForm } from '../../molecules/auth/EmailAuthForm';
import { useTheme } from '../../../theme';
import { 
  signOut, 
  signInWithEmail, 
  signUpWithEmail, 
  signInAnonymously 
} from '../../../services/firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from '@react-native-firebase/firestore';

interface ProfileContentProps {
  onClose: () => void;
  onSettingsPress?: () => void;
  onSubscriptionPress?: () => void;
}

export const ProfileContent: React.FC<ProfileContentProps> = ({
  onClose,
  onSettingsPress,
  onSubscriptionPress,
}) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const { userProfile, isPremium, isAuthenticated } = useSelector((state: RootState) => state.auth);
  
  // Auth state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (email: string, password: string) => {
    setLoading(true);
    try {
      let user;
      if (authMode === 'signup') {
        user = await signUpWithEmail(email, password);
        
        // Create user profile in Firestore
        const db = getFirestore();
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          email: user.email,
          displayName: user.displayName || email.split('@')[0],
          createdAt: new Date(),
          membershipStatus: 'free',
          preferences: {},
        });
      } else {
        user = await signInWithEmail(email, password);
      }
      
      // Fetch user profile
      const db = getFirestore();
      const userDocRef = doc(db, 'users', user.uid);
      const profileDoc = await getDoc(userDocRef);
      
      const profileData = profileDoc.data();
      
      dispatch(setAuthUser(user));
      dispatch(setUserProfile({
        email: user.email,
        displayName: profileData?.displayName || user.displayName,
        photoURL: user.photoURL,
        createdAt: profileData?.createdAt?.toDate() || new Date(),
        membershipStatus: profileData?.membershipStatus || 'free',
        preferences: profileData?.preferences || {},
      }));
      
      setShowAuthForm(false);
    } catch (error) {
      Alert.alert(
        'Authentication Error',
        error instanceof Error ? error.message : 'An error occurred during authentication'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    setLoading(true);
    try {
      const user = await signInAnonymously();
      dispatch(setAuthUser(user));
      dispatch(setUserProfile({
        email: null,
        displayName: 'Anonymous User',
        photoURL: null,
        createdAt: new Date(),
        membershipStatus: 'free',
        preferences: {},
      }));
    } catch {
      Alert.alert('Error', 'Failed to sign in anonymously');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      dispatch(logout());
      onClose();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleSubscriptionPress = () => {
    if (onSubscriptionPress) {
      onSubscriptionPress();
    } else {
      // Default behavior - navigate to subscription screen
      // TODO: Navigate to subscription screen
    }
    onClose();
  };

  const handleSettingsPress = () => {
    if (onSettingsPress) {
      onSettingsPress();
    } else {
      // Default behavior - navigate to settings
      // TODO: Navigate to settings
    }
    onClose();
  };

  if (!isAuthenticated) {
    if (showAuthForm) {
      return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <View style={styles.authHeader}>
            <Button
              title="← Back"
              onPress={() => setShowAuthForm(false)}
              variant="ghost"
              size="small"
            />
            <Typography variant="title" weight="semibold" color="primary">
              {authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </Typography>
            <View style={{ width: 60 }} />
          </View>
          
          <ScrollView style={styles.authFormContainer}>
            <EmailAuthForm
              mode={authMode}
              onSubmit={handleEmailAuth}
              loading={loading}
            />
            <View style={styles.authModeToggle}>
              <Typography variant="body" color="secondary">
                {authMode === 'signin' ? "Don't have an account?" : "Already have an account?"}
              </Typography>
              <Button
                title={authMode === 'signin' ? 'Sign Up' : 'Sign In'}
                onPress={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                variant="ghost"
                size="small"
              />
            </View>
          </ScrollView>
        </View>
      );
    }
    
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.profileSection}>
          <ProfileAvatar
            size={64}
            showPremiumIndicator={false}
          />
          <Typography 
            variant="title" 
            weight="semibold" 
            color="primary"
            style={styles.signInTitle}
          >
            Welcome to Symposium AI
          </Typography>
          <Typography 
            variant="body" 
            color="secondary"
            style={styles.signInSubtitle}
          >
            Sign in to save your conversations and unlock premium features
          </Typography>
        </View>

        <View style={styles.actions}>
          <Button
            title="Sign In with Email"
            onPress={() => {
              setAuthMode('signin');
              setShowAuthForm(true);
            }}
            variant="primary"
            style={styles.signInButton}
          />
          <Button
            title="Continue as Guest"
            onPress={handleAnonymousSignIn}
            variant="ghost"
            style={styles.guestButton}
            loading={loading}
          />
        </View>
      </View>
    );
  }

  const displayName = userProfile?.displayName || 'User';
  const email = userProfile?.email || '';

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Info */}
      <View style={styles.profileSection}>
        <ProfileAvatar
          displayName={userProfile?.displayName}
          email={userProfile?.email}
          photoURL={userProfile?.photoURL}
          isPremium={isPremium}
          size={64}
        />
        <Typography 
          variant="title" 
          weight="semibold" 
          color="primary"
          style={styles.displayName}
        >
          {displayName}
        </Typography>
        <Typography 
          variant="body" 
          color="secondary"
          style={styles.email}
        >
          {email}
        </Typography>
        {isPremium && (
          <View style={[styles.premiumBadge, { backgroundColor: theme.colors.primary[100] }]}>
            <Typography 
              variant="caption" 
              weight="semibold" 
              color="brand"
            >
              Premium Member
            </Typography>
          </View>
        )}
      </View>

      {/* Settings Rows */}
      <View style={[styles.settingsSection, { backgroundColor: theme.colors.surface }]}>
        {!isPremium && (
          <SettingRow
            title="Upgrade to Premium"
            subtitle="Unlock all features and remove limits"
            icon="star"
            iconColor={theme.colors.primary[500]}
            onPress={handleSubscriptionPress}
            testID="profile-subscription-button"
          />
        )}
        
        <SettingRow
          title="Account Settings"
          subtitle="Manage your account and preferences"
          icon="person-circle-outline"
          onPress={handleSettingsPress}
          testID="profile-settings-button"
        />
        
        <SettingRow
          title="Help & Support"
          subtitle="Get help and contact support"
          icon="help-circle-outline"
          onPress={() => {
            // TODO: Navigate to help
            onClose();
          }}
          testID="profile-help-button"
        />
      </View>

      {/* Sign Out */}
      <View style={styles.actions}>
        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="secondary"
          style={styles.signOutButton}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  displayName: {
    marginTop: 12,
    textAlign: 'center',
  },
  email: {
    marginTop: 4,
    textAlign: 'center',
  },
  premiumBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  signInTitle: {
    marginTop: 12,
    textAlign: 'center',
  },
  signInSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  settingsSection: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  signInButton: {
    marginTop: 8,
  },
  signOutButton: {
    // No additional styles needed
  },
  guestButton: {
    marginTop: 8,
  },
  authHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  authFormContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  authModeToggle: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 10,
  },
});