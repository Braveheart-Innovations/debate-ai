import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../store';
import { logout, setAuthUser, setUserProfile, setIsAnonymous } from '../../../store/authSlice';
import { ProfileAvatar } from '../../molecules/ProfileAvatar';
import { Typography } from '../../molecules/Typography';
import { Button } from '../../molecules/Button';
import { SettingRow } from '../../molecules/SettingRow';
import { EmailAuthForm } from '../../molecules/auth/EmailAuthForm';
import { SocialAuthProviders } from '../auth/SocialAuthProviders';
import { FreeTierCTA } from '../../molecules/profile/FreeTierCTA';
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
  const { userProfile, isPremium, isAuthenticated, isAnonymous } = useSelector((state: RootState) => state.auth);
  
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
        displayName: 'Guest User',
        photoURL: null,
        createdAt: new Date(),
        membershipStatus: 'free',
        preferences: {},
        authProvider: 'anonymous',
      }));
      dispatch(setIsAnonymous(true));
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

  // Handle anonymous users - show upgrade options
  if (isAnonymous) {
    return (
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.guestProfileSection}>
          <ProfileAvatar size={64} />
          <Typography 
            variant="title" 
            weight="semibold" 
            color="primary"
            style={styles.displayName}
          >
            Guest User
          </Typography>
          <Typography 
            variant="body" 
            color="secondary"
            style={styles.email}
          >
            Limited access - Sign in for full features
          </Typography>
        </View>

        {/* Upgrade CTA */}
        <View style={styles.upgradeSection}>
          <Typography 
            variant="heading" 
            weight="semibold" 
            color="primary"
            style={styles.upgradeTitle}
          >
            Create Your Account
          </Typography>
          <Typography 
            variant="body" 
            color="secondary"
            style={styles.upgradeSubtitle}
          >
            Sign in to save your debates, unlock all AI personalities, and access premium features
          </Typography>
        </View>

        {/* Social Auth Providers for upgrade */}
        <View style={styles.authProviders}>
          <SocialAuthProviders 
            onSuccess={onClose}
            onError={(error) => {
              Alert.alert('Upgrade Failed', error.message);
            }}
          />
        </View>

        {/* Email Sign Up Option */}
        <View style={styles.guestActions}>
          <Button
            title="Sign up with Email"
            onPress={() => {
              setAuthMode('signup');
              setShowAuthForm(true);
            }}
            variant="secondary"
            fullWidth
          />
        </View>

        {/* Settings Access */}
        <View style={[styles.guestSettingsSection, { backgroundColor: theme.colors.surface }]}>
          <SettingRow
            title="App Settings"
            subtitle="Manage app preferences"
            icon="settings-outline"
            onPress={handleSettingsPress}
            testID="guest-settings-button"
          />
        </View>
      </ScrollView>
    );
  }

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
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Get Started Section */}
        <View style={styles.getStartedSection}>
          <Typography 
            variant="heading" 
            weight="semibold" 
            color="primary"
            style={styles.getStartedTitle}
          >
            Get Started
          </Typography>
          <Typography 
            variant="body" 
            color="secondary"
            style={styles.getStartedSubtitle}
          >
            Sign in to Use Premium Features
          </Typography>
        </View>
        
        {/* Premium Feature Bubbles */}
        <View style={styles.premiumFeatures}>
          <View style={[styles.featureBubble, { backgroundColor: theme.colors.primary[50] }]}>
            <Typography variant="caption" weight="medium" color="primary">
              Customized Debates
            </Typography>
          </View>
          <View style={[styles.featureBubble, { backgroundColor: theme.colors.primary[50] }]}>
            <Typography variant="caption" weight="medium" color="primary">
              Chat with 3+ AIs
            </Typography>
          </View>
          <View style={[styles.featureBubble, { backgroundColor: theme.colors.primary[50] }]}>
            <Typography variant="caption" weight="medium" color="primary">
              Personality Types
            </Typography>
          </View>
          <View style={[styles.featureBubble, { backgroundColor: theme.colors.primary[50] }]}>
            <Typography variant="caption" weight="medium" color="primary">
              Comparison Mode
            </Typography>
          </View>
        </View>

        {/* Auth Card */}
        <View style={[styles.authCard, { backgroundColor: theme.colors.surface }]}>
          {/* Social Auth Providers - Native buttons */}
          <View style={styles.authProviderContainer}>
            <SocialAuthProviders onSuccess={onClose} />
          </View>

          {/* Email Sign In */}
          <View style={styles.authActions}>
            <Button
              title="Sign in with Email"
              onPress={() => {
                setAuthMode('signin');
                setShowAuthForm(true);
              }}
              variant="secondary"
              fullWidth
              style={styles.emailButton}
            />

            {/* Guest Option */}
            <Button
              title="Continue as Guest"
              onPress={handleAnonymousSignIn}
              variant="ghost"
              fullWidth
              loading={loading}
              style={styles.guestButton}
            />
          </View>
        </View>
        
        <Typography 
          variant="caption" 
          color="secondary"
          style={styles.disclaimer}
        >
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Typography>
      </ScrollView>
    );
  }

  const displayName = userProfile?.displayName || 'User';
  const email = userProfile?.email || '';

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Enhanced Profile Info */}
      <View style={[styles.profileCard, { backgroundColor: theme.colors.surface }]}>
        <LinearGradient
          colors={isPremium 
            ? ['rgba(255, 215, 0, 0.1)', 'rgba(255, 165, 0, 0.05)']
            : ['rgba(99, 102, 241, 0.1)', 'rgba(139, 92, 246, 0.05)']
          }
          style={styles.profileCardGradient}
        >
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <ProfileAvatar
                displayName={userProfile?.displayName}
                email={userProfile?.email}
                photoURL={userProfile?.photoURL}
                isPremium={isPremium}
                size={72}
              />
              {isPremium && (
                <View style={[styles.premiumIndicator, { backgroundColor: theme.colors.warning[500] }]}>
                  <Typography variant="caption" weight="bold" color="inverse">
                    ✨
                  </Typography>
                </View>
              )}
            </View>
            
            <View style={styles.profileInfo}>
              <Typography 
                variant="title" 
                weight="bold" 
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
              
              <View style={styles.membershipStatus}>
                {isPremium ? (
                  <View style={[styles.membershipBadge, styles.premiumBadge, { backgroundColor: theme.colors.warning[500] }]}>
                    <Typography 
                      variant="caption" 
                      weight="bold" 
                      color="inverse"
                    >
                      Premium Member ✨
                    </Typography>
                  </View>
                ) : (
                  <View style={[styles.membershipBadge, styles.freeBadge, { backgroundColor: theme.colors.primary[100] as string }]}>
                    <Typography 
                      variant="caption" 
                      weight="semibold" 
                      color="brand"
                    >
                      Free Member
                    </Typography>
                  </View>
                )}
              </View>
            </View>
          </View>
          
          {/* User Stats */}
          <View style={styles.userStats}>
            <View style={styles.statItem}>
              <Typography variant="title" weight="bold" color="primary">
                {Math.floor(Math.random() * 50) + 10}
              </Typography>
              <Typography variant="caption" color="secondary">
                Debates
              </Typography>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Typography variant="title" weight="bold" color="primary">
                {Math.floor(Math.random() * 200) + 50}
              </Typography>
              <Typography variant="caption" color="secondary">
                Messages
              </Typography>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Typography variant="title" weight="bold" color="primary">
                {isPremium ? '12' : '3'}
              </Typography>
              <Typography variant="caption" color="secondary">
                AI Models
              </Typography>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Premium CTA for free users */}
      {!isPremium && (
        <View style={styles.ctaSection}>
          <FreeTierCTA onPress={handleSubscriptionPress} />
        </View>
      )}

      {/* Enhanced Settings Section */}
      <View style={styles.settingsContainer}>
        <Typography 
          variant="heading" 
          weight="semibold" 
          color="primary"
          style={styles.sectionTitle}
        >
          Account & Settings
        </Typography>
        
        <View style={[styles.settingsCard, { backgroundColor: theme.colors.surface }]}>
          <SettingRow
            title="Account Settings"
            subtitle="Manage your account and preferences"
            icon="person-circle-outline"
            onPress={handleSettingsPress}
            testID="profile-settings-button"
          />
          
          <View style={[styles.settingDivider, { backgroundColor: theme.colors.border }]} />
          
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
      </View>

      {/* Sign Out */}
      <View style={styles.signOutSection}>
        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="secondary"
          style={styles.signOutButton}
          fullWidth
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  getStartedSection: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  getStartedTitle: {
    fontSize: 28,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  getStartedSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 16,
  },
  premiumFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  featureBubble: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 4,
  },
  featureHighlights: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  
  // Auth Card Styles
  authCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  authProviderContainer: {
    marginBottom: 16,
  },
  authActions: {
    gap: 12,
  },
  
  // Profile Card Styles
  profileCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  profileCardGradient: {
    padding: 24,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  premiumIndicator: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  profileInfo: {
    flex: 1,
  },
  membershipStatus: {
    marginTop: 8,
  },
  membershipBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  premiumBadge: {
    shadowColor: '#f59e0b',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  freeBadge: {
    // No additional shadow for free badge
  },
  userStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  statItem: {
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 16,
  },
  
  // Settings Styles
  settingsContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  settingsCard: {
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  settingDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60, // Align with setting text
  },
  
  // Legacy styles for guest/anonymous users
  guestProfileSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  guestActions: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  guestSettingsSection: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  upgradeSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  upgradeTitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  upgradeSubtitle: {
    textAlign: 'center',
  },
  authProviders: {
    paddingHorizontal: 20,
  },
  ctaSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  displayName: {
    fontSize: 20,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
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
  signOutSection: {
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
    marginTop: 4,
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
  emailButton: {
    // No additional styles
  },
  disclaimer: {
    textAlign: 'center',
    paddingHorizontal: 40,
    marginTop: 12,
    marginBottom: 8,
  },
});