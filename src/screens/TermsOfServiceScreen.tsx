import React, { useCallback, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, View, Linking, Alert } from 'react-native';
import { useTheme } from '../theme';
import { Header, HeaderActions } from '../components/organisms';
import { Typography, Button } from '../components/molecules';

interface TermsOfServiceScreenProps {
  navigation: { goBack: () => void };
}

const TERMS_OF_SERVICE_URL = 'https://www.symposiumai.app/terms';

const TermsOfServiceScreen: React.FC<TermsOfServiceScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();

  const openTerms = useCallback(async () => {
    try {
      const canOpen = await Linking.canOpenURL(TERMS_OF_SERVICE_URL);
      if (!canOpen) {
        throw new Error('unsupported');
      }
      await Linking.openURL(TERMS_OF_SERVICE_URL);
    } catch {
      Alert.alert(
        'Unable to open Terms of Service',
        `Please visit ${TERMS_OF_SERVICE_URL} in your browser.`,
        [{ text: 'OK' }]
      );
    }
  }, []);

  useEffect(() => {
    void openTerms();
  }, [openTerms]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        variant="gradient"
        title="Terms of Service"
        showBackButton
        onBack={() => navigation.goBack()}
        animated
        rightElement={<HeaderActions variant="gradient" />}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <View style={{ gap: 12 }}>
          <Typography variant="title" weight="bold">
            View the Latest Terms
          </Typography>
          <Typography variant="body" color="secondary">
            We'll open our website in your browser so you always see the current Terms of Service. If the page didn't open automatically, tap the button below.
          </Typography>
          <Button
            title="Open Terms of Service"
            variant="secondary"
            onPress={openTerms}
            fullWidth
          />
          <Typography variant="caption" color="secondary">
            URL: {TERMS_OF_SERVICE_URL}
          </Typography>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default TermsOfServiceScreen;

