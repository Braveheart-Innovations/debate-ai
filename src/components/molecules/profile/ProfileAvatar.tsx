import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

interface ProfileAvatarProps {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  isPremium?: boolean;
  size?: number;
  onPress?: () => void;
  showPremiumIndicator?: boolean;
  testID?: string;
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  displayName,
  email,
  photoURL,
  isPremium = false,
  size = 36,
  onPress,
  showPremiumIndicator = true,
  testID,
}) => {
  const { theme } = useTheme();

  const getInitials = () => {
    if (!displayName && !email) return null;
    const name = displayName || email || '';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const initials = getInitials();
  const isAuthenticated = !!(displayName || email);
  
  const containerStyle = [
    styles.container,
    {
      width: size,
      height: size,
      borderRadius: size / 2,
    }
  ];

  const avatarStyle = [
    styles.avatar,
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: isAuthenticated 
        ? (isPremium ? theme.colors.primary[500] : theme.colors.surface)
        : theme.colors.surface,
      borderColor: isAuthenticated
        ? (isPremium ? theme.colors.primary[500] : theme.colors.border)
        : theme.colors.border,
    }
  ];

  const renderContent = () => {
    if (photoURL) {
      return (
        <Image 
          source={{ uri: photoURL }} 
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      );
    }

    if (isAuthenticated && initials) {
      return (
        <Text style={[
          styles.initials,
          { 
            fontSize: size * 0.4,
            color: isPremium 
              ? theme.colors.background 
              : theme.colors.text.primary 
          }
        ]}>
          {initials}
        </Text>
      );
    }

    return (
      <Ionicons 
        name="person-outline" 
        size={size * 0.55} 
        color={theme.colors.text.secondary}
      />
    );
  };

  const premiumBadgeSize = size * 0.35;

  const content = (
    <View style={containerStyle} testID={testID}>
      <View style={avatarStyle}>
        {renderContent()}
      </View>
      {isPremium && showPremiumIndicator && (
        <View style={[
          styles.premiumBadge, 
          { 
            backgroundColor: theme.colors.primary[400],
            width: premiumBadgeSize,
            height: premiumBadgeSize,
            borderRadius: premiumBadgeSize / 2,
            top: -2,
            right: -2,
          }
        ]}>
          <Ionicons name="star" size={premiumBadgeSize * 0.6} color={theme.colors.background} />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel="Profile">
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  image: {
    // Image styles are applied inline for dynamic sizing
  },
  initials: {
    fontWeight: '600',
  },
  premiumBadge: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
});
