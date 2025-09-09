import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';

export const UnlockEverythingBanner: React.FC = () => {
  const { theme } = useTheme();

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
              $7.99/month
            </Typography>
          </View>
        </View>

        <Typography
          variant="caption"
          align="center"
          style={{ color: theme.colors.text.secondary, marginBottom: 16 }}
        >
          Get all premium features and save vs multiple AI subscriptions
        </Typography>

        <View style={styles.features}>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Collaborate on ideas with multiple AIs at once
            </Typography>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Enjoy all features each provider enables over their API, including document attachments, image generation, and live voice mode
            </Typography>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Create custom Debates or choose from numerous preset topics
            </Typography>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Utilize the custom personality system to enhance AI responses 
            </Typography>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Compare AI providers, different models from the same provider, or different custom personality types
            </Typography>
          </View>
          <View style={styles.bulletRow}>
            <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
            <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
              Seemlessly resume prior conversations and export memorable debate moments
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

