import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface AppLogoProps {
  size?: number;
}


const AppLogo: React.FC<AppLogoProps> = ({ size = 120 }) => {
  const { theme, isDark } = useTheme();
  const rotationAnimation = useSharedValue(0);
  const floatAnimation = useSharedValue(0);
  const scaleAnimation = useSharedValue(0);

  // All 9 AI providers with their brand colors
  const aiNodes = [
    { color: '#C15F3C', name: 'Claude' },     // Anthropic orange
    { color: '#10A37F', name: 'ChatGPT' },    // OpenAI green
    { color: '#4888F8', name: 'Gemini' },     // Google blue
    { color: '#20808D', name: 'Perplexity' }, // Perplexity teal
    { color: '#FA520F', name: 'Mistral' },    // Mistral orange-red
    { color: '#FF7759', name: 'Cohere' },     // Cohere coral
    { color: '#0F6FFF', name: 'Together' },   // Together bright blue
    { color: '#4D6BFE', name: 'DeepSeek' },   // DeepSeek indigo
    { color: '#1DA1F2', name: 'Grok' },       // Grok X/Twitter blue
  ];

  useEffect(() => {
    // Smooth continuous rotation - no reset
    rotationAnimation.value = withRepeat(
      withTiming(360, {
        duration: 15000,
        easing: Easing.linear,
      }),
      -1,
      false  // This ensures it doesn't reverse, just keeps going
    );
    
    // Floating animation for brain
    floatAnimation.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true  // Reverse for smooth back and forth
    );
    
    // Gentle scale pulse
    scaleAnimation.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }),
        withTiming(0, { duration: 2000 })
      ),
      -1,
      true  // Reverse for smooth pulse
    );
  }, [rotationAnimation, floatAnimation, scaleAnimation]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(scaleAnimation.value, [0, 1], [0.98, 1.02]) }
    ],
  }));

  const centerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(floatAnimation.value, [0, 1], [1, 1.1]) },
      { translateY: interpolate(floatAnimation.value, [0, 1], [0, -3]) }
    ],
  }));

  const orbitAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotationAnimation.value % 360}deg` }
    ],
  }));

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle, { width: size, height: size }]}>
      {/* Clean background */}
      <View style={[styles.backgroundCircle, { 
        width: size, 
        height: size, 
        borderRadius: size * 0.22,
        backgroundColor: isDark ? theme.colors.card : '#f8f9fa',
        borderWidth: 1,
        borderColor: isDark ? theme.colors.border : '#e0e0e0',
      }]} />
      
      {/* Orbiting colored nodes */}
      <Animated.View style={[StyleSheet.absoluteFillObject, orbitAnimatedStyle]}>
        {aiNodes.map((node, index) => {
          const nodeSize = size * 0.12;  // Slightly smaller for 9 dots
          const angle = (index * 40) * Math.PI / 180;  // 360/9 = 40 degrees per dot
          const radius = size * 0.35;  // Slightly larger radius for 9 dots
          const x = size / 2 + Math.cos(angle) * radius - nodeSize / 2;
          const y = size / 2 + Math.sin(angle) * radius - nodeSize / 2;
          
          return (
            <View
              key={node.name}
              style={[
                styles.orbitNode,
                {
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: nodeSize,
                  height: nodeSize,
                  borderRadius: nodeSize / 2,
                  backgroundColor: node.color,
                }
              ]}
            />
          );
        })}
      </Animated.View>
      
      {/* Removed connection lines for cleaner look */}
      
      {/* Center brain with gradient */}
      <Animated.View style={[styles.centerIcon, centerAnimatedStyle]}>
        <LinearGradient
          colors={theme.colors.gradients.primary}
          style={[
            styles.brainGradient,
            { 
              width: size * 0.3,  // Reduced from 0.35
              height: size * 0.3,  // Reduced from 0.35
              borderRadius: size * 0.15,  // Adjusted accordingly
            }
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <MaterialCommunityIcons 
            name="brain" 
            size={size * 0.16}  // Reduced from 0.18
            color="white" 
          />
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundCircle: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  orbitNode: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  centerIcon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  brainGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
});

export { AppLogo };
