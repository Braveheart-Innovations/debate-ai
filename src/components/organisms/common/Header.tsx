import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { 
  FadeInDown, 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming,
  withRepeat,
  useAnimatedProps,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Rect, G, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { Box } from '@/components/atoms';
import { Typography } from '@/components/molecules';
import { Button } from '@/components/molecules';
import { Badge } from '@/components/molecules';
import { useTheme, Theme } from '@/theme';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useGreeting } from '@/hooks/home/useGreeting';

// Use responsive width via useWindowDimensions inside the component

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
  // Demo badge in lower-right
  showDemoBadge?: boolean;
}

// Base header heights - will be scaled for tablets
export const HEADER_HEIGHT = 65;
const COMPACT_HEIGHT = 50;
const TABLET_COMPACT_HEIGHT = 60;

// Gradient header uses proportional scaling for tablets
const MIN_TABLET_GRADIENT_HEIGHT = 100;
const MIN_TABLET_LANDSCAPE_GRADIENT_HEIGHT = 120; // Higher minimum for landscape to fit badges/buttons
const MAX_TABLET_GRADIENT_HEIGHT = 150;
const TABLET_GRADIENT_HEIGHT_RATIO = 0.11; // 11% of screen height
const TABLET_LANDSCAPE_HEIGHT_RATIO = 0.15; // 15% for landscape (shorter screen)

/**
 * Calculate gradient header height based on screen dimensions.
 * Uses proportional scaling for tablets to handle iPad Air vs iPad Pro differences.
 */
const getGradientHeaderHeight = (isTablet: boolean, screenHeight: number, isLandscape: boolean = false): number => {
  if (!isTablet) return HEADER_HEIGHT; // 65px for phones - unchanged

  // In landscape, use a higher ratio and minimum since screen height is shorter
  const ratio = isLandscape ? TABLET_LANDSCAPE_HEIGHT_RATIO : TABLET_GRADIENT_HEIGHT_RATIO;
  const minHeight = isLandscape ? MIN_TABLET_LANDSCAPE_GRADIENT_HEIGHT : MIN_TABLET_GRADIENT_HEIGHT;

  // Proportional scaling with landscape-aware bounds
  const proportionalHeight = screenHeight * ratio;
  return Math.max(minHeight, Math.min(MAX_TABLET_GRADIENT_HEIGHT, proportionalHeight));
};

/**
 * Get base header height for non-gradient variants.
 */
const getBaseHeaderHeight = (isTablet: boolean, isCompact: boolean): number => {
  if (isCompact) {
    return isTablet ? TABLET_COMPACT_HEIGHT : COMPACT_HEIGHT;
  }
  // Non-gradient tablets use a modest increase
  return isTablet ? 85 : HEADER_HEIGHT;
};

/**
 * Calculate responsive greeting font sizes based on content length and screen width.
 * Prevents long greetings from wrapping and creating a cramped header appearance.
 */
const calculateGreetingFontSizes = (
  title: string,
  screenWidth: number,
  isTablet: boolean
): { titleSize: number; titleLineHeight: number } => {
  const titleLength = title.length;

  // Calculate available width (screen minus horizontal padding)
  const availableWidth = screenWidth - 32; // 16px padding each side

  // Estimate characters per line at base font size
  // At 32px font, roughly 0.55 width ratio per character
  const charWidthRatio = 0.55;
  const maxCharsAtBaseSize = availableWidth / (32 * charWidthRatio);

  // If text fits at base size, use it; otherwise scale down
  let titleSize: number;
  if (isTablet) {
    // Tablets have more room, use simpler calculation
    titleSize = titleLength > 25 ? 30 : titleLength > 20 ? 34 : 38;
  } else {
    // Phones need more aggressive scaling
    if (titleLength <= maxCharsAtBaseSize) {
      titleSize = 32; // Fits at full size
    } else {
      // Scale down to fit: calculate size needed for text to fit on one line
      const neededSize = availableWidth / (titleLength * charWidthRatio);
      titleSize = Math.max(18, Math.min(32, neededSize));
    }
  }

  const titleLineHeight = titleSize + (isTablet ? 8 : 4);

  return { titleSize, titleLineHeight };
};

