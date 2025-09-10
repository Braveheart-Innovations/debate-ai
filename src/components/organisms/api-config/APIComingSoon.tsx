import React from 'react';
import { StyleSheet, Text as RNText, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Box } from '@/components/atoms';
import { Typography } from '@/components/molecules';
import { AIProvider } from '@/config/aiProviders';
import { useTheme } from '@/theme';

export interface APIComingSoonProps {
  providers: AIProvider[];
  title?: string;
  style?: ViewStyle;
  testID?: string;
}

export const APIComingSoon: React.FC<APIComingSoonProps> = ({
  providers,
  title = 'Coming Soon',
  style,
  testID,
}) => {
  const { theme } = useTheme();

  if (!providers || providers.length === 0) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeInDown.delay(500).springify()}
      style={[styles.container, style]}
      testID={testID}
    >
      <Typography variant="title" style={styles.title}>
        {title}
      </Typography>
      
      <Box
        style={[
          styles.providerContainer,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Box style={styles.providersGrid}>
          {providers.map(provider => (
            <Box
              key={provider.id}
              style={styles.providerItem}
            >
              <RNText style={styles.providerIcon}>
                {provider.icon}
              </RNText>
              <Typography variant="body" color="secondary">
                {provider.name}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 32,
  },
  title: {
    marginBottom: 16,
  },
  providerContainer: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  providersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 12,
  },
  providerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
});
