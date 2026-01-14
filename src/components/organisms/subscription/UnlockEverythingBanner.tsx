import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';
import { useStorePrices } from '@/hooks/useStorePrices';

export const UnlockEverythingBanner: React.FC = () => {
  const { theme } = useTheme();
  const { monthly } = useStorePrices();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.primary[500],
        },
      ]}
    >
      <View style={[StyleSheet.absoluteFillObject, { opacity: 0.1 }]}>
        <LinearGradient
          colors={theme.colors.gradients.premium}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <MaterialCommunityIcons
            name="rocket-launch"
            size={28}
            color={theme.colors.primary[500]}
            style={{ marginRight: 12 }}
          />
          <View>
            <Typography variant="title" weight="bold">
              Unlock Everything
            </Typography>
            <Typography variant="body" weight="bold" style={{ color: theme.colors.primary[500] }}>
              {monthly.localizedPrice}/month
            </Typography>
          </View>
        </View>

        <Typography
          variant="caption"
          align="center"
          style={{ color: theme.colors.text.secondary, marginBottom: 16 }}
        >
          One app for ChatGPT, Claude, Gemini, and more. Use your own API keys and pay only for what you use.
        </Typography>

        <View style={styles.features}>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Create Mode: Generate and refine images with multiple AI providers like DALL-E and Gemini
            </Typography>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Web Search: Get real-time information with cited sources from supported AIs
            </Typography>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              AI Debate Arena: Watch AIs debate any topic live, or choose from preset topics
            </Typography>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Group Chat: Collaborate with up to 3 AIs simultaneously on any idea
            </Typography>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Compare Mode: See responses side-by-side across providers, models, or personalities
            </Typography>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Upload documents and images for AI analysis, and export conversations
            </Typography>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 20,
    paddingVertical: 24,
    marginBottom: 24,
    borderWidth: 2,
    overflow: 'visible',
  },
  content: {
    flexDirection: 'column',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  features: {
    width: '100%',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
});

