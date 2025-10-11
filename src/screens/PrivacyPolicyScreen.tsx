import React, { useCallback, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, View, Linking, Alert } from 'react-native';
import { useTheme } from '../theme';
import { Header, HeaderActions } from '../components/organisms';
import { Typography, Button } from '../components/molecules';

interface PrivacyPolicyScreenProps {
  navigation: { goBack: () => void };
}

const PRIVACY_POLICY_URL = 'https://www.symposiumai.app/privacy';

const PrivacyPolicyScreen: React.FC<PrivacyPolicyScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();

  const openPrivacyPolicy = useCallback(async () => {
    try {
      const canOpen = await Linking.canOpenURL(PRIVACY_POLICY_URL);
      if (!canOpen) {
        throw new Error('unsupported');
      }
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      Alert.alert(
        'Unable to open Privacy Policy',
        `Please visit ${PRIVACY_POLICY_URL} in your browser.`,
        [{ text: 'OK' }]
      );
    }
  }, []);

  useEffect(() => {
    void openPrivacyPolicy();
  }, [openPrivacyPolicy]);

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
        <View style={{ gap: 12 }}>
          <Typography variant="title" weight="bold">
            View the Latest Privacy Policy
          </Typography>
          <Typography variant="body" color="secondary">
            We'll open our website in your browser so you always see the most up-to-date policy. If the page didn't open automatically, use the button below.
          </Typography>
          <Button
            title="Open Privacy Policy"
            variant="secondary"
            onPress={openPrivacyPolicy}
            fullWidth
          />
          <Typography variant="caption" color="secondary">
            URL: {PRIVACY_POLICY_URL}
          </Typography>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PrivacyPolicyScreen;
