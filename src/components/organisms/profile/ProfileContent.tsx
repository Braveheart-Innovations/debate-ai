import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Linking, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../store';
import { logout, setAuthUser, setUserProfile } from '../../../store/authSlice';
import { ProfileAvatar, Typography, Button, SettingRow } from '@/components/molecules';
import { EmailAuthForm } from '@/components/molecules/auth/EmailAuthForm';
import { SocialAuthProviders } from '../auth/SocialAuthProviders';
import { UnlockEverythingBanner } from '@/components/organisms/subscription/UnlockEverythingBanner';
import { useTheme } from '../../../theme';
import {
  signOut,
  signInWithEmail,
  signUpWithEmail,
  toAuthUser
} from '../../../services/firebase/auth';
import { getFirestore, doc, getDoc } from '@react-native-firebase/firestore';
import { TrialBanner } from '@/components/molecules/subscription/TrialBanner';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import PurchaseService from '@/services/iap/PurchaseService';
import { deleteAccount } from '@/services/firebase/accountDeletion';
import { ErrorService } from '@/services/errors/ErrorService';

interface ProfileContentProps {
  onClose: () => void;
}

export const ProfileContent: React.FC<ProfileContentProps> = ({
  onClose,
}) => {
  const { theme, isDark } = useTheme();
  const dispatch = useDispatch();
  const { userProfile, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const access = useFeatureAccess();

  // Auth state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [iapLoading, setIapLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleEmailAuth = async (email: string, password: string) => {
    setLoading(true);
    try {
      let user;
      if (authMode === 'signup') {
        // signUpWithEmail already creates the user document in Firestore
        user = await signUpWithEmail(email, password);
      } else {
        user = await signInWithEmail(email, password);
      }

      // Fetch user profile
      const db = getFirestore();
      const userDocRef = doc(db, 'users', user.uid);
      const profileDoc = await getDoc(userDocRef);

      const profileData = profileDoc.data();

      dispatch(setAuthUser(toAuthUser(user)));
      dispatch(setUserProfile({
        email: user.email,
        displayName: profileData?.displayName || user.displayName || email.split('@')[0],
        photoURL: user.photoURL,
        createdAt: profileData?.createdAt?.toDate
          ? profileData.createdAt.toDate().getTime()
          : typeof profileData?.createdAt === 'number'
          ? profileData.createdAt
          : Date.now(),
        membershipStatus: profileData?.membershipStatus || 'demo',
        preferences: profileData?.preferences || {},
      }));

      setShowAuthForm(false);
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'auth' });
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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.\n\nAre you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            setDeleteLoading(true);
            try {
              const result = await deleteAccount();
              if (result.success) {
                ErrorService.showSuccess('Your account has been permanently deleted.', 'account');
                dispatch(logout());
                onClose();
              } else if (result.requiresRecentLogin) {
                ErrorService.showInfo('For security, please sign out and sign back in before deleting your account.', 'account');
              } else {
                ErrorService.handleWithToast(new Error(result.message || 'Failed to delete account. Please try again.'), { feature: 'account' });
              }
            } catch (error) {
              ErrorService.handleWithToast(error, { feature: 'account' });
              console.error('Delete account error:', error);
            } finally {
              setDeleteLoading(false);
            }
          },
        },
      ]
    );
  };

  // Subscription navigation handled by Account Settings actions; no sheet close side-effects

  // App Settings link removed

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
          {(() => {
            const bubbleStyle = isDark
              ? { backgroundColor: theme.colors.overlays.medium, borderWidth: 1, borderColor: theme.colors.primary[500] }
              : { backgroundColor: theme.colors.primary[50], borderWidth: 1, borderColor: theme.colors.primary[200] };
            return (
              <>
                <View style={[styles.featureBubble, bubbleStyle]}>
                  <Typography variant="caption" weight="medium" color="brand">
                  Customized Debates
                  </Typography>
                </View>
                <View style={[styles.featureBubble, bubbleStyle]}>
                  <Typography variant="caption" weight="medium" color="brand">
                  Chat with 3+ AIs
                  </Typography>
                </View>
                <View style={[styles.featureBubble, bubbleStyle]}>
                  <Typography variant="caption" weight="medium" color="brand">
                  Personality Types
                  </Typography>
                </View>
                <View style={[styles.featureBubble, bubbleStyle]}>
                  <Typography variant="caption" weight="medium" color="brand">
                  Comparison Mode
                  </Typography>
                </View>
              </>
            );
          })()}
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
          </View>
        </View>
        
        <Typography 
          variant="caption" 
          color="secondary"
          style={styles.disclaimer}
        >
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Typography>

        {/* Account Settings (signed-out view) */}
        <View style={styles.settingsContainer}>
          <Typography 
            variant="heading" 
            weight="semibold" 
            color="primary"
            style={styles.sectionTitle}
          >
            Account Settings
          </Typography>
          <View style={[styles.settingsCard, { backgroundColor: theme.colors.surface }]}>
            <SettingRow
              title="Membership"
              subtitle={'Demo — Limited access'}
              icon="card-outline"
            />
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Button
                title="Sign in to start trial"
                onPress={() => {
                  setAuthMode('signup');
                  setShowAuthForm(true);
                }}
                variant="primary"
              />
            </View>
            {/* App Settings link removed */}
          </View>
        </View>
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
          colors={(access.isPremium || access.isInTrial)
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
                isPremium={access.isPremium || access.isInTrial}
                size={72}
                showPremiumIndicator={false}
              />
              {(access.isPremium || access.isInTrial) && (
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
                {access.isInTrial ? (
                  <View style={[styles.membershipBadge, styles.trialBadge, { backgroundColor: theme.colors.info[500] }]}>
                    <Typography variant="caption" weight="bold" color="inverse">
                      Trial — {access.trialDaysRemaining ?? 0} day{access.trialDaysRemaining === 1 ? '' : 's'} left
                    </Typography>
                  </View>
                ) : access.isPremium ? (
                  <View style={[styles.membershipBadge, styles.premiumBadge, { backgroundColor: theme.colors.warning[500] }]}>
                    <Typography variant="caption" weight="bold" color="inverse">Premium Member ✨</Typography>
                  </View>
                ) : (
                  <View style={[styles.membershipBadge, styles.freeBadge, { backgroundColor: theme.colors.primary[100] as string }]}>
                    <Typography variant="caption" weight="semibold" color="brand">Demo Member</Typography>
                  </View>
                )}
              </View>
            </View>
          </View>
          
          {/* Stats removed until tracked in app data */}
        </LinearGradient>
      </View>

      {/* Premium CTA for demo users who haven't used trial */}
      {access.canStartTrial && (
        <>
          {/* Start Trial button first */}
          <View style={styles.ctaSection}>
            <Button
              title={iapLoading ? 'Starting Trial…' : 'Start 7‑Day Free Trial'}
              onPress={async () => {
                try {
                  setIapLoading(true);
                  const res = await PurchaseService.purchaseSubscription('monthly');
                  if (res.success) {
                    ErrorService.showSuccess('Your trial is starting (pending store confirmation).', 'subscription');
                    await access.refresh();
                  } else if (!('cancelled' in res) || !res.cancelled) {
                    const msg = 'userMessage' in res && res.userMessage ? res.userMessage : 'Unable to start trial.';
                    ErrorService.handleWithToast(new Error(msg), { feature: 'subscription' });
                  }
                } catch (_e) {
                  void _e;
                  ErrorService.handleWithToast(new Error('Failed to initiate purchase.'), { feature: 'subscription' });
                } finally {
                  setIapLoading(false);
                }
              }}
              variant="primary"
            />
          </View>

          {/* Then Unlock Everything banner */}
          <View style={styles.ctaSection}>
            <UnlockEverythingBanner />
          </View>
        </>
      )}

      {/* Trial banner */}
      {access.isInTrial && <TrialBanner />}

      {/* Upgrade CTA for demo users who have already used trial */}
      {access.isDemo && access.hasUsedTrial && (
        <View style={styles.ctaSection}>
          <UnlockEverythingBanner />
        </View>
      )}

      {/* Account Settings Section */}
      <View style={styles.settingsContainer}>
        <Typography 
          variant="heading" 
          weight="semibold" 
          color="primary"
          style={styles.sectionTitle}
        >
          Account Settings
        </Typography>

        <View style={[styles.settingsCard, { backgroundColor: theme.colors.surface }]}>
          <SettingRow
            title="Membership"
            subtitle={
              access.isInTrial && access.trialDaysRemaining != null
                ? `Trial — ${access.trialDaysRemaining} day${access.trialDaysRemaining === 1 ? '' : 's'} left`
                : access.isPremium
                ? 'Premium — Full access'
                : 'Demo — Limited access'
            }
            icon="card-outline"
          />

          {/* Start Trial moved above Unlock Everything */}

          {(access.isInTrial || access.isPremium) && (
            <SettingRow
              title="Manage Subscription"
              subtitle={Platform.OS === 'ios' ? 'Open App Store subscriptions' : 'Open Play Store subscriptions'}
              icon="open-outline"
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('https://apps.apple.com/account/subscriptions');
                } else {
                  Linking.openURL('https://play.google.com/store/account/subscriptions?package=com.braveheartinnovations.debateai');
                }
              }}
            />
          )}

          <SettingRow
            title="Restore Purchases"
            subtitle="Re-sync your subscription"
            icon="refresh-outline"
            onPress={async () => {
              try {
                setIapLoading(true);
                const res = await PurchaseService.restorePurchases();
                if (res.success && res.restored) {
                  ErrorService.showSuccess('Your subscription was restored.', 'subscription');
                  await access.refresh();
                } else {
                  ErrorService.showInfo('No active subscriptions found.', 'subscription');
                }
              } catch (_e) {
                void _e;
                ErrorService.handleWithToast(new Error('Unable to restore purchases.'), { feature: 'subscription' });
              } finally {
                setIapLoading(false);
              }
            }}
          />

          {/* App Settings link removed */}
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

      {/* Delete Account */}
      <View style={styles.deleteAccountSection}>
        <Button
          title={deleteLoading ? 'Deleting...' : 'Delete Account'}
          onPress={handleDeleteAccount}
          variant="ghost"
          fullWidth
          disabled={deleteLoading}
          style={styles.deleteAccountButton}
        />
        <Typography variant="caption" color="secondary" style={styles.deleteAccountWarning}>
          Permanently delete your account and all data
        </Typography>
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
  trialBadge: {
    shadowColor: '#3b82f6',
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
  deleteAccountSection: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  deleteAccountButton: {
    opacity: 0.7,
  },
  deleteAccountWarning: {
    marginTop: 8,
    textAlign: 'center',
  },
});
