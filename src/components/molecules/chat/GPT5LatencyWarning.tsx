import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '../common/Card';
import { Typography } from '../common/Typography';
import { useTheme } from '@/theme';

interface GPT5LatencyWarningProps {
  onDismiss?: () => void;
  showAlternativeButton?: boolean;
  onSwitchToAlternative?: () => void;
}

const STORAGE_KEY = 'gpt5_latency_warning_dismissed';

export const GPT5LatencyWarning: React.FC<GPT5LatencyWarningProps> = ({
  onDismiss,
  showAlternativeButton = false,
  onSwitchToAlternative,
}) => {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [isPermanentlyDismissed, setIsPermanentlyDismissed] = useState(false);

  useEffect(() => {
    checkDismissalStatus();
  }, []);

  const checkDismissalStatus = async () => {
    try {
      const dismissed = await AsyncStorage.getItem(STORAGE_KEY);
      if (dismissed === 'true') {
        setIsPermanentlyDismissed(true);
      } else {
        setIsVisible(true);
      }
    } catch {
      setIsVisible(true);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  const handlePermanentDismiss = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, 'true');
      setIsPermanentlyDismissed(true);
      setIsVisible(false);
      onDismiss?.();
    } catch (error) {
      console.error('Failed to save dismissal preference:', error);
      handleDismiss();
    }
  };

  if (!isVisible || isPermanentlyDismissed) {
    return null;
  }

  const warningBgColor = `${theme.colors.warning[500]}15`;

  return (
    <Card style={StyleSheet.flatten([styles.container, { backgroundColor: warningBgColor }])} padding="medium">
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons 
            name="warning" 
            size={24} 
            color={theme.colors.warning[500]} 
          />
        </View>
        
        <View style={styles.textContainer}>
          <Typography 
            variant="body" 
            style={StyleSheet.flatten([styles.title, { color: theme.colors.warning[500] }])}
          >
            GPT-5 Performance Notice
          </Typography>
          
          <Typography 
            variant="caption" 
            style={StyleSheet.flatten([styles.message, { color: theme.colors.text.secondary }])}
          >
            GPT-5 currently experiences 40-150 second response delays due to OpenAI API issues. 
            This is a known issue affecting all GPT-5 users globally.
          </Typography>
          
          {showAlternativeButton && (
            <TouchableOpacity 
              style={StyleSheet.flatten([styles.alternativeButton, { backgroundColor: theme.colors.primary[500] }])}
              onPress={onSwitchToAlternative}
            >
              <Typography variant="caption" style={{ color: theme.colors.text.inverse }}>
                Switch to GPT-4o (Faster)
              </Typography>
            </TouchableOpacity>
          )}
          
          <View style={styles.dismissButtons}>
            <TouchableOpacity 
              style={styles.dismissButton}
              onPress={handleDismiss}
            >
              <Typography variant="caption" style={{ color: theme.colors.text.secondary, opacity: 0.7 }}>
                Dismiss
              </Typography>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.dismissButton}
              onPress={handlePermanentDismiss}
            >
              <Typography variant="caption" style={{ color: theme.colors.text.secondary, opacity: 0.7 }}>
                Don't show again
              </Typography>
            </TouchableOpacity>
          </View>
        </View>
        
        <TouchableOpacity 
          style={styles.closeButton}
          onPress={handleDismiss}
        >
          <Ionicons 
            name="close" 
            size={20} 
            color={theme.colors.text.secondary} 
          />
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
    marginBottom: 4,
  },
  message: {
    lineHeight: 18,
  },
  alternativeButton: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  dismissButtons: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 16,
  },
  dismissButton: {
    paddingVertical: 4,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
});
