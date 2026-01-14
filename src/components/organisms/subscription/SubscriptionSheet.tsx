import React, { useState } from "react";
import { View, ScrollView, Platform } from "react-native";
import { SheetHeader } from "@/components/molecules/sheets/SheetHeader";
import { UnlockEverythingBanner } from "@/components/organisms/subscription/UnlockEverythingBanner";
import { GradientButton, Button, Typography } from "@/components/molecules";
import { useTheme } from "@/theme";
import { PurchaseService } from "@/services/iap/PurchaseService";
import { useStorePrices } from "@/hooks/useStorePrices";

interface SubscriptionSheetProps {
  onClose: () => void;
}

export const SubscriptionSheet: React.FC<SubscriptionSheetProps> = ({
  onClose,
}) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const { monthly } = useStorePrices();

  const cancelInstructions = Platform.select({
    ios: 'Settings > Your Name > Subscriptions',
    android: 'Play Store > Account > Subscriptions',
  });

  const handleStartTrial = async () => {
    try {
      setLoading(true);
      await PurchaseService.purchaseSubscription("monthly");
      // The underlying hook will update UI; just close to reduce friction
      onClose();
    } catch {
      // Keep the sheet open for retry; could show inline error
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
          Start your 7‑day free trial and unlock all premium features with your
          own API keys.
        </Typography>

        {/* Trial Terms Disclosure - Required for Play Store compliance */}
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
            {'\u2022'} 7-day free trial
          </Typography>
          <Typography variant="caption" color="secondary" style={{ marginBottom: 4 }}>
            {'\u2022'} After trial: {monthly.localizedPrice}/month
          </Typography>
          <Typography variant="caption" color="secondary" style={{ marginBottom: 4 }}>
            {'\u2022'} Auto-renews unless canceled 24 hours before trial ends
          </Typography>
          <Typography variant="caption" color="secondary">
            {'\u2022'} Cancel anytime: {cancelInstructions}
          </Typography>
        </View>

        <UnlockEverythingBanner />
        <GradientButton
          title={loading ? "Starting Trial…" : "Start 7‑Day Free Trial"}
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
