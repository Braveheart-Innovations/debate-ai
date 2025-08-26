import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { 
  FadeInDown, 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming,
  withRepeat,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { Box } from '../atoms/Box';
import { Typography } from '../molecules/Typography';
import { Button } from '../molecules/Button';
import { Badge } from '../molecules/Badge';
import { useTheme, Theme } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Custom ChevronLeft Icon Component
interface ChevronLeftIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const ChevronLeftIcon: React.FC<ChevronLeftIconProps> = ({ 
  size = 24, 
  color = '#000', 
  strokeWidth = 2 
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M15 18L9 12L15 6"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// Enhanced BackButton Component
interface BackButtonProps {
  onPress: () => void;
  variant?: 'default' | 'gradient';
  size?: number;
  testID?: string;
}

const BackButton: React.FC<BackButtonProps> = ({ 
  onPress, 
  variant = 'default',
  size = 44,
  testID 
}) => {
  const { theme } = useTheme();
  
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const isGradient = variant === 'gradient';
  const iconColor = isGradient ? theme.colors.text.inverse : theme.colors.text.primary;
  const backgroundColor = isGradient 
    ? 'rgba(255, 255, 255, 0.15)' 
    : theme.colors.surface;
  const borderColor = isGradient 
    ? 'rgba(255, 255, 255, 0.3)' 
    : theme.colors.border;

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor,
          justifyContent: 'center',
          alignItems: 'center',
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isGradient ? 0.3 : 0.1,
              shadowRadius: 4,
            },
            android: {
              elevation: isGradient ? 6 : 2,
            },
          }),
        }
      ]}
      activeOpacity={0.7}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      accessibilityHint="Navigates to the previous screen"
    >
      <ChevronLeftIcon 
        size={size * 0.5} 
        color={iconColor}
        strokeWidth={2.5}
      />
    </TouchableOpacity>
  );
};

export interface HeaderProps {
  // Layout & Styling
  variant?: 'default' | 'gradient' | 'centered' | 'compact';
  height?: number;
  animated?: boolean;
  animationDelay?: number;
  
  // Content
  title: string;
  subtitle?: string;
  
  // Navigation
  onBack?: () => void;
  showBackButton?: boolean;
  
  // Right side elements
  rightElement?: React.ReactNode;
  actionButton?: {
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'danger' | 'ghost';
  };
  
  // Badge
  badge?: {
    text: string;
    type?: 'premium' | 'default' | 'new' | 'experimental';
  };
  
  // Special features
  showDate?: boolean;
  showTime?: boolean;
  roundInfo?: {
    current: number;
    total: number;
  };
  participantsList?: string[];
  sessionCount?: {
    current: number;
    max?: number;
    isPremium?: boolean;
  };
  
  // Testing
  testID?: string;
}

export const HEADER_HEIGHT = 65;
const COMPACT_HEIGHT = 50;

