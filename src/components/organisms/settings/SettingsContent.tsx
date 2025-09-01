import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setGlobalStreaming, setStreamingSpeed, setPremiumStatus } from '../../../store';
import { Typography } from '../../molecules/Typography';
import { SheetHeader } from '../../molecules/SheetHeader';
import { SettingRow } from '../../molecules/SettingRow';
import { Button } from '../../molecules/Button';
import { useTheme } from '../../../theme';
import { 
  useThemeSettings
} from '../../../hooks/settings';

interface SettingsContentProps {
  onClose?: () => void;
  onNavigateToAPIConfig?: () => void;
}

export const SettingsContent: React.FC<SettingsContentProps> = ({
  onClose,
  onNavigateToAPIConfig,
}) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const streamingEnabled = useSelector((state: RootState) => state.streaming?.globalStreamingEnabled ?? true);
  const streamingSpeed = useSelector((state: RootState) => state.streaming?.streamingSpeed ?? 'natural');
  const isPremium = useSelector((state: RootState) => state.auth.isPremium);
  
  const themeSettings = useThemeSettings();

  const handleStreamingSpeedPress = () => {
    if (!streamingEnabled) return;
    
    // Cycle through speeds: instant -> natural -> slow -> instant
    const nextSpeed = streamingSpeed === 'instant' ? 'natural' : 
                     streamingSpeed === 'natural' ? 'slow' : 'instant';
    dispatch(setStreamingSpeed(nextSpeed));
  };

  const getStreamingSpeedDisplay = () => {
    return streamingSpeed.charAt(0).toUpperCase() + streamingSpeed.slice(1);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Consistent Sheet Header */}
      <SheetHeader
        title="Settings"
        onClose={onClose || (() => {})}
        showHandle={false}
        testID="settings-sheet-header"
      />
      
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
      {/* API Configuration Section */}
      <View style={styles.sectionHeader}>
        <Typography variant="title" weight="semibold" color="primary">
          API Configuration
        </Typography>
      </View>
      
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <SettingRow
          title="Manage API Keys"
          subtitle="Configure your AI provider API keys"
          icon="key"
          onPress={() => {
            onNavigateToAPIConfig?.();
            onClose?.();
          }}
        />
      </View>

      {/* Preferences Section */}
      <View style={styles.sectionHeader}>
        <Typography variant="title" weight="semibold" color="primary">
          Preferences
        </Typography>
      </View>
      
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <SettingRow
          title="Premium Mode"
          subtitle={isPremium ? 'Premium features unlocked' : 'Simulate premium to test UI'}
          icon="star"
          rightElement={
            <Button
              title={isPremium ? 'On' : 'Off'}
              onPress={() => dispatch(setPremiumStatus(!isPremium))}
              variant={isPremium ? 'primary' : 'secondary'}
              size="small"
            />
          }
        />
        
        <SettingRow
          title="Dark Mode"
          subtitle="Easier on the eyes at night"
          icon="moon"
          rightElement={
            <Button
              title={themeSettings.isDark ? 'On' : 'Off'}
              onPress={() => themeSettings.setThemeMode(themeSettings.isDark ? 'light' : 'dark')}
              variant={themeSettings.isDark ? 'primary' : 'secondary'}
              size="small"
              disabled={themeSettings.isLoading}
            />
          }
        />
        
        <SettingRow
          title="Enable Streaming"
          subtitle="Show AI responses as they are generated"
          icon="play-circle"
          rightElement={
            <Button
              title={streamingEnabled ? 'On' : 'Off'}
              onPress={() => dispatch(setGlobalStreaming(!streamingEnabled))}
              variant={streamingEnabled ? 'primary' : 'secondary'}
              size="small"
            />
          }
        />
        
        <SettingRow
          title="Streaming Speed"
          subtitle={streamingEnabled ? `Currently: ${getStreamingSpeedDisplay()}` : 'Enable streaming to adjust speed'}
          icon="speedometer"
          onPress={streamingEnabled ? handleStreamingSpeedPress : undefined}
          disabled={!streamingEnabled}
        />
      </View>
      
      {/* Bottom Spacing */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    // No extra padding needed here
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  closeButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  section: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 4,
  },
  bottomSpacing: {
    height: 40,
  },
});
