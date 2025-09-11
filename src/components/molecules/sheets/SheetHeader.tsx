import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';

interface SheetHeaderProps {
  title: string;
  onClose: () => void;
  showHandle?: boolean;
  testID?: string;
}

export const SheetHeader: React.FC<SheetHeaderProps> = ({
  title,
  onClose,
  showHandle = false,
  testID,
}) => {
  const { isDark } = useTheme();

  // Match the gradient colors from the main Header component
  // Claude orange -> OpenAI green -> Gemini blue
  const gradientColors: readonly [string, string, ...string[]] = isDark 
    ? ['#C15F3C', '#10A37F', '#4888F8']
    : ['#D97757', '#10A37F', '#4888F8'];

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.headerGradient}
      testID={testID}
    >
      {showHandle && (
        <View style={styles.handleContainer}>
          <View style={[styles.handle, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]} />
        </View>
      )}
      
      <View style={styles.header}>
        <Typography 
          variant="heading" 
          weight="semibold" 
          color="inverse"
          style={styles.title}
        >
          {title}
        </Typography>
        
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID={testID ? `${testID}-close` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    position: 'relative',
  },
  title: {
    textAlign: 'center',
    fontSize: 22,
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    top: 12,
    padding: 4,
    borderRadius: 20,
  },
});
