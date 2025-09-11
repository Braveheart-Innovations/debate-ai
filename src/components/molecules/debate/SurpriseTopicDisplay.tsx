/**
 * Display component for surprise/random topics
 * Shows the generated topic with regeneration option
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Typography } from '../common/Typography';
import { Button } from '../common/Button';

export interface SurpriseTopicDisplayProps {
  topic: string;
  onRegenerate: () => void;
  isGenerating?: boolean;
  showRegenerateHint?: boolean;
  disabled?: boolean;
}

export const SurpriseTopicDisplay: React.FC<SurpriseTopicDisplayProps> = ({
  topic,
  onRegenerate,
  isGenerating = false,
  showRegenerateHint = true,
  disabled = false,
}) => {
  const { theme } = useTheme();

  if (!topic && !isGenerating) {
    return null;
  }

  return (
    <Animated.View 
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={{ marginBottom: theme.spacing.xl }}
    >
      <View style={{
        backgroundColor: theme.colors.primary[50],
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        borderWidth: 2,
        borderColor: theme.colors.primary[300],
      }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: theme.spacing.sm,
        }}>
          <Typography 
            variant="caption" 
            color="secondary" 
            weight="semibold"
          >
            🎲 Random Topic Selected:
          </Typography>
          
          {!disabled && (
            <TouchableOpacity
              onPress={onRegenerate}
              disabled={isGenerating}
              style={{
                padding: theme.spacing.xs,
                borderRadius: theme.borderRadius.sm,
              }}
            >
              <Typography 
                variant="caption" 
                style={{ 
                  color: theme.colors.primary[600],
                  textDecorationLine: 'underline',
                }}
              >
                {isGenerating ? 'Generating...' : 'New Topic'}
              </Typography>
            </TouchableOpacity>
          )}
        </View>

        {/* Topic Display */}
        {isGenerating ? (
          <View style={{
            paddingVertical: theme.spacing.md,
            alignItems: 'center',
          }}>
            <Typography 
              variant="body" 
              style={{ 
                color: theme.colors.text.secondary,
                fontStyle: 'italic',
              }}
            >
              🎲 Rolling the dice...
            </Typography>
          </View>
        ) : (
          <Animated.View
            entering={FadeIn.delay(200)}
            key={topic} // Force re-animation on topic change
          >
            <Typography 
              variant="body" 
              weight="semibold"
              style={{
                color: theme.colors.primary[700],
                marginBottom: theme.spacing.sm,
                lineHeight: 22,
              }}
            >
              {topic}
            </Typography>
          </Animated.View>
        )}

        {/* Action Buttons */}
        <View style={{ 
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: theme.spacing.md,
        }}>
          {showRegenerateHint && !disabled && (
            <Typography 
              variant="caption" 
              color="secondary" 
              style={{ 
                fontStyle: 'italic',
                flex: 1,
              }}
            >
              Press "New Topic" for a different one
            </Typography>
          )}
          
          {!disabled && (
            <Button
              title={isGenerating ? 'Rolling...' : '🎲 New Topic'}
              onPress={onRegenerate}
              variant="ghost"
              size="small"
              disabled={isGenerating}
              style={{
                backgroundColor: theme.colors.primary[100],
                borderColor: theme.colors.primary[400],
              }}
            />
          )}
        </View>
      </View>
    </Animated.View>
  );
};
