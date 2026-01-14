import React from 'react';
import { View, StyleSheet, ScrollView, Modal, TouchableOpacity, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography, Button, GradientButton } from '@/components/molecules';
import { useTheme } from '@/theme';
import { useStorePrices } from '@/hooks/useStorePrices';

interface TrialTermsSheetProps {
  visible: boolean;
  onClose: () => void;
  onAcceptTerms: () => void;
  isAuthenticated: boolean;
  loading?: boolean;
}

export const TrialTermsSheet: React.FC<TrialTermsSheetProps> = ({
  visible,
  onClose,
  onAcceptTerms,
  isAuthenticated,
  loading = false,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { monthly } = useStorePrices();

  // Dynamic arrays using localized price from store
  const trialFeatures = [
    `7 days free, then ${monthly.localizedPrice}/month`,
    'Cancel anytime before trial ends',
    'Full access to all premium features',
  ];

  const legalTerms = [
    `Subscription auto-renews at ${monthly.localizedPrice}/mo unless canceled at least 24 hours before the trial ends`,
    'Your payment method will be charged within 24 hours of the trial ending',
    'Manage or cancel anytime in Settings > Subscriptions',
  ];

  const handlePrivacyPolicy = () => {
    // Use in-app navigation if available, otherwise fallback to URL
    Linking.openURL('https://www.symposiumai.app/privacy');
  };

  const handleTermsOfService = () => {
    Linking.openURL('https://www.symposiumai.app/terms');
  };

  const ctaText = isAuthenticated
    ? (loading ? 'Starting Trial...' : 'Start Free Trial')
    : 'Continue to Create Account';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Typography variant="body" color="secondary">Cancel</Typography>
          </TouchableOpacity>
          <Typography variant="title" weight="bold" color="primary">
            Start Your Free Trial
          </Typography>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Trial Benefits */}
          <View style={[styles.benefitsCard, { backgroundColor: isDark ? theme.colors.surface : theme.colors.primary[50] as string }]}>
            {trialFeatures.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <View style={[styles.checkCircle, { backgroundColor: theme.colors.success[500] }]}>
                  <Typography variant="caption" weight="bold" color="inverse">
                    {'\u2713'}
                  </Typography>
                </View>
                <Typography variant="body" weight="medium" color="primary" style={styles.featureText}>
                  {feature}
                </Typography>
              </View>
            ))}
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

          {/* Terms Section */}
          <View style={styles.termsSection}>
            <Typography variant="body" weight="semibold" color="primary" style={styles.termsTitle}>
              By starting your trial, you agree to:
            </Typography>

            {legalTerms.map((term, index) => (
              <View key={index} style={styles.termRow}>
                <Typography variant="caption" color="secondary" style={styles.bullet}>
                  {'\u2022'}
                </Typography>
                <Typography variant="caption" color="secondary" style={styles.termText}>
                  {term}
                </Typography>
              </View>
            ))}
          </View>

          {/* Legal Links */}
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={handlePrivacyPolicy}>
              <Typography variant="caption" color="brand" weight="medium">
                Privacy Policy
              </Typography>
            </TouchableOpacity>
            <Typography variant="caption" color="secondary" style={styles.linkDivider}>|</Typography>
            <TouchableOpacity onPress={handleTermsOfService}>
              <Typography variant="caption" color="brand" weight="medium">
                Terms of Service
              </Typography>
            </TouchableOpacity>
          </View>

          {/* Platform-specific management info */}
          <View style={[styles.infoBox, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)' }]}>
            <Typography variant="caption" color="secondary" style={{ textAlign: 'center' }}>
              {Platform.OS === 'ios'
                ? 'Payment will be charged to your Apple ID account. You can manage your subscription in Settings > Your Name > Subscriptions.'
                : 'Payment will be charged to your Google Play account. You can manage your subscription in Play Store > Account > Subscriptions.'}
            </Typography>
          </View>
        </ScrollView>

        {/* Fixed Bottom Actions */}
        <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
          <GradientButton
            title={ctaText}
            onPress={onAcceptTerms}
            gradient={theme.colors.gradients.primary}
            fullWidth
            disabled={loading}
          />
          <Button
            title="Maybe Later"
            onPress={onClose}
            variant="ghost"
            fullWidth
            disabled={loading}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  closeButton: {
    width: 60,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  benefitsCard: {
    padding: 20,
    borderRadius: 16,
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureText: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 24,
  },
  termsSection: {
    marginBottom: 20,
  },
  termsTitle: {
    marginBottom: 12,
  },
  termRow: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingRight: 16,
  },
  bullet: {
    marginRight: 8,
    marginTop: 2,
  },
  termText: {
    flex: 1,
    lineHeight: 20,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  linkDivider: {
    marginHorizontal: 12,
  },
  infoBox: {
    padding: 16,
    borderRadius: 12,
  },
  actions: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
});

export default TrialTermsSheet;
