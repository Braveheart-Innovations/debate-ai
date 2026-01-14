import React, { useState, useEffect, useMemo } from 'react';
import { ScrollView, View, StyleSheet, Alert, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import { Box } from '@/components/atoms';
import { Typography, GradientButton, Button } from '@/components/molecules';
import { Header, TrialTermsSheet } from '@/components/organisms';
import { UnlockEverythingBanner } from '@/components/organisms/subscription/UnlockEverythingBanner';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import { PurchaseService } from '@/services/iap/PurchaseService';
import type { PlanType } from '@/services/iap/products';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useStorePrices } from '@/hooks/useStorePrices';
import { RootState, showSheet } from '@/store';

export default function UpgradeScreen() {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [showTrialTerms, setShowTrialTerms] = useState(false);
  const { hasUsedTrial, isInTrial, trialDaysRemaining, isPremium, canStartTrial, refresh } = useFeatureAccess();
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const { monthly, annual, lifetime } = useStorePrices();

  // Dynamic plans array using localized prices from the store
  const plans = useMemo(() => [
    { id: 'monthly', title: 'Monthly', price: monthly.localizedPrice, period: '/mo', highlight: false },
    { id: 'annual', title: 'Annual', price: annual.localizedPrice, period: '/yr', highlight: true, badge: 'Save 30%' },
    { id: 'lifetime', title: 'Lifetime', price: lifetime.localizedPrice, period: '', highlight: false, badge: 'One-Time' },
  ], [monthly.localizedPrice, annual.localizedPrice, lifetime.localizedPrice]);

  // Listen for background purchase errors and show to user
  useEffect(() => {
    const unsubscribe = PurchaseService.onPurchaseError(({ message, isRecoverable }) => {
      // Refresh subscription status in case it actually succeeded
      refresh();

      if (isRecoverable) {
        Alert.alert(
          'Purchase Issue',
          `${message}\n\nYour payment may still be processing. Please wait a moment and check your subscription status.`,
          [
            { text: 'OK', style: 'default' },
            { text: 'Restore Purchases', onPress: () => PurchaseService.restorePurchases() },
          ]
        );
      } else {
        Alert.alert('Purchase Failed', message);
      }
    });

    return unsubscribe;
  }, [refresh]);

  // Determine header subtitle based on membership status
  const getHeaderSubtitle = () => {
    if (isPremium) return 'Manage your subscription';
    if (isInTrial && trialDaysRemaining !== null) return `${trialDaysRemaining} days left in trial`;
    if (hasUsedTrial) return 'Your trial has ended';
    return 'Start your 7‑day free trial';
  };

  // Determine the title based on membership status
  const getTitle = () => {
    if (isPremium) return 'Premium';
    if (hasUsedTrial) return 'Upgrade to Premium';
    return 'Unlock Premium';
  };

  // Handle "Start Trial" button tap - show terms first
  const handleStartTrialTap = () => {
    setShowTrialTerms(true);
  };

  // Handle accepting trial terms
  const handleAcceptTrialTerms = async () => {
    if (!isAuthenticated) {
      // Close terms sheet and open profile sheet for auth
      setShowTrialTerms(false);
      dispatch(showSheet({ sheet: 'profile' }));
      return;
    }

    // User is authenticated - proceed with trial purchase
    try {
      setLoadingPlan('trial');
      const result = await PurchaseService.purchaseSubscription('monthly');
      if (result.success) {
        setShowTrialTerms(false);
        Alert.alert('Success', 'Your free trial has started!');
        (navigation as unknown as { goBack: () => void }).goBack();
      } else if ('cancelled' in result && result.cancelled) {
        // User cancelled, keep terms sheet open
      } else {
        const message = 'userMessage' in result && result.userMessage
          ? result.userMessage
          : 'Could not start trial. Please try again.';
        Alert.alert('Trial Failed', message);
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setLoadingPlan(null);
    }
  };

  const onSubscribe = async (planId: string) => {
    // Check authentication first for all purchases
    if (!isAuthenticated) {
      dispatch(showSheet({ sheet: 'profile' }));
      return;
    }

    try {
      setLoadingPlan(planId);
      const result = await PurchaseService.purchaseSubscription(planId as PlanType);
      if (result.success) {
        Alert.alert('Success', 'Thank you for your purchase!');
        (navigation as unknown as { goBack: () => void }).goBack();
      } else if ('cancelled' in result && result.cancelled) {
        // User cancelled, do nothing
      } else {
        const message = 'userMessage' in result && result.userMessage
          ? result.userMessage
          : 'Purchase could not be completed. Please try again.';
        Alert.alert('Purchase Failed', message);
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <Box style={{ flex: 1 }} backgroundColor="background">
      <SafeAreaView style={{ flex: 1 }}>
        <Header
          variant="gradient"
          title={getTitle()}
          subtitle={getHeaderSubtitle()}
          showBackButton
          onBack={() => {
            try { (navigation as unknown as { goBack: () => void }).goBack(); } catch { /* noop */ }
          }}
          animated
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Trial ended message */}
          {hasUsedTrial && !isPremium && !isInTrial && (
            <View style={[styles.messageCard, { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: theme.colors.error[300] }]}>
              <Typography variant="body" weight="semibold" style={{ color: theme.colors.error[600] }}>
                Your free trial has ended
              </Typography>
              <Typography variant="caption" color="secondary" style={{ marginTop: 4 }}>
                Upgrade to Premium to continue enjoying all features.
              </Typography>
            </View>
          )}

          {/* Features */}
          <UnlockEverythingBanner />

          {/* Primary Trial CTA - only show if user can start trial */}
          {canStartTrial && (
            <View style={[
              styles.trialCard,
              {
                backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : theme.colors.primary[50] as string,
                borderColor: isDark ? theme.colors.primary[500] : theme.colors.primary[300]
              }
            ]}>
              <Typography variant="title" weight="bold" color="brand" style={{ textAlign: 'center' }}>
                Start 7-Day Free Trial
              </Typography>
              <Typography variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 4 }}>
                Then {monthly.localizedPrice}/month. Cancel anytime.
              </Typography>
              <GradientButton
                title={loadingPlan === 'trial' ? 'Starting...' : 'Start Free Trial'}
                onPress={handleStartTrialTap}
                gradient={theme.colors.gradients.primary}
                fullWidth
                style={{ marginTop: 16 }}
                disabled={loadingPlan !== null}
              />
            </View>
          )}

          {/* Separator */}
          {canStartTrial && (
            <View style={styles.separatorContainer}>
              <View style={[styles.separatorLine, { backgroundColor: theme.colors.border }]} />
              <Typography variant="caption" color="secondary" style={styles.separatorText}>
                Or choose a plan
              </Typography>
              <View style={[styles.separatorLine, { backgroundColor: theme.colors.border }]} />
            </View>
          )}

          {/* Pricing */}
          <Typography variant="subtitle" weight="bold" style={{ marginTop: canStartTrial ? 0 : theme.spacing.xl, marginBottom: theme.spacing.md }}>
            {canStartTrial ? 'Other Plans' : 'Choose a Plan'}
          </Typography>
          {plans.map((p) => (
            <View
              key={p.id}
              style={[styles.planCard, {
                borderColor: p.highlight ? theme.colors.primary[500] : theme.colors.border,
                backgroundColor: theme.colors.card,
              }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="subtitle" weight="bold">{p.title}</Typography>
                {p.badge && (
                  <View style={[styles.badge, { backgroundColor: theme.colors.primary[500] }]}>
                    <Typography variant="caption" color="inverse" weight="bold">{p.badge}</Typography>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
                <Typography variant="title" weight="bold">{p.price}</Typography>
                <Typography variant="caption" color="secondary" style={{ marginLeft: 6 }}>{p.period}</Typography>
              </View>
              <GradientButton
                title={loadingPlan === p.id ? 'Processing...' : (p.id === 'lifetime' ? 'Buy Now' : 'Subscribe Now')}
                onPress={() => onSubscribe(p.id)}
                gradient={theme.colors.gradients.primary}
                fullWidth
                style={{ marginTop: 12 }}
                disabled={loadingPlan !== null}
              />
            </View>
          ))}
          <Button
            title="Restore Purchases"
            onPress={async () => {
              try {
                setLoadingPlan('restore');
                const result = await PurchaseService.restorePurchases();
                if (result.success && result.restored) {
                  Alert.alert('Success', 'Your purchases have been restored.');
                  (navigation as unknown as { goBack: () => void }).goBack();
                } else if (result.success && !result.restored) {
                  Alert.alert('No Purchases', 'No previous purchases were found.');
                } else {
                  const message = 'userMessage' in result && result.userMessage
                    ? result.userMessage
                    : 'Could not restore purchases. Please try again.';
                  Alert.alert('Restore Failed', message);
                }
              } catch {
                Alert.alert('Error', 'An unexpected error occurred.');
              } finally {
                setLoadingPlan(null);
              }
            }}
            variant="ghost"
            fullWidth
            disabled={loadingPlan !== null}
          />

          {/* Compliance Disclaimer */}
          <View style={styles.disclaimerContainer}>
            <Typography variant="caption" color="secondary" style={styles.disclaimerText}>
              Subscriptions auto-renew unless canceled at least 24 hours before the end of the current period.
              Manage subscriptions in your device Settings.
            </Typography>
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={() => Linking.openURL('https://www.symposiumai.app/privacy')}>
                <Typography variant="caption" color="brand" weight="medium">
                  Privacy Policy
                </Typography>
              </TouchableOpacity>
              <Typography variant="caption" color="secondary"> | </Typography>
              <TouchableOpacity onPress={() => Linking.openURL('https://www.symposiumai.app/terms')}>
                <Typography variant="caption" color="brand" weight="medium">
                  Terms of Service
                </Typography>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Trial Terms Modal */}
      <TrialTermsSheet
        visible={showTrialTerms}
        onClose={() => setShowTrialTerms(false)}
        onAcceptTerms={handleAcceptTrialTerms}
        isAuthenticated={isAuthenticated}
        loading={loadingPlan === 'trial'}
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  messageCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  trialCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 24,
    marginBottom: 16,
  },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  separatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  separatorText: {
    marginHorizontal: 16,
  },
  planCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  disclaimerContainer: {
    marginTop: 24,
    paddingHorizontal: 8,
  },
  disclaimerText: {
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
});