export const Header: React.FC<HeaderProps> = ({
  variant = 'default',
  height,
  animated = false,
  animationDelay = 0,
  title,
  subtitle,
  onBack,
  showBackButton = false,
  rightElement,
  actionButton,
  badge,
  showDate = false,
  showTime = false,
  roundInfo,
  participantsList,
  sessionCount,
  testID,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Animation values
  const titleOpacity = useSharedValue(animated ? 0 : 1);
  const titleTranslateY = useSharedValue(animated ? 20 : 0);
  
  // Gradient variant specific animation values
  const gradientAnimation = useSharedValue(0);
  const subtitleOpacity = useSharedValue(animated ? 0 : 1);
  const subtitleTranslateY = useSharedValue(animated ? 15 : 0);
  const geometryAnimation = useSharedValue(0);
  const floatingAnimation = useSharedValue(0);
  
  // Get time-based greeting (for gradient variant)
  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  };
  
  // Update time if needed (more frequent for gradient variant)
  useEffect(() => {
    if (showTime || variant === 'gradient') {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 60000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [showTime, variant]);
  
  // Animate entrance if needed
  useEffect(() => {
    if (animated || variant === 'gradient') {
      // Text entrance animations
      titleOpacity.value = withTiming(1, { duration: 800 });
      titleTranslateY.value = withTiming(0, { 
        duration: 800,
        easing: Easing.out(Easing.cubic),
      });
      
      subtitleOpacity.value = withTiming(1, { 
        duration: 1000,
        easing: Easing.out(Easing.quad),
      });
      subtitleTranslateY.value = withTiming(0, {
        duration: 1000,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [animated, variant, titleOpacity, titleTranslateY, subtitleOpacity, subtitleTranslateY]);
  
  // Gradient variant continuous animations
  useEffect(() => {
    if (variant === 'gradient') {
      // Subtle gradient breathing animation
      gradientAnimation.value = withRepeat(
        withTiming(1, {
          duration: 10000,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      );
      
      // Geometric shape animation
      geometryAnimation.value = withRepeat(
        withTiming(1, {
          duration: 15000,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      );
      
      // Floating elements animation
      floatingAnimation.value = withRepeat(
        withTiming(1, {
          duration: 4000,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      );
    }
  }, [variant, gradientAnimation, geometryAnimation, floatingAnimation]);
  
  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));
  
  const subtitleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));
  
  const geometryAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ 
      translateY: interpolate(geometryAnimation.value, [0, 1], [-10, 10])
    }]
  }));
  
  const floatingAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ 
      translateY: interpolate(floatingAnimation.value, [0, 1], [-5, 5])
    }]
  }));
  
  // Calculate header height
  const headerHeight = height || (variant === 'compact' ? COMPACT_HEIGHT : HEADER_HEIGHT);
  const totalHeight = headerHeight + insets.top;
  
  // Get variant-specific styles
  const getVariantStyles = () => {
    switch (variant) {
      case 'gradient':
        return {
          needsGradient: true,
          backgroundColor: 'transparent',
          centered: false,
          compact: false,
        };
      case 'centered':
        return {
          needsGradient: false,
          backgroundColor: theme.colors.background,
          centered: true,
          compact: false,
        };
      case 'compact':
        return {
          needsGradient: false,
          backgroundColor: theme.colors.surface,
          centered: false,
          compact: true,
        };
      default:
        return {
          needsGradient: false,
          backgroundColor: theme.colors.surface,
          centered: false,
          compact: false,
        };
    }
  };
  
  const variantStyles = getVariantStyles();
  const styles = createStyles(theme, totalHeight, headerHeight, variant === 'centered');
  
  // Render gradient background if needed
  const renderBackground = () => {
    if (variantStyles.needsGradient) {
      
      // Get theme-appropriate gradients using AI provider colors
      // Match the app logo colors: Claude orange, OpenAI green, Gemini blue
      const primaryGradient = isDark 
        ? ['#C15F3C', '#10A37F', '#4888F8'] // Claude orange -> OpenAI green -> Gemini blue
        : ['#D97757', '#10A37F', '#4888F8']; // More blue presence in light mode
        
      // Complementary AI provider colors for accents
      const accentGradient = isDark
        ? ['#20808D', '#FA520F'] // Perplexity teal -> Mistral orange
        : ['#FF7759', '#4D6BFE']; // Cohere coral -> DeepSeek blue

      return (
        <>
          {/* Wave-shaped mask for the entire header */}
          <Svg 
            width={SCREEN_WIDTH} 
            height={totalHeight} 
            style={StyleSheet.absoluteFillObject}
          >
            <Defs>
              <SvgGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                {primaryGradient.map((color, index) => (
                  <Stop 
                    key={index} 
                    offset={`${index * 50}%`} 
                    stopColor={color} 
                  />
                ))}
              </SvgGradient>
            </Defs>
            
            {/* Header shape with wave bottom */}
            <Path
              d={`M0,0 
                  L${SCREEN_WIDTH},0
                  L${SCREEN_WIDTH},${totalHeight - 10}
                  Q${SCREEN_WIDTH * 0.75},${totalHeight - 5} ${SCREEN_WIDTH * 0.5},${totalHeight - 8}
                  Q${SCREEN_WIDTH * 0.25},${totalHeight - 3} 0,${totalHeight - 12}
                  Z`}
              fill="url(#headerGradient)"
            />
          </Svg>
          
          {/* Geometric SVG Shapes with modern curved design */}
          <Box style={styles.geometryContainer}>
            <Animated.View style={[styles.geometryLayer, geometryAnimatedStyle]}>
              <Svg width={SCREEN_WIDTH} height={totalHeight} style={StyleSheet.absoluteFillObject}>
                <Defs>
                  <SvgGradient id="accent1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor={accentGradient[0]} stopOpacity="0.3" />
                    <Stop offset="100%" stopColor={accentGradient[1]} stopOpacity="0.15" />
                  </SvgGradient>
                  <SvgGradient id="accent2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor={theme.colors.text.inverse} stopOpacity="0.1" />
                    <Stop offset="100%" stopColor={theme.colors.text.inverse} stopOpacity="0.05" />
                  </SvgGradient>
                </Defs>
                
                {/* Dramatic diagonal cut with curved corner */}
                <Path
                  d={`M0,0 
                      L${SCREEN_WIDTH * 0.6},0
                      Q${SCREEN_WIDTH * 0.75},0 ${SCREEN_WIDTH * 0.85},${totalHeight * 0.25}
                      Q${SCREEN_WIDTH * 0.95},${totalHeight * 0.45} ${SCREEN_WIDTH},${totalHeight * 0.65}
                      L${SCREEN_WIDTH},${totalHeight}
                      L0,${totalHeight}
                      Z`}
                  fill={theme.colors.background}
                  opacity={isDark ? 0.15 : 0.1}
                />
                
                {/* Wave-like accent shape */}
                <Path
                  d={`M0,${totalHeight * 0.3}
                      C${SCREEN_WIDTH * 0.15},${totalHeight * 0.2}
                      ${SCREEN_WIDTH * 0.35},${totalHeight * 0.6}
                      ${SCREEN_WIDTH * 0.6},${totalHeight * 0.4}
                      C${SCREEN_WIDTH * 0.8},${totalHeight * 0.25}
                      ${SCREEN_WIDTH * 0.9},${totalHeight * 0.6}
                      ${SCREEN_WIDTH},${totalHeight * 0.5}
                      L${SCREEN_WIDTH},${totalHeight}
                      Q${SCREEN_WIDTH * 0.7},${totalHeight * 0.92} ${SCREEN_WIDTH * 0.3},${totalHeight * 0.96}
                      Q0,${totalHeight} 0,${totalHeight * 0.9}
                      Z`}
                  fill="url(#accent2)"
                />
              </Svg>
            </Animated.View>
          </Box>
          
          {/* Floating accent elements */}
          <Animated.View style={[styles.floatingElements, floatingAnimatedStyle]}>
            <Box style={[styles.floatingCircle, styles.circle1, { 
              backgroundColor: theme.colors.text.inverse,
              opacity: isDark ? 0.06 : 0.08
            }]} />
            <Box style={[styles.floatingCircle, styles.circle2, { 
              backgroundColor: theme.colors.text.inverse,
              opacity: isDark ? 0.04 : 0.06
            }]} />
            <Box style={[styles.floatingCircle, styles.circle3, { 
              backgroundColor: theme.colors.text.inverse,
              opacity: isDark ? 0.08 : 0.1
            }]} />
          </Animated.View>
        </>
      );
    }
    return null;
  };
  
  
  // Render left section (back button or "Go Back" text)
  const renderLeftSection = () => {
    if (!showBackButton || !onBack) return <View style={styles.sideSection} />;
    
    // For gradient variant, "Go Back" is rendered in the main content area
    if (variant === 'gradient') {
      return null;
    }
    
    // For other variants, use the circular back button
    return (
      <View style={styles.sideSection}>
        <BackButton
          onPress={onBack}
          variant="default"
          size={44}
          testID="header-back-button"
        />
      </View>
    );
  };
  
  // Render center section (title, subtitle, badges)
  const renderCenterSection = () => {
    const titleColor = variant === 'gradient' ? 'inverse' : 'primary';
    const subtitleColor = variant === 'gradient' ? 'inverse' : 'secondary';
    
    // Handle participants list for chat
    if (participantsList && participantsList.length > 0) {
      return (
        <View style={[styles.centerSection, variantStyles.centered && styles.centerSectionCentered]}>
          <Typography variant="title" color={titleColor} weight="bold">
            {title}
          </Typography>
          <Typography variant="caption" color={subtitleColor}>
            {participantsList.join(', ')}
          </Typography>
        </View>
      );
    }
    
    // Handle round info for debate
    if (roundInfo) {
      return (
        <View style={[styles.centerSection, variantStyles.centered && styles.centerSectionCentered]}>
          <Typography variant="title" color={titleColor} weight="bold">
            {title}
          </Typography>
          <Typography variant="body" color={subtitleColor}>
            Round {roundInfo.current} of {roundInfo.total}
          </Typography>
        </View>
      );
    }
    
    // Handle session count for history
    if (sessionCount) {
      const isNearLimit = sessionCount.max && sessionCount.current >= sessionCount.max * 0.8;
      return (
        <View style={[styles.centerSection, variantStyles.centered && styles.centerSectionCentered]}>
          <View style={styles.titleRow}>
            <Typography variant="title" color={titleColor} weight="bold">
              {title}
            </Typography>
            {sessionCount.isPremium && (
              <Badge 
                label="Premium" 
                type="premium"
              />
            )}
          </View>
          <Typography 
            variant="caption" 
            color={isNearLimit ? 'error' : subtitleColor}
          >
            {sessionCount.current} Sessions
            {sessionCount.max && ` / ${sessionCount.max}`}
          </Typography>
        </View>
      );
    }
    
    // Special handling for gradient variant
    if (variant === 'gradient') {
      return (
        <Box style={styles.gradientContent}>
          {/* Go Back button at the top when showing back button */}
          {showBackButton && onBack && (
            <Box style={[styles.goBackContainer, { marginBottom: theme.spacing.xs }]}>
              <TouchableOpacity
                onPress={onBack}
                style={styles.goBackButton}
                activeOpacity={0.7}
                testID="header-go-back-button"
                accessibilityRole="button"
                accessibilityLabel="Go back"
                accessibilityHint="Navigates to the previous screen"
              >
                <Typography 
                  variant="body" 
                  weight="bold"
                  color="inverse"
                  style={styles.goBackText}
                >
                  ← Go Back
                </Typography>
              </TouchableOpacity>
            </Box>
          )}
          
          {/* Date positioned above greeting - but not when showing back button */}
          {showDate && !showBackButton && (
            <Box style={[styles.dateContainer, { marginBottom: theme.spacing.xs }]}>
              <Typography 
                variant="body" 
                weight="bold"
                color="inverse"
                style={styles.dateText}
              >
                {currentTime.toLocaleDateString('en-US', { 
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })}
              </Typography>
            </Box>
          )}
          
          <Animated.View style={titleAnimatedStyle}>
            <Typography
              variant="heading"
              weight="bold"
              color="inverse"
              style={styles.gradientTitle}
            >
              {title || getGreeting()}
            </Typography>
          </Animated.View>
          
          {subtitle && (
            <Animated.View style={subtitleAnimatedStyle}>
              <Typography
                variant="subtitle"
                weight="medium"
                color="inverse"
                style={styles.gradientSubtitle}
              >
                {subtitle}
              </Typography>
            </Animated.View>
          )}
        </Box>
      );
    }
    
    // Default title/subtitle with optional badge
    return (
      <View style={[styles.centerSection, variantStyles.centered && styles.centerSectionCentered]}>
        {animated ? (
          <Animated.View style={titleAnimatedStyle}>
            <View style={styles.titleRow}>
              <Typography variant="title" color={titleColor} weight="bold">
                {title}
              </Typography>
              {badge && (
                <Badge 
                  label={badge.text} 
                  type={badge.type}
                />
              )}
            </View>
            {subtitle && (
              <Typography variant="caption" color={subtitleColor}>
                {subtitle}
              </Typography>
            )}
          </Animated.View>
        ) : (
          <>
            <View style={styles.titleRow}>
              <Typography variant="title" color={titleColor} weight="bold">
                {title}
              </Typography>
              {badge && (
                <Badge 
                  label={badge.text} 
                  type={badge.type}
                />
              )}
            </View>
            {subtitle && (
              <Typography variant="caption" color={subtitleColor}>
                {subtitle}
              </Typography>
            )}
          </>
        )}
      </View>
    );
  };
  
  // Render right section
  const renderRightSection = () => {
    if (rightElement) {
      return <View style={styles.sideSection}>{rightElement}</View>;
    }
    
    if (actionButton) {
      return (
        <View style={styles.sideSection}>
          <Button
            title={actionButton.label}
            onPress={actionButton.onPress}
            variant={actionButton.variant || 'ghost'}
            size="small"
          />
        </View>
      );
    }
    
    return <View style={styles.sideSection} />;
  };
  
  const HeaderContent = animated && (variant as string) !== 'gradient' ? Animated.View : View;
  
  return (
    <Box 
      style={[
        styles.container, 
        { backgroundColor: variantStyles.backgroundColor },
        variant === 'gradient' && { height: totalHeight, overflow: 'hidden' }
      ]}
      testID={testID}
    >
      {renderBackground()}
      
      {variant === 'gradient' ? (
        <>
          {/* Gradient variant uses vertical layout structure */}
          <Box style={styles.gradientContentContainer}>
            {/* Main content area with vertical layout */}
            <Box style={styles.gradientMainContent}>
              {renderCenterSection()}
            </Box>
          </Box>
          
          {/* Top right container for HeaderActions - positioned absolutely OUTSIDE main content */}
          {rightElement && (
            <View style={[styles.headerTopRightContainer, { 
              top: 0,
              right: 0 
            }]}>
              {rightElement}
            </View>
          )}
        </>
      ) : (
        <HeaderContent 
          style={[
            styles.content,
            animated && (variant as string) !== 'gradient' ? { entering: FadeInDown.delay(animationDelay) } : {}
          ]}
        >
          <View style={styles.headerRow}>
            {renderLeftSection()}
            {renderCenterSection()}
            {renderRightSection()}
          </View>
        </HeaderContent>
      )}
    </Box>
  );
};

