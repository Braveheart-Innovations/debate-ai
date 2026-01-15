import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Dimensions,
  Image,
  Pressable,
} from 'react-native';
import { GradientButton, Typography } from '../components/molecules';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppIcon from '../../assets/icon.png';
import { useTheme } from '../theme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useDispatch } from 'react-redux';
import { completeOnboarding } from '../store';
import { settingsService } from '../services/settings/SettingsService';
import { useStorePrices } from '@/hooks/useStorePrices';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// Layout constants
const CONTAINER_PADDING = 24;
const CARD_GAP = 12;
const CARD_WIDTH = (width - (CONTAINER_PADDING * 2) - CARD_GAP) / 2;

interface WelcomeScreenProps {
  navigation: {
    replace: (screen: string) => void;
  };
}

// Animated gradient background component
const AnimatedGradientBackground: React.FC = () => {
  const { theme, isDark } = useTheme();
  const animatedOpacity = useSharedValue(0.3);
  
  useEffect(() => {
    animatedOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 3000 }),
        withTiming(0.3, { duration: 3000 })
      ),
      -1,
      true
    );
  }, [animatedOpacity]);
  
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: animatedOpacity.value,
  }));
  
  if (!isDark) return null;
  
  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, animatedStyle]}>
      <LinearGradient
        colors={[theme.colors.primary[900], theme.colors.background, theme.colors.background]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    </Animated.View>
  );
};

