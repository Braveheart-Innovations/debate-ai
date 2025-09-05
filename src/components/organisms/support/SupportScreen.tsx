import React, { useState } from 'react';
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
import BraveheartLogo from '../../../../assets/BraveheartInnovationsLogoNoText.png';
import { Box } from '../../atoms';
import { Typography, SheetHeader } from '../../molecules';
import { useTheme } from '../../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// import { useNavigation, NavigationProp } from '@react-navigation/native';
// import { RootStackParamList } from '../../../types';

interface SupportScreenProps {
  onClose: () => void;
}

export const SupportScreen: React.FC<SupportScreenProps> = ({ onClose }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<'root' | 'privacy' | 'terms'>('root');
  // Navigation retained for potential future external screens; currently unused after in-sheet navigation.

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

  const handleOpenPrivacyPolicy = () => setView('privacy');
  const handleOpenTermsOfService = () => setView('terms');

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Consistent Sheet Header */}
      <SheetHeader
        title="Help & Support"
        onClose={onClose}
        showHandle={false}
        testID="support-sheet-header"
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ 
          paddingHorizontal: 20,
          paddingTop: 20, 
          paddingBottom: 40 + insets.bottom
        }}
        showsVerticalScrollIndicator={true}
        bounces={true}
        scrollEnabled={true}
        nestedScrollEnabled={true}
      >
        {view !== 'root' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <TouchableOpacity onPress={() => setView('root')} accessibilityLabel="Back" style={{ padding: 8 }}>
              <Ionicons name="chevron-back" size={22} color={theme.colors.text.secondary} />
            </TouchableOpacity>
            <Typography variant="subtitle" weight="semibold" style={{ marginLeft: 4 }}>
              {view === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
            </Typography>
          </View>
        )}

        {view === 'root' && (
          <>
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
        <Box style={[
          styles.section,
          styles.creditsSection,
          { borderTopColor: theme.colors.border }
        ]}>
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
        </>
        )}

        {view === 'privacy' && (
          <View style={{ paddingBottom: 20 }}>
            <Typography variant="heading" weight="bold" style={{ marginBottom: 8 }}>
              Privacy Policy
            </Typography>
            <Typography variant="caption" color="secondary" style={{ marginBottom: 16 }}>
              Effective Date: January 1, 2025
            </Typography>

            <Typography variant="subtitle" weight="semibold">1. Introduction</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              Braveheart Innovations LLC ("we," "our," or "us") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use Symposium AI, our mobile application.
            </Typography>

            <Typography variant="subtitle" weight="semibold">2. Information We Collect</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 8 }}>
              We collect minimal information to provide our services:
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Device Information: Device type, operating system, and app version for technical support
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Usage Data: App features used, session duration, and crash reports to improve our service
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • API Keys: Third-party API keys you provide are stored locally on your device only
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 12 }}>
              • Conversation History: Stored locally on your device and never transmitted to our servers
            </Typography>

            <Typography variant="subtitle" weight="semibold">3. How We Use Your Information</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 8 }}>
              We use the collected information to:
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Provide and maintain our Service
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Improve user experience and app functionality
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Provide customer support
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Detect and prevent technical issues
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 12 }}>
              • Comply with legal obligations
            </Typography>

            <Typography variant="subtitle" weight="semibold">4. Data Storage and Security</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              Your conversation history and API keys are stored locally on your device using secure storage mechanisms provided by your operating system. We do not have access to this data. We implement appropriate technical and organizational measures to protect any data we do process.
            </Typography>

            <Typography variant="subtitle" weight="semibold">5. Third-Party Services</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              When you use third-party AI services (OpenAI, Anthropic, Google, etc.) through our app, your interactions are governed by their respective privacy policies. We do not store or have access to the content of these interactions beyond what is saved locally on your device.
            </Typography>

            <Typography variant="subtitle" weight="semibold">6. Your Rights</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 8 }}>
              You have the right to:
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Access your personal data
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Correct inaccurate data
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Request deletion of your data
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Object to data processing
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 12 }}>
              • Data portability
            </Typography>

            <Typography variant="subtitle" weight="semibold">7. Children's Privacy</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              Our Service is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.
            </Typography>

            <Typography variant="subtitle" weight="semibold">8. Data Retention</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              We retain minimal analytics data for up to 90 days. Your locally stored conversation history and API keys remain on your device until you delete them or uninstall the app.
            </Typography>

            <Typography variant="subtitle" weight="semibold">9. International Data Transfers</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              As we do not collect or store your conversation data or API keys on our servers, there are no international data transfers of your personal information by us. Any transfers that occur are directly between your device and the third-party AI service providers you choose to use.
            </Typography>

            <Typography variant="subtitle" weight="semibold">10. Changes to This Privacy Policy</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Effective Date" above.
            </Typography>

            <Typography variant="subtitle" weight="semibold">11. Contact Us</Typography>
            <Typography variant="body" color="secondary">
              If you have questions about this Privacy Policy, please contact us at:
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginTop: 8 }}>
              Email: privacy@braveheartinnovations.com
            </Typography>
            <Typography variant="body" color="secondary">
              Braveheart Innovations LLC
            </Typography>
            <Typography variant="body" color="secondary">
              support@braveheartinnovations.com
            </Typography>
          </View>
        )}

        {view === 'terms' && (
          <View style={{ paddingBottom: 20 }}>
            <Typography variant="heading" weight="bold" style={{ marginBottom: 8 }}>
              Terms of Service
            </Typography>
            <Typography variant="caption" color="secondary" style={{ marginBottom: 16 }}>
              Effective Date: January 1, 2025
            </Typography>

            <Typography variant="subtitle" weight="semibold">1. Acceptance of Terms</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              By downloading, installing, or using Symposium AI ("the App"), a product of Braveheart Innovations LLC, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the App.
            </Typography>

            <Typography variant="subtitle" weight="semibold">2. Description of Service</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              Symposium AI is a mobile application product of Braveheart Innovations LLC that provides an interface for interacting with multiple AI language models. Users can engage in conversations, compare responses, and watch AI debates. The App supports various third-party AI services through user-provided API keys.
            </Typography>

            <Typography variant="subtitle" weight="semibold">3. User Accounts and API Keys</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 8 }}>
              You are responsible for:
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Maintaining the confidentiality of your API keys
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • All activities that occur using your API keys
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Ensuring compliance with third-party service providers' terms
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 12 }}>
              • Any fees incurred through use of third-party AI services
            </Typography>

            <Typography variant="subtitle" weight="semibold">4. Acceptable Use</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 8 }}>
              You agree not to use the App to:
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Violate any laws or regulations
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Generate harmful, offensive, or illegal content
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Attempt to bypass AI service providers' safety measures
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Infringe on intellectual property rights
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Engage in unauthorized data scraping or mining
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Distribute malware or harmful code
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 12 }}>
              • Impersonate others or provide false information
            </Typography>

            <Typography variant="subtitle" weight="semibold">5. Intellectual Property</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              The App and its original content, features, and functionality are owned by Braveheart Innovations LLC and are protected by international copyright, trademark, and other intellectual property laws. Content generated by AI services remains subject to the respective service providers' terms.
            </Typography>

            <Typography variant="subtitle" weight="semibold">6. Premium Features</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              Certain features require a premium subscription. Subscription fees are billed in advance and are non-refundable except as required by law. We reserve the right to modify subscription fees upon reasonable notice.
            </Typography>

            <Typography variant="subtitle" weight="semibold">7. Disclaimers</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 8 }}>
              THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING:
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Merchantability and fitness for a particular purpose
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Accuracy, reliability, or completeness of AI-generated content
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 4 }}>
              • Uninterrupted or error-free service
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginLeft: 16, marginBottom: 12 }}>
              • Security of your data or API keys
            </Typography>

            <Typography variant="subtitle" weight="semibold">8. Limitation of Liability</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              IN NO EVENT SHALL BRAVEHEART INNOVATIONS LLC BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR USE, ARISING FROM YOUR USE OF THE APP, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE PAST TWELVE MONTHS.
            </Typography>

            <Typography variant="subtitle" weight="semibold">9. Third-Party Services</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              The App integrates with third-party AI services. We are not responsible for the content, policies, or practices of third-party services. Your use of these services is governed by their respective terms and policies.
            </Typography>

            <Typography variant="subtitle" weight="semibold">10. Indemnification</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              You agree to indemnify and hold harmless Braveheart Innovations LLC from any claims, damages, losses, and expenses (including legal fees) arising from your use of the App, violation of these Terms, or infringement of any rights of another party.
            </Typography>

            <Typography variant="subtitle" weight="semibold">11. Termination</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              We may terminate or suspend your access to the App immediately, without prior notice, for any reason, including breach of these Terms. Upon termination, your right to use the App will cease immediately.
            </Typography>

            <Typography variant="subtitle" weight="semibold">12. Governing Law</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              These Terms shall be governed by and construed in accordance with the laws of the United States and the State of Delaware, without regard to its conflict of law provisions. Any disputes shall be resolved in the courts of Delaware.
            </Typography>

            <Typography variant="subtitle" weight="semibold">13. Changes to Terms</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              We reserve the right to modify these Terms at any time. We will provide notice of material changes through the App or by email. Continued use of the App after changes constitutes acceptance of the modified Terms.
            </Typography>

            <Typography variant="subtitle" weight="semibold">14. Severability</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.
            </Typography>

            <Typography variant="subtitle" weight="semibold">15. Entire Agreement</Typography>
            <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
              These Terms constitute the entire agreement between you and Braveheart Innovations LLC regarding the use of the App and supersede all prior agreements and understandings.
            </Typography>

            <Typography variant="subtitle" weight="semibold">16. Contact Information</Typography>
            <Typography variant="body" color="secondary">
              For questions about these Terms, please contact us at:
            </Typography>
            <Typography variant="body" color="secondary" style={{ marginTop: 8 }}>
              Email: legal@braveheartinnovations.com
            </Typography>
            <Typography variant="body" color="secondary">
              Braveheart Innovations LLC
            </Typography>
            <Typography variant="body" color="secondary">
              support@braveheartinnovations.com
            </Typography>
          </View>
        )}
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
    // Use theme border via inline style on render since styles object can't access theme
  },
});
