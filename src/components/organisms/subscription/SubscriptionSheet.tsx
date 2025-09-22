import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { SheetHeader } from "@/components/molecules/sheets/SheetHeader";
import { UnlockEverythingBanner } from "@/components/organisms/subscription/UnlockEverythingBanner";
import { GradientButton, Button, Typography } from "@/components/molecules";
import { useTheme } from "@/theme";
import { PurchaseService } from "@/services/iap/PurchaseService";

interface SubscriptionSheetProps {
  onClose: () => void;
}

export const SubscriptionSheet: React.FC<SubscriptionSheetProps> = ({
  onClose,
}) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

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
