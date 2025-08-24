import React from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setGlobalStreaming, setStreamingSpeed } from '../../../store';
import { logout } from '../../../store/authSlice';
import { signOut } from '../../../services/firebase/auth';
import { Typography } from '../../molecules/Typography';
import { SettingRow } from '../../molecules/SettingRow';
import { Button } from '../../molecules/Button';
import { ProfileAvatar } from '../../molecules/ProfileAvatar';
import { useTheme } from '../../../theme';
import { 
  useThemeSettings
} from '../../../hooks/settings';

interface UnifiedSettingsProps {
  onClose?: () => void;
  onNavigateToAPIConfig?: () => void;
  onNavigateToSubscription?: () => void;
  onNavigateToHelp?: () => void;
}

export const UnifiedSettings: React.FC<UnifiedSettingsProps> = ({
  onClose,
  onNavigateToAPIConfig,
  onNavigateToSubscription,
  onNavigateToHelp,
}) => {
  const { theme, isDark } = useTheme();
  const dispatch = useDispatch();
  const { userProfile, isPremium, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const streamingEnabled = useSelector((state: RootState) => state.streaming?.globalStreamingEnabled ?? true);
  const streamingSpeed = useSelector((state: RootState) => state.streaming?.streamingSpeed ?? 'natural');
  
  const themeSettings = useThemeSettings();

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              dispatch(logout());
              onClose?.();
            } catch (error) {
              console.error('Error signing out:', error);
            }
          },
        },
      ]
    );
  };

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

  // Get gradient colors based on theme
  const gradientColors: readonly [string, string, ...string[]] = isDark 
    ? [theme.colors.gradients.primary[0], theme.colors.gradients.primary[1], theme.colors.primary[700] as string]
    : [theme.colors.gradients.primary[0], theme.colors.gradients.premium[1], theme.colors.gradients.sunrise[0] as string];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header with gradient background */}
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <Typography variant="heading" weight="semibold" color="inverse">
            Settings
          </Typography>
          {onClose && (
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
            >
              <Typography variant="heading" weight="medium" color="inverse">
                ✕
              </Typography>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
      
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Account & Membership Section */}
      {isAuthenticated && (
        <>
          <View style={styles.sectionHeader}>
            <Typography variant="title" weight="semibold" color="primary">
              Account & Membership
            </Typography>
          </View>
          
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            {/* Profile Info Row */}
            <View style={styles.profileRow}>
              <ProfileAvatar
                displayName={userProfile?.displayName}
                email={userProfile?.email}
                photoURL={userProfile?.photoURL}
                isPremium={isPremium}
                size={40}
              />
              <View style={styles.profileInfo}>
                <Typography variant="body" weight="medium" color="primary">
                  {userProfile?.displayName || 'User'}
                </Typography>
                <Typography variant="caption" color="secondary">
                  {userProfile?.email}
                </Typography>
                {isPremium && (
                  <Typography variant="caption" color="brand" style={styles.premiumText}>
                    Premium Member
                  </Typography>
                )}
              </View>
            </View>
            
            {!isPremium && (
              <SettingRow
                title="Upgrade to Premium"
                subtitle="Unlock all features and remove limits"
                icon="star"
                iconColor={theme.colors.primary[500]}
                onPress={() => {
                  onNavigateToSubscription?.();
                  onClose?.();
                }}
              />
            )}
          </View>
        </>
      )}

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

      {/* Help & Support Section */}
      <View style={styles.sectionHeader}>
        <Typography variant="title" weight="semibold" color="primary">
          Help & Support
        </Typography>
      </View>
      
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <SettingRow
          title="Help & Support"
          subtitle="Get help and contact support"
          icon="help-circle"
          onPress={() => {
            onNavigateToHelp?.();
            onClose?.();
          }}
        />
        
        <SettingRow
          title="Privacy Policy"
          subtitle="View our privacy policy"
          icon="shield-checkmark"
          onPress={() => {
            // TODO: Navigate to privacy policy
            onClose?.();
          }}
        />
      </View>

      {/* About Section */}
      <View style={styles.sectionHeader}>
        <Typography variant="title" weight="semibold" color="primary">
          About
        </Typography>
      </View>
      
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.aboutContent}>
          <Typography variant="body" color="secondary" style={styles.aboutText}>
            Symposium AI v1.0.0{'\n'}
            Where Ideas Converge. Where Understanding Emerges.
          </Typography>
        </View>
      </View>

      {/* Sign Out Button */}
      {isAuthenticated && (
        <View style={styles.signOutSection}>
          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="secondary"
            style={styles.signOutButton}
          />
        </View>
      )}
      
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
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  premiumText: {
    marginTop: 2,
  },
  aboutContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  aboutText: {
    textAlign: 'center',
    lineHeight: 20,
  },
  signOutSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  signOutButton: {
    // No additional styles needed
  },
  bottomSpacing: {
    height: 40,
  },
});