// Animated SVG elements
const AnimatedG = Animated.createAnimatedComponent(G);

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
  showDemoBadge = false,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [currentTime, setCurrentTime] = useState(new Date());
  const { width, height: screenHeight } = useWindowDimensions();
  const { isTablet, isLandscape } = useDeviceType();
  const { timeBasedGreeting, welcomeMessage } = useGreeting();
  const hasSubtitle = Boolean(subtitle);
  // Subtle, battery-friendly accents inside the SVG (no edges move)
  const enableAccents = true;
  
  // Animation values
  const titleOpacity = useSharedValue(animated ? 0 : 1);
  const titleTranslateY = useSharedValue(animated ? 20 : 0);
  
  // Gradient variant specific animation values
  const gradientAnimation = useSharedValue(0);
  const subtitleOpacity = useSharedValue(animated ? 0 : 1);
  const subtitleTranslateY = useSharedValue(animated ? 15 : 0);
  // Deprecated accent animations removed
  
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
  
  // Subtle pulse for inner highlight opacity
  useEffect(() => {
    if (variant === 'gradient' && enableAccents) {
      gradientAnimation.value = withRepeat(
        withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
    }
  }, [variant, enableAccents, gradientAnimation]);
  
  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));
  
  const subtitleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));
  
  // Accents disabled

  // Calculate header height - use proportional scaling for gradient variant on tablets
  const baseHeight = variant === 'gradient'
    ? getGradientHeaderHeight(isTablet, screenHeight, isLandscape)
    : getBaseHeaderHeight(isTablet, variant === 'compact');
  const headerHeight = height || baseHeight;
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
  const styles = createStyles(theme, totalHeight, headerHeight, variant === 'centered', isTablet);
  
  // Animated props for subtle accent opacity
  const pulseProps = useAnimatedProps(() => ({
    opacity: 0.03 + 0.03 * gradientAnimation.value, // 3% -> 6%
  }));
  const pulseProps2 = useAnimatedProps(() => ({
    opacity: 0.02 + 0.02 * (1 - gradientAnimation.value), // 2% -> 4%
  }));
  
  // Render gradient background if needed
  const renderBackground = () => {
    if (!variantStyles.needsGradient) return null;
    // Rectangular gradient with optional subtle inner accents
    const primaryGradient = isDark
      ? ['#C15F3C', '#10A37F', '#4888F8']
      : ['#D97757', '#10A37F', '#4888F8'];

    const bottomMargin = 6; // keep all accents above this to avoid seams
    const r1 = Math.min(totalHeight * 0.45, totalHeight - bottomMargin - totalHeight * 0.55);
    const r2 = Math.min(totalHeight * 0.3, totalHeight - bottomMargin - totalHeight * 0.65);
    const r3 = Math.min(totalHeight * 0.22, totalHeight - bottomMargin - totalHeight * 0.75);

    const cy1 = totalHeight * 0.5;
    const cy2 = totalHeight * 0.6;
    const cy3 = totalHeight * 0.4;

    return (
      <Svg width={width} height={totalHeight} style={StyleSheet.absoluteFillObject}>
        <Defs>
          <SvgGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            {primaryGradient.map((color, index) => (
              <Stop key={index} offset={`${index * 50}%`} stopColor={color} />
            ))}
          </SvgGradient>
        </Defs>
        {/* Background gradient */}
        <Rect x={0} y={-1} width={width} height={totalHeight + 2} fill="url(#headerGradient)" />
        {enableAccents && (
          <>
            <AnimatedG animatedProps={pulseProps}>
              {/* Soft inner light blobs; avoid bottom edge */}
              <Circle cx={width * 0.82} cy={cy1} r={Math.max(0, r1)} fill={theme.colors.text.inverse} />
              <Circle cx={width * 0.22} cy={cy2} r={Math.max(0, r2)} fill={theme.colors.text.inverse} />
            </AnimatedG>
            <AnimatedG animatedProps={pulseProps2}>
              <Circle cx={width * 0.55} cy={cy3} r={Math.max(0, r3)} fill={theme.colors.text.inverse} />
            </AnimatedG>
          </>
        )}
      </Svg>
    );
  };
  
  const renderGradientTitleContent = () => {
    if (!title) {
      // Dynamic time-based greeting when no title provided
      // Calculate dynamic font sizes based on greeting length and screen width
      const { titleSize, titleLineHeight } = calculateGreetingFontSizes(timeBasedGreeting, width, isTablet);

      return (
        <>
          <Typography
            variant="heading"
            weight="bold"
            color="inverse"
            style={[
              styles.gradientTitle,
              { fontSize: titleSize, lineHeight: titleLineHeight }
            ]}
          >
            {timeBasedGreeting}
          </Typography>
          <Typography
            variant="subtitle"
            weight="medium"
            color="inverse"
            style={styles.gradientSubtitle}
          >
            {welcomeMessage}
          </Typography>
        </>
      );
    }

    const motionMatch = title.match(/^\s*Motion:\s*(.+)$/i);
    if (motionMatch) {
      const motionText = motionMatch[1]?.trim() || '';
      const maxContentWidth = Math.max(200, width - theme.spacing.lg * 2);
      const responsiveFontSize = Math.min(30, Math.max(20, width * 0.065));
      const responsiveLineHeight = responsiveFontSize + 6;

      return (
        <Box
          style={[
            styles.motionContainer,
            { maxWidth: maxContentWidth },
            { marginBottom: hasSubtitle ? theme.spacing.xs : theme.spacing.xs * 0.5 },
          ]}
        >
          <Typography
            variant="title"
            weight="bold"
            color="inverse"
            numberOfLines={3}
            ellipsizeMode="tail"
            style={[
              styles.motionTitle,
              { fontSize: responsiveFontSize, lineHeight: responsiveLineHeight },
              hasSubtitle && { marginBottom: theme.spacing.xs * 0.5 },
            ]}
          >
            {motionText}
          </Typography>
        </Box>
      );
    }

    // Calculate dynamic font sizes based on title length and screen width
    const { titleSize, titleLineHeight } = calculateGreetingFontSizes(title, width, isTablet);

    return (
      <Typography
        variant="heading"
        weight="bold"
        color="inverse"
        numberOfLines={2}
        ellipsizeMode="tail"
        style={[
          styles.gradientTitle,
          { fontSize: titleSize, lineHeight: titleLineHeight },
          hasSubtitle && styles.gradientTitleWithSubtitle
        ]}
      >
        {title}
      </Typography>
    );
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
          
          <Animated.View style={[titleAnimatedStyle, styles.gradientTitleWrapper]}>
            {renderGradientTitleContent()}
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

  // Calculate bottom positions for demo badge and action button
  // In landscape on tablets, use larger offsets to keep them within gradient bounds
  const isTabletLandscape = isTablet && isLandscape;
  const actionButtonBottom = isTabletLandscape ? 16 : 8;
  const demoBadgeBottom = actionButton
    ? (isTabletLandscape ? 52 : 40)  // Above action button
    : (isTabletLandscape ? 16 : 10); // Standalone

  return (
    <Box 
      style={[
        styles.container, 
        { backgroundColor: variantStyles.backgroundColor },
        variant === 'gradient' && {
          minHeight: totalHeight,
          paddingBottom: 0, // Override base padding, gradientContentContainer handles it
          overflow: 'hidden',
          borderBottomWidth: 0,
          // Remove drop shadow/elevation to avoid a subtle line under the gradient
          elevation: 0,
          shadowColor: 'transparent',
          shadowOpacity: 0,
          shadowRadius: 0,
          shadowOffset: { width: 0, height: 0 },
        }
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
            <View style={[styles.headerTopRightContainer, { top: 0, right: 0 }]}>
              {rightElement}
            </View>
          )}
          
          {/* Action button positioned in lower right of header for gradient variant */}
          {actionButton && (
            <View style={[styles.headerActionButtonContainer, {
              bottom: actionButtonBottom,
              right: 16
            }]}>
              <Button
                title={actionButton.label}
                onPress={actionButton.onPress}
                variant={actionButton.variant || 'danger'}
                size="small"
              />
            </View>
          )}

          {/* Demo badge (lower-right) */}
          {showDemoBadge && (
            <View style={[styles.demoBadgeContainer, { bottom: demoBadgeBottom, right: 16 }]}> 
              <Typography variant="caption" weight="bold" color="inverse">DEMO MODE</Typography>
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
  _centered?: boolean,
  isTablet?: boolean
) => StyleSheet.create({
  container: {
    position: 'relative',
    minHeight: totalHeight,
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingBottom: theme.spacing.xs,
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
    flex: 0,
    justifyContent: 'flex-start',
    paddingBottom: 0,
    paddingTop: theme.spacing.xs,
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
    paddingBottom: isTablet
      ? theme.spacing.xl
      : Platform.select({ ios: theme.spacing.md, android: theme.spacing.lg }),
    paddingTop: isTablet ? theme.spacing.lg : theme.spacing.sm,
    zIndex: 10,
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
  headerActionButtonContainer: {
    position: 'absolute',
    zIndex: 1000,  // Higher z-index to ensure button is clickable
  },
  demoBadgeContainer: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.92)',
    zIndex: 1002,
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
    fontSize: isTablet ? 18 : undefined,
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
    minHeight: 0,
    paddingTop: isTablet ? theme.spacing.sm : theme.spacing.xs * 0.25,
  },
  gradientTitleWrapper: {
    width: '100%',
  },
  gradientTitle: {
    letterSpacing: -1,
    lineHeight: isTablet ? 40 : 32,
    fontSize: isTablet ? 38 : 32,
    textShadowColor: theme.colors.shadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: isTablet ? 4 : 2,
  },
  gradientTitleWithSubtitle: {
    marginBottom: isTablet ? theme.spacing.sm : theme.spacing.xs,
  },
  gradientSubtitle: {
    letterSpacing: 0.5,
    lineHeight: isTablet ? 24 : 22,
    fontSize: isTablet ? 18 : 15, // Slightly larger on phones for readability
    opacity: 0.95,
    textShadowColor: theme.colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginTop: isTablet ? 0 : 2,
  },
  motionContainer: {
    width: '100%',
  },
  motionTitle: {
    letterSpacing: -0.4,
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
