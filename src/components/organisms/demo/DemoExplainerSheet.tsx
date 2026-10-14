import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { ContextBar, Typography, Button, GradientButton } from '@/components/molecules';
import { useTheme } from '@/theme';
import { Header } from '@/components/organisms';
import { UnlockEverythingBanner } from '@/components/organisms/subscription/UnlockEverythingBanner';
import useFeatureAccess from '@/hooks/useFeatureAccess';

interface DemoExplainerSheetProps {
  onClose: () => void;
  onStartTrial: () => void;
}

export const DemoExplainerSheet: React.FC<DemoExplainerSheetProps> = ({ onClose, onStartTrial }) => {
  const { theme } = useTheme();
  const { canStartTrial } = useFeatureAccess();
  const bodyCopy = canStartTrial
    ? 'Explore pre‑recorded chats, debates, and comparisons that mimic live streaming. To use real providers with your own keys and unlock all features, start a free 7‑day trial.'
    : 'Explore pre‑recorded chats, debates, and comparisons that mimic live streaming. To use real providers with your own keys and unlock all features, upgrade to Premium.';
  const ctaText = canStartTrial ? 'Start 7‑Day Free Trial' : 'Upgrade to Premium';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      <Header
        variant="gradient"
        slim
        title="You're in Demo Mode"
        showBackButton
        onBack={onClose}
        animated
      />
      <ContextBar title="Simulated content" subtitle="No live API calls." />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        <Typography variant="body" color="secondary" style={{ marginBottom: 16 }}>
          {bodyCopy}
        </Typography>

        <UnlockEverythingBanner />

        <GradientButton
          title={ctaText}
          onPress={onStartTrial}
          gradient={theme.colors.gradients.primary}
          fullWidth
          style={{ marginBottom: 8 }}
        />
        <Button title="Maybe later" onPress={onClose} variant="ghost" fullWidth />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
});

export default DemoExplainerSheet;
