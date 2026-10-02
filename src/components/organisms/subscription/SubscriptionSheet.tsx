import React, { useState, useMemo } from "react";
import { View, ScrollView, Platform } from "react-native";
import { SheetHeader } from "@/components/molecules/sheets/SheetHeader";
import { UnlockEverythingBanner } from "@/components/organisms/subscription/UnlockEverythingBanner";
import { GradientButton, Button, Typography } from "@/components/molecules";
import { useTheme } from "@/theme";
import { PurchaseService } from "@/services/iap/PurchaseService";
import { useStorePrices } from "@/hooks/useStorePrices";
import { describeRenewal, firstChargePrice } from "@/utils/subscriptionTerms";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { ENABLED_API_CONFIG_PROVIDER_COUNT } from "@/config/apiConfigProviders";
import { ErrorService } from "@/services/errors/ErrorService";

interface SubscriptionSheetProps {
  onClose: () => void;
}

export const SubscriptionSheet: React.FC<SubscriptionSheetProps> = ({
  onClose,
}) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const { monthly } = useStorePrices();
  const { canStartTrial } = useFeatureAccess();

  // Get trial duration from store prices (fetched from Google Play/App Store)
  const trialDuration = monthly.trial?.durationText || '1 week';
  const trialDays = monthly.trial?.durationDays || 7;

  // Calculate trial end date based on actual trial duration
  const trialEndDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + trialDays);
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }, [trialDays]);

  const cancelInstructions = Platform.select({
    ios: 'Settings > Your Name > Subscriptions',
    android: 'Play Store > Account > Subscriptions',
  });

  const handleStartTrial = async () => {
    try {
      setLoading(true);
      const result = await PurchaseService.purchaseSubscription("monthly", { includeTrialOffer: canStartTrial });
      if (result.success) {
        return;
      } else if (!('cancelled' in result) || !result.cancelled) {
        const message = 'userMessage' in result && result.userMessage
          ? result.userMessage
          : 'Purchase could not be completed. Please try again.';
        ErrorService.showError(message, 'subscription');
      }
    } catch {
      ErrorService.showError('Purchase could not be completed. Please try again.', 'subscription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SheetHeader title="Unlock Premium" onClose={onClose} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        <Typography
          variant="body"
          color="secondary"
          style={{ marginBottom: 16 }}
        >
          {canStartTrial ? `Start your ${trialDuration} free trial` : 'Subscribe to Premium'} and unlock all premium features across{' '}
          {ENABLED_API_CONFIG_PROVIDER_COUNT} supported AI providers with your own API keys.
        </Typography>

        {canStartTrial && (
          <View style={{
            backgroundColor: theme.colors.surface,
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}>
            <Typography variant="body" weight="semibold" style={{ marginBottom: 8 }}>
              Trial Terms
            </Typography>
            <Typography variant="caption" color="secondary" style={{ marginBottom: 4 }}>
              {'\u2022'} Payment method required to start trial
            </Typography>
            <Typography variant="caption" color="secondary" style={{ marginBottom: 4 }}>
              {'\u2022'} {trialDuration} free trial ends on {trialEndDate}
            </Typography>
            <Typography variant="caption" color="secondary" style={{ marginBottom: 4 }}>
              {'\u2022'} First charge: {firstChargePrice(monthly)} on {trialEndDate} unless canceled
            </Typography>
            <Typography variant="caption" color="secondary" style={{ marginBottom: 4 }}>
              {'\u2022'} {describeRenewal(monthly, 'month')}
            </Typography>
            <Typography variant="caption" color="secondary">
              {'\u2022'} Cancel anytime: {cancelInstructions}
            </Typography>
          </View>
        )}

        <UnlockEverythingBanner />
        <GradientButton
          title={loading ? "Processing…" : canStartTrial ? `Start ${trialDuration} Free Trial` : "Subscribe Now"}
          onPress={handleStartTrial}
          gradient={theme.colors.gradients.primary}
          fullWidth
          disabled={loading}
        />
        <Button
          title="Maybe later"
          onPress={onClose}
          variant="ghost"
          fullWidth
        />
      </ScrollView>
    </View>
  );
};

export default SubscriptionSheet;
