import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../store';
import { logout, setAuthUser, setUserProfile } from '../../../store/authSlice';
import type { RootStackParamList } from '@/types';
import { ProfileAvatar, Typography, Button, SettingRow, KeyboardAvoider } from '@/components/molecules';
import { EmailAuthForm } from '@/components/molecules/auth/EmailAuthForm';
import { SocialAuthProviders } from '../auth/SocialAuthProviders';
import { UnlockEverythingBanner } from '@/components/organisms/subscription/UnlockEverythingBanner';
import { useTheme } from '../../../theme';
import {
  signOut,
  signInWithEmail,
  signUpWithEmail,
  toAuthUser,
  sendCurrentUserEmailVerification,
  refreshCurrentUserEmailVerification,
  updateCurrentUserDisplayName
} from '../../../services/firebase/auth';
import { getFirestore, doc, getDoc } from '@react-native-firebase/firestore';
import { TrialBanner } from '@/components/molecules/subscription/TrialBanner';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useStorePrices } from '@/hooks/useStorePrices';
import { describePostTrialPricing } from '@/utils/subscriptionTerms';
import PurchaseService from '@/services/iap/PurchaseService';
import { deleteAccount } from '@/services/firebase/accountDeletion';
import { ErrorService } from '@/services/errors/ErrorService';
import { openSubscriptionManagement } from '@/services/subscription/subscriptionManagement';

interface ProfileContentProps {
  onClose: () => void;
}

