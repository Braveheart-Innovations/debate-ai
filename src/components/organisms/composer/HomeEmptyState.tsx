import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { Typography, GradientButton, Button } from '@/components/molecules';
import { useGreeting } from '@/hooks/useGreeting';

interface HomeEmptyStateProps {
  hasConfiguredAIs: boolean;
  /** Hidden when undefined (demo mode). */
  onQuickStart?: () => void;
  onConfigureAIs: () => void;
  /**
   * Names of connected Studio-only providers (e.g. Runway). With no chat AI
   * keyed, the CTA says where those keys work instead of implying none exist.
   */
  studioOnlyProviderNames?: string[];
  onOpenStudio?: () => void;
  testID?: string;
}

const CAPABILITY_HINTS = [
  { icon: 'globe-outline' as const, label: 'Web search' },
  { icon: 'at-outline' as const, label: 'Mentions' },
  { icon: 'image-outline' as const, label: 'Images & docs' },
];

/**
 * Fills the space above the bottom-docked composer on Home: witty greeting,
 * capability hints, Quick Start entry, and a first-run CTA when no provider
 * has an API key yet.
 */
const formatNames = (names: string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export const HomeEmptyState: React.FC<HomeEmptyStateProps> = ({
  hasConfiguredAIs,
  onQuickStart,
  onConfigureAIs,
  studioOnlyProviderNames = [],
  onOpenStudio,
  testID,
}) => {
  const { theme } = useTheme();
  const { timeBasedGreeting, welcomeMessage } = useGreeting({ screenCategory: 'home' });

  const handleQuickStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onQuickStart?.();
  };

  return (
    <View style={styles.container} testID={testID}>
      <Typography variant="title" align="center">
        {timeBasedGreeting}
      </Typography>
      <Typography variant="body" color="secondary" align="center" style={styles.subtitle}>
        {welcomeMessage}
      </Typography>

      {hasConfiguredAIs ? (
        <>
          <View style={styles.hintRow}>
            {CAPABILITY_HINTS.map(hint => (
              <View key={hint.label} style={styles.hint}>
                <Ionicons name={hint.icon} size={14} color={theme.colors.text.secondary} />
                <Typography variant="caption" color="secondary">
                  {hint.label}
                </Typography>
              </View>
            ))}
          </View>

          {onQuickStart && (
            <TouchableOpacity
              onPress={handleQuickStart}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Quick Start"
              accessibilityHint="Opens guided conversation starters"
              style={[
                styles.quickStartChip,
                {
                  borderColor: theme.colors.primary[400],
                  backgroundColor: `${theme.colors.primary[500]}14`,
                },
              ]}
              testID={testID ? `${testID}-quick-start` : undefined}
            >
              <Ionicons name="flash-outline" size={16} color={theme.colors.primary[500]} />
              <Typography
                variant="caption"
                weight="semibold"
                style={{ color: theme.colors.primary[500] }}
              >
                Quick Start
              </Typography>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={styles.configureCta}>
          <Typography variant="body" color="secondary" align="center" style={styles.configureCopy}>
            {studioOnlyProviderNames.length > 0
              ? `Your ${formatNames(studioOnlyProviderNames)} ${
                  studioOnlyProviderNames.length === 1 ? 'key works' : 'keys work'
                } in The Studio. To chat, add a key for a chat AI such as ChatGPT, Claude, or Gemini.`
              : 'Bring your own API keys — connect a provider to start chatting.'}
          </Typography>
          <GradientButton
            title={studioOnlyProviderNames.length > 0 ? 'Add a chat AI key' : 'Configure your first AI'}
            onPress={onConfigureAIs}
            gradient={theme.colors.gradients.primary}
            testID={testID ? `${testID}-configure` : undefined}
          />
          {studioOnlyProviderNames.length > 0 && onOpenStudio && (
            <View testID={testID ? `${testID}-open-studio` : undefined}>
              <Button title="Open The Studio" onPress={onOpenStudio} variant="secondary" size="medium" />
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickStartChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  configureCta: {
    alignSelf: 'stretch',
    gap: 16,
  },
  configureCopy: {
    paddingHorizontal: 8,
  },
});

export default HomeEmptyState;
