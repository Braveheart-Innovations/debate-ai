import React from 'react';
import { 
  ScrollView, 
  View, 
  TouchableOpacity, 
  StyleSheet, 
  Linking,
  Platform,
  Alert,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import AppIcon from '../../../../assets/icon.png';
import { Box } from '../../atoms';
import { Typography, SheetHeader } from '../../molecules';
import { useTheme } from '../../../theme';

interface SupportScreenProps {
  onClose: () => void;
}

export const SupportScreen: React.FC<SupportScreenProps> = ({ onClose }) => {
  const { theme } = useTheme();

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
    const body = encodeURIComponent(`Hi Symposium AI Team,\n\nI need help with:\n\n[Please describe your issue here]${decodeURIComponent(deviceInfo)}`);
    const mailtoUrl = `mailto:team@symposiumai.com?subject=${subject}&body=${body}`;
    
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          'Email Client Not Available',
          'Please send an email to team@symposiumai.com',
          [{ text: 'OK' }]
        );
      }
    } catch {
      Alert.alert(
        'Error',
        'Could not open email client. Please email team@symposiumai.com directly.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleOpenFAQs = async () => {
    const url = 'https://symposiumai.com/faqs';
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Could not open FAQs page', [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert('Error', 'Could not open FAQs page', [{ text: 'OK' }]);
    }
  };

  const handleOpenPrivacyPolicy = async () => {
    const url = 'https://symposiumai.com/privacy';
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Could not open Privacy Policy', [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert('Error', 'Could not open Privacy Policy', [{ text: 'OK' }]);
    }
  };

  const handleOpenTermsOfService = async () => {
    const url = 'https://symposiumai.com/terms';
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Could not open Terms of Service', [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert('Error', 'Could not open Terms of Service', [{ text: 'OK' }]);
    }
  };

  return (
    <Box style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Consistent Sheet Header */}
      <SheetHeader
        title="Help & Support"
        onClose={onClose}
        showHandle={false}
        testID="support-sheet-header"
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Get Help Section */}
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
                  Find answers to common questions
                </Typography>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
          </TouchableOpacity>
        </Box>

        {/* About Section */}
        <Box style={styles.section}>
          <Typography variant="title" weight="semibold" style={styles.sectionTitle}>
            About
          </Typography>
          
          {/* Privacy Policy and Terms of Service */}
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
                  How we protect your data
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
                  Terms and conditions of use
                </Typography>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
          </TouchableOpacity>

          {/* App Logo and Version */}
          <Box style={[styles.aboutCard, { backgroundColor: theme.colors.surface, marginTop: 12 }]}>
            <View style={styles.logoContainer}>
              <Image 
                source={AppIcon} 
                style={styles.appIcon}
              />
            </View>
            <Typography variant="title" weight="bold" style={{ textAlign: 'center' }}>
              Symposium AI
            </Typography>
            <Typography variant="body" color="secondary" style={{ textAlign: 'center' }}>
              Version 1.0.0
            </Typography>
          </Box>
        </Box>

        {/* Developer Credits */}
        <Box style={[styles.section, styles.creditsSection]}>
          <Typography variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            Made with ❤️ by the Symposium AI Team
          </Typography>
          <Typography variant="caption" color="secondary" style={{ textAlign: 'center', marginTop: 4 }}>
            © 2024 Braveheart Innovations. All rights reserved.
          </Typography>
        </Box>
      </ScrollView>
    </Box>
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
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
});