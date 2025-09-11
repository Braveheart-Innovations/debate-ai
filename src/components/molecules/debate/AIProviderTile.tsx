/**
 * AIProviderTile - Unified component for rendering AI provider buttons/tiles
 * Single source of truth for AI provider visual representation across the app
 */

import React from 'react';
import { 
  TouchableOpacity, 
  View, 
  ViewStyle, 
  StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AIAvatar } from '@/components/organisms/common/AIAvatar';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';
import { AI } from '@/types';

export type TileSize = 'small' | 'medium' | 'large' | 'xlarge';
export type TileStyle = 'flat' | 'gradient' | 'outlined';

interface AIProviderTileProps {
  ai: AI;
  size?: TileSize;
  tileStyle?: TileStyle;
  showName?: boolean;
  namePosition?: 'below' | 'overlay';
  onPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  customWidth?: number;
  customHeight?: number;
}

export const AIProviderTile: React.FC<AIProviderTileProps> = ({
  ai,
  size = 'medium',
  tileStyle = 'flat',
  showName = false,
  namePosition = 'below',
  onPress,
  disabled = false,
  selected = false,
  style,
  customWidth,
  customHeight,
}) => {
  const { theme } = useTheme();
  
  // Size configurations
  const sizeConfig = {
    small: { 
      container: 60, 
      avatar: 'small' as const,
      fontSize: 12,
      borderRadius: 8,
    },
    medium: { 
      container: 100, 
      avatar: 'medium' as const,
      fontSize: 14,
      borderRadius: 12,
    },
    large: { 
      container: 140, 
      avatar: 'large' as const,
      fontSize: 16,
      borderRadius: 12,
    },
    xlarge: { 
      container: 180, 
      avatar: 'large' as const,
      fontSize: 18,
      borderRadius: 16,
    },
  };
  
  const config = sizeConfig[size];
  const width = customWidth || config.container;
  const height = customHeight || config.container;
  
  // Get AI color - ensure we use the same color everywhere
  const aiColor = ai.color || theme.colors.primary[500];
  // Use gradient if available, otherwise create one from the base color
  const gradientColors: [string, string] = [aiColor, aiColor];
  
  const renderContent = () => {
    const avatarElement = (
      <AIAvatar
        icon={ai.icon}
        iconType={ai.iconType}
        size={config.avatar}
        color={aiColor}
        providerId={ai.provider || ai.id}
        isSelected={selected}
      />
    );
    
    const nameElement = showName && (
      <Typography
        variant="body"
        weight="semibold"
        style={{
          color: namePosition === 'overlay' ? '#FFFFFF' : theme.colors.text.primary,
          fontSize: config.fontSize,
          marginTop: namePosition === 'below' ? 8 : 0,
          textAlign: 'center',
        }}
      >
        {ai.name}
      </Typography>
    );
    
    return (
      <View style={{
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: theme.spacing.sm,
      }}>
        {avatarElement}
        {showName && namePosition === 'below' && nameElement}
        {showName && namePosition === 'overlay' && (
          <View style={{
            position: 'absolute',
            bottom: 8,
            left: 0,
            right: 0,
            alignItems: 'center',
          }}>
            {nameElement}
          </View>
        )}
      </View>
    );
  };
  
  const containerStyle: StyleProp<ViewStyle> = [
    {
      width,
      height: showName && namePosition === 'below' ? height + 30 : height,
      borderRadius: config.borderRadius,
      opacity: disabled ? 0.5 : 1,
      overflow: 'hidden',
    },
    selected && {
      borderWidth: 2,
      borderColor: aiColor,
    },
    style,
  ];
  
  const innerContent = () => {
    switch (tileStyle) {
      case 'gradient':
        return (
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          >
            {renderContent()}
          </LinearGradient>
        );
        
      case 'outlined':
        return (
          <View style={{
            flex: 1,
            borderWidth: 2,
            borderColor: aiColor,
            borderRadius: config.borderRadius,
            backgroundColor: theme.colors.surface,
          }}>
            {renderContent()}
          </View>
        );
        
      case 'flat':
      default:
        return (
          <View style={{
            flex: 1,
            backgroundColor: aiColor,
          }}>
            {renderContent()}
          </View>
        );
    }
  };
  
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
        style={containerStyle}
      >
        {innerContent()}
      </TouchableOpacity>
    );
  }
  
  return (
    <View style={containerStyle}>
      {innerContent()}
    </View>
  );
};
