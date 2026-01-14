import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { useStorePrices } from '@/hooks/useStorePrices';

interface DemoBannerProps {
  onPress?: () => void;
  subtitle?: string;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ onPress, subtitle }) => {
  const { theme, isDark } = useTheme();
  const { isDemo, hasUsedTrial, canStartTrial } = useFeatureAccess();
  const { monthly } = useStorePrices();
  if (!isDemo) return null;

  // Determine the CTA text based on trial status
  const ctaText = canStartTrial ? 'Start 7‑Day Free Trial' : 'Upgrade to Premium';
  const bannerTitle = hasUsedTrial ? 'Trial Ended' : 'Demo Mode';
  const defaultSubtitle = hasUsedTrial
    ? 'Your trial has ended. Upgrade to continue.'
    : 'Simulated content — no live API calls.';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark
              ? (hasUsedTrial ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)')
              : (hasUsedTrial ? 'rgba(239,68,68,0.10)' : 'rgba(99,102,241,0.10)'),
            borderColor: hasUsedTrial ? theme.colors.error[500] : theme.colors.primary[300],
          },
        ]}
      >
        <Typography
          variant="caption"
          weight="bold"
          style={{ color: hasUsedTrial ? theme.colors.error[600] : theme.colors.primary[700] }}
        >
          {bannerTitle}
        </Typography>
        <Typography variant="caption" color="secondary" style={{ marginTop: 2 }}>
          {subtitle || defaultSubtitle}
        </Typography>
        <View style={styles.ctaRow}>
          <View style={[styles.ctaPill, hasUsedTrial && styles.ctaPillWarning]}>
            <Typography variant="caption" weight="semibold" color="inverse">
              {ctaText}
            </Typography>
          </View>
          {canStartTrial && (
            <Typography variant="caption" color="secondary" style={styles.priceText}>
              Then {monthly.localizedPrice}/mo
            </Typography>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  ctaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#6366F1', // theme.colors.primary[500]
  },
  ctaPillWarning: {
    backgroundColor: '#EF4444', // theme.colors.error
  },
  priceText: {
    marginLeft: 8,
  },
});

export default DemoBanner;

