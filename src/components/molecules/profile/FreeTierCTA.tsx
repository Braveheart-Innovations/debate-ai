import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../Typography';
import { useTheme } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';

interface FreeTierCTAProps {
  onPress?: () => void;
  variant?: 'compact' | 'full';
}

export const FreeTierCTA: React.FC<FreeTierCTAProps> = ({ onPress, variant = 'full' }) => {
  const { theme, isDark } = useTheme();

  const gradientColors: readonly [string, string, ...string[]] = isDark
    ? [theme.colors.gradients.premium[0], theme.colors.gradients.premium[1], '#1a1a2e']
    : [theme.colors.gradients.premium[0], theme.colors.gradients.premium[1], theme.colors.gradients.sunrise[0] as string];

  if (variant === 'compact') {
    const Container = onPress ? TouchableOpacity : View;
    return (
      <Container {...(onPress ? { onPress, activeOpacity: 0.8 } : {})}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.compactContainer}
        >
          <Ionicons name="star" size={16} color="#fff" />
          <Typography variant="caption" weight="semibold" color="inverse">
            Upgrade to Premium
          </Typography>
        </LinearGradient>
      </Container>
    );
  }

  return (
    <View style={styles.fullContainer}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientContainer}
      >
        <View style={styles.header}>
          <Ionicons name="star" size={24} color="#FFD700" />
          <Typography variant="title" weight="bold" color="inverse" style={styles.title}>
            Unlock Premium Features
          </Typography>
        </View>
        
        <View style={styles.features}>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Typography variant="caption" color="inverse" style={styles.featureText}>
              Unlimited AI Debates & Custom Topics
            </Typography>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Typography variant="caption" color="inverse" style={styles.featureText}>
              Signature Styles + Seasonal Packs
            </Typography>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Typography variant="caption" color="inverse" style={styles.featureText}>
              Expert AI Models & Cost Control
            </Typography>
          </View>
        </View>
        {/* Removed secondary link; primary action handled by parent Start Trial button */}
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  fullContainer: {
    width: '100%',
    marginVertical: 16,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  gradientContainer: {
    padding: 20,
    borderRadius: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    marginLeft: 12,
  },
  features: {
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureText: {
    marginLeft: 8,
    flex: 1,
  },
  ctaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    borderRadius: 12,
  },
});
