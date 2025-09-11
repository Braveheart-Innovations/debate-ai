import React from 'react';
import { View, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GradientButton, Typography } from '@/components/molecules';
import { AIAvatar } from '@/components/organisms/common/AIAvatar';
import { AIConfig } from '@/types';
import { useTheme } from '@/theme';
import * as Haptics from 'expo-haptics';

interface DebateModeCardProps {
  selectedAIs: AIConfig[];
  onStartDebate: () => void;
  style?: ViewStyle;
}

export const DebateModeCard: React.FC<DebateModeCardProps> = ({
  selectedAIs,
  onStartDebate,
  style,
}) => {
  const { theme, isDark } = useTheme();
  const canDebate = selectedAIs.length >= 2;
  
  const getMessage = () => {
    if (selectedAIs.length === 0) {
      return "Select 2 or more AIs to start a debate";
    } else if (selectedAIs.length === 1) {
      return "Select 1 more AI for debate mode";
    } else {
      return "Ready to debate! Choose a topic below";
    }
  };
  
  const handlePress = () => {
    if (canDebate) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onStartDebate();
    }
  };
  
  return (
    <Animated.View 
      entering={FadeInDown.delay(300).springify()}
      style={style}
    >
      <LinearGradient
        colors={isDark 
          ? ['rgba(250, 112, 154, 0.1)', 'rgba(254, 225, 64, 0.1)']
          : ['rgba(250, 112, 154, 0.05)', 'rgba(254, 225, 64, 0.05)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: theme.borderRadius.xl,
          padding: theme.spacing.lg,
          borderWidth: 1,
          borderColor: canDebate 
            ? theme.colors.warning[500] 
            : theme.colors.border,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Typography style={{ fontSize: 24, marginRight: 8 }}>⚔️</Typography>
          <Typography variant="title" weight="bold">
            Debate Mode
          </Typography>
        </View>
        
        {/* AI Avatars Display */}
        {selectedAIs.length > 0 && (
          <View style={{ 
            flexDirection: 'row', 
            justifyContent: 'center',
            alignItems: 'center',
            marginVertical: theme.spacing.md,
          }}>
            {selectedAIs.slice(0, 3).map((ai, index) => (
              <View 
                key={ai.id} 
                style={{ 
                  marginLeft: index > 0 ? -12 : 0,
                  zIndex: selectedAIs.length - index,
                }}
              >
                <AIAvatar
                  icon={ai.icon || ai.avatar || '🤖'}
                  iconType={ai.iconType || 'letter'}
                  size="medium"
                  color={ai.color}
                  isSelected={false}
                />
              </View>
            ))}
          </View>
        )}
        
        {/* Status Message */}
        <Typography 
          variant="default" 
          color={canDebate ? "primary" : "secondary"}
          align="center"
          style={{ marginBottom: theme.spacing.md }}
        >
          {getMessage()}
        </Typography>
        
        {/* Start Button */}
        {canDebate && (
          <GradientButton
            title="Choose Debate Topic"
            onPress={handlePress}
            variant="primary"
          />
        )}
      </LinearGradient>
    </Animated.View>
  );
};
