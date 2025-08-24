import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setProfileSheetVisible } from '../../store';

interface ProfileIconProps {
  onPress?: () => void;
  variant?: 'default' | 'gradient';
}

export const ProfileIcon: React.FC<ProfileIconProps> = ({ onPress, variant = 'default' }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const { isAuthenticated, userProfile, isPremium } = useSelector((state: RootState) => state.auth);
  
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      dispatch(setProfileSheetVisible(true));
    }
  };
  
  // Get initials from user profile
  const getInitials = () => {
    if (!userProfile?.displayName && !userProfile?.email) return null;
    const name = userProfile.displayName || userProfile.email || '';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };
  
  const initials = getInitials();
  const isGradient = variant === 'gradient';
  
  // Use consistent styling with Settings icon for gradient variant
  const iconColor = isGradient ? theme.colors.text.inverse : theme.colors.text.secondary;
  const backgroundColor = isGradient ? 'transparent' : (
    isAuthenticated 
      ? (isPremium ? theme.colors.primary[500] : theme.colors.surface)
      : theme.colors.surface
  );
  const borderColor = isGradient ? 'transparent' : (
    isAuthenticated
      ? (isPremium ? theme.colors.primary[500] : theme.colors.border)
      : theme.colors.border
  );
  
  return (
    <TouchableOpacity onPress={handlePress} style={styles.container}>
      <View style={[
        styles.iconContainer,
        { 
          backgroundColor,
          borderColor,
          borderWidth: isGradient ? 0 : 1.5,
        }
      ]}>
        {isAuthenticated && initials && !isGradient ? (
          <Text style={[
            styles.initials,
            { 
              color: isPremium 
                ? theme.colors.background 
                : theme.colors.text.primary 
            }
          ]}>
            {initials}
          </Text>
        ) : (
          <Ionicons 
            name="person-circle-outline" 
            size={isGradient ? 24 : 20} 
            color={iconColor}
          />
        )}
      </View>
      {isPremium && !isGradient && (
        <View style={[styles.premiumBadge, { backgroundColor: theme.colors.primary[400] }]}>
          <Ionicons name="star" size={8} color={theme.colors.background} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  initials: {
    fontSize: 14,
    fontWeight: '600',
  },
  premiumBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
});