const WelcomeScreen: React.FC<WelcomeScreenProps> = () => {
  const dispatch = useDispatch();
  const { theme, isDark } = useTheme();
  const { monthly } = useStorePrices();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(50);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(1, {
      damping: 12,
      stiffness: 100,
    });
    opacity.value = withTiming(1, { duration: 800 });
    translateY.value = withSpring(0, {
      damping: 15,
      stiffness: 100,
    });
    
    // Subtle pulse animation for the logo
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000 }),
        withTiming(1, { duration: 2000 })
      ),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedLogoStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value * pulseScale.value },
    ],
    opacity: opacity.value,
  }));

  const handleGetStarted = () => {
    dispatch(completeOnboarding());
    // Persist onboarding state to survive app updates
    settingsService.saveOnboardingState(true);
  };

  const features = [
    {
      icon: { type: 'material', name: 'language' },
      gradient: theme.colors.gradients.ocean,
      title: 'Web Search',
      description: 'Search the web in real-time.',
    },
    {
      icon: { type: 'material', name: 'brush' },
      gradient: theme.colors.gradients.sunset,
      title: 'Create Mode',
      description: 'Generate AI images instantly.',
    },
    {
      icon: { type: 'material-community', name: 'account-group' },
      gradient: theme.colors.gradients.primary,
      title: 'Group AI Chat',
      description: 'Chat with up to 3 AIs at once.',
    },
    {
      icon: { type: 'material-community', name: 'sword-cross' },
      gradient: theme.colors.gradients.sunrise,
      title: 'AI Debate Arena',
      description: 'Watch AIs debate any topic live.',
    },
    {
      icon: { type: 'material', name: 'compare-arrows' },
      gradient: theme.colors.gradients.forest,
      title: 'Compare Mode',
      description: 'See responses side-by-side.',
    },
    {
      icon: { type: 'material-community', name: 'key-variant' },
      gradient: theme.colors.gradients.primary,
      title: 'BYOK',
      description: 'Your API keys. Your savings.',
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AnimatedGradientBackground />
      <ScrollView 
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* Hero Section */}
        <Animated.View style={[styles.logoContainer, animatedLogoStyle]}>
          <View style={styles.iconWrapper}>
            <Image 
              source={AppIcon} 
              style={{ width: 120, height: 120, borderRadius: 20 }}
            />
          </View>
          <Typography 
            variant="heading" 
            weight="bold" 
            align="center" 
            style={{ 
              marginTop: 20, 
              marginBottom: 8,
            }}
          >
            Symposium AI
          </Typography>
          <Typography 
            variant="subtitle" 
            color="secondary" 
            align="center"
            style={{ marginBottom: 20 }}
          >
            {`Where Ideas Converge.\nWhere Understanding Emerges.`}
          </Typography>
        </Animated.View>

        {/* Feature Cards Grid */}
        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <Animated.View
              key={feature.title}
              entering={FadeInDown.delay(200 + index * 100).springify()}
              style={{ width: CARD_WIDTH }}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.featureCard,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: isDark ? theme.colors.gray[700] : theme.colors.border,
                    shadowColor: theme.colors.shadow,
                    shadowOpacity: isDark ? 0.3 : 0.08,
                  },
                  pressed && styles.featureCardPressed,
                ]}
              >
                <LinearGradient
                  colors={feature.gradient}
                  style={[
                    styles.featureIconGradient,
                    isDark && {
                      shadowColor: feature.gradient[0],
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.5,
                      shadowRadius: 12,
                    }
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {feature.icon.type === 'material' ? (
                    <MaterialIcons name={feature.icon.name as keyof typeof MaterialIcons.glyphMap} size={28} color="#FFFFFF" />
                  ) : feature.icon.type === 'material-community' ? (
                    <MaterialCommunityIcons name={feature.icon.name as keyof typeof MaterialCommunityIcons.glyphMap} size={28} color="#FFFFFF" />
                  ) : (
                    <Ionicons name={feature.icon.name as keyof typeof Ionicons.glyphMap} size={28} color="#FFFFFF" />
                  )}
                </LinearGradient>

                <Typography
                  variant="body"
                  weight="bold"
                  style={styles.featureTitle}
                >
                  {feature.title}
                </Typography>
                <Typography
                  variant="caption"
                  style={[styles.featureDescription, { color: theme.colors.text.primary }]}
                >
                  {feature.description}
                </Typography>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        {/* Price comparison section removed per request */}

        {/* Premium Banner */}
        <Animated.View 
          entering={FadeInUp.delay(800).springify()}
        >
          <View
            style={[
              styles.premiumBanner,
              { 
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.primary[500],
              }
            ]}
          >
          <View style={[StyleSheet.absoluteFillObject, { opacity: 0.1 }]}>
            <LinearGradient
              colors={theme.colors.gradients.premium}
              style={StyleSheet.absoluteFillObject}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </View>
          <View style={styles.premiumContent}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <Typography variant="title" weight="bold" align="center">
                One App. Every AI.
              </Typography>
              <Typography
                variant="body"
                weight="bold"
                style={{ color: theme.colors.primary[500], marginTop: 4 }}
              >
                {monthly.localizedPrice}/month
              </Typography>
            </View>

            <Typography
              variant="caption"
              align="center"
              style={{ color: theme.colors.text.secondary, marginBottom: 12 }}
            >
              Use your own API keys and skip the $20+/month per-AI subscriptions.
              ChatGPT, Claude, Gemini, and more — all in one place.
            </Typography>

            <View style={styles.premiumFeatures}>
              <View style={styles.bulletRow}>
                <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
                <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
                  7-day free trial with full access
                </Typography>
              </View>
              <View style={styles.bulletRow}>
                <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
                <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
                  Pay only for what you use via BYOK
                </Typography>
              </View>
            </View>
          </View>
          </View>
        </Animated.View>

        {/* CTA Buttons */}
        <Animated.View 
          entering={FadeInDown.delay(1000).springify()}
          style={styles.ctaContainer}
        >
          <GradientButton
            title="Start Your AI Journey"
            onPress={handleGetStarted}
            gradient={theme.colors.gradients.ocean}
            style={{ marginBottom: 12 }}
            fullWidth
          />
          
          <Typography 
            variant="caption" 
            color="secondary" 
            align="center"
            style={{ marginTop: 8 }}
          >
            No sign-up required • Your API keys stay private • Start free
          </Typography>
        </Animated.View>

        {/* Footer Quote */}
        <Animated.View 
          entering={FadeIn.delay(1200)}
          style={styles.footer}
        >
          <Typography 
            variant="caption" 
            color="secondary" 
            align="center"
            style={{ fontStyle: 'italic' }}
          >
            "We are a way for the cosmos to know itself."{'\n'}
            -Carl Sagan, Cosmos
          </Typography>
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Typography 
              variant="caption" 
              color="secondary" 
              align="center"
            >
              Built with
            </Typography>
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              source={require('../../assets/BraveheartInnovationsLogoNoText.png') as number}
              style={{ width: 32, height: 32, marginHorizontal: 8 }}
              resizeMode="contain"
            />
            <Typography 
              variant="caption" 
              color="secondary" 
              align="center"
            >
              by Braveheart Innovations LLC
            </Typography>
          </View>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 20,
  },
  iconWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  featureCard: {
    borderRadius: 16,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 140,
    justifyContent: 'flex-start',
  },
  featureCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  featureTitle: {
    marginTop: 12,
    marginBottom: 6,
  },
  featureDescription: {
    lineHeight: 16,
    opacity: 0.8,
  },
  featureIconGradient: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumBanner: {
    borderRadius: 16,
    padding: 20,
    paddingVertical: 24,
    marginBottom: 24,
    borderWidth: 2,
    overflow: 'visible',
  },
  premiumContent: {
    flexDirection: 'column',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  premiumFeatures: {
    width: '100%',
  },
  ctaContainer: {
    marginBottom: 24,
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
    paddingBottom: 20,
  },
});

export default WelcomeScreen;
