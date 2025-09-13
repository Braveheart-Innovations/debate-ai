/**
 * DebateStepIndicator Organism
 * Shows the current step in the debate setup process with progress indicator
 */

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules';

type DebateStep = 'topic' | 'ai' | 'personality' | 'review';

interface DebateStepIndicatorProps {
  currentStep: DebateStep;
  completedSteps: DebateStep[];
  isPremium: boolean;
}

interface StepInfo {
  id: DebateStep;
  label: string;
  icon: string;
  description: string;
}

export const DebateStepIndicator: React.FC<DebateStepIndicatorProps> = ({
  currentStep,
  completedSteps,
  isPremium,
}) => {
  const { theme } = useTheme();

  const steps: StepInfo[] = [
    {
      id: 'topic',
      label: 'Motion',
      icon: '💭',
      description: 'Choose what to debate',
    },
    {
      id: 'ai',
      label: 'Debaters',
      icon: '🤖',
      description: 'Select 2 AIs',
    },
    {
      id: 'personality' as DebateStep,
      label: 'Personalities',
      icon: '🎭',
      description: isPremium ? 'Set the tone' : 'Premium feature',
    },
  ];

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);
  const progressPercentage = currentStepIndex >= 0 ? ((currentStepIndex + 1) / steps.length) * 100 : 0;

  return (
    <View style={{
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
    }}>
      {/* Progress Bar */}
      <View style={{
        height: 4,
        backgroundColor: theme.colors.border,
        borderRadius: 2,
        marginBottom: theme.spacing.md,
        overflow: 'hidden',
      }}>
        <View style={{
          height: '100%',
          width: `${progressPercentage}%`,
          backgroundColor: theme.colors.primary[500],
          borderRadius: 2,
        }} />
      </View>

      {/* Steps */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {steps.map((step) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;
          
          let stepState: 'completed' | 'current' | 'upcoming';
          if (isCompleted) {
            stepState = 'completed';
          } else if (isCurrent) {
            stepState = 'current';
          } else {
            stepState = 'upcoming';
          }

          const getStepColor = () => {
            switch (stepState) {
              case 'completed':
                return theme.colors.success[500];
              case 'current':
                return theme.colors.primary[500];
              default:
                return theme.colors.text.secondary;
            }
          };

          const getStepBackgroundColor = () => {
            switch (stepState) {
              case 'completed':
                return theme.colors.success[50];
              case 'current':
                return theme.colors.primary[50];
              default:
                return theme.colors.background;
            }
          };

          return (
            <View
              key={step.id}
              style={{
                alignItems: 'center',
                flex: 1,
                paddingHorizontal: theme.spacing.xs,
              }}
            >
              {/* Step Circle */}
              <View style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: getStepBackgroundColor(),
                borderWidth: 2,
                borderColor: getStepColor(),
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: theme.spacing.xs,
              }}>
                {isCompleted ? (
                  <Typography variant="body" style={{ color: getStepColor() }}>
                    ✓
                  </Typography>
                ) : (
                  <Typography variant="body" style={{ fontSize: 16 }}>
                    {step.icon}
                  </Typography>
                )}
              </View>

              {/* Step Label */}
              <Typography
                variant="caption"
                weight={isCurrent ? 'semibold' : 'medium'}
                align="center"
                style={{
                  color: getStepColor(),
                  marginBottom: 2,
                }}
              >
                {step.label}
              </Typography>

              {/* Step Description */}
              <Typography
                variant="caption"
                align="center"
                style={{
                  color: theme.colors.text.secondary,
                  fontSize: 10,
                  lineHeight: 12,
                }}
              >
                {step.description}
              </Typography>
            </View>
          );
        })}
      </View>

      {/* Removed redundant current-step callout */}
    </View>
  );
};
