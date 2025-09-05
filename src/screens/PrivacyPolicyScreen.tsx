import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, View } from 'react-native';
import { useTheme } from '../theme';
import { Header, HeaderActions } from '../components/organisms';
import { Typography } from '../components/molecules';

interface PrivacyPolicyScreenProps {
  navigation: { goBack: () => void };
}

const PrivacyPolicyScreen: React.FC<PrivacyPolicyScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        variant="gradient"
        title="Privacy Policy"
        showBackButton
        onBack={() => navigation.goBack()}
        animated
        rightElement={<HeaderActions variant="gradient" />}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <View style={{ gap: 8 }}>
          <Typography variant="title" weight="bold">Your Privacy</Typography>
          <Typography variant="body" color="secondary">
            This is a placeholder Privacy Policy shown locally in the app. Replace with your actual policy text.
          </Typography>
          <Typography variant="subtitle" weight="semibold">Data Collection</Typography>
          <Typography variant="body" color="secondary">
            Describe what data you collect, how you use it, and retention policies.
          </Typography>
          <Typography variant="subtitle" weight="semibold">Contact</Typography>
          <Typography variant="body" color="secondary">
            For questions, contact team@symposiumai.com.
          </Typography>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PrivacyPolicyScreen;

