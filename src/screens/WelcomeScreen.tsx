import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Dimensions,
  Text,
  Image,
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
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

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
  const { theme } = useTheme();
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
  };

  const features = [
    {
      emoji: '⚔️',
      gradient: theme.colors.gradients.sunset,
      title: 'AI Debate Arena',
      description: 'Watch AIs debate preselected topics. **Premium**: Create debates on ANY topic you choose.',
      premiumType: 'partial' as const,
    },
    {
      emoji: '🎭',
      gradient: theme.colors.gradients.forest,
      title: '12 Personalities',
      description: 'From Comedian to Philosopher. Each AI adapts to your chosen personality style.',
      premiumType: 'full' as const,
    },
    {
      emoji: '🔑',
      gradient: theme.colors.gradients.ocean,
      title: 'BYOK',
      description: 'Bring Your Own Keys. Use your existing API keys to save vs multiple AI subscriptions.',
      premiumType: 'none' as const,
    },
    {
      emoji: '👥',
      gradient: theme.colors.gradients.ocean,
      title: 'Group AI Chat',
      description: 'Free-form conversations with multiple AIs. **Premium**: Unlimited AIs in one chat.',
      premiumType: 'partial' as const,
    },
    {
      emoji: '🛡️',
      gradient: theme.colors.gradients.forest,
      title: 'Hallucination Shield',
      description: 'Multiple AIs fact-check each other in real-time. When one AI makes a claim, others can challenge it.',
      premiumType: 'none' as const,
    },
    {
      emoji: '⚙️',
      gradient: theme.colors.gradients.sunrise,
      title: 'Expert Mode',
      description: 'Choose your model & control costs. GPT-3.5 for simple tasks, GPT-4 for complex. Full parameter control.',
      premiumType: 'full' as const,
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
            Where Ideas Converge. Where Understanding Emerges.
          </Typography>
        </Animated.View>

        {/* Feature Cards Grid */}
        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <Animated.View
              key={feature.title}
              entering={FadeInDown.delay(200 + index * 100).springify()}
              style={{ width: (width - 48 - 12) / 2 }} // Card width calculation
            >
              <View
                style={[
                  styles.featureCard,
                  { 
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                    shadowColor: theme.colors.shadow,
                  }
                ]}
              >
              {/* Premium Badge - only for full premium features */}
              {feature.premiumType === 'full' && (
                <View style={styles.premiumBadge}>
                  <LinearGradient
                    colors={theme.colors.gradients.premium}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <Typography 
                    variant="caption" 
                    weight="bold" 
                    style={{ color: '#fff', fontSize: 10, letterSpacing: 0.5 }}
                  >
                    PREMIUM
                  </Typography>
                </View>
              )}
              
              <LinearGradient
                colors={feature.gradient}
                style={styles.featureIconGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Typography style={styles.featureEmoji}>{feature.emoji}</Typography>
              </LinearGradient>
              
              <Typography 
                variant="body" 
                weight="bold"
                style={{ marginTop: 12, marginBottom: 6 }}
              >
                {feature.title}
              </Typography>
              {feature.premiumType === 'partial' ? (
                <Text style={{ 
                  fontSize: 14,  // Changed from 12 to match Typography caption
                  lineHeight: 16, 
                  opacity: 0.8, 
                  color: theme.colors.text.primary,
                }}>
                  {feature.description.split('**Premium**:')[0]}
                  <Text style={{ fontWeight: 'bold' }}>Premium:</Text>
                  {feature.description.split('**Premium**:')[1]}
                </Text>
              ) : (
                <Typography 
                  variant="caption" 
                  style={{ lineHeight: 16, opacity: 0.8, color: theme.colors.text.primary }}
                >
                  {feature.description}
                </Typography>
              )}
              </View>
            </Animated.View>
          ))}
        </View>

        {/* Cost Comparison Section */}
        <Animated.View 
          entering={FadeInUp.delay(700).springify()}
          style={styles.comparisonSection}
        >
          <Typography 
            variant="body" 
            weight="bold" 
            align="center"
            style={{ marginBottom: 12 }}
          >
            💰 Why Pay More?
          </Typography>
          
          <View style={styles.comparisonContainer}>
            {/* Traditional Subscriptions */}
            <View style={[styles.comparisonCard, { 
              backgroundColor: theme.colors.error[50], 
              borderColor: theme.colors.error[200] 
            }]}>
              <Typography variant="caption" weight="bold" style={{ color: theme.colors.error[600], marginBottom: 8 }}>
                Traditional Way
              </Typography>
              <View style={styles.priceRow}>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary }}>
                  ChatGPT Plus
                </Typography>
                <Typography variant="caption" weight="bold">
                  $20/mo
                </Typography>
              </View>
              <View style={styles.priceRow}>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary }}>
                  Claude Pro
                </Typography>
                <Typography variant="caption" weight="bold">
                  $20/mo
                </Typography>
              </View>
              <View style={styles.priceRow}>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary }}>
                  Perplexity Pro
                </Typography>
                <Typography variant="caption" weight="bold">
                  $20/mo
                </Typography>
              </View>
              <View style={[styles.priceRow, { borderTopWidth: 1, borderTopColor: theme.colors.error[200], paddingTop: 8, marginTop: 8 }]}>
                <Typography variant="caption" weight="bold" style={{ color: theme.colors.error[600] }}>
                  Total
                </Typography>
                <Typography variant="body" weight="bold" style={{ color: theme.colors.error[600] }}>
                  $60/mo
                </Typography>
              </View>
              <Typography variant="caption" style={{ color: theme.colors.error[600], marginTop: 4, fontSize: 11, fontStyle: 'italic' }}>
                Fixed cost, use it or lose it
              </Typography>
            </View>
            
            {/* Our Way */}
            <View style={[styles.comparisonCard, { 
              backgroundColor: theme.colors.success[50], 
              borderColor: theme.colors.success[400] 
            }]}>
              <Typography variant="caption" weight="bold" style={{ color: theme.colors.success[700], marginBottom: 8 }}>
                Smart Way (You!)
              </Typography>
              <View style={styles.priceRow}>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary }}>
                  App Premium
                </Typography>
                <Typography variant="caption" weight="bold">
                  $9.99/mo
                </Typography>
              </View>
              <View style={styles.priceRow}>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary }}>
                  API Usage
                </Typography>
                <Typography variant="caption" weight="bold">
                  ~$5-10/mo
                </Typography>
              </View>
              <View style={styles.priceRow}>
                <Typography variant="caption" style={{ color: theme.colors.success[600] }}>
                  All AIs included
                </Typography>
                <Typography variant="caption" weight="bold" style={{ color: theme.colors.success[600] }}>
                  ✓
                </Typography>
              </View>
              <View style={[styles.priceRow, { borderTopWidth: 1, borderTopColor: theme.colors.success[200], paddingTop: 8, marginTop: 8 }]}>
                <Typography variant="caption" weight="bold" style={{ color: theme.colors.success[700] }}>
                  Total
                </Typography>
                <Typography variant="body" weight="bold" style={{ color: theme.colors.success[700] }}>
                  ~$20/mo
                </Typography>
              </View>
              <Typography variant="caption" style={{ color: theme.colors.success[700], marginTop: 4, fontSize: 11, fontStyle: 'italic' }}>
                Pay only for what you use!
              </Typography>
            </View>
          </View>
          
          <View style={styles.savingsBadge}>
            <LinearGradient
              colors={theme.colors.gradients.success}
              style={StyleSheet.absoluteFillObject}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <Typography variant="caption" weight="bold" style={{ color: '#fff' }}>
              Save $40+/month with smarter AI usage!
            </Typography>
          </View>
        </Animated.View>

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
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}>
              <Typography style={{ fontSize: 24, marginRight: 12 }}>🚀</Typography>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
                  <Typography variant="body" weight="bold">
                    Unlock Everything
                  </Typography>
                  <Typography 
                    variant="caption" 
                    weight="bold"
                    style={{ color: theme.colors.primary[500], marginLeft: 8 }}
                  >
                    $9.99/month
                  </Typography>
                </View>
                <Typography 
                  variant="caption" 
                  style={{ color: theme.colors.success[500], marginBottom: 4, fontStyle: 'italic' }}
                >
                  Save $30+/month vs multiple AI subscriptions!
                </Typography>
                <Typography 
                  variant="caption" 
                  style={{ color: theme.colors.text.secondary, marginBottom: 8, fontSize: 12 }}
                >
                  Pay only for what you use with API pricing
                </Typography>
                <View style={{ marginTop: 4 }}>
                  <View style={styles.bulletRow}>
                    <Typography variant="caption" style={{ color: theme.colors.success[500], marginRight: 6 }}>✓</Typography>
                    <Typography variant="caption" color="secondary" style={{ flex: 1, flexWrap: 'wrap' }}>
                      Unlimited AIs in group chats (Free: 2 AIs max)
                    </Typography>
                  </View>
                  <View style={styles.bulletRow}>
                    <Typography variant="caption" style={{ color: theme.colors.success[500], marginRight: 6 }}>✓</Typography>
                    <Typography variant="caption" color="secondary" style={{ flex: 1, flexWrap: 'wrap' }}>
                      All 12 personalities unlocked
                    </Typography>
                  </View>
                  <View style={styles.bulletRow}>
                    <Typography variant="caption" style={{ color: theme.colors.success[500], marginRight: 6 }}>✓</Typography>
                    <Typography variant="caption" color="secondary" style={{ flex: 1, flexWrap: 'wrap' }}>
                      Create debates on ANY topic
                    </Typography>
                  </View>
                  <View style={styles.bulletRow}>
                    <Typography variant="caption" style={{ color: theme.colors.success[500], marginRight: 6 }}>✓</Typography>
                    <Typography variant="caption" color="secondary" style={{ flex: 1, flexWrap: 'wrap' }}>
                      Expert mode with full API control
                    </Typography>
                  </View>
                  <View style={styles.bulletRow}>
                    <Typography variant="caption" style={{ color: theme.colors.success[500], marginRight: 6 }}>✓</Typography>
                    <Typography variant="caption" color="secondary" style={{ flex: 1, flexWrap: 'wrap' }}>
                      Unlimited conversation history
                    </Typography>
                  </View>
                  <View style={styles.bulletRow}>
                    <Typography variant="caption" style={{ color: theme.colors.success[500], marginRight: 6 }}>✓</Typography>
                    <Typography variant="caption" color="secondary" style={{ flex: 1, flexWrap: 'wrap' }}>
                      Priority support & early access to new features
                    </Typography>
                  </View>
                </View>
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
            "The future isn't about replacing human connection.{'\n'}
            It's about enhancing it."
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
    overflow: 'hidden',  // Keep badge within card boundaries
    minHeight: 220,  // Reduced slightly for 6 tiles
    justifyContent: 'flex-start',
  },
  premiumBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  featureIconGradient: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureEmoji: {
    fontSize: 28,
  },
  premiumBanner: {
    borderRadius: 16,
    padding: 20,
    paddingVertical: 24,
    marginBottom: 24,
    borderWidth: 2,
    overflow: 'visible',
    minHeight: 200,
  },
  premiumContent: {
    flexDirection: 'column',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  comparisonSection: {
    marginBottom: 24,
  },
  comparisonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  comparisonCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  savingsBadge: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
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