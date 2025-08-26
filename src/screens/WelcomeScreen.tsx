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
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

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
      icon: { type: 'material-community', name: 'sword-cross' },
      gradient: theme.colors.gradients.sunset,
      title: 'AI Debate Arena',
      description: 'Watch AIs debate topics in real-time. **Premium**: Create debates on ANY topic you choose.',
      premiumType: 'partial' as const,
    },
    {
      icon: { type: 'material', name: 'theater-comedy' },
      gradient: theme.colors.gradients.forest,
      title: '12 Personalities',
      description: 'From Comedian to Philosopher. Each AI adapts to your chosen personality style.',
      premiumType: 'full' as const,
    },
    {
      icon: { type: 'material-community', name: 'key-variant' },
      gradient: theme.colors.gradients.ocean,
      title: 'BYOK',
      description: 'Bring Your Own Keys. Use your existing API keys to save vs multiple AI subscriptions.',
      premiumType: 'none' as const,
    },
    {
      icon: { type: 'material-community', name: 'account-group' },
      gradient: theme.colors.gradients.primary,
      title: 'Group AI Chat',
      description: 'Collaborate with multiple AIs simultaneously. **Premium**: Unlimited AIs in one chat.',
      premiumType: 'partial' as const,
    },
    {
      icon: { type: 'material', name: 'verified-user' },
      gradient: theme.colors.gradients.forest,
      title: 'Hallucination Shield',
      description: 'Multiple AIs fact-check each other in real-time for maximum accuracy.',
      premiumType: 'none' as const,
    },
    {
      icon: { type: 'material', name: 'compare-arrows' },
      gradient: theme.colors.gradients.sunrise,
      title: 'Compare Mode',
      description: 'See side-by-side AI responses to the same prompt. Compare different perspectives instantly.',
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
            Where Ideas Converge and Understanding Emerges.
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <MaterialIcons name="savings" size={24} color={theme.colors.warning[500]} style={{ marginRight: 8 }} />
            <Typography 
              variant="title" 
              weight="bold" 
              align="center"
            >
              Why Pay More?
            </Typography>
          </View>
          
          <Typography 
            variant="caption" 
            color="secondary"
            align="center"
            style={{ marginBottom: 16 }}
          >
            Pay for what you actually use, not fixed subscriptions
          </Typography>
          
          <View style={styles.comparisonContainer}>
            {/* Subscription Model */}
            <View style={[styles.comparisonCard, { 
              backgroundColor: theme.colors.error[50], 
              borderColor: theme.colors.error[300],
              borderWidth: 2,
            }]}>
              <View style={styles.comparisonHeader}>
                <MaterialIcons name="money-off" size={18} color={theme.colors.error[600]} />
                <Typography variant="caption" weight="bold" style={{ color: theme.colors.error[700], marginLeft: 6 }}>
                  Subscription Model
                </Typography>
              </View>
              
              <View style={styles.subscriptionList}>
                <Typography variant="caption" weight="bold" style={{ color: theme.colors.text.primary, lineHeight: 18, fontSize: 12 }}>
                  Pay each provider:
                </Typography>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary, lineHeight: 18, fontSize: 12 }}>
                  • ChatGPT Plus: $20
                </Typography>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary, lineHeight: 18, fontSize: 12 }}>
                  • Claude Pro: $20
                </Typography>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary, lineHeight: 18, fontSize: 12 }}>
                  • Gemini Adv: $20
                </Typography>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary, lineHeight: 18, fontSize: 12 }}>
                  • Perplexity: $20
                </Typography>
              </View>
              
              <View style={styles.totalRow}>
                <Typography variant="title" weight="bold" style={{ color: theme.colors.error[600] }}>
                  ~$80*
                </Typography>
                <Typography variant="caption" style={{ color: theme.colors.error[600], fontSize: 12 }}>
                  /month
                </Typography>
              </View>
              
              <Typography variant="caption" align="center" style={{ color: theme.colors.error[700], marginTop: 8, fontWeight: 'bold' }}>
                Fixed cost, use it or lose it
              </Typography>
              
              <Typography variant="caption" style={{ color: theme.colors.text.secondary, fontSize: 10, fontStyle: 'italic', marginTop: 8 }}>
                *Varies by # of subscriptions & provider rates
              </Typography>
            </View>
            
            {/* Pay As You Go Model */}
            <View style={[styles.comparisonCard, { 
              backgroundColor: theme.colors.success[50], 
              borderColor: theme.colors.success[400],
              borderWidth: 2,
            }]}>
              <View style={styles.comparisonHeader}>
                <MaterialCommunityIcons name="cash-multiple" size={18} color={theme.colors.success[600]} />
                <Typography variant="caption" weight="bold" style={{ color: theme.colors.success[700], marginLeft: 6 }}>
                  Pay As You Go Model
                </Typography>
              </View>
              
              <View style={styles.subscriptionList}>
                <Typography variant="caption" weight="bold" style={{ color: theme.colors.text.primary, lineHeight: 18, fontSize: 12 }}>
                  Premium: $5.99/mo
                </Typography>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary, lineHeight: 18, fontSize: 11, marginTop: 4 }}>
                  Plus API usage*:
                </Typography>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary, lineHeight: 16, fontSize: 11 }}>
                  • Light: ~$5/mo
                </Typography>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary, lineHeight: 16, fontSize: 11 }}>
                  • Standard: ~$15/mo
                </Typography>
                <Typography variant="caption" style={{ color: theme.colors.text.secondary, lineHeight: 16, fontSize: 11 }}>
                  • Power: ~$30/mo
                </Typography>
              </View>
              
              <View style={styles.totalRow}>
                <Typography variant="title" weight="bold" style={{ color: theme.colors.success[700] }}>
                  ~$20*
                </Typography>
                <Typography variant="caption" style={{ color: theme.colors.success[700], fontSize: 12 }}>
                  /month
                </Typography>
              </View>
              
              <Typography variant="caption" align="center" style={{ color: theme.colors.success[700], marginTop: 8, fontWeight: 'bold' }}>
                Pay only for what you use
              </Typography>
              
              <Typography variant="caption" style={{ color: theme.colors.text.secondary, fontSize: 10, fontStyle: 'italic', marginTop: 8 }}>
                *Varies by usage & provider rates
              </Typography>
            </View>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <MaterialCommunityIcons name="rocket-launch" size={28} color={theme.colors.primary[500]} style={{ marginRight: 12 }} />
              <View>
                <Typography variant="title" weight="bold">
                  Unlock Everything
                </Typography>
                <Typography 
                  variant="body" 
                  weight="bold"
                  style={{ color: theme.colors.primary[500] }}
                >
                  $5.99/month
                </Typography>
              </View>
            </View>
            
            <Typography 
              variant="caption" 
              align="center"
              style={{ color: theme.colors.text.secondary, marginBottom: 16 }}
            >
              Get all premium features and save vs multiple AI subscriptions
            </Typography>
            
            <View style={styles.premiumFeatures}>
              <View style={styles.bulletRow}>
                <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
                <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
                  Unlimited AIs in group chats (Free: 2 AIs)
                </Typography>
              </View>
              <View style={styles.bulletRow}>
                <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
                <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
                  All 12 personality styles unlocked
                </Typography>
              </View>
              <View style={styles.bulletRow}>
                <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
                <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
                  Create debates on ANY topic
                </Typography>
              </View>
              <View style={styles.bulletRow}>
                <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
                <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
                  Compare Mode: Side-by-side AI responses
                </Typography>
              </View>
              <View style={styles.bulletRow}>
                <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
                <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
                  Unlimited conversation history
                </Typography>
              </View>
              <View style={styles.bulletRow}>
                <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
                <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
                  Advanced debate moderation controls
                </Typography>
              </View>
              <View style={styles.bulletRow}>
                <MaterialIcons name="check-circle" size={16} color={theme.colors.success[500]} style={{ marginRight: 8 }} />
                <Typography variant="caption" color="secondary" style={{ flex: 1 }}>
                  Priority support & early feature access
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
    padding: 16,
    borderRadius: 16,
    position: 'relative',
  },
  comparisonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 10,
    elevation: 10,
  },
  subscriptionList: {
    marginBottom: 12,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
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