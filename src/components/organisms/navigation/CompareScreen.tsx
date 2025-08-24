import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Typography } from '../../molecules/Typography';
import { Button } from '../../molecules/Button';
import { useTheme } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';

interface CompareScreenProps {
  navigation?: {
    navigate: (screen: string) => void;
  };
}

export const CompareScreen: React.FC<CompareScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();

  const handleGoToAPIConfig = () => {
    navigation?.navigate('APIConfig');
  };

  const handleGoToDebate = () => {
    navigation?.navigate('DebateTab');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary[100] }]}>
          <Ionicons 
            name="git-compare" 
            size={64} 
            color={theme.colors.primary[500]} 
          />
        </View>
        
        <Typography 
          variant="heading" 
          weight="bold" 
          color="primary"
          style={styles.title}
        >
          Compare
        </Typography>
        
        <Typography 
          variant="body" 
          color="secondary"
          style={styles.description}
        >
          Compare different AI models side-by-side to see how they respond to the same prompts. This feature will help you understand the strengths and differences between various AI providers.
        </Typography>

        <View style={styles.features}>
          <View style={styles.feature}>
            <Ionicons 
              name="checkmark-circle" 
              size={20} 
              color={theme.colors.primary[500]} 
            />
            <Typography 
              variant="body" 
              color="primary"
              style={styles.featureText}
            >
              Side-by-side AI comparisons
            </Typography>
          </View>
          
          <View style={styles.feature}>
            <Ionicons 
              name="checkmark-circle" 
              size={20} 
              color={theme.colors.primary[500]} 
            />
            <Typography 
              variant="body" 
              color="primary"
              style={styles.featureText}
            >
              Multiple providers simultaneously
            </Typography>
          </View>
          
          <View style={styles.feature}>
            <Ionicons 
              name="checkmark-circle" 
              size={20} 
              color={theme.colors.primary[500]} 
            />
            <Typography 
              variant="body" 
              color="primary"
              style={styles.featureText}
            >
              Performance analytics
            </Typography>
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            title="Set Up API Keys"
            onPress={handleGoToAPIConfig}
            variant="primary"
            style={styles.primaryButton}
          />
          
          <Button
            title="Try AI Debate Instead"
            onPress={handleGoToDebate}
            variant="secondary"
            style={styles.secondaryButton}
          />
        </View>

        <Typography 
          variant="caption" 
          color="secondary"
          style={styles.comingSoon}
        >
          Coming Soon - This feature is under active development
        </Typography>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  features: {
    alignSelf: 'stretch',
    marginBottom: 32,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  featureText: {
    marginLeft: 12,
    flex: 1,
  },
  actions: {
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  primaryButton: {
    marginBottom: 12,
  },
  secondaryButton: {
    // No additional styles needed
  },
  comingSoon: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
});