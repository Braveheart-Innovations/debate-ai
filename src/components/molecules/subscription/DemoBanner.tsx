import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';
import useFeatureAccess from '@/hooks/useFeatureAccess';

interface DemoBannerProps {
  onPress?: () => void;
  subtitle?: string;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ onPress, subtitle }) => {
  const { theme, isDark } = useTheme();
  const { isDemo } = useFeatureAccess();
  if (!isDemo) return null;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.10)',
            borderColor: theme.colors.primary[300],
          },
        ]}
      >
        <Typography variant="caption" weight="bold" style={{ color: theme.colors.primary[700] }}>
          Demo Mode
        </Typography>
        <Typography variant="caption" color="secondary" style={{ marginTop: 2 }}>
          {subtitle || 'Simulated content — no live API calls.'}
        </Typography>
        <View style={styles.ctaPill}>
          <Typography variant="caption" weight="semibold" color="inverse">
            Start 7‑Day Free Trial
          </Typography>
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
  ctaPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#6366F1', // theme.colors.primary[500]
  },
});

export default DemoBanner;

