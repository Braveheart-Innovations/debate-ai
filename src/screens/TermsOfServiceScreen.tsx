import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, View } from 'react-native';
import { useTheme } from '../theme';
import { Header, HeaderActions } from '../components/organisms';
import { Typography } from '../components/molecules';

interface TermsOfServiceScreenProps {
  navigation: { goBack: () => void };
}

const TermsOfServiceScreen: React.FC<TermsOfServiceScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();

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
        <View style={{ gap: 8 }}>
          <Typography variant="title" weight="bold">Terms</Typography>
          <Typography variant="body" color="secondary">
            This is a placeholder Terms of Service shown locally in the app. Replace with your actual terms.
          </Typography>
          <Typography variant="subtitle" weight="semibold">Use of Service</Typography>
          <Typography variant="body" color="secondary">
            Outline permitted uses, restrictions, and disclaimers.
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

export default TermsOfServiceScreen;

