import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Typography, Button, GradientButton } from '@/components/molecules';
import { useTheme } from '@/theme';
import { Header } from '@/components/organisms';
import { UnlockEverythingBanner } from '@/components/organisms/subscription/UnlockEverythingBanner';

interface DemoExplainerSheetProps {
  onClose: () => void;
  onStartTrial: () => void;
}

export const DemoExplainerSheet: React.FC<DemoExplainerSheetProps> = ({ onClose, onStartTrial }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      <Header
        variant="gradient"
        title="You're in Demo Mode"
        subtitle="Simulated content — no live API calls"
        showBackButton
        onBack={onClose}
        showTime={false}
        showDate={false}
        animated
      />
      <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        <Typography variant="body" color="secondary" style={{ marginBottom: 16 }}>
          Explore pre‑recorded chats, debates, and comparisons that mimic live streaming. To use real providers with your own keys and unlock all features, start a free 7‑day trial.
        </Typography>

        <UnlockEverythingBanner />

        <GradientButton
          title="Start 7‑Day Free Trial"
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
