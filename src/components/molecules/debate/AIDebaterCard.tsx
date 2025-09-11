/**
 * AI Debater card component for selection
 * Shows AI info with selection state and optional personality
 */

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Typography } from '../common/Typography';
import { AIAvatar } from '@/components/organisms/common/AIAvatar';
import { PersonalityChip } from './PersonalityChip';
import { AIDebater, Personality } from '@/types/debate';

export interface AIDebaterCardProps {
  debater: AIDebater;
  isSelected: boolean;
  onToggle: () => void;
  personality?: Personality;
  showPersonality?: boolean;
  disabled?: boolean;
  index?: number;
  maxReached?: boolean;
}

export const AIDebaterCard: React.FC<AIDebaterCardProps> = ({
  debater,
  isSelected,
  onToggle,
  personality,
  showPersonality = false,
  disabled = false,
  index = 0,
  maxReached = false,
}) => {
  const { theme } = useTheme();

  const canSelect = isSelected || !maxReached;
  const isDisabled = disabled || !canSelect;

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
      <TouchableOpacity
        onPress={onToggle}
        disabled={isDisabled}
        style={{
          backgroundColor: isSelected 
            ? theme.colors.primary[50] 
            : theme.colors.surface,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.md,
          borderWidth: 2,
          borderColor: isSelected 
            ? theme.colors.primary[500] 
            : theme.colors.border,
          opacity: isDisabled ? 0.6 : 1,
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isSelected ? 0.1 : 0.05,
          shadowRadius: 4,
          elevation: isSelected ? 2 : 1,
        }}
      >
        {/* Main AI Info */}
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center',
          marginBottom: showPersonality && personality ? theme.spacing.sm : 0,
        }}>
          <View style={{ marginRight: theme.spacing.md }}>
            <AIAvatar
              icon={debater.icon || debater.name.charAt(0)}
              iconType={debater.iconType || 'letter'}
              size="large"
              color={debater.color}
              isSelected={isSelected}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Typography 
              variant="body" 
              weight="semibold"
              style={{ 
                color: isSelected 
                  ? theme.colors.primary[700] 
                  : theme.colors.text.primary,
                marginBottom: 2,
              }}
            >
              {debater.name}
            </Typography>
            
            <Typography 
              variant="caption" 
              style={{ 
                color: isSelected 
                  ? theme.colors.primary[600] 
                  : theme.colors.text.secondary 
              }}
            >
              {debater.provider.charAt(0).toUpperCase() + debater.provider.slice(1)}
              {debater.model && ` • ${debater.model}`}
            </Typography>

            {/* Strength Areas */}
            {debater.strengthAreas && debater.strengthAreas.length > 0 && (
              <View style={{ 
                flexDirection: 'row', 
                flexWrap: 'wrap',
                marginTop: theme.spacing.xs,
                gap: theme.spacing.xs,
              }}>
                {debater.strengthAreas.slice(0, 2).map((strength, idx) => (
                  <View
                    key={idx}
                    style={{
                      backgroundColor: isSelected 
                        ? theme.colors.primary[200]
                        : theme.colors.background,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: theme.borderRadius.sm,
                    }}
                  >
                    <Typography 
                      variant="caption"
                      style={{
                        color: isSelected 
                          ? theme.colors.primary[700]
                          : theme.colors.text.secondary,
                        fontSize: 10,
                      }}
                    >
                      {strength}
                    </Typography>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Selection Indicator */}
          <View style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: isSelected 
              ? theme.colors.primary[500] 
              : theme.colors.border,
            backgroundColor: isSelected 
              ? theme.colors.primary[500] 
              : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {isSelected && (
              <Typography 
                variant="caption" 
                weight="bold"
                style={{ color: '#fff', fontSize: 12 }}
              >
                ✓
              </Typography>
            )}
          </View>
        </View>

        {/* Personality Chip */}
        {showPersonality && personality && (
          <View style={{ 
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: theme.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: isSelected 
              ? theme.colors.primary[200]
              : theme.colors.border,
          }}>
            <Typography 
              variant="caption" 
              style={{ 
                color: theme.colors.text.secondary,
                marginRight: theme.spacing.sm,
              }}
            >
              Personality:
            </Typography>
            <PersonalityChip
              personality={personality}
              isSelected={true}
              onPress={() => {}}
              disabled={true}
              size="small"
            />
          </View>
        )}

        {/* Max Selection Warning */}
        {!isSelected && maxReached && (
          <View style={{
            marginTop: theme.spacing.xs,
            padding: theme.spacing.xs,
            backgroundColor: theme.colors.warning[50],
            borderRadius: theme.borderRadius.sm,
          }}>
            <Typography
              variant="caption"
              style={{ color: theme.colors.warning[700] }}
            >
              Maximum selection reached
            </Typography>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};
