import React from 'react';
import {
  ScrollView,
  View,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import AppIcon from '../../../../assets/icon.png';
import BraveheartLogo from '../../../../assets/BraveheartInnovationsLogoNoText.png';
import { Box } from '../../atoms';
import { Typography, SheetHeader } from '../../molecules';
import { useTheme } from '../../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SupportSheetProps {
  onClose: () => void;
}

const FAQ_URL = 'https://www.symposiumai.app/faq';
const PRIVACY_POLICY_URL = 'https://www.symposiumai.app/privacy';
const TERMS_OF_SERVICE_URL = 'https://www.symposiumai.app/terms';

export const SupportSheet: React.FC<SupportSheetProps> = ({ onClose }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const openExternalLink = async (url: string, label: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        throw new Error('unsupported');
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Unable to open link',
        `Please open ${label} in your browser:\n${url}`,
        [{ text: 'OK' }]
      );
    }
  };

  const getDeviceInfo = () => {
    const info = [
      `App Version: 1.0.0`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Device: ${Device.brand} ${Device.modelName}`,
      `OS: ${Device.osName} ${Device.osVersion}`,
    ];
    return info.join('\n');
  };

  const handleGetHelp = async () => {
    const subject = encodeURIComponent('Support Request - Symposium AI');
    const deviceInfo = encodeURIComponent(`\n\n---\nDevice Information:\n${getDeviceInfo()}`);
    const body = encodeURIComponent(
      `Hi Symposium AI Team,\n\nI need help with:\n\n[Please describe your issue here]${decodeURIComponent(
        deviceInfo
      )}`
    );
    const mailtoUrl = `mailto:support@braveheartinnovations.com?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          'Email Client Not Available',
          'Please send an email to support@braveheartinnovations.com',
          [{ text: 'OK' }]
        );
      }
    } catch {
      Alert.alert(
        'Error',
        'Could not open email client. Please email support@braveheartinnovations.com directly.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleOpenFAQs = () => openExternalLink(FAQ_URL, 'the FAQ');
  const handleOpenPrivacyPolicy = () => openExternalLink(PRIVACY_POLICY_URL, 'the Privacy Policy');
  const handleOpenTermsOfService = () => openExternalLink(TERMS_OF_SERVICE_URL, 'the Terms of Service');

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SheetHeader title="Help & Support" onClose={onClose} showHandle={false} testID="support-sheet-header" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 40 + insets.bottom,
        }}
        showsVerticalScrollIndicator
        bounces
        scrollEnabled
        nestedScrollEnabled
      >
        <Box style={[styles.section, { marginTop: 0 }]}>
          <Typography variant="title" weight="semibold" style={styles.sectionTitle}>
            Get Help
          </Typography>

          <TouchableOpacity
            style={[styles.listItem, { backgroundColor: theme.colors.surface }]}
            onPress={handleGetHelp}
            activeOpacity={0.7}
          >
            <View style={styles.listItemContent}>
              <Ionicons name="mail-outline" size={24} color={theme.colors.primary[500]} />
              <View style={styles.listItemText}>
                <Typography variant="body" weight="medium">
                  Contact Support
                </Typography>
                <Typography variant="caption" color="secondary">
                  Send us an email with your question or issue
                </Typography>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listItem, { backgroundColor: theme.colors.surface }]}
            onPress={handleOpenFAQs}
            activeOpacity={0.7}
          >
            <View style={styles.listItemContent}>
              <Ionicons name="help-circle-outline" size={24} color={theme.colors.primary[500]} />
              <View style={styles.listItemText}>
                <Typography variant="body" weight="medium">
                  FAQs
                </Typography>
                <Typography variant="caption" color="secondary">
                  View the latest answers on symposiumai.app
                </Typography>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
          </TouchableOpacity>
        </Box>

        <Box style={styles.section}>
          <Typography variant="title" weight="semibold" style={styles.sectionTitle}>
            Legal &amp; Policies
          </Typography>
          <Typography variant="caption" color="secondary" style={{ marginBottom: 12, paddingHorizontal: 4 }}>
            We’ll open these in your browser so you always see the current versions.
          </Typography>

          <TouchableOpacity
            style={[styles.listItem, { backgroundColor: theme.colors.surface }]}
            onPress={handleOpenPrivacyPolicy}
            activeOpacity={0.7}
          >
            <View style={styles.listItemContent}>
              <Ionicons name="shield-checkmark-outline" size={24} color={theme.colors.text.secondary} />
              <View style={styles.listItemText}>
                <Typography variant="body" weight="medium">
                  Privacy Policy
                </Typography>
                <Typography variant="caption" color="secondary">
                  Opens symposiumai.app/privacy
                </Typography>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listItem, { backgroundColor: theme.colors.surface }]}
            onPress={handleOpenTermsOfService}
            activeOpacity={0.7}
          >
            <View style={styles.listItemContent}>
              <Ionicons name="document-text-outline" size={24} color={theme.colors.text.secondary} />
              <View style={styles.listItemText}>
                <Typography variant="body" weight="medium">
                  Terms of Service
                </Typography>
                <Typography variant="caption" color="secondary">
                  Opens symposiumai.app/terms
                </Typography>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
          </TouchableOpacity>
        </Box>

        <Box style={styles.section}>
          <Typography variant="title" weight="semibold" style={styles.sectionTitle}>
            About
          </Typography>

          <Box style={[styles.aboutCard, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.logoContainer}>
              <Image source={AppIcon} style={styles.appIcon} />
            </View>
            <Typography variant="title" weight="bold" style={{ textAlign: 'center' }}>
              Symposium AI
            </Typography>
            <Typography variant="body" color="secondary" style={{ textAlign: 'center' }}>
              Version 1.0.0
            </Typography>
          </Box>
        </Box>

        <Box
          style={[
            styles.section,
            styles.creditsSection,
            { borderTopColor: theme.colors.border },
          ]}
        >
          <View style={styles.braveheartRow}>
            <Typography variant="caption" color="secondary" style={{ textAlign: 'center' }}>
              Made with
            </Typography>
            <Image
              source={BraveheartLogo as unknown as number}
              style={styles.braveheartLogo}
              resizeMode="contain"
            />
            <Typography variant="caption" color="secondary" style={{ textAlign: 'center' }}>
              by Braveheart Innovations LLC
            </Typography>
          </View>
        </Box>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  listItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  listItemText: {
    marginLeft: 12,
    flex: 1,
  },
  aboutCard: {
    padding: 24,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 12,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  creditsSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  braveheartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  braveheartLogo: {
    width: 18,
    height: 18,
    marginHorizontal: 6,
  },
});