export const ProfileContent: React.FC<ProfileContentProps> = ({
  onClose,
}) => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const dispatch = useDispatch();
  const { userProfile, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const access = useFeatureAccess();
  const { monthly } = useStorePrices();

  // Get trial duration from store prices (fetched from Google Play/App Store)
  const trialDuration = monthly.trial?.durationText || '1 week';
  const trialDays = monthly.trial?.durationDays || 7;

  // Calculate trial end date based on actual trial duration
  const trialEndDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + trialDays);
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }, [trialDays]);

  // Platform-specific cancel instructions
  const cancelInstructions = Platform.select({
    ios: 'Settings > Your Name > Subscriptions',
    android: 'Play Store > Account > Subscriptions',
  });

  // Auth state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [iapLoading, setIapLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(userProfile?.displayName || '');
  const [displayNameLoading, setDisplayNameLoading] = useState(false);
  const [displayNameEditing, setDisplayNameEditing] = useState(false);

  useEffect(() => {
    if (!displayNameEditing) {
      setDisplayNameDraft(userProfile?.displayName || '');
    }
  }, [displayNameEditing, userProfile?.displayName]);

  const handleEmailAuth = async (email: string, password: string) => {
    setLoading(true);
    try {
      let authUser;
      if (authMode === 'signup') {
        // signUpWithEmail already creates the user document in Firestore
        authUser = await signUpWithEmail(email, password);
        try {
          await sendCurrentUserEmailVerification();
          ErrorService.showInfo('Verification email sent. Verify your email before starting a free trial.', 'auth');
        } catch (verificationError) {
          ErrorService.handleSilent(verificationError, { action: 'sendEmailVerificationAfterSignup' });
          ErrorService.showInfo('Account created. Verify your email before starting a free trial.', 'auth');
        }
      } else {
        authUser = await signInWithEmail(email, password);
      }

      // Fetch user profile
      const db = getFirestore();
      const userDocRef = doc(db, 'users', authUser.uid);
      const profileDoc = await getDoc(userDocRef);

      const profileData = profileDoc.data();

      dispatch(setAuthUser(toAuthUser(authUser)));
      dispatch(setUserProfile({
        email: authUser.email,
        displayName: profileData?.displayName || authUser.displayName || email.split('@')[0],
        photoURL: authUser.photoURL,
        createdAt: profileData?.createdAt?.toDate
          ? profileData.createdAt.toDate().getTime()
          : typeof profileData?.createdAt === 'number'
          ? profileData.createdAt
          : Date.now(),
        membershipStatus: profileData?.membershipStatus || 'demo',
        preferences: profileData?.preferences || {},
        authProvider: profileData?.authProvider || 'email',
        emailVerified: authUser.emailVerified || profileData?.emailVerified === true,
      }));

      setShowAuthForm(false);
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'auth' });
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setVerificationLoading(true);
    try {
      await sendCurrentUserEmailVerification();
      ErrorService.showInfo('Verification email sent. Check your inbox, then return here.', 'auth');
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'auth' });
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleRefreshVerification = async () => {
    setVerificationLoading(true);
    try {
      const refreshedUser = await refreshCurrentUserEmailVerification();
      dispatch(setAuthUser(refreshedUser));
      if (refreshedUser?.emailVerified) {
        dispatch(setUserProfile(userProfile ? { ...userProfile, emailVerified: true } : null));
        ErrorService.showSuccess('Email verified.', 'auth');
      } else {
        ErrorService.showInfo('Email is not verified yet. Check the verification link and try again.', 'auth');
      }
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'auth' });
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleStartDisplayNameEdit = () => {
    setDisplayNameDraft(userProfile?.displayName || 'User');
    setDisplayNameEditing(true);
  };

  const handleCancelDisplayNameEdit = () => {
    setDisplayNameDraft(userProfile?.displayName || '');
    setDisplayNameEditing(false);
  };

  const handleSaveDisplayName = async () => {
    const trimmedDisplayName = displayNameDraft.trim();
    if (!trimmedDisplayName) {
      ErrorService.showInfo('Display name is required.', 'profile');
      return;
    }

    if (trimmedDisplayName === displayName.trim()) {
      setDisplayNameEditing(false);
      return;
    }

    setDisplayNameLoading(true);
    try {
      const updatedAuthUser = await updateCurrentUserDisplayName(trimmedDisplayName);
      dispatch(setAuthUser(updatedAuthUser));
      dispatch(setUserProfile(userProfile ? {
        ...userProfile,
        displayName: trimmedDisplayName,
      } : null));
      setDisplayNameDraft(trimmedDisplayName);
      setDisplayNameEditing(false);
      ErrorService.showSuccess('Display name updated.', 'profile');
    } catch (error) {
      ErrorService.handleWithToast(error, { feature: 'profile' });
    } finally {
      setDisplayNameLoading(false);
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
  const openSubscriptionScreen = () => {
    onClose();
    navigation.navigate('Subscription');
  };

  // App Settings link removed

  if (!isAuthenticated) {
    if (showAuthForm) {
      return (
        <KeyboardAvoider
          style={[styles.container, { backgroundColor: theme.colors.background }]}
        >
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

          <ScrollView
            style={styles.authFormContainer}
            keyboardShouldPersistTaps="handled"
          >
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
        </KeyboardAvoider>
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
  const trimmedDisplayNameDraft = displayNameDraft.trim();
  const displayNameUnchanged = trimmedDisplayNameDraft === displayName.trim();
  const canSaveDisplayName = Boolean(trimmedDisplayNameDraft) && !displayNameUnchanged && !displayNameLoading;

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
              {displayNameEditing ? (
                <View style={styles.displayNameEditRow}>
                  <TextInput
                    value={displayNameDraft}
                    onChangeText={setDisplayNameDraft}
                    accessibilityLabel="Display name"
                    placeholder="User"
                    placeholderTextColor={theme.colors.text.secondary}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="done"
                    maxLength={80}
                    editable={!displayNameLoading}
                    onSubmitEditing={handleSaveDisplayName}
                    style={[
                      styles.displayNameInlineInput,
                      {
                        borderColor: theme.colors.border,
                        color: theme.colors.text.primary,
                        backgroundColor: theme.colors.background,
                      },
                    ]}
                  />
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Save display name"
                    onPress={handleSaveDisplayName}
                    disabled={!canSaveDisplayName}
                    style={[
                      styles.displayNameIconButton,
                      {
                        backgroundColor: theme.colors.primary[500],
                        opacity: canSaveDisplayName ? 1 : 0.45,
                      },
                    ]}
                  >
                    {displayNameLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.text.inverse} />
                    ) : (
                      <Ionicons name="checkmark" size={18} color={theme.colors.text.inverse} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Cancel display name edit"
                    onPress={handleCancelDisplayNameEdit}
                    disabled={displayNameLoading}
                    style={[
                      styles.displayNameIconButton,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        opacity: displayNameLoading ? 0.45 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="close" size={18} color={theme.colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.displayNameRow}>
                  <Typography
                    variant="title"
                    weight="bold"
                    color="primary"
                    style={styles.displayName}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {displayName}
                  </Typography>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Edit display name"
                    onPress={handleStartDisplayNameEdit}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.editDisplayNameButton}
                  >
                    <Ionicons name="pencil-outline" size={17} color={theme.colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              )}
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

      {access.requiresEmailVerification && !access.isPremium && !access.isInTrial && (
        <View style={[styles.ctaSection, { backgroundColor: theme.colors.surface }]}>
          <SettingRow
            title="Verify email"
            subtitle="Verify your email address before starting a free trial."
            icon="mail-outline"
          />
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 12 }}>
            <Button
              title="Resend"
              onPress={handleResendVerification}
              variant="secondary"
              disabled={verificationLoading}
              style={{ flex: 1 }}
            />
            <Button
              title="I've verified"
              onPress={handleRefreshVerification}
              variant="primary"
              loading={verificationLoading}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      {/* Premium CTA for demo users who haven't used trial */}
      {access.canStartTrial && (
        <>
          {/* Start Trial button first */}
          <View style={styles.ctaSection}>
            <Button
              title={iapLoading ? 'Starting Trial…' : `Start ${trialDuration} Free Trial`}
              onPress={async () => {
                try {
                  setIapLoading(true);
                  const res = await PurchaseService.purchaseSubscription('monthly', { includeTrialOffer: true });
                  if (res.success) {
                    return;
                  } else if (!('cancelled' in res) || !res.cancelled) {
                    const msg = 'userMessage' in res && res.userMessage ? res.userMessage : 'Unable to start trial.';
                    ErrorService.showError(msg, 'subscription');
                  }
                } catch (_e) {
                  void _e;
                  ErrorService.showError('Failed to initiate purchase.', 'subscription');
                } finally {
                  setIapLoading(false);
                }
              }}
              variant="primary"
            />
            {/* Trial Terms Disclosure - Required for Play Store compliance */}
            <View style={[styles.trialTerms, { backgroundColor: theme.colors.surface }]}>
              <Typography variant="caption" color="secondary" style={styles.trialTermsText}>
                {trialDuration} free trial ends {trialEndDate}. Then {describePostTrialPricing(monthly, 'month')} unless canceled. Cancel anytime: {cancelInstructions}
              </Typography>
            </View>
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
          <Button
            title="Upgrade to Premium"
            onPress={openSubscriptionScreen}
            variant="primary"
            fullWidth
            style={styles.upgradeButton}
          />
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
                void openSubscriptionManagement();
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
  upgradeButton: {
    marginTop: 16,
  },
  trialTerms: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
  },
  trialTermsText: {
    textAlign: 'center',
    lineHeight: 18,
  },
  displayName: {
    flexShrink: 1,
    fontSize: 20,
  },
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 6,
    marginBottom: 4,
  },
  displayNameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  displayNameInlineInput: {
    flex: 1,
    minHeight: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 18,
    fontWeight: '700',
  },
  editDisplayNameButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayNameIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
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
