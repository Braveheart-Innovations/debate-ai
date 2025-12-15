/**
 * APIKeyGuidanceModal
 *
 * Pre-flight modal that shows users what to expect before opening the WebView
 * to get their API key. Displays estimated time, difficulty, and steps.
 */

import React from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { Typography, SheetHeader } from '@/components/molecules';
import { Box } from '@/components/atoms';
import { AIProvider } from '@/config/aiProviders';

export interface APIKeyGuidanceModalProps {
  visible: boolean;
  provider: AIProvider | null;
  onContinue: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export const APIKeyGuidanceModal: React.FC<APIKeyGuidanceModalProps> = ({
  visible,
  provider,
  onContinue,
  onSkip,
  onClose,
}) => {
  const { theme, isDark } = useTheme();

  if (!provider) {
    return null;
  }

  const guidance = provider.guidance;

  const difficultyLabels = {
    easy: 'Easy',
    medium: 'Moderate',
    hard: 'Takes a bit longer',
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <BlurView intensity={20} style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Backdrop */}
        <TouchableOpacity
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Bottom sheet */}
        <View
          style={{
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '85%',
            overflow: 'hidden',
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -3 },
                shadowOpacity: 0.25,
                shadowRadius: 10,
              },
              android: { elevation: 10 },
            }),
          }}
        >
          <SheetHeader
            title={`Get ${provider.name} API Key`}
            onClose={onClose}
            showHandle
          />

          <ScrollView
            contentContainerStyle={{ padding: theme.spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            {/* Provider header with gradient */}
            <LinearGradient
              colors={provider.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                padding: theme.spacing.lg,
                borderRadius: 16,
                marginBottom: theme.spacing.lg,
              }}
            >
              <Typography
                variant="title"
                weight="bold"
                style={{ color: '#FFFFFF', marginBottom: 8 }}
              >
                {provider.name}
              </Typography>
              <Typography
                variant="body"
                style={{ color: 'rgba(255,255,255,0.9)' }}
              >
                {provider.description}
              </Typography>

              {/* Time and difficulty badges */}
              {guidance && (
                <Box
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    marginTop: 16,
                  }}
                >
                  <Box
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 20,
                    }}
                  >
                    <Typography
                      variant="caption"
                      weight="semibold"
                      style={{ color: '#FFFFFF' }}
                    >
                      {guidance.estimatedTime}
                    </Typography>
                  </Box>
                  <Box
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 20,
                    }}
                  >
                    <Typography
                      variant="caption"
                      weight="semibold"
                      style={{ color: '#FFFFFF' }}
                    >
                      {difficultyLabels[guidance.difficulty]}
                    </Typography>
                  </Box>
                </Box>
              )}
            </LinearGradient>

            {/* Steps */}
            {guidance && (
              <Box style={{ marginBottom: theme.spacing.lg }}>
                <Typography
                  variant="subtitle"
                  weight="semibold"
                  style={{ marginBottom: 12 }}
                >
                  What to expect
                </Typography>

                {guidance.steps.map((step, index) => (
                  <Box
                    key={index}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      marginBottom: 16,
                    }}
                  >
                    <Box
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: isDark
                          ? theme.colors.overlays.medium
                          : theme.colors.primary[50],
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Typography
                        variant="caption"
                        weight="bold"
                        style={{ color: theme.colors.primary[500] }}
                      >
                        {index + 1}
                      </Typography>
                    </Box>
                    <Box style={{ flex: 1 }}>
                      <Typography variant="body" weight="medium">
                        {step.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="secondary"
                        style={{ marginTop: 2 }}
                      >
                        {step.instruction}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            {/* Tips */}
            {guidance && guidance.tips.length > 0 && (
              <Box
                style={{
                  backgroundColor: isDark
                    ? theme.colors.overlays.soft
                    : theme.colors.warning[50],
                  padding: theme.spacing.md,
                  borderRadius: 12,
                  marginBottom: theme.spacing.lg,
                }}
              >
                <Typography
                  variant="caption"
                  weight="semibold"
                  style={{
                    color: theme.colors.warning[600],
                    marginBottom: 8,
                  }}
                >
                  Tips
                </Typography>
                {guidance.tips.map((tip, index) => (
                  <Typography
                    key={index}
                    variant="caption"
                    color="secondary"
                    style={{ marginBottom: index < guidance.tips.length - 1 ? 4 : 0 }}
                  >
                    {tip}
                  </Typography>
                ))}
              </Box>
            )}

            {/* Action buttons */}
            <Box style={{ gap: 12 }}>
              <TouchableOpacity
                onPress={onContinue}
                style={{
                  backgroundColor: theme.colors.primary[500],
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                <Typography
                  variant="body"
                  weight="semibold"
                  style={{ color: '#FFFFFF' }}
                >
                  Let's Go
                </Typography>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onSkip}
                style={{
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Typography variant="body" color="secondary">
                  I already have a key
                </Typography>
              </TouchableOpacity>
            </Box>
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
};

export default APIKeyGuidanceModal;