const createStyles = (
  theme: Theme, 
  totalHeight: number, 
  headerHeight: number,
  _centered?: boolean
) => StyleSheet.create({
  container: {
    position: 'relative',
    height: totalHeight,
    width: SCREEN_WIDTH,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: headerHeight - 16,
    paddingHorizontal: 16,
  },
  sideSection: {
    width: 60,
    alignItems: 'flex-start',
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  centerSectionCentered: {
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeDateContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  
  // Gradient variant specific styles (from GradientHeader)
  gradientContentContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    zIndex: 10,
    height: '100%',
    justifyContent: 'flex-start',
  },
  geometryContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  geometryLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  floatingElements: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  floatingCircle: {
    position: 'absolute',
    borderRadius: theme.borderRadius.full,
  },
  circle1: {
    width: 120,
    height: 120,
    top: '15%',
    right: '10%',
  },
  circle2: {
    width: 80,
    height: 80,
    top: '60%',
    left: '5%',
  },
  circle3: {
    width: 60,
    height: 60,
    top: '45%',
    right: '25%',
  },
  timeContainer: {
    position: 'absolute',
    alignItems: 'flex-end',
    zIndex: 15,
  },
  headerTopRightContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 999,  // Increased z-index to ensure it's on top
  },
  dateContainer: {
    alignItems: 'flex-start',
    zIndex: 15,
  },
  timeText: {
    letterSpacing: -0.5,
    textShadowColor: theme.colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dateText: {
    letterSpacing: 0.3,
    opacity: 0.9,
    textShadowColor: theme.colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  gradientContent: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    zIndex: 15,
  },
  gradientMainContent: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    zIndex: 10,  // Lower than headerTopRightContainer
    minHeight: 45,
    paddingTop: theme.spacing.xs,
  },
  gradientTitle: {
    letterSpacing: -1,
    lineHeight: 32,
    fontSize: 32,
    textShadowColor: theme.colors.shadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: 2,
  },
  gradientSubtitle: {
    letterSpacing: 0.5,
    lineHeight: 20,
    opacity: 0.95,
    textShadowColor: theme.colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginTop: -2,
  },
  gradientBackButton: {
    position: 'absolute',
    zIndex: 15,
    alignItems: 'flex-start',
  },
  goBackContainer: {
    alignItems: 'flex-start',
  },
  goBackButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: 'transparent',
  },
  goBackText: {
    letterSpacing: 0.3,
    textShadowColor: theme.colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export default Header;